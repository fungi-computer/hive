import { createVoxelWorld, MATERIAL } from "../height-caves.mjs";
import { createWorldSpec, sampleTerrain } from "../height.js";
import { freeze } from "../../engine/environment/water/geometry.mjs";
import {
  GOBLIN_ENVIRONMENT_BOUNDS,
  GOBLIN_FRAME,
  GOBLIN_SPACING_M,
  GOBLIN_WORLD_IDENTITY,
} from "./content.ts";
import type { Coordinate } from "../../engine/world/physical-geometry.ts";

export type GoblinWorldCheckpoint = ReturnType<
  ReturnType<typeof createVoxelWorld>["save"]
>;

/** Own a rebuildable immutable-checkpoint query. No caller gets the mutable
 * voxel store; current geometry never aliases a candidate's edit operations. */
export function goblinTerrainProjection(checkpoint: GoblinWorldCheckpoint) {
  const world = createVoxelWorld(GOBLIN_WORLD_IDENTITY, { checkpoint });
  const canonical = freeze(world.save());
  const bounds = GOBLIN_ENVIRONMENT_BOUNDS;
  const points = new Map<string, number>();
  const spec = createWorldSpec({ seed: GOBLIN_WORLD_IDENTITY.base.heightSeed });
  const originalSoil: Coordinate[] = [];
  let surfaceCeilingY = bounds.min[1] + 1;
  for (let x = bounds.min[0]; x < bounds.max[0]; x++) {
    for (let z = bounds.min[2]; z < bounds.max[2]; z++) {
      const bed = sampleTerrain(spec, x, z, 1).bedLevel;
      // The physical generator can carve these nominal soil layers. Its actual
      // generated material, not the height label, establishes porous custody.
      for (const y of [bed - 2, bed - 1]) {
        if (y < bounds.min[1] || y >= bounds.max[1]) continue;
        if (world.inspect({ x, y, z }).generatedMaterial === MATERIAL.soil)
          originalSoil.push(Object.freeze([x, y, z] as const));
      }
      surfaceCeilingY = Math.max(
        surfaceCeilingY,
        Math.min(bounds.max[1], bed + 2),
      );
    }
  }
  function material(at: Coordinate): number {
    if (
      !at.every(
        (v, i) =>
          Number.isSafeInteger(v) && v >= bounds.min[i] && v < bounds.max[i],
      )
    )
      throw new Error("outside registered Goblin environmental region");
    const key = at.join();
    let value = points.get(key);
    if (value === undefined) {
      value = world.readPoint({ x: at[0], y: at[1], z: at[2] });
      points.set(key, value!);
    }
    return value!;
  }
  return Object.freeze({
    checkpoint: canonical,
    originalSoil: Object.freeze(originalSoil),
    surfaceCeilingY,
    material,
    terrain: Object.freeze({
      identity: "goblin-generated-region-v2",
      revision: canonical.revision,
      frame: GOBLIN_FRAME,
      spacingM: GOBLIN_SPACING_M,
      bounds,
      solidAt: (x: number, y: number, z: number) =>
        material([x, y, z]) !== MATERIAL.air,
    }),
  });
}
