import { system, type SystemOptions } from "./authoring";
import { allocateWork, type WorkClaim } from "./work-allocation";
import { WorkParticipation } from "./work-control";
import type { AssignmentPair, AssignmentCandidate, EntityId, WriteContext } from "../contracts";

export const WORK_RETRY_INTERVAL = 8;

/**
 * Return whether a blocked task is due for its deterministic retry slot.
 * A task gets exactly one slot in every interval; the task id is the only
 * source of staggering, so retries survive reloads and never consume random state.
 */
export function shouldRetryWorkTask(task: EntityId, tick: number, interval = WORK_RETRY_INTERVAL): boolean {
  if (!Number.isInteger(interval) || interval <= 0) throw new Error("retry interval must be a positive integer");
  const text = String(task);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const slot = (hash >>> 0) % interval;
  return (((slot + tick) % interval) + interval) % interval === 0;
}

export type WorkCandidate = Pick<AssignmentCandidate, "worker" | "task">;
type TaggedCandidate = WorkCandidate & { readonly providerIndex: number };
type TaggedAssignment = AssignmentPair & { readonly providerIndex: number };

export type PreparedWorkProvider<Candidate extends WorkCandidate = WorkCandidate> = {
  readonly claims: readonly WorkClaim[];
  readonly candidates: readonly Candidate[];
  /** Actors occupied by native or another authoritative work owner this tick. */
  readonly occupiedActors?: readonly EntityId[];
  /** Cheap optimistic cost used to propose a joint assignment. */
  readonly lowerBound: (candidate: Candidate) => number;
  /** Exact authoritative cost; expensive route work happens only on proposals. */
  readonly estimate: (candidate: Candidate) => number | null;
  readonly apply: (assignments: readonly AssignmentPair[]) => void;
  readonly progress: () => void;
};

export type WorkProvider<Candidate extends WorkCandidate = WorkCandidate> =
  (context: WriteContext, suspendedActors: ReadonlySet<EntityId>) => PreparedWorkProvider<Candidate>;

export type WorkSystemOptions = Omit<SystemOptions, "run"> & {
  /** Providers have distinct private candidate payloads; the shared owner only
   * relies on the common worker/task/cost shape. */
  readonly providers: readonly WorkProvider<any>[];
  /** Deterministic authored planning phases owned by this work composition. */
  readonly phases?: readonly ((context: WriteContext) => void)[];
};

/**
 * One scheduled owner for all work kinds. Providers prepare bounded indexes and
 * saved claims once, then this owner performs the sole native assignment pass.
 * Provider functions are trusted composition code and never enter saved state.
 */
export function createWorkSystem(options: WorkSystemOptions) {
  return system({
    id: options.id,
    version: options.version,
    reads: [...new Set([...(options.reads ?? []), WorkParticipation])],
    writes: options.writes,
    every: options.every,
    consumesImpacts: options.consumesImpacts,
    run(context) {
      for (const phase of options.phases ?? []) phase(context);
      const participationRows = context.query({ components: [WorkParticipation] });
      const suspendedActors = new Set(
        participationRows.flatMap((row) =>
          row.get(WorkParticipation).automatic ? [] : [row.id],
        ),
      );
      // WorkAttempt is the canonical custody fact across every work family,
      // including native-planner tasks that are intentionally invisible to
      // authored providers. No provider may assign an actor already owned by
      // another durable attempt.
      const canonicallyOccupiedActors = new Set(
        participationRows.flatMap((row) =>
          context.workAttemptForWorker?.(row.id) ? [row.id] : [],
        ),
      );
      const prepared = options.providers.map((provider) => provider(context, suspendedActors));
      const claims = prepared.flatMap((provider) => provider.claims);
      const occupiedActors = new Set([
        ...canonicallyOccupiedActors,
        ...prepared.flatMap((provider) => provider.occupiedActors ?? []),
      ]);
      const candidates: TaggedCandidate[] = prepared.flatMap((provider, providerIndex) =>
        provider.candidates.map((candidate) => ({
          providerIndex,
          ...candidate,
        })),
      );
      const taskProviders = new Map<EntityId, number>();
      prepared.forEach((provider,index) => {
        for (const claim of provider.claims) {
          if (taskProviders.has(claim.task)) throw new Error("work task belongs to competing providers");
          taskProviders.set(claim.task,index);
        }
      });
      for (const candidate of candidates)
        if (taskProviders.get(candidate.task) !== candidate.providerIndex)
          throw new Error(
            `work candidate ${candidate.task} belongs to provider ${String(taskProviders.get(candidate.task))}, not ${candidate.providerIndex}`,
          );
      const available = candidates.filter(
        (candidate) =>
          !occupiedActors.has(candidate.worker) &&
          !suspendedActors.has(candidate.worker),
      );
      const assignments = allocateWork(
        claims,
        available,
        (candidate) => prepared[candidate.providerIndex].lowerBound(candidate),
        (candidate) => prepared[candidate.providerIndex].estimate(candidate),
        (eligible) => {
          const matched = context.assign(eligible.map(({ worker, task, cost }) => ({ worker, task, cost })));
          return matched.map((assignment) => {
            const candidate = available.find((item) =>
              item.worker === assignment.worker && item.task === assignment.task,
            );
            if (!candidate) throw new Error("native matcher returned unknown work assignment");
            return { ...assignment, providerIndex: candidate.providerIndex } satisfies TaggedAssignment;
          });
        },
        new Set([...occupiedActors, ...suspendedActors]),
      );
      const assignmentsByProvider = prepared.map((_, providerIndex) =>
        assignments.filter((assignment) => taskProviders.get(assignment.task) === providerIndex),
      );
      prepared.forEach((provider, providerIndex) => {
        provider.apply(assignmentsByProvider[providerIndex]);
        provider.progress();
      });
    },
  });
}

export type { WorkClaim };
