import { STEP_MS, clockRequest } from "./protocol.ts";

/** Advance exactly one persisted clock occurrence from its scheduled deadline. */
export function advanceClockOccurrence(sequence: number, dueDeadline: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || !Number.isSafeInteger(dueDeadline) || dueDeadline < 0)
    throw new Error("public-host-format");
  const nextSequence = sequence + 1;
  const deadline = dueDeadline + STEP_MS;
  if (!Number.isSafeInteger(nextSequence) || !Number.isSafeInteger(deadline)) throw new Error("public-host-format");
  return {
    sequence: nextSequence,
    request: JSON.stringify(clockRequest(nextSequence)),
    deadline,
  };
}
