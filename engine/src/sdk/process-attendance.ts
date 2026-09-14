import { component, query } from "./authoring";
import { Body, Container, Destination, ExcavationWork, Position, Support, Traversal, move } from "./common";
import { StagedProcess, attendProcess } from "./process-supply";
import type { EntityId, MoveDestination, ProcessRequirements, WriteContext } from "../contracts";
import type { PreparedWorkProvider } from "./work-system";
import { OwnedByParty, PartyMember } from "./party";

export const ProcessAttendanceWork = component<{ process: EntityId; actor: EntityId; contactX: number; contactY: number; contactZ: number }>("hive.process-attendance", { version: 1, fields: { process: "entity", actor: "entity", contactX: "number", contactY: "number", contactZ: "number" } });
type Candidate = { readonly worker: EntityId; readonly task: EntityId; readonly target: MoveDestination };
const CONTACT_DISTANCE = 1.5;
const MAX_PROCESSES = 64;
const MAX_WORKERS = 256;

/**
 * Supplies attended stages to the shared work allocator. Native process state
 * owns the claim and progress; this provider only chooses a worker and submits
 * movement/attendance actions.
 */
export function processAttendanceProvider(
  ctx: WriteContext,
  workers: readonly EntityId[],
  suspended: ReadonlySet<EntityId>,
): PreparedWorkProvider<Candidate> {
  if (workers.length > MAX_WORKERS) throw new Error("process worker bound exceeded");
  const rows = ctx.query(query(StagedProcess));
  const owners = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const memberships = new Map(ctx.query(query(PartyMember)).map(row => [row.id, row.get(PartyMember).party]));
  if (rows.length > MAX_PROCESSES) throw new Error("staged process bound exceeded");
  const workerIds = [...new Set(workers)];
  const processes = rows.map(row => ({ id: row.id, state: row.get(StagedProcess) }));
  const positions = new Map(ctx.query(query(Position)).map(row => { const p = row.get(Position); return [row.id, { x: p.x, y: p.y, z: p.z, frame: null } satisfies MoveDestination]; }));
  const bodies = new Set(ctx.query(query(Body)).filter(row => row.get(Body).speed > 0).map(row => row.id));
  const containers = new Set(ctx.query(query(Container)).map(row => row.id));
  const traversals = new Set(ctx.query(query(Traversal)).map(row => row.id));
  const supports = new Set(ctx.query(query(Support)).map(row => row.id));
  const destinations = new Set(ctx.query(query(Destination)).map(row => row.id));
  const excavating = new Set(ctx.query(query(ExcavationWork)).map(row => row.id));
  const targets = new Map<EntityId, MoveDestination>();
  for (const process of processes) {
    const contact = positions.get(process.state.station);
    if (contact) targets.set(process.id, contact);
  }
  const attendanceRows = ctx.query(query(ProcessAttendanceWork));
  const attendance = new Map(attendanceRows.map(row => [row.get(ProcessAttendanceWork).process, { id: row.id, state: row.get(ProcessAttendanceWork) }]));
  const initialCandidates = processes.filter(process => process.state.phase === "waiting" && process.state.stageIndex === 0 && !attendance.has(process.id));
  const facts = initialCandidates.length ? ctx.workMaterialFacts() : null;
  const readyForStage = (process: typeof processes[number]): boolean => {
    if (process.state.phase !== "waiting") return false;
    const requirements: ProcessRequirements = ctx.processRequirements(process.state.definition, process.state.station);
    const stage = requirements.stages[process.state.stageIndex];
    if (!stage || stage.mode !== "attended") return false;
    // Inputs are checked by processSupplyPhase only before admission. Native
    // bindings are authoritative after prepare consumes an input.
    if (process.state.stageIndex !== 0) return true;
    const lots = facts?.lots ?? [];
    return requirements.inputs.every(input => {
      const matching = lots.filter(lot => lot.container === `${process.state.station}:${input.port}` && lot.kind === input.material && lot.quantity > 0);
      return input.policy === "whole-lot" ? matching.some(lot => lot.quantity === input.quantity) : matching.reduce((sum, lot) => sum + lot.quantity, 0) >= input.quantity;
    });
  };
  const eligibleWorkers = workerIds.filter(worker => bodies.has(worker) && containers.has(worker) && traversals.has(worker)
    && positions.has(worker) && !supports.has(worker) && !destinations.has(worker) && !excavating.has(worker) && !suspended.has(worker));
  const discoverable = processes.filter(readyForStage).filter(process => !attendance.has(process.id));
  const processStart = discoverable.length ? (ctx.clock.tick * 4) % discoverable.length : 0;
  const active = Array.from({ length: Math.min(4, discoverable.length) }, (_, offset) => discoverable[(processStart + offset) % discoverable.length]!);
  const claims = processes.map(({ id, state }) => ({ task: id, actor: state.phase === "working" ? state.worker : attendance.get(id)?.state.actor ?? null }));
  const candidates = active.flatMap(process => {
    const party = owners.get(process.id);
    const target = targets.get(process.id);
    const workerStart = eligibleWorkers.length ? (ctx.clock.tick * 32) % eligibleWorkers.length : 0;
    const selectedWorkers = Array.from({ length: Math.min(32, eligibleWorkers.length) }, (_, offset) => eligibleWorkers[(workerStart + offset) % eligibleWorkers.length]!);
    return target ? selectedWorkers.filter(worker => party === undefined || memberships.get(worker) === party).map(worker => ({ worker, task: process.id, target })) : [];
  });
  return {
    claims,
    candidates,
    lowerBound(candidate) {
      const pose = positions.get(candidate.worker);
      return pose ? Math.hypot(pose.x - candidate.target.x, pose.y - candidate.target.y, pose.z - candidate.target.z) : 0;
    },
    estimate(candidate) {
      const route = ctx.routeCosts([{ actor: candidate.worker, target: candidate.target }])[0];
      return route?.status === "reachable" ? route.cost : null;
    },
    apply(assignments) {
      for (const assignment of assignments) {
        const candidate = candidates.find(item => item.worker === assignment.worker && item.task === assignment.task);
        if (!candidate) throw new Error("unknown process attendance assignment");
        const pose = positions.get(candidate.worker);
        const attendanceId = `process-attendance.${candidate.task}` as EntityId;
        const party = owners.get(candidate.task);
        ctx.createAuthoredEntity({ id: attendanceId, components: { ...(party ? { [OwnedByParty.id]: { party } } : {}), [ProcessAttendanceWork.id]: { process: candidate.task, actor: candidate.worker, contactX: candidate.target.x, contactY: candidate.target.y, contactZ: candidate.target.z } } });
        if (pose && Math.hypot(pose.x - candidate.target.x, pose.y - candidate.target.y, pose.z - candidate.target.z) <= CONTACT_DISTANCE) ctx.action(attendProcess(candidate.worker, candidate.task));
        else ctx.action(move(candidate.worker, candidate.target));
      }
    },
    progress() {
      for (const row of attendanceRows) {
        const work = row.get(ProcessAttendanceWork);
        const process = processes.find(item => item.id === work.process);
        const target = targets.get(work.process);
        const pose = positions.get(work.actor);
        const stage = process && ctx.processRequirements(process.state.definition, process.state.station).stages[process.state.stageIndex];
        if (!process || !target || !stage || stage.mode !== "attended" || process.state.phase === "blocked" || process.state.phase === "complete" || process.state.phase === "working" && process.state.worker !== work.actor) { ctx.removeAuthoredEntity(row.id); continue; }
        const contact = { x: work.contactX, y: work.contactY, z: work.contactZ, frame: null } satisfies MoveDestination;
        const rejected = ctx.outcomes.some(({ action, result }) => !result.accepted && ((action.kind === "move" && action.entity === work.actor && action.destination.x === contact.x && action.destination.y === contact.y && action.destination.z === contact.z) || (action.kind === "attend-process" && action.worker === work.actor && action.process === work.process)));
        if (rejected) { ctx.removeAuthoredEntity(row.id); continue; }
        if (destinations.has(work.actor)) continue;
        if (process.state.phase === "working") { ctx.action(attendProcess(work.actor, work.process)); continue; }
        if (pose && Math.hypot(pose.x - contact.x, pose.y - contact.y, pose.z - contact.z) <= CONTACT_DISTANCE) ctx.action(attendProcess(work.actor, work.process));
        else ctx.action(move(work.actor, contact));
      }
    },
  };
}
