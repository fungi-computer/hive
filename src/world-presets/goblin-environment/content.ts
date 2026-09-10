import { worldIdentity } from "../height-caves.mjs";
import { freeze } from "../../engine/environment/water/geometry.mjs";

/** Goblin content: a playable clearing inside a finite environmental collar.
 * Placement bounds and physical-query bounds are deliberately distinct. */
export const GOBLIN_FRAME = Object.freeze({
  x: -7,
  y: 15,
  z: 119,
  storeyVoxels: 4,
});
export const GOBLIN_MAP_SIDE = 15;
export const GOBLIN_SPACING_M = Object.freeze([1, 0.54, 1] as const);
export const GOBLIN_WORLD_IDENTITY = freeze(
  worldIdentity({
    worldId: "goblin-clearing",
    seed: "hive-world-lab-seed-20260907",
  }),
);
export const GOBLIN_ENVIRONMENT_BOUNDS = Object.freeze({
  min: Object.freeze([GOBLIN_FRAME.x - 1, -64, GOBLIN_FRAME.z - 1] as const),
  max: Object.freeze([
    GOBLIN_FRAME.x + GOBLIN_MAP_SIDE + 1,
    64,
    GOBLIN_FRAME.z + GOBLIN_MAP_SIDE + 1,
  ] as const),
});

/** Game-scale moisture and rates; not a measured hydraulic material model. */
export const GOBLIN_LOAM = Object.freeze({
  id: "goblin-loam-v1",
  porosity: 0.45,
  retention: 0.18,
  absorbMPerS: 0.003,
  seepMPerS: 0.001,
});
export const GOBLIN_WATER_RULES = Object.freeze({
  id: "goblin-clearing-water-v2",
  fallMPerS: 2,
  spreadMPerS: 0.4,
  pressureWetFraction: 0.999,
});
export const GOBLIN_INITIAL_WATER_TABLE_M =
  (GOBLIN_FRAME.y - 1) * GOBLIN_SPACING_M[1] + 0.15;

/** These are finite region boundary conditions, not hidden solid voxels.
 * The inner playable edge is inside the collar. No outside water is generated. */
export const GOBLIN_WATER_BOUNDARY = Object.freeze({
  lateral: "closed-finite-region",
  bottom: "closed-finite-region",
  top: "dry-open-frontier",
} as const);

/** Covers the registered 17×17×128 address envelope, with impermeable cells
 * omitted from the actual water graph. These are protective limits, NOT a
 * demonstrated capacity or a promise to step the maximum graph in one tick. */
export const GOBLIN_WATER_LIMITS = Object.freeze({
  cells: 40_000,
  faces: 120_000,
  wireBytes: 16 * 1024 * 1024,
  dataNodes: 2_000_000,
});
