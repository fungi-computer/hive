import type { TerrainRegionPatch } from "./terrain-regions";
export const MAX_TERRAIN_REGION_HEIGHT: 1024;
export const MAX_TERRAIN_REGION_SAMPLES: 65536;
type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};
type Sample =
  | { kind: "known"; solid: boolean; material: number }
  | { kind: "unknown" | "outside" };
export function exposeTerrainFaces(input: {
  bounds: Bounds;
  core: { minX: number; maxX: number; minZ: number; maxZ: number };
  level: number;
  sample: (cell: [number, number, number]) => Sample;
  columnTop?: (x: number, z: number) => number | null;
  maxFaces?: number;
}): TerrainRegionPatch["faces"];
