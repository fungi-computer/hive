import { query } from "./authoring";
import { Body, Container, Destination, ExcavationWork, Position, Support, Traversal } from "./common";
import { StagedProcess } from "./process-supply";
import { OwnedByParty, PartyMember } from "./party";
import type { EntityId, MoveDestination, ProcessRequirements, WriteContext } from "../contracts";
import type { PreparedWorkProvider } from "./work-system";

type Candidate = { readonly worker: EntityId; readonly task: EntityId; readonly target: MoveDestination };
const CONTACT_DISTANCE = 1.5;
const MAX_PROCESSES = 64;
const MAX_WORKERS = 256;
const ACTIVE_PROCESS_WINDOW = 4;
const ACTIVE_WORKER_WINDOW = 32;

/** Process attendance is represented by the native WorkAttempt. */
export function processAttendanceProvider(ctx: WriteContext, workers: readonly EntityId[], suspended: ReadonlySet<EntityId>): PreparedWorkProvider<Candidate> {
  if (workers.length > MAX_WORKERS) throw new Error("process attendance worker bound exceeded");
  const allProcesses = ctx.query(query(StagedProcess)).map(row => ({ id: row.id, state: row.get(StagedProcess) })).sort((a, b) => a.id.localeCompare(b.id));
  if (allProcesses.length > MAX_PROCESSES) throw new Error("process attendance process bound exceeded");
  const processStart = allProcesses.length ? (ctx.clock.tick * ACTIVE_PROCESS_WINDOW) % allProcesses.length : 0;
  const processes = Array.from({ length: Math.min(ACTIVE_PROCESS_WINDOW, allProcesses.length) }, (_, offset) => allProcesses[(processStart + offset) % allProcesses.length]!);
  const owners = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const memberships = new Map(ctx.query(query(PartyMember)).map(row => [row.id, row.get(PartyMember).party]));
  const positions = new Map(ctx.query(query(Position)).map(row => { const p = row.get(Position); return [row.id, { x: p.x, y: p.y, z: p.z, frame: null } satisfies MoveDestination]; }));
  const bodies = new Set(ctx.query(query(Body)).filter(row => row.get(Body).speed > 0).map(row => row.id));
  const containers = new Set(ctx.query(query(Container)).map(row => row.id));
  const traversals = new Set(ctx.query(query(Traversal)).map(row => row.id));
  const supports = new Set(ctx.query(query(Support)).map(row => row.id));
  const destinations = new Set(ctx.query(query(Destination)).map(row => row.id));
  const excavating = new Set(ctx.query(query(ExcavationWork)).map(row => row.id));
  const targets = new Map(allProcesses.flatMap(process => { const target = positions.get(process.state.station); return target ? [[process.id, target] as const] : []; }));
  const attempts = new Map((ctx.workAttempts?.(allProcesses.map(process => process.id)) ?? []).map(attempt => [attempt.key.task, attempt]));
  const materialFacts = processes.some(process => (process.state.phase === "waiting" || process.state.phase === "blocked") && process.state.stageIndex === 0) ? ctx.workMaterialFacts() : null;
  const ready = processes.filter(process => {
    if (attempts.has(process.id)) return false;
    // The rotating bounded process window is itself the deterministic retry
    // scheduler. Admitting a blocked row when its window returns avoids both a
    // global retry burst and starvation from composing two unrelated moduli.
    if (process.state.phase !== "waiting" && process.state.phase !== "blocked") return false;
    const requirements: ProcessRequirements = ctx.processRequirements(process.state.definition, process.state.station);
    const stage = requirements.stages[process.state.stageIndex];
    if (stage?.mode !== "attended") return false;
    if (process.state.stageIndex !== 0) return true;
    const lots = materialFacts?.lots ?? [];
    return requirements.inputs.every(input => {
      const matching = lots.filter(lot => lot.container === `${process.state.station}:${input.port}` && lot.kind === input.material && lot.quantity > 0);
      return input.policy === "whole-lot"
        ? matching.some(lot => lot.quantity === input.quantity)
        : matching.reduce((sum, lot) => sum + lot.quantity, 0) >= input.quantity;
    });
  });
  const activeWorkers = new Set([...attempts.values()].map(attempt => attempt.worker));
  const eligibleWorkers = workers.filter(worker => bodies.has(worker) && containers.has(worker) && traversals.has(worker) && positions.has(worker) && !activeWorkers.has(worker) && !supports.has(worker) && !destinations.has(worker) && !excavating.has(worker) && !suspended.has(worker));
  const sortedWorkers = [...new Set(eligibleWorkers)].sort((a, b) => a.localeCompare(b));
  const workerStart = sortedWorkers.length ? (ctx.clock.tick * ACTIVE_WORKER_WINDOW) % sortedWorkers.length : 0;
  const selectedWorkers = Array.from({ length: Math.min(ACTIVE_WORKER_WINDOW, sortedWorkers.length) }, (_, offset) => sortedWorkers[(workerStart + offset) % sortedWorkers.length]!);
  const candidates = ready.flatMap(process => {
    const party = owners.get(process.id) ?? owners.get(process.state.station);
    const target = targets.get(process.id);
    return target ? selectedWorkers.filter(worker => party === undefined || memberships.get(worker) === party).map(worker => ({ worker, task: process.id, target })) : [];
  });
  return {
    claims: allProcesses.map(process => {
      const attempt = attempts.get(process.id);
      const actor = attempt && (attempt.phase.kind === "executing" || (attempt.phase.kind === "outcome" && attempt.phase.result.kind === "completed")) ? attempt.worker : null;
      return { task: process.id, actor };
    }),
    candidates,
    lowerBound: candidate => { const pose = positions.get(candidate.worker); return pose ? Math.hypot(pose.x - candidate.target.x, pose.y - candidate.target.y, pose.z - candidate.target.z) : 0; },
    estimate: candidate => { const result = ctx.routeCosts([{ actor: candidate.worker, target: candidate.target }])[0]; return result?.status === "reachable" ? result.cost : null; },
    apply: assignments => {
      for (const assignment of assignments) {
        const candidate = candidates.find(item => item.worker === assignment.worker && item.task === assignment.task);
        if (!candidate) throw new Error("unknown process attendance assignment");
        const process = processes.find(item => item.id === candidate.task)!;
        const party = owners.get(candidate.task) ?? owners.get(process.state.station);
        if (!party) throw new Error("process attendance task has no party owner");
        ctx.action({ kind: "begin-work-attempt", task: candidate.task, worker: candidate.worker, party, operation: { kind: "route", destination: candidate.target } });
      }
    },
    progress: () => {
      for (const process of allProcesses) {
        const attempt = attempts.get(process.id);
        if (!attempt) continue;
        if (attempt.phase.kind === "executing" && suspended.has(attempt.worker)) {
          ctx.action({ kind: "interrupt-work-attempt", task: attempt.key.task, generation: attempt.key.generation, sequence: attempt.phase.operation.sequence, cause: "drafted" });
          continue;
        }
        if (attempt.phase.kind !== "outcome") continue;
        const operation = attempt.phase.operation;
        if (attempt.phase.activity.kind === "process-attendance") {
          // Native process advancement has already committed the exact stage
          // transition (or returned the process to waiting) in the same
          // candidate as this retained outcome. Acknowledge that fact only
          // after observing the canonical process row.
          const current = allProcesses.find(item => item.id === process.id)?.state;
          if (!current || (attempt.phase.result.kind === "completed" && current.phase !== "waiting" && current.phase !== "complete" && current.phase !== "blocked")) continue;
          ctx.action({ kind: "acknowledge-work-attempt", task: operation.attempt.task, generation: operation.attempt.generation, sequence: operation.sequence });
          continue;
        }
        if (attempt.phase.result.kind !== "completed") {
          // Blocked/interrupted approach has no physical process effect; ACK
          // the retained result so the worker and task can be retried.
          ctx.action({ kind: "acknowledge-work-attempt", task: operation.attempt.task, generation: operation.attempt.generation, sequence: operation.sequence });
          continue;
        }
        const target = targets.get(process.id), pose = positions.get(attempt.worker);
        if (target && pose && Math.hypot(pose.x - target.x, pose.y - target.y, pose.z - target.z) <= CONTACT_DISTANCE) {
          ctx.action({ kind: "continue-work-attempt", task: attempt.key.task, generation: attempt.key.generation, sequence: attempt.phase.operation.sequence, nextActivity: { kind: "process-attendance", process: process.id } });
        } else {
          ctx.action({ kind: "acknowledge-work-attempt", task: operation.attempt.task, generation: operation.attempt.generation, sequence: operation.sequence });
        }
      }
    },
  };
}
