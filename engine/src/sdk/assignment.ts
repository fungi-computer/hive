import type { AssignmentCandidate, AssignmentPair, EntityId } from "../contracts";

const validId = (value: unknown): value is EntityId =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 128 &&
  /^[A-Za-z0-9._:-]+$/.test(value);

export function checkedAssignments(
  candidates: unknown,
  maxEdges = 128,
): readonly AssignmentCandidate[] {
  if (
    !Array.isArray(candidates) ||
    !Number.isSafeInteger(maxEdges) ||
    maxEdges < 1 ||
    maxEdges > 128 ||
    candidates.length > 128
  ) {
    throw new Error("invalid assignment batch");
  }
  const detached: AssignmentCandidate[] = [];
  for (const candidate of candidates) {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Object.keys(candidate).length !== 3 ||
      !Object.hasOwn(candidate, "worker") ||
      !Object.hasOwn(candidate, "task") ||
      !Object.hasOwn(candidate, "cost")
    ) {
      throw new Error("invalid assignment candidate");
    }
    const value = candidate as Record<string, unknown>;
    if (
      !validId(value.worker) ||
      !validId(value.task) ||
      typeof value.cost !== "number" ||
      !Number.isFinite(value.cost) ||
      value.cost < 0
    ) {
      throw new Error("invalid assignment candidate");
    }
    detached.push({
      worker: value.worker,
      task: value.task,
      cost: value.cost,
    });
  }
  const bytes = new TextEncoder().encode(
    JSON.stringify({ candidates: detached, max_edges: maxEdges }),
  ).byteLength;
  if (bytes > 4096) throw new Error("assignment batch too large");
  return detached;
}

export function assign(
  port: {
    assign(
      candidates: readonly AssignmentCandidate[],
      maxEdges?: number,
    ): readonly AssignmentPair[];
  },
  candidates: readonly AssignmentCandidate[],
  maxEdges = 128,
): readonly AssignmentPair[] {
  return port.assign(candidates, maxEdges);
}
