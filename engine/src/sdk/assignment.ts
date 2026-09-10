import type { AssignmentCandidate, AssignmentPair, EntityId } from "../contracts";

const validId = (value: unknown): value is EntityId => typeof value === "string" && value.length > 0 && value.length <= 128;
export function checkedAssignments(candidates: readonly AssignmentCandidate[], maxEdges = 128): readonly AssignmentCandidate[] {
  if (!Array.isArray(candidates) || !Number.isSafeInteger(maxEdges) || maxEdges < 1 || maxEdges > 128 || candidates.length > 128) throw new Error("invalid assignment batch");
  const bytes = new TextEncoder().encode(JSON.stringify(candidates)).byteLength;
  if (bytes > 4096) throw new Error("assignment batch too large");
  for (const candidate of candidates) if (!validId(candidate.worker) || !validId(candidate.task) || typeof candidate.cost !== "number" || !Number.isFinite(candidate.cost) || candidate.cost < 0) throw new Error("invalid assignment candidate");
  return structuredClone(candidates);
}
export function assign(port: { assign(candidates: readonly AssignmentCandidate[], maxEdges?: number): readonly AssignmentPair[] }, candidates: readonly AssignmentCandidate[], maxEdges = 128): readonly AssignmentPair[] {
  return port.assign(checkedAssignments(candidates, maxEdges), maxEdges);
}
