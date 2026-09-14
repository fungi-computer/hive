import { entity } from "./authoring";
import type {
  EntityId,
  ConstructionAccessContact,
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

/** Query native attempt ownership without leaking the port's non-empty batch contract. */
export function workAttemptsFor(
  context: Pick<ReadContext, "workAttempts">,
  tasks: readonly EntityId[],
): readonly WorkAttempt[] {
  const unique = [...new Set(tasks)];
  if (!unique.length) return [];
  const query = context.workAttempts;
  if (!query) throw new Error("work attempt query is unavailable");
  const rows: WorkAttempt[] = [];
  for (let offset = 0; offset < unique.length; offset += 128) {
    const batch = unique.slice(offset, offset + 128);
    const returned = query(batch);
    const requested = new Set(batch);
    for (const attempt of returned) {
      if (!requested.has(attempt.key.task))
        throw new Error("work attempt query returned an unrequested task");
      if (rows.some((row) => row.key.task === attempt.key.task))
        throw new Error("work attempt query returned duplicate task rows");
      rows.push(attempt);
    }
  }
  return rows;
}

/** Read the one native attempt projection for a task. */
export function workAttempt(
  context: Pick<ReadContext, "workAttempts">,
  task: EntityId,
): WorkAttempt | null {
  entity(task);
  const rows = workAttemptsFor(context, [task]);
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

export function continueRouteWorkAttempt(
  context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">,
  attempt: WorkAttemptKey,
  operationSequence: number,
  destination: MoveDestination,
): void {
  const exact = key(attempt), operation = sequence(operationSequence);
  if (![destination.x, destination.y, destination.z].every(Number.isFinite)) throw new Error("work attempt destination must be finite");
  if (destination.frame !== null) entity(destination.frame);
  const current = workAttempt(context, exact.task);
  if (!current || current.key.generation !== exact.generation || current.phase.kind !== "outcome" || current.phase.operation.sequence !== operation || current.phase.result.kind !== "completed") throw new Error("work attempt completed outcome is stale");
  context.action({ kind: "continue-work-attempt", task: exact.task, generation: exact.generation, sequence: operation, nextActivity: { kind: "route", destination } });
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
  contact: ConstructionAccessContact,
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
    nextActivity: { kind: "construction", site, contact: { x: contact.x, y: contact.y, z: contact.z, frame: null }, mode },
  });
}

export function continueDeconstructionWorkAttempt(
  context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">,
  attempt: WorkAttemptKey,
  operationSequence: number,
  site: EntityId,
  contact: ConstructionAccessContact,
): void {
  const exact = key(attempt), operation = sequence(operationSequence);
  entity(site);
  if (![contact.x, contact.y, contact.z].every(Number.isFinite)) throw new Error("deconstruction contact must be finite");
  const current = workAttempt(context, exact.task);
  if (!current || current.key.generation !== exact.generation || current.phase.kind !== "outcome" || current.phase.operation.sequence !== operation || current.phase.result.kind !== "completed") throw new Error("work attempt completed outcome is stale");
  context.action({ kind: "continue-work-attempt", task: exact.task, generation: exact.generation, sequence: operation, nextActivity: { kind: "deconstruction", site, contact: { x: contact.x, y: contact.y, z: contact.z, frame: null } } });
}

function requireCompleted(context: Pick<ReadContext, "workAttempts">, attempt: WorkAttemptKey, operation: number): void {
  const current = workAttempt(context, attempt.task);
  if (!current || current.key.generation !== attempt.generation || current.phase.kind !== "outcome" || current.phase.operation.sequence !== operation || current.phase.result.kind !== "completed") throw new Error("work attempt completed outcome is stale");
}

export function continueExcavationWorkAttempt(context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">, attempt: WorkAttemptKey, operationSequence: number, cell: readonly [number, number, number], expectedMaterial: number, replacementMaterial: number): void {
  const exact = key(attempt), operation = sequence(operationSequence);
  if (cell.length !== 3 || !cell.every(Number.isSafeInteger) || ![expectedMaterial, replacementMaterial].every(Number.isSafeInteger)) throw new Error("excavation activity must be integral");
  requireCompleted(context, exact, operation);
  context.action({ kind: "continue-work-attempt", task: exact.task, generation: exact.generation, sequence: operation, nextActivity: { kind: "excavation", cell, expectedMaterial, replacementMaterial } });
}

export function continueResourceEstablishWorkAttempt(context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">, attempt: WorkAttemptKey, operationSequence: number, site: EntityId, definition: string, cell: readonly [number, number, number]): void {
  const exact = key(attempt), operation = sequence(operationSequence); entity(site);
  if (cell.length !== 3 || !cell.every(Number.isSafeInteger)) throw new Error("resource cell must be integral");
  requireCompleted(context, exact, operation);
  context.action({ kind: "continue-work-attempt", task: exact.task, generation: exact.generation, sequence: operation, nextActivity: { kind: "resource-establish", site, definition, cell } });
}

export function continueResourceTendWorkAttempt(context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">, attempt: WorkAttemptKey, operationSequence: number, site: EntityId, vessel: EntityId): void {
  const exact = key(attempt), operation = sequence(operationSequence); entity(site); entity(vessel); requireCompleted(context, exact, operation);
  context.action({ kind: "continue-work-attempt", task: exact.task, generation: exact.generation, sequence: operation, nextActivity: { kind: "resource-tend", site, vessel } });
}

export function continueResourceExtractWorkAttempt(context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">, attempt: WorkAttemptKey, operationSequence: number, source: EntityId): void {
  const exact = key(attempt), operation = sequence(operationSequence); entity(source); requireCompleted(context, exact, operation);
  context.action({ kind: "continue-work-attempt", task: exact.task, generation: exact.generation, sequence: operation, nextActivity: { kind: "resource-extract", source } });
}

export function continueFieldWaterWorkAttempt(context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">, attempt: WorkAttemptKey, operationSequence: number, vessel: EntityId, cell: readonly [number, number, number], direction: "withdraw" | "deposit", portions: number): void {
  const exact = key(attempt), operation = sequence(operationSequence); entity(vessel);
  if (cell.length !== 3 || !cell.every(Number.isSafeInteger) || !Number.isSafeInteger(portions) || portions <= 0) throw new Error("field water activity is invalid");
  requireCompleted(context, exact, operation);
  context.action({ kind: "continue-work-attempt", task: exact.task, generation: exact.generation, sequence: operation, nextActivity: { kind: "field-water", vessel, cell, direction, portions } });
}

/** Continue one admitted attempt through the native material transfer owner. */
export function continueMaterialTransferAttempt(
  context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">,
  attempt: WorkAttemptKey,
  operationSequence: number,
  lot: EntityId,
  from: EntityId,
  to: EntityId,
  quantity: number,
): void {
  const exact = key(attempt), operation = sequence(operationSequence);
  entity(lot); entity(from); entity(to);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("material transfer quantity must be positive");
  const current = workAttempt(context, exact.task);
  if (!current || current.key.generation !== exact.generation || current.phase.kind !== "outcome" || current.phase.operation.sequence !== operation || current.phase.result.kind !== "completed") throw new Error("work attempt completed outcome is stale");
  context.action({ kind: "continue-work-attempt", task: exact.task, generation: exact.generation, sequence: operation, nextActivity: { kind: "material-transfer", lot, from, to, quantity } });
}

/** Continue an admitted attempt through the native ground-custody owner. */
export function continueMaterialDropAttempt(
  context: Pick<WriteContext, "action"> & Pick<ReadContext, "workAttempts">,
  attempt: WorkAttemptKey,
  operationSequence: number,
  lot: EntityId,
): void {
  const exact = key(attempt), operation = sequence(operationSequence);
  entity(lot);
  const current = workAttempt(context, exact.task);
  if (!current || current.key.generation !== exact.generation || current.phase.kind !== "outcome" || current.phase.operation.sequence !== operation || current.phase.result.kind !== "completed") throw new Error("work attempt completed outcome is stale");
  context.action({ kind: "continue-work-attempt", task: exact.task, generation: exact.generation, sequence: operation, nextActivity: { kind: "material-drop", lot } });
}
