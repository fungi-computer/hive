import { component, query } from "../sdk/authoring";
import { Body, Container, Destination, MaterialLot, Position, Support, Surface, exchangeFieldWater, move } from "../sdk/common";
import type { PreparedWorkProvider } from "../sdk/work-system";
import type { EntityId, MoveDestination, WriteContext } from "../contracts";
import { Worker } from "./colony-components";
import { OwnedByParty, PartyMember } from "../sdk/party";
import { acknowledgeWorkAttempt, beginRouteWorkAttempt, continueFieldWaterWorkAttempt } from "../sdk/work-attempt";

export type WaterSupplyPhase = "idle" | "queued" | "approaching" | "submitting" | "complete" | "blocked";
type WaterSupplyState = {
  request: number; attempt: number; phase: WaterSupplyPhase; actor: EntityId | null; vessel: EntityId | null;
  x: number; y: number; z: number; approachX: number; approachY: number; approachZ: number; reason: string;
};
export const WaterSupplyWork = component<WaterSupplyState>("colony.water-supply-work", { version: 1, fields: {
  request: "number", attempt: "number", phase: "string", actor: "nullable-entity", vessel: "nullable-entity",
  x: "number", y: "number", z: "number", approachX: "number", approachY: "number", approachZ: "number", reason: "string",
} });

export const WaterSupplyOrder = component<{ revision: number; process: EntityId | null; party: EntityId | null }>("colony.water-supply-order", {
  version: 3, fields: { revision: "number", process: "nullable-entity", party: "nullable-entity" },
});

type WaterOption = { readonly cell: readonly [number, number, number]; readonly approaches: readonly MoveDestination[] };
type Candidate = { readonly worker: EntityId; readonly task: EntityId; readonly vessel: EntityId; readonly options: readonly WaterOption[] };
const empty = (request: number): WaterSupplyState => ({ request, attempt: 0, phase: "queued", actor: null, vessel: null, x: 0, y: 0, z: 0, approachX: 0, approachY: 0, approachZ: 0, reason: "" });
const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function waterSupplyProvider(ctx: WriteContext, suspended: ReadonlySet<EntityId>): PreparedWorkProvider<Candidate> {
  const nativeRows = [...ctx.query(query(WaterSupplyWork, WaterSupplyOrder))].sort((a, b) => a.id.localeCompare(b.id));
  const owners = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const members = new Map(ctx.query(query(PartyMember)).map(row => [row.id, row.get(PartyMember).party]));
  const workers = ctx.query(query(Worker, Body, Position)).filter(row => !row.get(Worker).guest && !suspended.has(row.id));
  const attempts = new Map((ctx.workAttempts?.(nativeRows.map(row => row.id)) ?? []).map(attempt => [attempt.key.task, attempt]));
  const lots = ctx.workMaterialFacts().lots;
  const pails = new Map<EntityId, EntityId>(lots.filter(lot => lot.kind === "pail" && workers.some(worker => worker.id === lot.container)).map(lot => [lot.container, lot.id]));
  const poses = new Map(ctx.worldPoses(workers.map(row => row.id)).map(pose => [pose.id, pose.local]));
  const centers = workers.flatMap(worker => { const pose = poses.get(worker.id); return pose ? [[Math.round(pose.x), Math.round(pose.y), Math.round(pose.z)] as [number, number, number]] : []; });
  const contacts = centers.length ? ctx.waterContacts(centers).slice(0, 8) : [];
  const candidates: Candidate[] = [];
  for (const row of nativeRows) { if (attempts.has(row.id)) continue; const state = row.get(WaterSupplyWork), party = owners.get(row.id), order = row.get(WaterSupplyOrder); if (state.phase !== "queued" || order.revision !== state.request || !party) continue; for (const worker of workers) { const vessel = pails.get(worker.id); if (!vessel || members.get(worker.id) !== party) continue; const options = contacts.map(contact => ({ cell: contact.at, approaches: contact.approaches })).filter(option => option.approaches.length); if (options.length) candidates.push({ worker: worker.id, task: row.id, vessel, options }); } }
  const selected = new Map<string, { cell: readonly [number, number, number]; approach: MoveDestination }>();
  return { claims: nativeRows.filter(row => attempts.has(row.id)).map(row => ({ task: row.id, actor: attempts.get(row.id)?.worker ?? null })), candidates, lowerBound: candidate => { const pose = poses.get(candidate.worker), target = candidate.options[0].approaches[0]; return pose ? Math.hypot(pose.x - target.x, pose.z - target.z) : Number.POSITIVE_INFINITY; }, estimate: candidate => { const targets = candidate.options.flatMap(option => option.approaches.map(approach => ({ option, approach }))); const result = ctx.routeToAny({ actor: candidate.worker, targets: targets.map(target => target.approach) }); if (result.status !== "reachable") return null; const target = targets[result.targetIndex]; if (!target) return null; selected.set(`${candidate.task}\0${candidate.worker}`, { cell: target.option.cell, approach: target.approach }); return result.cost; }, apply: assignments => { for (const assignment of assignments) { const candidate = candidates.find(item => item.task === assignment.task && item.worker === assignment.worker), party = owners.get(assignment.task), target = selected.get(`${assignment.task}\0${assignment.worker}`); if (!candidate || !party || !target) continue; beginRouteWorkAttempt(ctx, assignment.task, assignment.worker, party, target.approach); } }, progress: () => { for (const row of nativeRows) { const attempt = attempts.get(row.id); if (!attempt || attempt.phase.kind !== "outcome") continue; const state = row.get(WaterSupplyWork), phase = attempt.phase, activity = phase.activity; if (phase.result.kind !== "completed") { acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence); continue; } if (activity.kind === "route") { const pail = pails.get(attempt.worker), contact = contacts.find(item => item.approaches.some(approach => approach.x === activity.destination.x && approach.y === activity.destination.y && approach.z === activity.destination.z)); if (!pail || !contact) { acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence); continue; } continueFieldWaterWorkAttempt(ctx, attempt.key, phase.operation.sequence, pail, contact.at, "withdraw", 1); } else if (activity.kind === "field-water") { ctx.write(WaterSupplyWork, row.id, { ...state, phase: "complete", actor: null, vessel: null, x: activity.cell[0], y: activity.cell[1], z: activity.cell[2], reason: "" }); acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence); } } } };
}
