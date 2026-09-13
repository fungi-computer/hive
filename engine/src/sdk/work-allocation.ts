import type {
  AssignmentCandidate,
  AssignmentPair,
  EntityId,
} from "../contracts";

/** Saved task ownership is the input; this projection is rebuilt each tick. */
export interface WorkClaim {
  readonly task: EntityId;
  readonly actor: EntityId | null;
}

type WorkPair = { readonly worker: EntityId; readonly task: EntityId };
type CostState<Candidate extends WorkPair> = {
  readonly candidate: Candidate;
  readonly bound: number;
  exact: number | null | undefined;
};

function eligibleCandidates<Candidate extends WorkPair>(
  claims: readonly WorkClaim[],
  candidates: readonly Candidate[],
  unavailableActors: ReadonlySet<EntityId>,
): readonly Candidate[] {
  const tasks = new Set<EntityId>();
  const occupied = new Set<EntityId>();
  const claimedTasks = new Set<EntityId>();
  for (const claim of claims) {
    if (tasks.has(claim.task)) throw new Error("duplicate work task");
    tasks.add(claim.task);
    if (claim.actor === null) continue;
    if (occupied.has(claim.actor))
      throw new Error("worker has competing work claims");
    occupied.add(claim.actor);
    claimedTasks.add(claim.task);
  }
  const pairs = new Set<string>();
  return candidates.filter((candidate) => {
    if (!tasks.has(candidate.task))
      throw new Error("candidate references unknown work task");
    if (
      occupied.has(candidate.worker) ||
      claimedTasks.has(candidate.task) ||
      unavailableActors.has(candidate.worker)
    )
      return false;
    const key = `${candidate.worker}\0${candidate.task}`;
    if (pairs.has(key)) throw new Error("duplicate work candidate pair");
    pairs.add(key);
    return true;
  });
}

function costStates<Candidate extends WorkPair>(
  candidates: readonly Candidate[],
  lowerBound: (candidate: Candidate) => number,
): CostState<Candidate>[] {
  return candidates.map((candidate) => {
    const bound = lowerBound(candidate);
    if (!Number.isFinite(bound) || bound < 0)
      throw new Error("invalid work candidate lower bound");
    return { candidate, bound, exact: undefined };
  });
}

function proposedCosts<Candidate extends WorkPair>(
  states: readonly CostState<Candidate>[],
): AssignmentCandidate[] {
  return states.flatMap(({ candidate, bound, exact }) =>
    exact === null
      ? []
      : [
          {
            worker: candidate.worker,
            task: candidate.task,
            cost: exact ?? bound,
          },
        ],
  );
}

function selectedState<Candidate extends WorkPair>(
  states: readonly CostState<Candidate>[],
  assignment: AssignmentPair,
): CostState<Candidate> {
  const state = states.find(
    ({ candidate }) =>
      candidate.worker === assignment.worker &&
      candidate.task === assignment.task,
  );
  if (!state) throw new Error("matcher returned unknown work candidate");
  return state;
}

/** All participating work kinds submit one candidate set to the native matcher.
 * Existing claims win, including paused work and workers carrying a task's goods.
 * Callers release claims in their saved task state, never in a separate cache.
 */
export function allocateWork<Candidate extends WorkPair>(
  claims: readonly WorkClaim[],
  candidates: readonly Candidate[],
  lowerBound: (candidate: Candidate) => number,
  estimate: (candidate: Candidate) => number | null,
  match: (
    candidates: readonly AssignmentCandidate[],
  ) => readonly AssignmentPair[],
  unavailableActors: ReadonlySet<EntityId> = new Set(),
): readonly AssignmentPair[] {
  const states = costStates(
    eligibleCandidates(claims, candidates, unavailableActors),
    lowerBound,
  );
  for (let round = 0; round <= states.length; round++) {
    const costed = proposedCosts(states);
    if (!costed.length) return [];
    const proposed = match(costed);
    let resolved = false;
    let needsRematch = false;
    for (const assignment of proposed) {
      const state = selectedState(states, assignment);
      if (state.exact !== undefined) continue;
      const exact = estimate(state.candidate);
      if (exact !== null && (!Number.isFinite(exact) || exact < state.bound))
        throw new Error("invalid exact work candidate cost");
      state.exact = exact;
      resolved = true;
      needsRematch ||= exact === null || exact > state.bound;
    }
    if (!resolved || !needsRematch) return proposed;
  }
  throw new Error("work cost refinement exceeded candidate bound");
}
