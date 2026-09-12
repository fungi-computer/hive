import { component, entity, query } from "./authoring";
import { ConstructionSite, SealedContainer, attendConstruction } from "./construction";
import { createWorkSystem, type PreparedWorkProvider } from "./work-system";
import {
  Body,
  Container,
  Destination,
  ExcavationWork,
  MaterialLot,
  LotWater,
  Position,
  Support,
  Traversal,
  move,
} from "./common";
import type { EntityId, MoveDestination, WorldPose, WriteContext } from "../contracts";

/** Durable authored intent while a worker is walking to a native site. */
export const ConstructionApproach = component<{ site: EntityId; worker: EntityId }>(
  "hive.construction-approach",
  { version: 1, fields: { site: "entity", worker: "entity" } },
);

export type ConstructionMaterialRequirement = {
  readonly material: string;
  readonly quantity: number;
};

export type ConstructionWorkOptions = {
  readonly workers: readonly EntityId[];
  readonly catalogMaterials: Readonly<Record<string, readonly ConstructionMaterialRequirement[]>>;
};

export type ConstructionCandidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly target: MoveDestination;
};

const MAX_WORKERS = 256;
const MAX_CATALOGS = 128;
const MAX_REQUIREMENTS = 64;
const MAX_QUANTITY = 0xffffffff;

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_QUANTITY;
}

function distance(
  left: { readonly x: number; readonly y: number; readonly z: number },
  right: { readonly x: number; readonly y: number; readonly z: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function validateOptions(options: ConstructionWorkOptions): void {
  if (!Array.isArray(options.workers) || options.workers.length > MAX_WORKERS)
    throw new Error("construction worker bound exceeded");
  if (!options.catalogMaterials || Object.keys(options.catalogMaterials).length > MAX_CATALOGS)
    throw new Error("construction catalog bound exceeded");
  for (const worker of options.workers) {
    entity(worker);
  }
  for (const [catalog, requirements] of Object.entries(options.catalogMaterials)) {
    entity(catalog);
    if (!Array.isArray(requirements) || requirements.length > MAX_REQUIREMENTS)
      throw new Error("invalid construction catalog materials");
    const kinds = new Set<string>();
    let total = 0;
    for (const requirement of requirements) {
      if (!requirement || typeof requirement.material !== "string" || !requirement.material || kinds.has(requirement.material) || !validQuantity(requirement.quantity))
        throw new Error("invalid construction material requirement");
      kinds.add(requirement.material);
      total += requirement.quantity;
      if (!validQuantity(total)) throw new Error("construction material requirement overflow");
    }
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
  const approaches = new Map<EntityId, { readonly id: EntityId; readonly state: { readonly site: EntityId; readonly worker: EntityId } }>();
  for (const row of approachRows) {
    const state = row.get(ConstructionApproach);
    if (approaches.has(state.site)) throw new Error("duplicate construction approach claim");
    approaches.set(state.site, { id: row.id, state });
  }
  const siteIds = new Set(sites.map((row) => row.id));
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
  const waterByLot = new Map(ctx.query(query(LotWater)).map((row) => [row.id, row.get(LotWater)]));
  const lots = ctx.query(query(MaterialLot)).map((row) => ({
    id: row.id,
    lot: row.get(MaterialLot),
    water: waterByLot.get(row.id),
  }));
  const quantities = new Map<EntityId, Map<string, number>>();
  for (const { lot, water } of lots) {
    if (!Number.isSafeInteger(lot.quantity) || lot.quantity < 0 || lot.quantity > MAX_QUANTITY) continue;
    if (water && (!Number.isFinite(water.waterKg) || water.waterKg < 0)) continue;
    if (water?.waterKg && water.waterKg > 0) continue;
    const byKind = quantities.get(lot.container) ?? new Map<string, number>();
    const total = (byKind.get(lot.kind) ?? 0) + lot.quantity;
    if (Number.isSafeInteger(total) && total <= MAX_QUANTITY) byKind.set(lot.kind, total);
    quantities.set(lot.container, byKind);
  }
  const ready = (site: EntityId, catalog: string): boolean => {
    const requirements = options.catalogMaterials[catalog];
    if (!requirements) return false;
    const byKind = quantities.get(site) ?? new Map<string, number>();
    return requirements.every((requirement) =>
      (byKind.get(requirement.material) ?? 0) >= requirement.quantity,
    );
  };
  const relevant = [...new Set([...workers, ...sites.map((row) => row.id)])];
  const poses = new Map<EntityId, WorldPose>();
  for (let offset = 0; offset < relevant.length; offset += 128) {
    for (const pose of ctx.worldPoses(relevant.slice(offset, offset + 128))) poses.set(pose.id, pose);
  }
  const targetFor = (site: EntityId): MoveDestination | null => {
    const pose = poses.get(site);
    const position = positions.get(site);
    if (!pose || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) return null;
    return { x: position.x, y: position.y, z: position.z, frame: pose.support };
  };
  const activeClaims = sites.flatMap((row) => {
    const approach = approaches.get(row.id);
    const state = row.get(ConstructionSite);
    if (sealed.has(row.id) || state.phase === "finished")
      return [];
    return [{ task: row.id, actor: state.worker ?? approach?.state.worker ?? null }];
  });
  const occupiedActors = sites.flatMap((row) => {
    const worker = row.get(ConstructionSite).worker;
    return worker === null ? [] : [worker];
  });
  const candidates = sites.flatMap((row) => {
    const state = row.get(ConstructionSite);
    if (sealed.has(row.id) || state.phase === "finished" || state.worker !== null || approaches.has(row.id) || !ready(row.id, state.catalog)) return [];
    const target = targetFor(row.id);
    if (!target) return [];
    return workers.flatMap((worker) => {
      const body = bodies.get(worker);
      const pose = poses.get(worker);
      if (!body || !Number.isFinite(body.speed) || body.speed <= 0 || !containers.has(worker) || !traversals.has(worker)
        || supports.has(worker) || destinations.has(worker) || excavations.has(worker) || !pose || pose.support !== target.frame) return [];
      return [{ worker, task: row.id, target }];
    });
  });
  const assigned = new Set<EntityId>();
  const requestMove = (worker: EntityId, target: MoveDestination) => {
    ctx.action(move(worker, target));
  };
  return {
    claims: activeClaims,
    occupiedActors,
    candidates,
    estimate: (candidate) => {
      const result = ctx.routeCosts([{ actor: candidate.worker, target: candidate.target }])[0];
      return result.status === "reachable" ? result.cost : null;
    },
    apply: (assignments) => {
      for (const assignment of assignments) {
        const target = candidates.find((candidate) => candidate.worker === assignment.worker && candidate.task === assignment.task);
        if (!target) continue;
        ctx.createAuthoredEntity({
          id: approachIdFor(assignment.task),
          components: { [ConstructionApproach.id]: { site: assignment.task, worker: assignment.worker } },
        });
        assigned.add(assignment.task);
        requestMove(assignment.worker, target.target);
      }
    },
    progress: () => {
      for (const row of sites) {
        const state = row.get(ConstructionSite);
        const approach = approaches.get(row.id);
        if (!approach) continue;
        if (suspendedActors.has(approach.state.worker)) continue;
        if (sealed.has(row.id) || state.phase === "finished" || state.worker !== null || !ready(row.id, state.catalog)) {
          ctx.removeAuthoredEntity(approach.id);
          continue;
        }
        if (assigned.has(row.id)) continue;
        const target = targetFor(row.id);
        const workerPose = poses.get(approach.state.worker);
        const workerBody = bodies.get(approach.state.worker);
        if (!workerSet.has(approach.state.worker) || !target || !workerPose || workerPose.support !== target.frame || !workerBody || !Number.isFinite(workerBody.speed) || workerBody.speed <= 0
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
        const sitePose = poses.get(row.id);
        if (!sitePose) continue;
        if (!destinations.has(approach.state.worker) && distance(workerPose.world, sitePose.world) <= 1e-7)
          ctx.action(attendConstruction(approach.state.worker, row.id));
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
      Traversal, Position, Destination, Support, ExcavationWork, MaterialLot, LotWater,
    ],
    writes: [ConstructionApproach],
    providers: [(ctx, suspendedActors) => constructionWorkProvider(ctx, options, suspendedActors)],
  });
}
