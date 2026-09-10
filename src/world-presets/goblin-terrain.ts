import { z } from "zod";
import { assertWorldRecord } from "../engine/world/data-contract.mjs";
import { createVoxelWorld, MATERIAL } from "./height-caves.mjs";
import {
  GOBLIN_FRAME,
  GOBLIN_MAP_SIDE,
  GOBLIN_SPACING_M,
  GOBLIN_WORLD_IDENTITY,
  GOBLIN_ENVIRONMENT_BOUNDS,
} from "./goblin-environment/content.ts";
import {
  goblinTerrainProjection,
  type GoblinWorldCheckpoint,
} from "./goblin-environment/terrain-projection.ts";

/** Terrain owns only generated material slots. Water, yielded lots and removal
 * obligations belong to the joined game transaction, never this checkpoint. */
export const GOBLIN_TERRAIN_ID = "goblin-generated-terrain-v2";
export const TERRAIN_FRAME = GOBLIN_FRAME;
export const TERRAIN_VOXEL_METRIC = Object.freeze({
  horizontalM: GOBLIN_SPACING_M[0],
  verticalM: GOBLIN_SPACING_M[1],
});
export const voxelSchema = z.tuple([
  z.number().int().safe(),
  z.number().int().safe(),
  z.number().int().safe(),
]);
export type TerrainVoxel = z.infer<typeof voxelSchema>;
export type GeneratedTerrain = Readonly<{
  version: 1;
  identity: typeof GOBLIN_TERRAIN_ID;
  world: GoblinWorldCheckpoint;
}>;
export type ExcavatedVoxel = Readonly<{
  at: readonly [number, number, number];
  materialId: 1 | 2;
}>;
const envelope = z
  .object({
    version: z.literal(1),
    identity: z.literal(GOBLIN_TERRAIN_ID),
    world: z.unknown(),
  })
  .strict();
const original = goblinTerrainProjection(
  createVoxelWorld(GOBLIN_WORLD_IDENTITY).save(),
);
const admitted = new WeakMap<object, ReturnType<typeof createProjection>>();

function inside(at: readonly number[]) {
  return (
    at[0] >= TERRAIN_FRAME.x &&
    at[0] < TERRAIN_FRAME.x + GOBLIN_MAP_SIDE &&
    at[2] >= TERRAIN_FRAME.z &&
    at[2] < TERRAIN_FRAME.z + GOBLIN_MAP_SIDE &&
    at[1] >= GOBLIN_ENVIRONMENT_BOUNDS.min[1] &&
    at[1] < GOBLIN_ENVIRONMENT_BOUNDS.max[1]
  );
}
function removedVoxels(
  world: GoblinWorldCheckpoint,
): readonly ExcavatedVoxel[] {
  return Object.freeze(
    world.changes.map(
      (change: { x: number; y: number; z: number; material: number }) => {
        const at = Object.freeze([change.x, change.y, change.z] as const);
        if (!inside(at))
          throw new Error("Terrain edit is outside the playable clearing.");
        const materialId = original.material(at);
        if (
          change.material !== MATERIAL.air ||
          (materialId !== MATERIAL.soil && materialId !== MATERIAL.stone)
        )
          throw new Error(
            "Unsupported terrain edit: only original soil or stone removal is admitted.",
          );
        return Object.freeze({ at, materialId: materialId as 1 | 2 });
      },
    ),
  );
}
function admitWorld(world: GoblinWorldCheckpoint): GeneratedTerrain {
  const excavated = removedVoxels(world);
  const environment = goblinTerrainProjection(world);
  const state: GeneratedTerrain = Object.freeze({
    version: 1,
    identity: GOBLIN_TERRAIN_ID,
    world: environment.checkpoint,
  });
  admitted.set(state, createProjection(environment, excavated));
  return state;
}
export function initialTerrain(): GeneratedTerrain {
  return admitWorld(original.checkpoint);
}
export function parseTerrain(value: unknown): GeneratedTerrain {
  if (value !== null && typeof value === "object" && admitted.has(value))
    return value as GeneratedTerrain;
  assertWorldRecord(
    value,
    ["version", "identity", "world"],
    "terrain envelope",
  );
  const wire = envelope.parse(value);
  // The maintained voxel owner validates the actual checkpoint grammar/identity.
  const world = createVoxelWorld(GOBLIN_WORLD_IDENTITY, {
    checkpoint: wire.world,
  });
  return admitWorld(world.save());
}
function projection(state: GeneratedTerrain) {
  const checked = parseTerrain(state);
  return admitted.get(checked)!;
}
export function terrainColumn(voxel: readonly [number, number, number]) {
  return {
    x: voxel[0] - TERRAIN_FRAME.x,
    z: voxel[2] - TERRAIN_FRAME.z,
    level: 0,
  };
}
function checkColumn(x: number, z: number) {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(z) ||
    x < 0 ||
    z < 0 ||
    x >= GOBLIN_MAP_SIDE ||
    z >= GOBLIN_MAP_SIDE
  )
    throw new Error("outside-clearing-terrain");
}
function createProjection(
  environment: ReturnType<typeof goblinTerrainProjection>,
  excavated: readonly ExcavatedVoxel[],
) {
  const cells = new Map<number, ReturnType<typeof readColumn>>();
  let changed:
    readonly Readonly<ReturnType<typeof terrainColumn>>[] | undefined;
  const excavatedColumns = new Map<
    string,
    Readonly<ReturnType<typeof terrainColumn>>
  >();
  for (const record of excavated) {
    const at = Object.freeze(terrainColumn(record.at));
    excavatedColumns.set(`${at.x},${at.z}`, at);
  }
  const columns = Object.freeze([...excavatedColumns.values()]);
  function cell(x: number, z: number) {
    checkColumn(x, z);
    const key = x * GOBLIN_MAP_SIDE + z;
    let fact = cells.get(key);
    if (!fact) {
      fact = readColumn(environment, x, z);
      cells.set(key, fact);
    }
    return fact;
  }
  return Object.freeze({
    environment,
    excavated,
    columns,
    key: JSON.stringify(environment.checkpoint),
    cell,
    changed() {
      if (!changed) {
        const result = [];
        for (let x = 0; x < GOBLIN_MAP_SIDE; x++)
          for (let z = 0; z < GOBLIN_MAP_SIDE; z++)
            if (!cell(x, z).support)
              result.push(Object.freeze({ x, z, level: 0 }));
        changed = Object.freeze(result);
      }
      return changed;
    },
  });
}
function readColumn(
  environment: ReturnType<typeof goblinTerrainProjection>,
  x: number,
  z: number,
) {
  const wx = x + TERRAIN_FRAME.x,
    wz = z + TERRAIN_FRAME.z;
  let y = TERRAIN_FRAME.y;
  while (
    y >= environment.terrain.bounds.min[1] &&
    environment.material([wx, y, wz]) === MATERIAL.air
  )
    y--;
  if (y < environment.terrain.bounds.min[1])
    throw new Error("no-modeled-standing-surface");
  return Object.freeze({
    height: (y + 1 - TERRAIN_FRAME.y) * TERRAIN_VOXEL_METRIC.verticalM,
    support: y + 1 === TERRAIN_FRAME.y,
    solid: environment.material([wx, TERRAIN_FRAME.y - 1, wz]) !== MATERIAL.air,
    voxel: Object.freeze([wx, y, wz] as const),
    revision: environment.checkpoint.revision,
  });
}
export function terrainEnvironment(state: GeneratedTerrain) {
  return projection(state).environment;
}
export function terrainGeometry(state: GeneratedTerrain) {
  return terrainEnvironment(state).terrain;
}
export function terrainMaterial(state: GeneratedTerrain, at: TerrainVoxel) {
  return terrainEnvironment(state).material(voxelSchema.parse(at));
}
export function terrainCell(state: GeneratedTerrain, x: number, z: number) {
  return projection(state).cell(x, z);
}
export function terrainRevision(state: GeneratedTerrain) {
  return terrainEnvironment(state).checkpoint.revision;
}
export function terrainGeometryKey(state: GeneratedTerrain) {
  return projection(state).key;
}
export function terrainChangedColumns(state: GeneratedTerrain) {
  return projection(state).changed();
}
export function terrainExcavatedColumns(state: GeneratedTerrain) {
  return projection(state).columns;
}
export function terrainExcavatedVoxels(state: GeneratedTerrain) {
  return projection(state).excavated;
}
export function terrainDigProblem(
  state: GeneratedTerrain,
  raw: TerrainVoxel,
): string | null {
  const at = voxelSchema.parse(raw);
  if (!inside(at)) return "Keep excavation inside the clearing.";
  const material = terrainMaterial(state, at);
  if (material === MATERIAL.air) return "This voxel is already empty.";
  if (material !== MATERIAL.soil && material !== MATERIAL.stone)
    throw new Error("Unsupported terrain material.");
  return null;
}
/** Detached voxel-only preparation. The caller must compose the actual removed
 * water/material/environment obligations before publishing this successor. */
export function excavateTerrain(
  state: GeneratedTerrain,
  raw: TerrainVoxel,
): GeneratedTerrain {
  const checked = parseTerrain(state),
    at = voxelSchema.parse(raw);
  const problem = terrainDigProblem(checked, at);
  if (problem) throw new Error(problem);
  const world = createVoxelWorld(GOBLIN_WORLD_IDENTITY, {
    checkpoint: checked.world,
  });
  const result = world.edit({
    expectedRevision: checked.world.revision,
    cells: [
      {
        x: at[0],
        y: at[1],
        z: at[2],
        material: MATERIAL.air,
        expectedMaterial: terrainMaterial(checked, at),
      },
    ],
  });
  if (!result.ok) throw new Error(`Terrain edit refused: ${result.reason}`);
  return admitWorld(world.save());
}
