import type {
  TerrainBaseline,
  TerrainRegionPatch,
  TerrainRegionKey,
} from "./terrain-regions";
export const TERRAIN_REGION_EDGE: 8;
export const TERRAIN_REGION_HEIGHT: 128;
export const MAX_TERRAIN_REGION_COLUMNS: 100;
export const MAX_TERRAIN_REGION_RUNS: 130;
export function terrainRegionLayout(
  world: TerrainBaseline["bounds"],
  key: TerrainRegionKey,
): {
  bounds: TerrainBaseline["bounds"];
  coverage: TerrainBaseline["bounds"];
} | null;
export function validateTerrainMaterialPatch(
  patch: TerrainRegionPatch,
  baseline?: TerrainBaseline,
): void;
export function freezeTerrainMaterialPatch(
  patch: TerrainRegionPatch,
): TerrainRegionPatch;
