import type { Footing } from "./engine/navigation/index.ts";
import {
  TERRAIN_FRAME,
  terrainCell,
  type GeneratedTerrain,
} from "./world-presets/goblin-terrain.ts";

/** Authored placement and the original renderer use local horizontal cells and
 * storeys. Physical bodies and material endpoints use signed world voxels. */
export type Placement = Readonly<{ x: number; z: number; level: number }>;
export type ViewPosition = Readonly<{ x: number; z: number; level: number }>;

export function placementFooting(placement: Placement): Footing {
  return {
    x: TERRAIN_FRAME.x + placement.x,
    y: TERRAIN_FRAME.y + placement.level * TERRAIN_FRAME.storeyVoxels,
    z: TERRAIN_FRAME.z + placement.z,
  };
}

/** Also accepts interpolated world positions; it does not round physical facts. */
export function worldView(position: Footing): ViewPosition {
  return {
    x: position.x - TERRAIN_FRAME.x,
    z: position.z - TERRAIN_FRAME.z,
    level: (position.y - TERRAIN_FRAME.y) / TERRAIN_FRAME.storeyVoxels,
  };
}

/** Inverse projection for a selected view plane. Actual target admission still
 * queries physical support/clearance at the resulting exact world coordinate. */
export function viewWorld(position: ViewPosition): Footing {
  return placementFooting(position);
}

export const placementKey = (at: Placement): string =>
  `${at.x},${at.z},${at.level}`;
export const samePlacement = (a: Placement, b: Placement): boolean =>
  placementKey(a) === placementKey(b);
/** Current authored placement remains the existing two-storey, 15-cell map. */
export function insidePlacement(at: Placement): boolean {
  return (
    Number.isInteger(at.x) &&
    Number.isInteger(at.z) &&
    Number.isInteger(at.level) &&
    at.x >= 0 &&
    at.z >= 0 &&
    at.x < 15 &&
    at.z < 15 &&
    at.level >= 0 &&
    at.level <= 1
  );
}
export function placementNeighbors(at: Placement): Placement[] {
  return [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ].map(([x, z]) => ({ x: at.x + x, z: at.z + z, level: at.level }));
}

/** Initial ground placement uses the actual registered surface, including the
 * lower edge of the clearing. It does not guess a floor from a view layer. */
export function groundFooting(
  terrain: GeneratedTerrain,
  at: Pick<Placement, "x" | "z">,
): Footing {
  const voxel = terrainCell(terrain, at.x, at.z).voxel;
  return { x: voxel[0], y: voxel[1] + 1, z: voxel[2] };
}

/** Current two-layer presentation: Ground includes exposed excavation floors.
 * This classifies an already-known physical fact; it cannot reveal a cave. */
export function viewLayer(at: Footing): 0 | 1 {
  return at.y < TERRAIN_FRAME.y + TERRAIN_FRAME.storeyVoxels ? 0 : 1;
}
export function exposedFooting(
  terrain: GeneratedTerrain,
  at: Footing,
): boolean {
  const local = worldView(at);
  return at.y >= groundFooting(terrain, local).y;
}
