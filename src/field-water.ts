import type {
  Actor,
  Clearing,
  MaterialsState,
  WaterDeliveryOperation,
} from "./model.ts";
import type { MaterialPortion } from "./engine/materials/index.ts";
import { compensatedSum } from "./engine/environment/arithmetic.mjs";
import { terrainEnvironment } from "./terrain.ts";
import { removedWaterKg } from "./terrain-removals.ts";
import { waterEnvironmentFacts } from "./world-presets/goblin-environment/water-state.ts";
import {
  prepareEnvironmentWaterTransfer,
  type EnvironmentState,
} from "./world-presets/goblin-environment/environment-state.ts";
import {
  importVesselContents,
  exportVesselContents,
  transferForActor,
} from "./materials.ts";
import { sourceContainerSpec } from "./finite-sources.ts";
import { waterSupplyProblem } from "./water-supply.ts";
import {
  FIELD_WATER,
  fieldWaterProblem,
  fieldWaterAccess,
  type FieldWaterReference,
} from "./field-water-source.ts";

type WaterState = Pick<
  Clearing,
  "materials" | "sources" | "terrain" | "sites" | "water" | "terrainRemovals"
>;

/** Current live/processed/consumed portions complete the physical boundary.
 * No cumulative material counter or second historical field baseline is saved. */
export function fieldWaterBalance(state: WaterState) {
  const materials = state.materials;
  const materialUnits =
    materials.lots.reduce(
      (sum, lot) => sum + (lot.material === "water" ? lot.quantity : 0),
      0,
    ) +
    materials.transformations.reduce(
      (sum, transformation) =>
        sum +
        transformation.inputs.reduce(
          (n, input) => n + (input.material === "water" ? input.quantity : 0),
          0,
        ),
      0,
    ) +
    materials.sinks.reduce(
      (sum, sink) => sum + (sink.material === "water" ? sink.quantity : 0),
      0,
    );
  const initialMaterialUnits = state.sources
    .filter((source) => source.kind === "spring")
    .reduce((sum, source) => sum + sourceContainerSpec(source).capacity, 0);
  if (
    !Number.isSafeInteger(materialUnits) ||
    !Number.isSafeInteger(initialMaterialUnits)
  )
    throw new Error("water material total exceeds exact integer capacity");
  const facts = waterEnvironmentFacts(state.water, {
    terrain: terrainEnvironment(state.terrain),
    sites: state.sites,
  });
  const residualKg = compensatedSum([
    facts.boundaryKg,
    removedWaterKg(state.terrainRemovals),
    FIELD_WATER.kgPerUnit * (materialUnits - initialMaterialUnits),
  ]);
  const toleranceKg = 1e-9 + 64 * Number.EPSILON * facts.initialTotalKg;
  return { materialUnits, initialMaterialUnits, residualKg, toleranceKg };
}
export function waterConservationProblem(state: WaterState): string | null {
  const balance = fieldWaterBalance(state);
  return Math.abs(balance.residualKg) <= balance.toleranceKg
    ? null
    : `water field/material balance is ${balance.residualKg} kg`;
}

type TransferRequest = FieldWaterReference & {
  operation: string;
  quantity: number;
};
type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
function resolveDrawingWorker(
  state: Clearing,
  operationId: string,
): Result<{ actor: Actor; operation: WaterDeliveryOperation }> {
  const operation = state.operations.find((entry) => entry.id === operationId);
  if (
    operation?.kind !== "water-delivery" ||
    operation.execution.phase !== "draw"
  )
    return { ok: false as const, reason: "field-transfer-needs-active-draw" };
  const transfer = state.materials.transfers.find(
    (entry) =>
      entry.owner.kind === "operation" &&
      entry.owner.operation === operation.id,
  );
  const actor = transfer && state.actors[transfer.actor];
  if (
    !actor ||
    actor.drafted ||
    actor.task?.target !== operation.id ||
    actor.task.kind !== "water-delivery" ||
    actor.task.job !== operation.job ||
    transferForActor(state.materials, actor.id) !== transfer
  )
    return {
      ok: false as const,
      reason: "field-transfer-needs-current-worker",
    };
  return { ok: true, value: { actor, operation } };
}
function preflight(
  state: Clearing,
  input: TransferRequest,
  direction: "withdraw" | "deposit",
) {
  if (state.paused) return { ok: false as const, reason: "world-paused" };
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0)
    return { ok: false as const, reason: "invalid-quantity" };
  const problem = fieldWaterProblem(state, {
    binding: input.binding,
    nodeId: input.nodeId,
  });
  if (problem) return { ok: false as const, reason: problem };
  const worker = resolveDrawingWorker(state, input.operation);
  if (!worker.ok) return worker;
  const { actor, operation } = worker.value;
  if (
    direction === "withdraw" &&
    (operation.supply.kind !== "field" ||
      operation.supply.binding !== input.binding ||
      operation.supply.nodeId !== input.nodeId)
  )
    return { ok: false as const, reason: "field-supply-mismatch" };
  const access = fieldWaterAccess(
    state,
    { binding: input.binding, nodeId: input.nodeId },
    direction,
  );
  if (
    !access.some(
      (cell) => actor.x === cell.x && actor.y === cell.y && actor.z === cell.z,
    ) ||
    actor.mode === "walk"
  )
    return { ok: false as const, reason: "field-water-out-of-reach" };
  const balance = waterConservationProblem(state);
  if (balance) return { ok: false as const, reason: balance };
  return { ok: true as const, value: operation };
}
function commitPair(
  state: Clearing,
  materials: MaterialsState,
  environment: EnvironmentState,
  operation: WaterDeliveryOperation,
): void {
  const { water, air } = environment;
  const problem = waterConservationProblem({
    materials,
    terrain: state.terrain,
    sites: state.sites,
    terrainRemovals: state.terrainRemovals,
    water,
    sources: state.sources,
  });
  if (problem) throw new Error(problem);
  const referenceProblem = waterSupplyProblem(
    { ...state, materials, water, air },
    operation.pail,
    operation.quantity,
    operation.supply,
  );
  if (referenceProblem) throw new Error(referenceProblem);
  // Everything fallible happens above. Never publish one half and then catch
  // the other's failure; both owners produce detached checked successors.
  // The work owner retains this state object across its draw/deliver callbacks.
  // Preserve that handle while replacing its privately prepared contents.
  Object.assign(state.materials, materials);
  state.water = water;
  state.air = air;
  state.workDirty = true;
}

export function drawFieldWater(
  state: Clearing,
  input: TransferRequest,
): Result<MaterialPortion[]> {
  const admitted = preflight(state, input, "withdraw");
  if (!admitted.ok) return admitted;
  const materials = structuredClone(state.materials);
  const supplied = importVesselContents(materials, {
    operation: input.operation,
    material: FIELD_WATER.material,
    quantity: input.quantity,
  });
  if (!supplied.ok) return supplied;
  try {
    const next = prepareEnvironmentWaterTransfer(
      state,
      {
        terrain: terrainEnvironment(state.terrain),
        sites: state.sites,
      },
      {
        id: input.nodeId,
        direction: "withdraw",
        massKg: input.quantity * FIELD_WATER.kgPerUnit,
      },
    );
    if (next.status === "blocked")
      return {
        ok: false,
        reason: `field-transfer-${next.medium}-${next.reason}`,
      };
    commitPair(state, materials, next.state, admitted.value);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "field-transfer-rejected",
    };
  }
  return { ok: true, value: [supplied.value] };
}

/** Initial return primitive for trusted host composition, before a separate UI
 * job. Only unpromised contents in active draw can leave; delivery promises
 * cannot silently be invalidated. An outward transfer is never a consumption. */
export function returnFieldWater(
  state: Clearing,
  input: TransferRequest & {
    portions: readonly MaterialPortion[];
  },
): Result<void> {
  const admitted = preflight(state, input, "deposit");
  if (!admitted.ok) return admitted;
  const materials = structuredClone(state.materials);
  const released = exportVesselContents(materials, {
    operation: input.operation,
    material: FIELD_WATER.material,
    quantity: input.quantity,
    portions: input.portions,
  });
  if (!released.ok) return released;
  try {
    const next = prepareEnvironmentWaterTransfer(
      state,
      {
        terrain: terrainEnvironment(state.terrain),
        sites: state.sites,
      },
      {
        id: input.nodeId,
        direction: "deposit",
        massKg: input.quantity * FIELD_WATER.kgPerUnit,
      },
    );
    if (next.status === "blocked")
      return {
        ok: false,
        reason: `field-transfer-${next.medium}-${next.reason}`,
      };
    commitPair(state, materials, next.state, admitted.value);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "field-transfer-rejected",
    };
  }
  return { ok: true, value: undefined };
}
