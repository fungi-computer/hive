import { system, type QueryRow } from "./authoring";
import { ConstructionSite, SealedContainer } from "./construction";
import { createWorkSystem, type PreparedWorkProvider } from "./work-system";
import {
  Body,
  Container,
  Destination,
  ExcavationWork,
  Position,
  Support,
  Traversal,
} from "./common";
import { OwnedByParty, PartyMember } from "./party";
import {
  acknowledgeWorkAttempt,
  beginRouteWorkAttempt,
  continueConstructionWorkAttempt,
  interruptWorkAttempt,
  workAttempt,
} from "./work-attempt";
import type {
  ConstructionAccessContact,
  EntityId,
  MoveDestination,
  WorldPose,
  WriteContext,
} from "../contracts";

export type ConstructionWorkOptions = { readonly workers: readonly EntityId[] };
export type ConstructionCandidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly contacts: readonly ConstructionAccessContact[];
  readonly mode: "bind" | "work";
  readonly party: EntityId;
};
const MAX_WORKERS = 256;
function distance(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function validateOptions(options: ConstructionWorkOptions): void {
  if (!Array.isArray(options.workers) || options.workers.length > MAX_WORKERS)
    throw new Error("construction worker bound exceeded");
  for (const worker of options.workers)
    if (typeof worker !== "string")
      throw new Error("invalid construction worker");
}
function target(contact: ConstructionAccessContact): MoveDestination {
  return { x: contact.x, y: contact.y, z: contact.z, frame: contact.frame };
}
function exactContact(a: MoveDestination, b: MoveDestination): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.frame === b.frame;
}
function attemptRow(ctx: WriteContext, task: EntityId) {
  return workAttempt(ctx, task);
}

export function constructionWorkProvider(
  ctx: WriteContext,
  options: ConstructionWorkOptions,
  suspendedActors: ReadonlySet<EntityId>,
): PreparedWorkProvider<ConstructionCandidate> {
  validateOptions(options);
  const workers = [...new Set(options.workers)];
  const sites = ctx.query({ components: [ConstructionSite] });
  const siteIds = sites.map((row) => row.id);
  const access = new Map(
    ctx.constructionAccess(siteIds).map((row) => [row.site, row]),
  );
  const sealed = new Set(
    ctx.query({ components: [SealedContainer] }).map((row) => row.id),
  );
  const bodies = new Map(
    ctx.query({ components: [Body] }).map((row) => [row.id, row.get(Body)]),
  );
  const containers = new Set(
    ctx.query({ components: [Container] }).map((row) => row.id),
  );
  const traversals = new Set(
    ctx.query({ components: [Traversal] }).map((row) => row.id),
  );
  const destinations = new Set(
    ctx.query({ components: [Destination] }).map((row) => row.id),
  );
  const supports = new Set(
    ctx.query({ components: [Support] }).map((row) => row.id),
  );
  const excavations = new Set(
    ctx.query({ components: [ExcavationWork] }).map((row) => row.id),
  );
  const positions = new Set(
    ctx.query({ components: [Position] }).map((row) => row.id),
  );
  const owners = new Map(
    ctx
      .query({ components: [OwnedByParty] })
      .map((row) => [row.id, row.get(OwnedByParty).party]),
  );
  const members = new Map(
    ctx
      .query({ components: [PartyMember] })
      .map((row) => [row.id, row.get(PartyMember).party]),
  );
  const poses = new Map<EntityId, WorldPose>();
  for (let i = 0; i < workers.length; i += 128)
    for (const pose of ctx.worldPoses(workers.slice(i, i + 128)))
      poses.set(pose.id, pose);
  const attempts = new Map(siteIds.map((id) => [id, attemptRow(ctx, id)]));
  const claims = sites.flatMap((row) => {
    const state = row.get(ConstructionSite);
    const attempt = attempts.get(row.id);
    if (!owners.has(row.id) || sealed.has(row.id) || state.phase === "finished")
      return [];
    return [{ task: row.id, actor: state.worker ?? attempt?.worker ?? null }];
  });
  const occupiedActors = [
    ...new Set(
      [...attempts.values()]
        .flatMap((a) => (a ? [a.worker] : []))
        .concat(
          sites.flatMap((row) =>
            row.get(ConstructionSite).worker
              ? [row.get(ConstructionSite).worker!]
              : [],
          ),
        ),
    ),
  ];
  const candidates = sites.flatMap((row) => {
    const state = row.get(ConstructionSite);
    const party = owners.get(row.id);
    const ar = access.get(row.id);
    if (
      !party ||
      sealed.has(row.id) ||
      state.phase === "finished" ||
      state.worker !== null ||
      !ar ||
      ar.support !== "ready" ||
      ar.contacts.length === 0 ||
      (positions.has(row.id) && !ar.materialsReady) ||
      attempts.get(row.id)
    )
      return [];
    const mode: ConstructionCandidate["mode"] = positions.has(row.id)
      ? "work"
      : "bind";
    return workers.flatMap((worker) => {
      const body = bodies.get(worker);
      const pose = poses.get(worker);
      if (
        members.get(worker) !== party ||
        !body ||
        body.speed <= 0 ||
        !containers.has(worker) ||
        !traversals.has(worker) ||
        supports.has(worker) ||
        destinations.has(worker) ||
        excavations.has(worker) ||
        !pose ||
        suspendedActors.has(worker)
      )
        return [];
      return [{ worker, task: row.id, contacts: ar.contacts, mode, party }];
    });
  });
  const routed = new Map<
    string,
    { contact: ConstructionAccessContact; cost: number }
  >();
  return {
    claims,
    occupiedActors,
    candidates,
    lowerBound: (c) => {
      const pose = poses.get(c.worker)?.world;
      return pose ? Math.min(...c.contacts.map((x) => distance(pose, x))) : 0;
    },
    estimate: (c) => {
      const result = ctx.routeToAny({
        actor: c.worker,
        targets: c.contacts.map(target),
      });
      if (result.status !== "reachable") return null;
      const contact = c.contacts[result.targetIndex];
      if (!contact) return null;
      routed.set(`${c.worker}\0${c.task}`, { contact, cost: result.cost });
      return result.cost;
    },
    apply: (assignments) => {
      for (const a of assignments) {
        const c = candidates.find(
          (x) => x.worker === a.worker && x.task === a.task,
        );
        const chosen = c && routed.get(`${a.worker}\0${a.task}`);
        if (!c || !chosen) continue;
        beginRouteWorkAttempt(
          ctx,
          a.task,
          a.worker,
          c.party,
          target(chosen.contact),
        );
      }
    },
    progress: () => {
      for (const row of sites) {
        const state = row.get(ConstructionSite);
        const a = attemptRow(ctx, row.id);
        if (!a) continue;
        if (suspendedActors.has(a.worker)) {
          if (a.phase.kind === "executing")
            interruptWorkAttempt(
              ctx,
              a.key,
              a.phase.operation.sequence,
              "workerUnavailable",
            );
          continue;
        }
        const ar = access.get(row.id);
        const current =
          a.phase.kind === "executing"
            ? a.phase.activity.kind === "route"
              ? a.phase.activity.destination
              : null
            : a.phase.kind === "outcome"
              ? a.phase.activity.kind === "route"
                ? a.phase.activity.destination
                : null
              : null;
        const selected =
          current && ar?.contacts.some((c) => exactContact(current, target(c)));
        if (
          a.phase.kind === "executing" &&
          (!ar || ar.support !== "ready" || !selected)
        ) {
          interruptWorkAttempt(
            ctx,
            a.key,
            a.phase.operation.sequence,
            "accessLost",
          );
          continue;
        }
        if (a.phase.kind !== "outcome") continue;
        const contact = current;
        if (a.phase.result.kind === "completed" && contact) {
          if (a.phase.activity.kind === "route")
            continueConstructionWorkAttempt(
              ctx,
              a.key,
              a.phase.operation.sequence,
              row.id,
              contact,
              positions.has(row.id) ? "work" : "bind",
            );
          else acknowledgeWorkAttempt(ctx, a.key, a.phase.operation.sequence);
        } else acknowledgeWorkAttempt(ctx, a.key, a.phase.operation.sequence);
      }
    },
  };
}
export function constructionWorkSystem(options: ConstructionWorkOptions) {
  return createWorkSystem({
    id: "hive.construction-work",
    version: 2,
    reads: [
      ConstructionSite,
      SealedContainer,
      Body,
      Container,
      Traversal,
      Position,
      Destination,
      Support,
      ExcavationWork,
      OwnedByParty,
      PartyMember,
    ],
    writes: [],
    providers: [
      (ctx, suspended) => constructionWorkProvider(ctx, options, suspended),
    ],
  });
}
