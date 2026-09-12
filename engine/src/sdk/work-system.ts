import { system, type SystemOptions } from "./authoring";
import { allocateWork, type WorkClaim } from "./work-allocation";
import { WorkParticipation } from "./work-control";
import type { AssignmentPair, AssignmentCandidate, EntityId, WriteContext } from "../contracts";

export type WorkCandidate = Pick<AssignmentCandidate, "worker" | "task">;
type TaggedCandidate = WorkCandidate & { readonly providerIndex: number };
type TaggedAssignment = AssignmentPair & { readonly providerIndex: number };

export type PreparedWorkProvider<Candidate extends WorkCandidate = WorkCandidate> = {
  readonly claims: readonly WorkClaim[];
  readonly candidates: readonly Candidate[];
  /** Actors occupied by native or another authoritative work owner this tick. */
  readonly occupiedActors?: readonly EntityId[];
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
    reads: [...new Set([...options.reads, WorkParticipation])],
    writes: options.writes,
    every: options.every,
    consumesImpacts: options.consumesImpacts,
    run(context) {
      const suspendedActors = new Set(
        context.query({ components: [WorkParticipation] }).flatMap((row) =>
          row.get(WorkParticipation).automatic ? [] : [row.id],
        ),
      );
      const prepared = options.providers.map((provider) => provider(context, suspendedActors));
      const claims = prepared.flatMap((provider) => provider.claims);
      const occupiedActors = new Set(prepared.flatMap((provider) => provider.occupiedActors ?? []));
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
          throw new Error("work candidate task belongs to another provider");
      const available = candidates.filter((candidate) =>
        !occupiedActors.has(candidate.worker) && !suspendedActors.has(candidate.worker),
      );
      const assignments = allocateWork(
        claims,
        available,
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
