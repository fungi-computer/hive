import {
  advanceFiniteWork,
  workProgressSchema,
  type WorkDefinition,
  type WorkHost,
  type WorkOutcome,
  type WorkProgressRecord,
} from "./progress.ts";
import type { createMaterialOwner } from "../materials/index.ts";
import type { MaterialsState, LegalDrop } from "../materials/types.ts";
type MaterialOwner<M extends string> = ReturnType<
  typeof createMaterialOwner<M>
>;
export type WorkRecord = { id: string; job: string };
type Uses<M extends string> = Pick<
  MaterialOwner<M>["uses"],
  | "acquireVesselForOperation"
  | "acquireLotForOperation"
  | "rebindOperationVessel"
  | "parkOperationVessel"
  | "interruptOperation"
>;
type VesselRequest<M extends string> = Parameters<
  Uses<M>["acquireVesselForOperation"]
>[1];
type PortionRequest<M extends string> = Parameters<
  Uses<M>["acquireLotForOperation"]
>[1];
export type Acquisition<M extends string> =
  | { kind: "vessel"; request: VesselRequest<M> }
  | { kind: "portion"; request: PortionRequest<M> };
/** Owns the lifecycle join between one work record and its material claim.
 * Records carry caller metadata; this module neither duplicates nor interprets it.
 * The caller resolves eligibility before submitting one outcome operation. */
export function createFiniteWorkOwner<M extends string>(uses: Uses<M>) {
  function remove<R extends WorkRecord>(records: R[], id: string) {
    const index = records.findIndex((record) => record.id === id);
    if (index >= 0) records.splice(index, 1);
  }
  const owner = {
    admit<R extends WorkRecord & WorkProgressRecord>(
      records: R[],
      materials: MaterialsState<M>,
      record: R,
      acquisition: Acquisition<M>,
    ) {
      const progress = workProgressSchema.safeParse(record.execution);
      if (!progress.success || progress.data.phase !== "acquire")
        return { ok: false as const, reason: "invalid-initial-progress" };
      if (
        acquisition.request.operation !== record.id ||
        records.some(
          (entry) => entry.id === record.id || entry.job === record.job,
        )
      )
        return { ok: false as const, reason: "work-identity-conflict" };
      const acquired =
        acquisition.kind === "vessel"
          ? uses.acquireVesselForOperation(materials, acquisition.request)
          : uses.acquireLotForOperation(materials, acquisition.request);
      if (!acquired.ok) return acquired;
      records.push(record);
      return { ok: true as const, value: record.id };
    },
    attach<R extends WorkRecord>(
      records: R[],
      materials: MaterialsState<M>,
      request: Parameters<Uses<M>["rebindOperationVessel"]>[1],
    ) {
      if (!records.some((record) => record.id === request.operation))
        return { ok: false as const, reason: "work-missing" };
      return uses.rebindOperationVessel(materials, request);
    },
    advance<R extends WorkRecord & WorkProgressRecord>(
      records: R[],
      materials: MaterialsState<M>,
      id: string,
      definition: WorkDefinition,
      host: WorkHost,
      actor: string,
      drop: LegalDrop,
    ): WorkOutcome {
      const record = records.find((entry) => entry.id === id);
      if (!record) return "interrupted";
      const outcome = advanceFiniteWork(record, definition, host);
      if (outcome === "pending") return outcome;
      const release =
        outcome === "completed" || definition.interruption === "release";
      const result = owner.interrupt(
        records,
        materials,
        release
          ? { kind: "release", operation: record.id, drop }
          : { kind: "park", operation: record.id, actor, drop },
      );
      if (!result.ok) throw new Error(result.reason);
      return outcome;
    },
    interrupt<R extends WorkRecord>(
      records: R[],
      materials: MaterialsState<M>,
      input:
        | { kind: "park"; operation: string; actor: string; drop: LegalDrop }
        | { kind: "release"; operation: string; drop?: LegalDrop },
    ) {
      if (!records.some((record) => record.id === input.operation))
        return { ok: false as const, reason: "work-missing" };
      if (input.kind === "park")
        return uses.parkOperationVessel(materials, {
          actor: input.actor,
          operation: input.operation,
          drop: input.drop,
        });
      const released = uses.interruptOperation(
        materials,
        input.operation,
        input.drop,
      );
      if (!released.ok) return released;
      remove(records, input.operation);
      return released;
    },
  };
  return owner;
}
