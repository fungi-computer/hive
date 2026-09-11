import type { AssignmentCandidate, AssignmentPair, EntityId } from "../contracts";

/** Saved task ownership is the input; this projection is rebuilt each tick. */
export interface WorkClaim {
  readonly task: EntityId;
  readonly actor: EntityId | null;
}

/** All participating work kinds submit one candidate set to the native matcher.
 * Existing claims win, including paused work and workers carrying a task's goods.
 * Callers release claims in their saved task state, never in a separate cache.
 */
export function allocateWork(
  claims: readonly WorkClaim[],
  candidates: readonly AssignmentCandidate[],
  match: (candidates: readonly AssignmentCandidate[]) => readonly AssignmentPair[],
): readonly AssignmentPair[] {
  const tasks = new Set<EntityId>();
  const occupied = new Set<EntityId>();
  const claimedTasks = new Set<EntityId>();
  for (const claim of claims) {
    if (tasks.has(claim.task)) throw new Error("duplicate work task");
    tasks.add(claim.task);
    if (claim.actor === null) continue;
    if (occupied.has(claim.actor)) throw new Error("worker has competing work claims");
    occupied.add(claim.actor);
    claimedTasks.add(claim.task);
  }
  const eligible = candidates.filter(candidate => {
    if (!tasks.has(candidate.task)) throw new Error("candidate references unknown work task");
    return !occupied.has(candidate.worker) && !claimedTasks.has(candidate.task);
  });
  return eligible.length ? match(eligible) : [];
}
