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

const ACCEPTED_DETOUR_RATIO = 1.5;
const ACCEPTED_DETOUR_METRES = 4;
const MAX_VALIDATED_ASSIGNMENTS_PER_STEP = 8;
const MAX_ROUTE_VALIDATIONS_PER_STEP = 32;

function materiallyWorse(bound: number, exact: number): boolean {
  return (
    exact >
    Math.max(bound * ACCEPTED_DETOUR_RATIO, bound + ACCEPTED_DETOUR_METRES)
  );
}

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
  validationLimit = MAX_VALIDATED_ASSIGNMENTS_PER_STEP,
): readonly AssignmentPair[] {
  if (!Number.isSafeInteger(validationLimit) || validationLimit < 1)
    throw new Error("invalid work validation limit");
  const states = costStates(
    eligibleCandidates(claims, candidates, unavailableActors),
    lowerBound,
  );
  const costed = proposedCosts(states);
  if (!costed.length) return [];
  let proposed = match(costed);
  let remainingRoutes = MAX_ROUTE_VALIDATIONS_PER_STEP;
  while (remainingRoutes > 0) {
    const exactSelected = proposed.filter((candidate) => {
      const exact = selectedState(states, candidate).exact;
      return exact !== undefined && exact !== null;
    });
    if (exactSelected.length >= validationLimit) break;
    const assignment = proposed.find(
      (candidate) => selectedState(states, candidate).exact === undefined,
    );
    if (!assignment) break;
    const state = selectedState(states, assignment);
    const exact = estimate(state.candidate);
    remainingRoutes--;
    if (exact !== null && (!Number.isFinite(exact) || exact < state.bound))
      throw new Error(
        `invalid exact work candidate cost for ${state.candidate.task}: bound ${state.bound}, exact ${exact}`,
      );
    state.exact = exact;
    if (exact === null || materiallyWorse(state.bound, exact)) {
      const corrected = proposedCosts(states);
      proposed = corrected.length ? [...match(corrected)] : [];
    }
  }
  // Every job and worker participated in the joint matching. Only a bounded
  // number of its exact, reachable selections acquire claims this step.
  return proposed
    .flatMap((assignment) => {
      const exact = selectedState(states, assignment).exact;
      return exact === undefined || exact === null
        ? []
        : [{ ...assignment, cost: exact }];
    })
    .slice(0, validationLimit);
}
