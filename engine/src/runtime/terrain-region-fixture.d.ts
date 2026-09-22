import type { TerrainBaseline, TerrainRegionPatch } from "./terrain-regions";
export function materialPatch(
  key: readonly [number, number, number?],
  world?: TerrainBaseline["bounds"],
  sample?: (cell: [number, number, number]) => number,
): TerrainRegionPatch;
