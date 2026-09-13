import { component, query } from "../sdk/authoring";
import { Body, Container, Destination, MaterialLot, Position, Support, Surface, exchangeFieldWater, move } from "../sdk/common";
import { createWorkSystem, type PreparedWorkProvider } from "../sdk/work-system";
import type { EntityId, MoveDestination, WriteContext } from "../contracts";
import { Worker } from "./colony-work";

export type WaterSupplyPhase = "idle" | "queued" | "approaching" | "submitting" | "complete" | "blocked";
type WaterSupplyState = {
  request: number; attempt: number; phase: WaterSupplyPhase; actor: EntityId | null; vessel: EntityId | null;
  x: number; y: number; z: number; approachX: number; approachY: number; approachZ: number; reason: string;
};
export const WaterSupplyWork = component<WaterSupplyState>("colony.water-supply-work", { version: 1, fields: {
  request: "number", attempt: "number", phase: "string", actor: "nullable-entity", vessel: "nullable-entity",
  x: "number", y: "number", z: "number", approachX: "number", approachY: "number", approachZ: "number", reason: "string",
} });

export const WaterSupplyOrder = component<{ revision: number }>("colony.water-supply-order", {
  version: 1, fields: { revision: "number" },
});

type Candidate = { readonly worker: EntityId; readonly task: EntityId; readonly vessel: EntityId; readonly cell: readonly [number, number, number]; readonly approaches: readonly MoveDestination[] };
const empty = (request: number): WaterSupplyState => ({ request, attempt: 0, phase: "queued", actor: null, vessel: null, x: 0, y: 0, z: 0, approachX: 0, approachY: 0, approachZ: 0, reason: "" });
const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function waterSupplyProvider(ctx: WriteContext, suspended: ReadonlySet<EntityId>): PreparedWorkProvider<Candidate> {
  const rows = [...ctx.query(query(WaterSupplyWork, WaterSupplyOrder))].sort((left, right) => left.id.localeCompare(right.id));
  const queued = rows.filter(row => row.get(WaterSupplyWork).phase === "queued");
  if (queued.length === 0) {
    const active = rows.filter(row => ["approaching", "submitting"].includes(row.get(WaterSupplyWork).phase));
    const actors = active.flatMap(row => row.get(WaterSupplyWork).actor ? [row.get(WaterSupplyWork).actor!] : []);
    const poses = actors.length ? new Map(ctx.worldPoses(actors).map(pose => [pose.id, pose.world])) : new Map();
    const moving = new Set(ctx.query(query(Destination)).map(row => row.id));
    return { claims: active.map(row => ({ task: row.id, actor: row.get(WaterSupplyWork).actor })), candidates: [], lowerBound: () => 0, estimate: () => null, apply: () => {}, progress: () => { for (const row of rows) { const state = row.get(WaterSupplyWork); if (state.phase === "complete") { ctx.removeAuthoredEntity(row.id); continue; } if (state.phase !== "approaching" || !state.actor || !state.vessel) continue; const pose = poses.get(state.actor); const approach = { x: state.approachX, y: state.approachY, z: state.approachZ }; const operation = `colony.water:${row.id}:${state.request}:${state.attempt}`; if (!pose || moving.has(state.actor) || distance(pose, approach) > 1.5) continue; ctx.action(exchangeFieldWater(operation, state.actor, state.vessel, { x: state.x, y: state.y, z: state.z })); ctx.write(WaterSupplyWork, row.id, { ...state, phase: "submitting" }); } } };
  }
  const workers = ctx.query(query(Worker, Body, Position, Container)).filter(row => !row.get(Worker).guest && !suspended.has(row.id));
  const workerIds = new Set(workers.map(worker => worker.id));
  const materialFacts = ctx.workMaterialFacts();
  const lots = materialFacts.lots;
  const containers = new Map(materialFacts.containers.map(row => [row.id, row]));
  const contents = new Map<EntityId, { quantity: number; invalid: boolean }>();
  for (const lot of lots) if (lot.kind !== "pail") {
    const current = contents.get(lot.container) ?? { quantity: 0, invalid: false };
    current.quantity += lot.quantity;
    current.invalid ||= lot.kind !== "water";
    contents.set(lot.container, current);
  }
  const pails = lots.filter(lot => lot.kind === "pail" && lot.quantity === 1 && workerIds.has(lot.container))
    .filter(lot => { const capacity = containers.get(lot.id)?.capacity ?? 0, current = contents.get(lot.id) ?? { quantity: 0, invalid: false }; return capacity > 0 && !current.invalid && current.quantity < capacity; });
  pails.sort((left, right) => left.id.localeCompare(right.id));
  const pailWorkers = [...new Set(pails.map(pail => pail.container))].sort().slice(0, 16);
  const poses = new Map(pailWorkers.length ? ctx.worldPoses(pailWorkers).map(pose => [pose.id, pose.world]) : []);
  const eligibleWorkers = pailWorkers.filter(worker => poses.has(worker));
  const activeActors = [...new Set(rows.flatMap(row => { const state = row.get(WaterSupplyWork); return ["approaching", "submitting"].includes(state.phase) && state.actor ? [state.actor] : []; }))].sort();
  for (const pose of activeActors.length ? ctx.worldPoses(activeActors) : []) poses.set(pose.id, pose.world);
  const centers = eligibleWorkers.map(worker => { const p = poses.get(worker)!; return [p.x, p.y, p.z] as [number, number, number]; });
  const water = centers.length ? ctx.waterContacts(centers) : [];
  const moving = new Set(ctx.query(query(Destination)).map(row => row.id));
  const queuedRows: EntityId[] = [];
  for (const row of rows) {
    const order = row.get(WaterSupplyOrder), prior = row.get(WaterSupplyWork);
    if (order.revision < prior.request) throw new Error("invalid water supply request correspondence");
    if (order.revision !== prior.request) ctx.write(WaterSupplyWork, row.id, empty(order.revision));
    const state = order.revision !== prior.request ? empty(order.revision) : prior;
    if (state.phase !== "queued") continue;
    queuedRows.push(row.id);
  }
  // Bound the shared candidate budget fairly: each queued demand contributes
  // one candidate per round before any demand receives a second. This keeps
  // a water-rich first demand from starving later orders.
  const candidates: Candidate[] = [];
  const pairs = water.length * pails.length;
  const rounds = Math.min(Math.ceil(128 / Math.max(1, queuedRows.length)), pairs);
  for (let round = 0; round < rounds && candidates.length < 128; round++) {
    const pair = round % pairs, cell = water[Math.floor(pair / pails.length)], pail = pails[pair % pails.length];
    if (!cell || !pail || !eligibleWorkers.includes(pail.container) || moving.has(pail.container)) continue;
    for (const task of queuedRows) {
      candidates.push({ worker: pail.container, task, vessel: pail.id, cell: cell.at, approaches: cell.approaches });
      if (candidates.length === 128) break;
    }
  }
  const boundedCandidates = candidates;
  const claims = rows.filter(row => {
    const state = row.get(WaterSupplyWork), order = row.get(WaterSupplyOrder);
    return order.revision !== state.request || state.phase === "queued" || state.phase === "approaching" || state.phase === "submitting";
  }).map(row => ({ task: row.id, actor: row.get(WaterSupplyWork).actor }));
  const chosen = new Map<string, { candidate: Candidate; approach: MoveDestination; cost: number }>();
  return {
    claims, candidates: boundedCandidates,
    lowerBound: candidate => { const pose = poses.get(candidate.worker); return pose ? Math.min(...candidate.approaches.map(a => distance(pose, a))) : Number.POSITIVE_INFINITY; },
    estimate: candidate => { const pose = poses.get(candidate.worker); if (!pose) return null; const result = ctx.routeToAny({ actor: candidate.worker, targets: candidate.approaches }); if (result.status !== "reachable") return null; chosen.set(`${candidate.task}\0${candidate.worker}`, { candidate, approach: candidate.approaches[result.targetIndex], cost: result.cost }); return result.cost; },
    apply: assignments => { for (const assignment of assignments) { const pick = chosen.get(`${assignment.task}\0${assignment.worker}`); if (!pick || pick.candidate.worker !== assignment.worker) continue; const { candidate, approach } = pick; const prior = rows.find(row => row.id === assignment.task)!.get(WaterSupplyWork); ctx.write(WaterSupplyWork, assignment.task, { request: prior.request, attempt: prior.attempt + 1, phase: "approaching", actor: candidate.worker, vessel: candidate.vessel, x: candidate.cell[0], y: candidate.cell[1], z: candidate.cell[2], approachX: approach.x, approachY: approach.y, approachZ: approach.z, reason: "" }); ctx.action(move(candidate.worker, approach)); } },
    progress: () => { for (const row of rows) { const state = row.get(WaterSupplyWork); const operation = `colony.water:${row.id}:${state.request}:${state.attempt}`; if (state.phase === "submitting" && state.actor && state.vessel) { const outcome = ctx.outcomes.find(({ action }) => action.kind === "exchange-field-water" && action.operation === operation); ctx.write(WaterSupplyWork, row.id, { ...state, phase: outcome?.result.accepted ? "complete" : "queued", actor: null, vessel: null, reason: outcome?.result.reason ?? (outcome ? "Water exchange rejected" : "Missing saved water exchange outcome") }); continue; } if (state.phase !== "approaching" || !state.actor || !state.vessel) continue; const pose = poses.get(state.actor); const approach = { x: state.approachX, y: state.approachY, z: state.approachZ }; const failedMove = ctx.outcomes.find(outcome => outcome.action.kind === "move" && outcome.action.entity === state.actor && !outcome.result.accepted && outcome.action.destination.x === approach.x && outcome.action.destination.y === approach.y && outcome.action.destination.z === approach.z); if (failedMove) { ctx.write(WaterSupplyWork, row.id, { ...state, phase: "queued", actor: null, vessel: null, reason: failedMove.result.reason ?? "Water approach unreachable" }); continue; } if (!pose || moving.has(state.actor) || distance(pose, approach) > 1.5) continue; ctx.action(exchangeFieldWater(operation, state.actor, state.vessel, { x: state.x, y: state.y, z: state.z })); ctx.write(WaterSupplyWork, row.id, { ...state, phase: "submitting" }); } },
  };
}

export const colonyWaterWorkSystem = createWorkSystem({ id: "colony.water-work", version: 1, reads: [WaterSupplyWork, WaterSupplyOrder, Worker, Body, Position, Container, Destination, Support, Surface, MaterialLot], writes: [WaterSupplyWork], providers: [(ctx, suspended) => waterSupplyProvider(ctx, suspended)] });
