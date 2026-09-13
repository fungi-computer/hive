import { component, query } from "../sdk/authoring";
import { Body, Container, Destination, MaterialLot, Position, Support, Surface, exchangeFieldWater, move } from "../sdk/common";
import { createWorkSystem, type PreparedWorkProvider } from "../sdk/work-system";
import type { EntityId, MoveDestination, WriteContext } from "../contracts";
import { Worker } from "./colony-work";

export type WaterSupplyPhase = "idle" | "queued" | "approaching" | "submitting" | "complete" | "blocked";
type WaterSupplyState = {
  request: number; phase: WaterSupplyPhase; actor: EntityId | null; vessel: EntityId | null;
  x: number; y: number; z: number; approachX: number; approachY: number; approachZ: number; reason: string;
};
export const WaterSupplyWork = component<WaterSupplyState>("colony.water-supply-work", { version: 1, fields: {
  request: "number", phase: "string", actor: "nullable-entity", vessel: "nullable-entity",
  x: "number", y: "number", z: "number", approachX: "number", approachY: "number", approachZ: "number", reason: "string",
} });

export const WaterSupplyOrder = component<{ revision: number }>("colony.water-supply-order", {
  version: 1, fields: { revision: "number" },
});

type Candidate = { readonly worker: EntityId; readonly task: EntityId; readonly vessel: EntityId; readonly cell: readonly [number, number, number]; readonly approaches: readonly MoveDestination[] };
const empty = (request: number): WaterSupplyState => ({ request, phase: "queued", actor: null, vessel: null, x: 0, y: 0, z: 0, approachX: 0, approachY: 0, approachZ: 0, reason: "" });
const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function waterSupplyProvider(ctx: WriteContext, suspended: ReadonlySet<EntityId>): PreparedWorkProvider<Candidate> {
  const rows = ctx.query(query(WaterSupplyWork, WaterSupplyOrder));
  const workers = ctx.query(query(Worker, Body, Position, Container)).filter(row => !row.get(Worker).guest && !suspended.has(row.id));
  const centers = workers.map(row => { const p = row.get(Position); return [p.x, p.y, p.z] as [number, number, number]; });
  if (!ctx.waterContacts) throw new Error("water supply requires native water contact capability");
  const water = ctx.waterContacts(centers);
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
  const pails = lots.filter(lot => lot.kind === "pail" && lot.quantity === 1 && workers.some(worker => worker.id === lot.container))
    .filter(lot => { const capacity = containers.get(lot.id)?.capacity ?? 0, current = contents.get(lot.id) ?? { quantity: 0, invalid: false }; return capacity > 0 && !current.invalid && current.quantity < capacity; });
  const poses = new Map(ctx.worldPoses(workers.map(row => row.id)).map(pose => [pose.id, pose.world]));
  const moving = new Set(ctx.query(query(Destination)).map(row => row.id));
  const candidates: Candidate[] = [];
  for (const row of rows) {
    const order = row.get(WaterSupplyOrder), prior = row.get(WaterSupplyWork);
    if (order.revision < prior.request) throw new Error("invalid water supply request correspondence");
    if (order.revision !== prior.request) ctx.write(WaterSupplyWork, row.id, empty(order.revision));
    const state = order.revision !== prior.request ? empty(order.revision) : prior;
    if (state.phase !== "queued") continue;
    for (const cell of water) {
      const [x, y, z] = cell.at;
      const approaches = cell.approaches;
      for (const pail of pails) {
        const worker = pail.container;
        if (workers.every(row => row.id !== worker) || moving.has(worker)) continue;
        candidates.push({ worker, task: row.id, vessel: pail.id, cell: cell.at, approaches });
      }
    }
  }
  const boundedCandidates = candidates.slice(0, 128);
  const claims = rows.filter(row => {
    const state = row.get(WaterSupplyWork), order = row.get(WaterSupplyOrder);
    return order.revision !== state.request || state.phase === "queued" || state.phase === "approaching" || state.phase === "submitting";
  }).map(row => ({ task: row.id, actor: row.get(WaterSupplyWork).actor }));
  const chosen = new Map<EntityId, { candidate: Candidate; approach: MoveDestination; cost: number }>();
  return {
    claims, candidates: boundedCandidates,
    lowerBound: candidate => { const pose = poses.get(candidate.worker); return pose ? Math.min(...candidate.approaches.map(a => distance(pose, a))) : Number.POSITIVE_INFINITY; },
    estimate: candidate => { const pose = poses.get(candidate.worker); if (!pose) return null; const result = ctx.routeToAny({ actor: candidate.worker, targets: candidate.approaches }); if (result.status !== "reachable") return null; chosen.set(candidate.task, { candidate, approach: candidate.approaches[result.targetIndex], cost: result.cost }); return result.cost; },
    apply: assignments => { for (const assignment of assignments) { const pick = chosen.get(assignment.task); if (!pick) continue; const { candidate, approach } = pick; ctx.write(WaterSupplyWork, assignment.task, { request: rows.find(row => row.id === assignment.task)!.get(WaterSupplyOrder).revision, phase: "approaching", actor: candidate.worker, vessel: candidate.vessel, x: candidate.cell[0], y: candidate.cell[1], z: candidate.cell[2], approachX: approach.x, approachY: approach.y, approachZ: approach.z, reason: "" }); ctx.action(move(candidate.worker, approach)); } },
    progress: () => { for (const row of rows) { const state = row.get(WaterSupplyWork); if ((state.phase === "submitting" || state.phase === "approaching") && state.actor && state.vessel) { const outcome = ctx.outcomes.find(({ action }) => action.kind === "exchange-field-water" && action.worker === state.actor && action.vessel === state.vessel); if (outcome) { ctx.write(WaterSupplyWork, row.id, { ...state, phase: outcome.result.accepted ? "complete" : "queued", actor: null, vessel: null, reason: outcome.result.reason ?? "Water exchange rejected" }); continue; } } if (state.phase !== "approaching" || !state.actor || !state.vessel) continue; const pose = poses.get(state.actor); if (!pose || moving.has(state.actor)) continue; const approach = { x: state.approachX, y: state.approachY, z: state.approachZ }; if (distance(pose, approach) > 1.5) continue; ctx.action(exchangeFieldWater(state.actor, state.vessel, { x: state.x, y: state.y, z: state.z })); ctx.write(WaterSupplyWork, row.id, { ...state, phase: "submitting" }); } },
  };
}

export const colonyWaterWorkSystem = createWorkSystem({ id: "colony.water-work", version: 1, reads: [WaterSupplyWork, WaterSupplyOrder, Worker, Body, Position, Container, Destination, Support, Surface, MaterialLot], writes: [WaterSupplyWork], providers: [(ctx, suspended) => waterSupplyProvider(ctx, suspended)] });
