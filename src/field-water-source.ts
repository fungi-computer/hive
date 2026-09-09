import { z } from "zod";
import type { Cell, Clearing } from "./model.ts";
import {
  terrainFacts,
  terrainCell,
  TERRAIN_FRAME,
  TERRAIN_VOXEL_METRIC,
} from "./terrain.ts";

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
export type FieldWaterSource = FieldWaterReference & {
  accessCells: readonly Cell[];
  availableUnits: number;
};
function columns(state: Pick<Clearing, "terrain">): readonly FieldColumn[] {
  return terrainFacts(state.terrain).soil.nodes.filter(
    (node: { kind: string }) => node.kind === "pit",
  );
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

/** The same physical reach rule is used for estimates and actual work. */
export function fieldWaterAccess(
  state: Pick<Clearing, "terrain">,
  reference: FieldWaterReference,
  direction: "withdraw" | "deposit",
): Cell[] {
  if (fieldWaterProblem(state, reference)) return [];
  const column = columns(state).find(
    (column) => column.nodeId === reference.nodeId,
  )!;
  return direction === "withdraw" && !canDraw(column)
    ? []
    : rimCells(state, column);
}
