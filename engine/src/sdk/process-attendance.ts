import { query } from "./authoring";
import { Body, Container, Destination, ExcavationWork, Position, Support, Traversal } from "./common";
import { StagedProcess } from "./process-supply";
import { OwnedByParty, PartyMember } from "./party";
import type { EntityId, MoveDestination, ProcessRequirements, WriteContext } from "../contracts";
import type { PreparedWorkProvider } from "./work-system";

type Candidate = { readonly worker: EntityId; readonly task: EntityId; readonly target: MoveDestination };
const CONTACT_DISTANCE = 1.5;

/** Process attendance is represented by the native WorkAttempt. */
export function processAttendanceProvider(ctx: WriteContext, workers: readonly EntityId[], suspended: ReadonlySet<EntityId>): PreparedWorkProvider<Candidate> {
  const processes = ctx.query(query(StagedProcess)).map(row => ({ id: row.id, state: row.get(StagedProcess) }));
  const owners = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const memberships = new Map(ctx.query(query(PartyMember)).map(row => [row.id, row.get(PartyMember).party]));
  const positions = new Map(ctx.query(query(Position)).map(row => { const p = row.get(Position); return [row.id, { x: p.x, y: p.y, z: p.z, frame: null } satisfies MoveDestination]; }));
  const bodies = new Set(ctx.query(query(Body)).filter(row => row.get(Body).speed > 0).map(row => row.id));
  const containers = new Set(ctx.query(query(Container)).map(row => row.id));
  const traversals = new Set(ctx.query(query(Traversal)).map(row => row.id));
  const supports = new Set(ctx.query(query(Support)).map(row => row.id));
  const destinations = new Set(ctx.query(query(Destination)).map(row => row.id));
  const excavating = new Set(ctx.query(query(ExcavationWork)).map(row => row.id));
  const attempts = new Map((ctx.workAttempts?.(processes.map(process => process.id)) ?? []).map(attempt => [attempt.key.task, attempt]));
  const targets = new Map(processes.flatMap(process => { const target = positions.get(process.state.station); return target ? [[process.id, target] as const] : []; }));
  const ready = processes.filter(process => {
    if (attempts.has(process.id)) return false;
    if (process.state.phase !== "waiting") return false;
    const requirements: ProcessRequirements = ctx.processRequirements(process.state.definition, process.state.station);
    return requirements.stages[process.state.stageIndex]?.mode === "attended";
  });
  const activeWorkers = new Set([...attempts.values()].map(attempt => attempt.worker));
  const eligibleWorkers = workers.filter(worker => bodies.has(worker) && containers.has(worker) && traversals.has(worker) && positions.has(worker) && !activeWorkers.has(worker) && !supports.has(worker) && !destinations.has(worker) && !excavating.has(worker) && !suspended.has(worker));
  const candidates = ready.flatMap(process => {
    const party = owners.get(process.id) ?? owners.get(process.state.station);
    const target = targets.get(process.id);
    return target ? eligibleWorkers.filter(worker => party === undefined || memberships.get(worker) === party).map(worker => ({ worker, task: process.id, target })) : [];
  });
  return {
    claims: processes.map(process => ({ task: process.id, actor: attempts.get(process.id)?.worker ?? process.state.worker })),
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
      for (const process of processes) {
        const attempt = attempts.get(process.id);
        if (!attempt || attempt.phase.kind !== "outcome" || attempt.phase.result.kind !== "completed") continue;
        const target = targets.get(process.id), pose = positions.get(attempt.worker);
        if (target && pose && Math.hypot(pose.x - target.x, pose.y - target.y, pose.z - target.z) <= CONTACT_DISTANCE)
          ctx.action({ kind: "continue-work-attempt", task: attempt.key.task, generation: attempt.key.generation, sequence: attempt.phase.operation.sequence, nextActivity: { kind: "process-attendance", process: process.id } });
      }
    },
  };
}
