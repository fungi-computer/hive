import { entity } from "./authoring";
import type {
  EntityId,
  MoveDestination,
  ReadContext,
  WorkAttempt,
  WorkAttemptKey,
  WorkInterruptCause,
  WriteContext,
} from "../contracts";

function sequence(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("work attempt sequence must be a positive integer");
  return value;
}

function key(value: WorkAttemptKey): WorkAttemptKey {
  entity(value.task);
  if (!Number.isSafeInteger(value.generation) || value.generation <= 0)
    throw new Error("work attempt generation must be a positive integer");
  return value;
}

/** Read the one native attempt projection for a task. */
export function workAttempt(
  context: Pick<ReadContext, "workAttempts">,
  task: EntityId,
): WorkAttempt | null {
  entity(task);
  const query = context.workAttempts;
  if (!query) throw new Error("work attempt query is unavailable");
  const rows = query([task]);
  if (rows.length > 1)
    throw new Error("work attempt query returned duplicate task rows");
  return rows[0] ?? null;
}

export function beginRouteWorkAttempt(
  context: Pick<WriteContext, "action">,
  task: EntityId,
  worker: EntityId,
  party: EntityId,
  destination: MoveDestination,
): void {
  entity(task);
  entity(worker);
  entity(party);
  if (
    ![destination.x, destination.y, destination.z].every((value) =>
      Number.isFinite(value),
    )
  )
    throw new Error("work attempt destination must be finite");
  if (destination.frame !== null) entity(destination.frame);
  context.action({
    kind: "begin-work-attempt",
    task,
    worker,
    party,
    operation: { kind: "route", destination },
  });
}

export function interruptWorkAttempt(
  context: Pick<WriteContext, "action">,
  attempt: WorkAttemptKey,
  operationSequence: number,
  cause: WorkInterruptCause,
): void {
  const exact = key(attempt);
  context.action({
    kind: "interrupt-work-attempt",
    task: exact.task,
    generation: exact.generation,
    sequence: sequence(operationSequence),
    cause,
  });
}

/** Replace only the current route operation, preserving its attempt generation. */
export function retargetRouteWorkAttempt(context: Pick<WriteContext, "action">, attempt: WorkAttemptKey, operationSequence: number, destination: MoveDestination): void {
  const exact = key(attempt);
  const operation = sequence(operationSequence);
  if (![destination.x, destination.y, destination.z].every(value => Number.isFinite(value))) throw new Error("work attempt destination must be finite");
  if (destination.frame !== null) entity(destination.frame);
  context.action({ kind: "retarget-work-attempt", task: exact.task, generation: exact.generation, sequence: operation, destination });
}

/** Acknowledge only the currently projected terminal operation. */
export function acknowledgeWorkAttempt(
  context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">,
  attempt: WorkAttemptKey,
  operationSequence: number,
): void {
  const exact = key(attempt);
  const operation = sequence(operationSequence);
  const current = workAttempt(context, exact.task);
  if (
    !current ||
    current.key.generation !== exact.generation ||
    current.phase.kind !== "outcome" ||
    current.phase.operation.sequence !== operation ||
    current.phase.operation.attempt.generation !== exact.generation
  ) {
    throw new Error("work attempt terminal outcome is stale");
  }
  context.action({
    kind: "acknowledge-work-attempt",
    task: exact.task,
    generation: exact.generation,
    sequence: operation,
  });
}

export function continueConstructionWorkAttempt(
  context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">,
  attempt: WorkAttemptKey,
  operationSequence: number,
  site: EntityId,
  contact: MoveDestination,
  mode: "bind" | "work",
): void {
  const exact = key(attempt);
  const operation = sequence(operationSequence);
  entity(site);
  if (![contact.x, contact.y, contact.z].every(Number.isFinite))
    throw new Error("construction contact must be finite");
  const current = workAttempt(context, exact.task);
  if (
    !current ||
    current.key.generation !== exact.generation ||
    current.phase.kind !== "outcome" ||
    current.phase.operation.sequence !== operation ||
    current.phase.result.kind !== "completed"
  )
    throw new Error("work attempt completed outcome is stale");
  context.action({
    kind: "continue-work-attempt",
    task: exact.task,
    generation: exact.generation,
    sequence: operation,
    nextActivity: { kind: "construction", site, contact, mode },
  });
}
