import { z } from "zod";
import { component, entity, query } from "./authoring";
import { Body, Destination, Emitter, ExcavationWork, LotWater, MaterialLot, Position, Support, beginEmission, move } from "./common";
import type { EntityId, MoveDestination, WriteContext } from "../contracts";
import type { PreparedWorkProvider } from "./work-system";

const stateSchema = z.object({
  request: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  phase: z.enum(["idle", "queued", "approaching", "submitting", "complete", "blocked"]),
  actor: z.string().min(1).max(128).transform(entity).nullable(),
  reason: z.string().max(512),
}).strict().refine(state =>
  (state.phase === "approaching" || state.phase === "submitting") === (state.actor !== null),
  "Only active attendance may claim an actor",
);
export type EmissionWorkState = z.infer<typeof stateSchema>;
const definition = component<EmissionWorkState>("hive.emission-work", {
  version: 1, fields: { request: "number", phase: "string", actor: "nullable-entity", reason: "string" },
});
/** Saved station intent. Native paid emissions own fuel, fire and elapsed time. */
export const EmissionWork = Object.freeze({ ...definition,
  validate: (value: unknown): value is EmissionWorkState => stateSchema.safeParse(value).success,
});
export const idleEmissionWork: EmissionWorkState = Object.freeze({ request: 0, phase: "idle", actor: null, reason: "" });
const queuedEmissionWork: EmissionWorkState = Object.freeze({ request: 0, phase: "queued", actor: null, reason: "" });

/** Player-owned request and system-owned progress have distinct mutation owners. */
const orderSchema = z.object({ revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), enabled: z.boolean() }).strict();
type Order = z.infer<typeof orderSchema>;
export const EmissionOrder = Object.freeze({ ...component<Order>("hive.emission-order", {
  version: 1, fields: { revision: "number", enabled: "boolean" },
}), validate: (value: unknown): value is Order => orderSchema.safeParse(value).success });
export function nextEmissionOrder(order: { revision: number; enabled: boolean }, work: EmissionWorkState, enabled: boolean) {
  if (!Number.isSafeInteger(order.revision) || order.revision < 0 || order.revision >= Number.MAX_SAFE_INTEGER)
    throw new Error("Invalid emission order revision");
  const active = work.phase === "queued" || work.phase === "approaching" || work.phase === "submitting";
  if (order.enabled === enabled && (!enabled || work.request !== order.revision || active)) return null;
  return { revision: order.revision + 1, enabled };
}

type Requirement = { readonly materialKind: string; readonly quantity: number };
type Candidate = { readonly worker: EntityId; readonly task: EntityId; readonly target: MoveDestination };
type Attendance = { id: EntityId; state: EmissionWorkState; target: MoveDestination | null; supplied: boolean; changed: boolean };

function suppliedStations(ctx: WriteContext, requirements: ReadonlyMap<string, Requirement>): Set<EntityId> {
  const wet = new Set(ctx.query(query(LotWater)).filter(row => row.get(LotWater).waterKg > 0).map(row => row.id));
  const stock = new Map<EntityId, Map<string, number>>();
  for (const row of ctx.query(query(MaterialLot))) {
    if (wet.has(row.id)) continue;
    const lot = row.get(MaterialLot);
    const kinds = stock.get(lot.container) ?? new Map<string, number>();
    kinds.set(lot.kind, (kinds.get(lot.kind) ?? 0) + lot.quantity);
    stock.set(lot.container, kinds);
  }
  return new Set(ctx.query(query(Emitter)).filter(row => {
    const requirement = requirements.get(row.get(Emitter).catalog);
    return requirement && (stock.get(row.id)?.get(requirement.materialKind) ?? 0) >= requirement.quantity;
  }).map(row => row.id));
}

function settleSubmission(ctx: WriteContext, attendance: Attendance): void {
  const { id, state } = attendance;
  const outcome = ctx.outcomes.find(({ action }) => action.kind === "begin-emission"
    && action.station === id && action.worker === state.actor);
  // Results are saved with the same Session revision as the submitted intent.
  // Missing correspondence is a stopped job, never permission to debit again.
  ctx.write(EmissionWork, id, outcome?.result.accepted
    ? { request: state.request, phase: "complete", actor: null, reason: "" }
    : { request: state.request, phase: "blocked", actor: null, reason: outcome?.result.reason?.slice(0, 512) ?? "Ignition result unavailable; request again" });
}

function progressAttendance(ctx: WriteContext, attendance: Attendance, suspended: ReadonlySet<EntityId>,
  positions: ReadonlyMap<EntityId, MoveDestination>, destinations: ReadonlySet<EntityId>): void {
  const { id, state, target, supplied } = attendance;
  if (state.phase === "submitting") { settleSubmission(ctx, attendance); return; }
  if (state.phase !== "approaching" || state.actor === null) return;
  const position = positions.get(state.actor);
  if (suspended.has(state.actor) || !supplied) {
    ctx.write(EmissionWork, id, { ...queuedEmissionWork, request: state.request });
    return;
  }
  if (!position || !target || position.frame !== target.frame) {
    ctx.write(EmissionWork, id, { request: state.request, phase: "blocked", actor: null, reason: "Station or worker is no longer reachable" });
    return;
  }
  const rejected = ctx.outcomes.find(({ action, result }) => !result.accepted && action.kind === "move"
    && action.entity === state.actor && action.destination.x === target.x
    && action.destination.y === target.y && action.destination.z === target.z && action.destination.frame === target.frame);
  if (rejected) {
    ctx.write(EmissionWork, id, { request: state.request, phase: "blocked", actor: null, reason: rejected.result.reason?.slice(0, 512) ?? "Cannot reach station" });
  } else if (!destinations.has(state.actor) && Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z) <= 1.5) {
    ctx.action(beginEmission(state.actor, id));
    ctx.write(EmissionWork, id, { request: state.request, phase: "submitting", actor: state.actor, reason: "" });
  } else {
    // The native movement owner reuses a healthy route and repairs invalidation.
    ctx.action(move(state.actor, target));
  }
}

/** Another provider in the existing shared allocator, not a second job loop. */
export function emissionWorkProvider(ctx: WriteContext, workers: readonly EntityId[],
  requirements: ReadonlyMap<string, Requirement>, suspended: ReadonlySet<EntityId>): PreparedWorkProvider<Candidate> {
  const allRows = ctx.query(query(EmissionWork, EmissionOrder, Emitter));
  if (allRows.length > 64 || workers.length > 128) throw new Error("Emission work bounds exceeded");
  const rows = allRows.filter(row => {
    const state = row.get(EmissionWork);
    return row.get(EmissionOrder).revision !== state.request || state.phase === "queued"
      || state.phase === "approaching" || state.phase === "submitting";
  });
  if (!rows.length) return { claims: [], candidates: [], estimate: () => null, apply() {}, progress() {} };
  const supplied = suppliedStations(ctx, requirements);
  const supports = new Set(ctx.query(query(Support)).map(row => row.id));
  const positions = new Map<EntityId, MoveDestination>(ctx.query(query(Position)).filter(row => !supports.has(row.id)).map(row => {
    const p = row.get(Position); return [row.id, { x: p.x, y: p.y, z: p.z, frame: null }];
  }));
  const bodies = new Set(ctx.query(query(Body)).filter(row => row.get(Body).speed > 0).map(row => row.id));
  const destinations = new Set(ctx.query(query(Destination)).map(row => row.id));
  const excavating = new Set(ctx.query(query(ExcavationWork)).map(row => row.id));
  const attendance = rows.map(row => {
    const prior = row.get(EmissionWork), order = row.get(EmissionOrder);
    if (!Number.isSafeInteger(order.revision) || order.revision < prior.request)
      throw new Error("Invalid emission request correspondence");
    const changed = order.revision !== prior.request;
    const state = changed ? { ...(order.enabled ? queuedEmissionWork : idleEmissionWork), request: order.revision } : prior;
    return { id: row.id, state, target: positions.get(row.id) ?? null, supplied: supplied.has(row.id), changed };
  });
  const claims = attendance.map(({ id, state }) => ({ task: id, actor: state.actor }));
  const candidates = attendance.flatMap(({ id, state, target, supplied: ready }) => {
    if (state.phase !== "queued" || !target || !ready) return [];
    return workers.filter(worker => bodies.has(worker) && positions.has(worker)
      && !destinations.has(worker) && !excavating.has(worker) && !suspended.has(worker))
      .map(worker => ({ worker, task: id, target }));
  });
  const assigned = new Set<EntityId>();
  return {
    claims, candidates,
    estimate(candidate) {
      const route = ctx.routeCosts([{ actor: candidate.worker, target: candidate.target }])[0];
      return route.status === "reachable" ? route.cost : null;
    },
    apply(assignments) {
      for (const assignment of assignments) {
        const candidate = candidates.find(item => item.task === assignment.task && item.worker === assignment.worker);
        if (!candidate) throw new Error("Unknown emission assignment");
        assigned.add(candidate.task);
        ctx.write(EmissionWork, candidate.task, { request: attendance.find(item => item.id === candidate.task)!.state.request, phase: "approaching", actor: candidate.worker, reason: "" });
        ctx.action(move(candidate.worker, candidate.target));
      }
    },
    progress() {
      for (const item of attendance) {
        if (assigned.has(item.id)) continue;
        if (item.changed) ctx.write(EmissionWork, item.id, item.state);
        else progressAttendance(ctx, item, suspended, positions, destinations);
      }
    },
  };
}
