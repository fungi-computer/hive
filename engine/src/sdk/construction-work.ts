import { component, entity, query } from "./authoring";
import { ConstructionSite, SealedContainer, attendConstruction, bindConstructionStage } from "./construction";
import { createWorkSystem, type PreparedWorkProvider } from "./work-system";
import {
  Body,
  Container,
  Destination,
  ExcavationWork,
  Position,
  Support,
  Traversal,
  move,
} from "./common";
import type { ConstructionAccessContact, EntityId, MoveDestination, WorldPose, WriteContext } from "../contracts";

/** Durable authored intent while a worker is walking to a native site. */
export const ConstructionApproach = component<{ site: EntityId; worker: EntityId; contactX: number; contactY: number; contactZ: number }>(
  "hive.construction-approach",
  { version: 2, fields: { site: "entity", worker: "entity", contactX: "number", contactY: "number", contactZ: "number" } },
);

export type ConstructionWorkOptions = {
  readonly workers: readonly EntityId[];
};

export type ConstructionCandidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly contacts: readonly ConstructionAccessContact[];
  readonly mode: "bind" | "work";
};

const MAX_WORKERS = 256;
function distance(
  left: { readonly x: number; readonly y: number; readonly z: number },
  right: { readonly x: number; readonly y: number; readonly z: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function validateOptions(options: ConstructionWorkOptions): void {
  if (!Array.isArray(options.workers) || options.workers.length > MAX_WORKERS)
    throw new Error("construction worker bound exceeded");
  for (const worker of options.workers) {
    entity(worker);
  }
}

function approachIdFor(site: EntityId): EntityId {
  const id = `construction-approach.${site.length}:${site}`;
  if (id.length > 128) throw new Error("construction approach identity exceeds bound");
  return entity(id);
}

/** Provider for the shared work owner; native ConstructionSite remains authoritative. */
export function constructionWorkProvider(
  ctx: WriteContext,
  options: ConstructionWorkOptions,
  suspendedActors: ReadonlySet<EntityId>,
): PreparedWorkProvider<ConstructionCandidate> {
  validateOptions(options);
  const workers = [...new Set(options.workers)];
  const workerSet = new Set(workers);
  const sites = ctx.query(query(ConstructionSite));
  for (const row of sites) approachIdFor(row.id);
  const approachRows = ctx.query(query(ConstructionApproach));
  const approaches = new Map<EntityId, { readonly id: EntityId; readonly state: { readonly site: EntityId; readonly worker: EntityId; readonly contactX: number; readonly contactY: number; readonly contactZ: number } }>();
  for (const row of approachRows) {
    const state = row.get(ConstructionApproach);
    if (approaches.has(state.site)) throw new Error("duplicate construction approach claim");
    approaches.set(state.site, { id: row.id, state });
  }
  const siteIds = new Set(sites.map((row) => row.id));
  const access = new Map((siteIds.size === 0 ? [] : ctx.constructionAccess([...siteIds])).map((row) => [row.site, row]));
  for (const row of approachRows) {
    if (!siteIds.has(row.get(ConstructionApproach).site)) ctx.removeAuthoredEntity(row.id);
  }
  const sealed = new Set(ctx.query(query(SealedContainer)).map((row) => row.id));
  const bodies = new Map(ctx.query(query(Body)).map((row) => [row.id, row.get(Body)]));
  const containers = new Map(ctx.query(query(Container)).map((row) => [row.id, row.get(Container)]));
  const traversals = new Map(ctx.query(query(Traversal)).map((row) => [row.id, row.get(Traversal)]));
  const destinations = new Set(ctx.query(query(Destination)).map((row) => row.id));
  const supports = new Set(ctx.query(query(Support)).map((row) => row.id));
  const excavations = new Set(ctx.query(query(ExcavationWork)).map((row) => row.id));
  const positions = new Map(ctx.query(query(Position)).map((row) => [row.id, row.get(Position)]));
  const relevant = workers;
  const poses = new Map<EntityId, WorldPose>();
  for (let offset = 0; offset < relevant.length; offset += 128) {
    for (const pose of ctx.worldPoses(relevant.slice(offset, offset + 128))) poses.set(pose.id, pose);
  }
  const targetFor = (site: EntityId, contact: { x: number; y: number; z: number }): MoveDestination => ({ x: contact.x, y: contact.y, z: contact.z, frame: null });
  const activeClaims = sites.flatMap((row) => {
    const approach = approaches.get(row.id);
    const state = row.get(ConstructionSite);
    if (sealed.has(row.id) || state.phase === "finished")
      return [];
    return [{ task: row.id, actor: state.worker ?? approach?.state.worker ?? null }];
  });
  const occupiedActors = [...new Set(sites.flatMap((row) => {
    const worker = row.get(ConstructionSite).worker;
    return worker === null ? [] : [worker];
  }).concat([...approaches.values()].map(({ state }) => state.worker)))];
  const candidates = sites.flatMap((row) => {
    const state = row.get(ConstructionSite);
    if (sealed.has(row.id) || state.phase === "finished" || state.worker !== null || !access.has(row.id)) return [];
    const accessRow = access.get(row.id)!;
    if (accessRow.support !== "ready" || accessRow.contacts.length === 0) return [];
    const mode: ConstructionCandidate["mode"] = positions.has(row.id) ? "work" : "bind";
    if (mode === "work" && (!accessRow.materialsReady || approaches.has(row.id))) return [];
    const contacts = accessRow.contacts;
    if (contacts.length === 0) return [];
    return workers.flatMap((worker) => {
      const body = bodies.get(worker);
      const pose = poses.get(worker);
      if (!body || !Number.isFinite(body.speed) || body.speed <= 0 || !containers.has(worker) || !traversals.has(worker)
        || supports.has(worker) || destinations.has(worker) || excavations.has(worker) || !pose) return [];
      return [{ worker, task: row.id, contacts, mode }];
    });
  });
  const assigned = new Set<EntityId>();
  const routed = new Map<string, { readonly contact: ConstructionAccessContact; readonly target: MoveDestination; readonly cost: number }>();
  const requestMove = (worker: EntityId, target: MoveDestination) => {
    ctx.action(move(worker, target));
  };
  return {
    claims: activeClaims,
    occupiedActors,
    candidates,
    lowerBound: (candidate) => {
      const actor = poses.get(candidate.worker)?.local;
      return actor ? Math.min(...candidate.contacts.map((contact) => distance(actor, contact))) : 0;
    },
    estimate: (candidate) => {
      const result = ctx.routeToAny({ actor: candidate.worker, targets: candidate.contacts.map((contact) => targetFor(candidate.task, contact)) });
      if (result.status !== "reachable") return null;
      const contact = candidate.contacts[result.targetIndex];
      if (!contact) return null;
      routed.set(`${candidate.worker}\0${candidate.task}\0${candidate.mode}`, { contact, target: targetFor(candidate.task, contact), cost: result.cost });
      return result.cost;
    },
    apply: (assignments) => {
      for (const assignment of assignments) {
        const target = candidates.find((candidate) => candidate.worker === assignment.worker && candidate.task === assignment.task);
        const mode = target?.mode;
        const chosen = mode ? routed.get(`${assignment.worker}\0${assignment.task}\0${mode}`) : undefined;
        if (!target || !chosen) continue;
        if (mode === "bind") {
          ctx.action(bindConstructionStage(assignment.task, chosen.contact));
          continue;
        }
        ctx.createAuthoredEntity({
          id: approachIdFor(assignment.task),
          components: { [ConstructionApproach.id]: { site: assignment.task, worker: assignment.worker, contactX: chosen.contact.x, contactY: chosen.contact.y, contactZ: chosen.contact.z } },
        });
        assigned.add(assignment.task);
        requestMove(assignment.worker, chosen.target);
      }
    },
    progress: () => {
      for (const row of sites) {
        const state = row.get(ConstructionSite);
        const approach = approaches.get(row.id);
        if (!approach) continue;
        if (suspendedActors.has(approach.state.worker)) continue;
        if (sealed.has(row.id) || state.phase === "finished" || state.worker !== null || access.get(row.id)?.support !== "ready" || !access.get(row.id)?.materialsReady) {
          ctx.removeAuthoredEntity(approach.id);
          continue;
        }
        if (assigned.has(row.id)) continue;
        const accessRow = access.get(row.id);
        const selected = accessRow?.contacts.find((contact) => contact.x === approach.state.contactX && contact.y === approach.state.contactY && contact.z === approach.state.contactZ);
        const target = selected ? targetFor(row.id, selected) : null;
        const workerPose = poses.get(approach.state.worker);
        const workerBody = bodies.get(approach.state.worker);
        if (!workerSet.has(approach.state.worker) || !target || !workerPose || !workerBody || !Number.isFinite(workerBody.speed) || workerBody.speed <= 0
          || !containers.has(approach.state.worker) || !traversals.has(approach.state.worker) || supports.has(approach.state.worker)
          || excavations.has(approach.state.worker)) {
          ctx.removeAuthoredEntity(approach.id);
          continue;
        }
        const rejected = ctx.outcomes.some(({ action, result }) =>
          !result.accepted && ((action.kind === "move" && action.entity === approach.state.worker
            && action.destination.x === target.x && action.destination.y === target.y && action.destination.z === target.z
            && action.destination.frame === target.frame)
            || (action.kind === "attend-construction" && action.worker === approach.state.worker && action.site === row.id)),
        );
        if (rejected) {
          ctx.removeAuthoredEntity(approach.id);
          continue;
        }
        if (!destinations.has(approach.state.worker) && distance(workerPose.world, { x: approach.state.contactX, y: approach.state.contactY, z: approach.state.contactZ }) <= 1e-7)
          ctx.action(attendConstruction(approach.state.worker, row.id, { x: approach.state.contactX, y: approach.state.contactY, z: approach.state.contactZ }));
        else requestMove(approach.state.worker, target);
      }
    },
  };
}

export function constructionWorkSystem(options: ConstructionWorkOptions) {
  return createWorkSystem({
    id: "hive.construction-work",
    version: 1,
    reads: [
      ConstructionSite, ConstructionApproach, SealedContainer, Body, Container,
      Traversal, Position, Destination, Support, ExcavationWork,
    ],
    writes: [ConstructionApproach],
    providers: [(ctx, suspendedActors) => constructionWorkProvider(ctx, options, suspendedActors)],
  });
}
