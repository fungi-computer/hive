import { z } from "zod";
import type { Actor, Cell, Clearing, MaterialsState } from "./model.ts";
import type { MaterialPortion } from "./engine/materials/index.ts";
import {
  balanceTolerance,
  compensatedSum,
} from "./engine/environment/soil/index.js";
import {
  terrainFacts,
  terrainCell,
  TERRAIN_FRAME,
  TERRAIN_VOXEL_METRIC,
  exchangeTerrainWater,
} from "./terrain.ts";
import {
  importVesselContents,
  exportVesselContents,
  transferForActor,
} from "./materials.ts";
import { sourceContainerSpec } from "./finite-sources.ts";

/** Goblin content units, not a rule imposed on every engine material. */
export const FIELD_WATER = Object.freeze({
  id: "goblin-water-1kg-per-unit-v1" as const,
  material: "water" as const,
  kgPerUnit: 1,
  litresPerUnit: 1,
  maxDrawReachM: TERRAIN_VOXEL_METRIC.verticalM,
});
export const fieldWaterReferenceSchema = z
  .object({
    binding: z.literal(FIELD_WATER.id),
    nodeId: z.string().min(1).max(160),
  })
  .strict();
export type FieldWaterReference = z.infer<typeof fieldWaterReferenceSchema>;
type FieldColumn = {
  kind: "pit";
  nodeId: string;
  at: readonly [number, number, number];
  baseYM: number;
  rimYM: number;
  depthM: number;
  massKg: number;
};
type WaterState = Pick<Clearing, "materials" | "sources" | "terrain">;
export type FieldWaterSource = FieldWaterReference & {
  accessCells: readonly Cell[];
  availableUnits: number;
};
function columns(state: Pick<Clearing, "terrain">): readonly FieldColumn[] {
  return terrainFacts(state.terrain).soil.nodes.filter(
    (node: { kind: string }) => node.kind === "pit",
  );
}

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
  const facts = terrainFacts(state.terrain);
  const residualKg = compensatedSum([
    facts.balance.exchangeWaterKg,
    FIELD_WATER.kgPerUnit * (materialUnits - initialMaterialUnits),
  ]);
  const toleranceKg = balanceTolerance(facts.soil.totalMassKg);
  return { materialUnits, initialMaterialUnits, residualKg, toleranceKg };
}
export function waterConservationProblem(state: WaterState): string | null {
  const balance = fieldWaterBalance(state);
  return Math.abs(balance.residualKg) <= balance.toleranceKg
    ? null
    : `water field/material balance is ${balance.residualKg} kg`;
}

/** A drained or temporarily inaccessible column remains a valid work reference. */
export function fieldWaterProblem(
  state: Pick<Clearing, "terrain">,
  reference: FieldWaterReference,
): string | null {
  if (!fieldWaterReferenceSchema.safeParse(reference).success)
    return "unknown field water binding";
  return columns(state).some((column) => column.nodeId === reference.nodeId)
    ? null
    : "missing field water column";
}
function rimCells(
  state: Pick<Clearing, "terrain">,
  column: FieldColumn,
): Cell[] {
  const x = column.at[0] - TERRAIN_FRAME.x,
    z = column.at[2] - TERRAIN_FRAME.z;
  return [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ].flatMap(([dx, dz]) => {
    const cell = { x: x + dx, z: z + dz, level: 0 };
    // The registered wet footprint is interior to this bounded clearing.
    // Terrain owns standing support; the route owner checks all other occupancy.
    return terrainCell(state.terrain, cell.x, cell.z).support ? [cell] : [];
  });
}
function canDraw(column: FieldColumn) {
  const surface = column.baseYM + column.depthM;
  const reach = TERRAIN_FRAME.y * TERRAIN_VOXEL_METRIC.verticalM - surface;
  return reach >= 0 && reach <= FIELD_WATER.maxDrawReachM;
}
/** This is physical stock/access, not a permission or pathfinding result. */
export function fieldWaterSources(
  state: Pick<Clearing, "terrain">,
): FieldWaterSource[] {
  return columns(state)
    .filter(canDraw)
    .map((column) => ({
      binding: FIELD_WATER.id,
      nodeId: column.nodeId,
      accessCells: rimCells(state, column),
      availableUnits: Math.floor(column.massKg / FIELD_WATER.kgPerUnit),
    }))
    .filter(
      (source) => source.availableUnits > 0 && source.accessCells.length > 0,
    )
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}
/** Wake work on actual whole-portion/reach changes, not on every field tick. */
export function fieldWaterSupplyKey(state: Pick<Clearing, "terrain">): string {
  return JSON.stringify(
    fieldWaterSources(state).map((source) => [
      source.nodeId,
      source.availableUnits,
      source.accessCells.map((cell) => [cell.x, cell.z, cell.level]),
    ]),
  );
}

type TransferRequest = FieldWaterReference & {
  operation: string;
  quantity: number;
};
type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
function resolveDrawingActor(
  state: Clearing,
  operationId: string,
): Result<Actor> {
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
  return { ok: true, value: actor };
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
  const worker = resolveDrawingActor(state, input.operation);
  if (!worker.ok) return worker;
  const actor = worker.value;
  const column = columns(state).find(
    (column) => column.nodeId === input.nodeId,
  )!;
  const access = rimCells(state, column);
  if (
    !access.some(
      (cell) =>
        actor.x === cell.x && actor.z === cell.z && actor.level === cell.level,
    ) ||
    actor.mode === "walk" ||
    (direction === "withdraw" && !canDraw(column))
  )
    return { ok: false as const, reason: "field-water-out-of-reach" };
  const balance = waterConservationProblem(state);
  if (balance) return { ok: false as const, reason: balance };
  return { ok: true as const };
}
function commitPair(
  state: Clearing,
  materials: MaterialsState,
  terrain: Clearing["terrain"],
): void {
  const problem = waterConservationProblem({
    materials,
    terrain,
    sources: state.sources,
  });
  if (problem) throw new Error(problem);
  // Everything fallible happens above. Never publish one half and then catch
  // the other's failure; both owners produce detached checked successors.
  // The work owner retains this state object across its draw/deliver callbacks.
  // Preserve that handle while replacing its privately prepared contents.
  Object.assign(state.materials, materials);
  state.terrain = terrain;
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
    const next = exchangeTerrainWater(state.terrain, {
      nodeId: input.nodeId,
      direction: "withdraw",
      massKg: input.quantity * FIELD_WATER.kgPerUnit,
    });
    commitPair(state, materials, next.state);
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
    const next = exchangeTerrainWater(state.terrain, {
      nodeId: input.nodeId,
      direction: "deposit",
      massKg: input.quantity * FIELD_WATER.kgPerUnit,
    });
    commitPair(state, materials, next.state);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "field-transfer-rejected",
    };
  }
  return { ok: true, value: undefined };
}
