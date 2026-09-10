import type { Footing } from "./engine/navigation/index.ts";
import {
  TERRAIN_FRAME,
  terrainCell,
  terrainGeometry,
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
/** Horizontal authored map admission. Vertical admission uses the registered
 * terrain envelope and the actual building shape, never a layer-button limit. */
export function insidePlacement(at: Placement): boolean {
  return (
    Number.isInteger(at.x) &&
    Number.isInteger(at.z) &&
    Number.isInteger(at.level) &&
    at.x >= 0 &&
    at.z >= 0 &&
    at.x < 15 &&
    at.z < 15 &&
    Number.isSafeInteger(
      TERRAIN_FRAME.y + at.level * TERRAIN_FRAME.storeyVoxels,
    )
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

/** Storey containing an already-known physical position. This projection does
 * not confer discovery or access to an underground cell. */
export function viewLayer(at: Footing): number {
  return Math.floor(worldView(at).level);
}

/** Selectable full-storey bases, derived from the registered finite world. A
 * complete four-voxel room must fit; support and knowledge are separate checks. */
export function placementLevels(terrain: GeneratedTerrain) {
  const { bounds, frame } = terrainGeometry(terrain);
  return Object.freeze({
    min: Math.ceil((bounds.min[1] - frame.y) / frame.storeyVoxels),
    max: Math.floor((bounds.max[1] - frame.y) / frame.storeyVoxels) - 1,
  });
}

export function levelLabel(level: number): string {
  return level === 0
    ? "Ground"
    : level > 0
      ? `Storey +${level}`
      : `Depth ${level}`;
}

export function exposedFooting(
  terrain: GeneratedTerrain,
  at: Footing,
): boolean {
  const local = worldView(at);
  return at.y >= groundFooting(terrain, local).y;
}
