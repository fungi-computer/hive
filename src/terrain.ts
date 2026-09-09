import type { Cell, TerrainState } from "./model.ts";
import type { ContainerSpec } from "./materials.ts";

/** One terrain cell is 1m × .54m × 1m. Logical storeys remain separate. */
export const TERRAIN_VOXEL_METRIC = Object.freeze({
  horizontalM: 1,
  verticalM: 0.54,
});
export const AUTHORED_CLEARING_TERRAIN = "authored-clearing-v1" as const;

export function authoredClearingTerrain(): TerrainState {
  return { base: AUTHORED_CLEARING_TERRAIN, edits: [], revision: 0 };
}
function key(at: Pick<Cell, "x" | "z" | "level">): string {
  return `${at.x},${at.z},${at.level}`;
}
function isShallowTerrainCell(at: Pick<Cell, "x" | "z" | "level">): boolean {
  return Number.isInteger(at.x) && Number.isInteger(at.z) && at.level === 0;
}
/** Geometry and support are deliberately independent of pawn routing. */
export function terrainCell(terrain: TerrainState, x: number, z: number) {
  const removed = terrain.edits.some((edit) => edit.x === x && edit.z === z);
  return {
    solid: !removed,
    height: removed ? -TERRAIN_VOXEL_METRIC.verticalM : 0,
    support: !removed,
    revision: terrain.revision,
  };
}
function terrainHasRemovedVoxel(
  terrain: TerrainState,
  at: Pick<Cell, "x" | "z" | "level">,
): boolean {
  return (
    isShallowTerrainCell(at) &&
    terrain.edits.some((edit) => key(edit) === key(at))
  );
}
export function removeShallowVoxel(
  terrain: TerrainState,
  at: Pick<Cell, "x" | "z" | "level">,
): boolean {
  if (!isShallowTerrainCell(at) || terrainHasRemovedVoxel(terrain, at))
    return false;
  terrain.edits.push({ x: at.x, z: at.z, level: 0 });
  terrain.revision++;
  return true;
}
export function backfillShallowVoxel(
  terrain: TerrainState,
  at: Pick<Cell, "x" | "z" | "level">,
): boolean {
  if (!isShallowTerrainCell(at)) return false;
  const index = terrain.edits.findIndex((edit) => key(edit) === key(at));
  if (index < 0) return false;
  terrain.edits.splice(index, 1);
  terrain.revision++;
  return true;
}
/** A terrain fill stages one real soil unit through the ordinary transfer owner. */
export function terrainBackfillBuffer(job: string): ContainerSpec {
  return {
    id: `terrain-backfill:${job}`,
    capacity: 1 as import("./model.ts").PositiveInt,
    accepts: ["soil"],
    bulk: { soil: 1 as import("./model.ts").PositiveInt },
  };
}
