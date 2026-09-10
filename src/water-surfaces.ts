import type { Clearing } from "./model.ts";
import { currentVisibility } from "./exploration.ts";
import { exposedFooting, worldView, viewLayer } from "./game-space.ts";
import {
  terrainEnvironment,
  TERRAIN_VOXEL_METRIC,
  TERRAIN_FRAME,
} from "./terrain.ts";
import { waterEnvironmentFacts } from "./world-presets/goblin-environment/water-state.ts";

export type WaterSurface = Readonly<{
  id: string;
  x: number;
  z: number;
  height: number;
}>;

type WaterCell = Readonly<{
  id: string;
  at: readonly [number, number, number];
  kind: string;
  massKg: number;
  capacityKg: number;
  liquidVolumeM3: number;
}>;
type Sight = Readonly<{
  visible(at: { x: number; y: number; z: number }): boolean;
  exposed(at: { x: number; y: number; z: number }): boolean;
}>;

/** Pure display projection of admitted facts and existing sight capabilities.
 * Submerged voxel boundaries are not free surfaces. */
export function visibleWaterSurfaces(
  cells: readonly WaterCell[],
  level: number,
  sight: Sight,
): readonly WaterSurface[] {
  const wet = new Set(
    cells
      .filter((cell) => cell.kind === "void" && cell.massKg > 0)
      .map((cell) => cell.at.join()),
  );
  const surfaces: WaterSurface[] = [];
  for (const cell of cells) {
    if (cell.kind !== "void" || cell.massKg <= 0) continue;
    const at = { x: cell.at[0], y: cell.at[1], z: cell.at[2] };
    const local = worldView(at);
    if (
      local.x < 0 ||
      local.x >= 15 ||
      local.z < 0 ||
      local.z >= 15 ||
      !sight.visible(at)
    )
      continue;
    const onLayer = viewLayer(at) === level;
    const exposedPit =
      level === 0 && at.y < TERRAIN_FRAME.y && sight.exposed(at);
    if (!onLayer && !exposedPit) continue;
    if (
      cell.massKg >= cell.capacityKg &&
      wet.has(`${at.x},${at.y + 1},${at.z}`)
    )
      continue;
    const depthM =
      cell.liquidVolumeM3 /
      (TERRAIN_VOXEL_METRIC.horizontalM * TERRAIN_VOXEL_METRIC.horizontalM);
    surfaces.push(
      Object.freeze({
        id: cell.id,
        x: local.x,
        z: local.z,
        height:
          local.level *
            TERRAIN_FRAME.storeyVoxels *
            TERRAIN_VOXEL_METRIC.verticalM +
          depthM,
      }),
    );
  }
  return Object.freeze(surfaces);
}

/** Current water is visible only through current sight, never remembered terrain. */
export function waterSurfaces(
  state: Clearing,
  level: number,
): readonly WaterSurface[] {
  const cells = waterEnvironmentFacts(state.water, {
    terrain: terrainEnvironment(state.terrain),
    sites: state.sites,
  }).cells;
  return visibleWaterSurfaces(cells, level, {
    visible: currentVisibility(state),
    exposed: (at) => exposedFooting(state.terrain, at),
  });
}
