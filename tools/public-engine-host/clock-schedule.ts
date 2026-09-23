import { STEP_MS, clockRequest } from "./protocol.ts";

/** Advance one physical step; an overrun slows wall cadence instead of creating overdue alarms. */
export function advanceClockOccurrence(sequence: number, dueDeadline: number, completedAt: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || !Number.isSafeInteger(dueDeadline) || dueDeadline < 0 ||
      !Number.isSafeInteger(completedAt) || completedAt < 0 || completedAt < dueDeadline)
    throw new Error("public-host-format");
  const nextSequence = sequence + 1;
  const deadline = Math.max(dueDeadline + STEP_MS, completedAt + STEP_MS);
  if (!Number.isSafeInteger(nextSequence) || !Number.isSafeInteger(deadline)) throw new Error("public-host-format");
  return {
    sequence: nextSequence,
    request: JSON.stringify(clockRequest(nextSequence)),
    deadline,
  };
}
