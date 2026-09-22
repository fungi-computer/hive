import type {
  TerrainRegionPatch,
  TerrainBaseline,
  TerrainFace,
} from "./terrain-regions";
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
type ExposureInput = {
  bounds: Bounds;
  core: {
    minX: number;
    maxX: number;
    minY?: number;
    maxY?: number;
    minZ: number;
    maxZ: number;
  };
  level: number;
  sample: (cell: [number, number, number]) => Sample;
  columnTop?: (x: number, z: number) => number | null;
  maxFaces?: number;
};
export function exposeTerrainFaces(input: ExposureInput): TerrainFace[];
export function terrainExposureSteps(
  input: ExposureInput,
): Generator<TerrainFace[], void, unknown>;
type PatchInput = {
  patch: TerrainRegionPatch;
  baseline: TerrainBaseline;
  level: number;
};
export function terrainPatchExposureSteps(
  input: PatchInput,
): Generator<TerrainFace[], void, unknown>;
export function exposeTerrainPatch(input: PatchInput): TerrainFace[];
