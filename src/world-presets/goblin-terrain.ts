import { createWetClearing } from "./seepage/wet-clearing.mjs";
import { createVoxelWorld, MATERIAL } from "./height-caves.mjs";
import { z } from "zod";

/** Registered Goblin content: one world, a finite wet patch, one coordinate frame. */
export const GOBLIN_TERRAIN_ID = "goblin-generated-wet-v1";
export const TERRAIN_FRAME = Object.freeze({
  x: -7,
  y: 15,
  z: 119,
  storeyVoxels: 4,
});
const recipe = createWetClearing({ connected: true });
const adapter = recipe.adapter;
export const TERRAIN_VOXEL_METRIC = Object.freeze({
  horizontalM: adapter.definition.baseSoilGeometry.spacingM[0],
  verticalM: adapter.definition.baseSoilGeometry.spacingM[1],
});
export const voxelSchema = z.tuple([
  z.number().int().safe(),
  z.number().int().safe(),
  z.number().int().safe(),
]);
export type TerrainVoxel = z.infer<typeof voxelSchema>;
export type GeneratedTerrain = {
  readonly version: string;
  readonly identity: string;
  readonly world: ReturnType<ReturnType<typeof createVoxelWorld>["save"]>;
  readonly soilState: {
    readonly version: string;
    readonly identity: string;
    readonly massKg: readonly number[];
    readonly initialTotalKg: number;
    readonly timeS: number;
    readonly steps: number;
  };
  readonly initialWaterKg: number;
  readonly exports: readonly ({
    readonly id: string;
    readonly at: readonly [number, number, number];
    readonly quantity: 1;
    readonly sourceVoxelM3: number;
  } & ({
    readonly kind: "porous";
    readonly materialId: 1;
    readonly nodeId: string;
    readonly soilId: string;
    readonly waterKg: number;
  } | {
    readonly kind: "impermeable";
    readonly materialId: 2;
    readonly waterKg: 0;
  }))[];
};
export function initialTerrain(): GeneratedTerrain {
  return adapter.parse(recipe.input);
}
export function parseTerrain(value: unknown): GeneratedTerrain {
  const state: GeneratedTerrain = adapter.parse(value);
  // The engine consumer can deepen stone. Main-game yields still own only soil;
  // do not admit an imported stone source as a soil item through the old count.
  if (state.exports.some(source => source.kind !== "porous"))
    throw new Error("Main-game stone material yields are not yet supported.");
  return state;
}
export function terrainFacts(state: GeneratedTerrain) {
  return adapter.read(state);
}
export function advanceTerrain(
  state: GeneratedTerrain,
  seconds: number,
): GeneratedTerrain {
  const next: GeneratedTerrain = adapter.advance(state, seconds).state;
  // Field advancement changes water only. Share the read projection through this
  // known transition; unrelated restores never alias merely by revision.
  readers.set(next, terrainWorld(state));
  visualKeys.set(next, terrainGeometryKey(state));
  return next;
}

export function terrainColumn(voxel: TerrainVoxel) {
  return {
    x: voxel[0] - TERRAIN_FRAME.x,
    z: voxel[2] - TERRAIN_FRAME.z,
    level: 0,
  };
}
function column(x: number, z: number) {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(z) ||
    x < 0 ||
    z < 0 ||
    x >= 15 ||
    z >= 15
  )
    throw new Error("outside-clearing-terrain");
}
/** Rebuildable read projection of an immutable checkpoint, never saved authority. */
const readers = new WeakMap<object, ReturnType<typeof createVoxelWorld>>();
function terrainWorld(state: GeneratedTerrain) {
  let world = readers.get(state);
  if (!world) {
    world = createVoxelWorld(state.world.identity, { checkpoint: state.world });
    readers.set(state, world);
  }
  return world;
}
export function terrainMaterial(state: GeneratedTerrain, at: TerrainVoxel) {
  return terrainWorld(state).readPoint({ x: at[0], y: at[1], z: at[2] });
}
export function terrainCell(state: GeneratedTerrain, x: number, z: number) {
  column(x, z);
  const wx = x + TERRAIN_FRAME.x,
    wz = z + TERRAIN_FRAME.z;
  const world = terrainWorld(state);
  const { minY } = worldBounds(world);
  let y = TERRAIN_FRAME.y;
  while (y >= minY && world.readPoint({ x: wx, y, z: wz }) === MATERIAL.air)
    y--;
  if (y < minY) throw new Error("no-modeled-standing-surface");
  return {
    height: (y + 1 - TERRAIN_FRAME.y) * TERRAIN_VOXEL_METRIC.verticalM,
    support: y + 1 === TERRAIN_FRAME.y,
    solid:
      world.readPoint({ x: wx, y: TERRAIN_FRAME.y - 1, z: wz }) !==
      MATERIAL.air,
    voxel: [wx, y, wz] as TerrainVoxel,
    revision: state.world.revision,
  };
}
type Prepared =
  { ok: true; state: GeneratedTerrain } | { ok: false; problem: string };
const preparations = new WeakMap<object, Map<string, Prepared>>();
function prepareExcavation(
  state: GeneratedTerrain,
  raw: TerrainVoxel,
): Prepared {
  const voxel = voxelSchema.parse(raw),
    key = voxel.join();
  if (
    !adapter.definition.baseSoilGeometry.cells.some(
      (cell: { at: number[] }) => cell.at.join() === key,
    )
  )
    return { ok: false, problem: "This soil cannot be dug here." };
  let cached = preparations.get(state);
  if (!cached) {
    cached = new Map();
    preparations.set(state, cached);
  }
  const prior = cached.get(key);
  if (prior) return prior;
  let result: Prepared;
  try {
    result = { ok: true, state: adapter.excavate(state, { at: voxel }).state };
  } catch (error) {
    result = {
      ok: false,
      problem:
        error instanceof Error ? error.message : "Terrain excavation rejected",
    };
  }
  cached.set(key, result); // at most the32 owned source cells, rebuilt per immutable checkpoint
  return result;
}
export function terrainDigProblem(
  state: GeneratedTerrain,
  voxel: TerrainVoxel,
): string | null {
  const prepared = prepareExcavation(state, voxel);
  return prepared.ok ? null : prepared.problem;
}
export function excavateTerrain(state: GeneratedTerrain, voxel: TerrainVoxel) {
  const prepared = prepareExcavation(state, voxel);
  if (!prepared.ok) throw new Error(prepared.problem);
  return prepared.state;
}
export function terrainRevision(state: GeneratedTerrain) {
  return state.world.revision;
}
export function terrainChangedColumns(state: GeneratedTerrain) {
  const cells = [];
  for (let x = 0; x < 15; x++)
    for (let z = 0; z < 15; z++)
      if (!terrainCell(state, x, z).support) cells.push({ x, z, level: 0 });
  return cells;
}
function worldBounds(world: ReturnType<typeof createVoxelWorld>) {
  // The voxel address owner rejects coordinate >= max: these are half-open.
  return z
    .object({ minY: z.number().int(), maxY: z.number().int() })
    .parse(world.describe().layout.bounds);
}
export function terrainGeometry(state: GeneratedTerrain) {
  const world = terrainWorld(state),
    bounds = worldBounds(world);
  return Object.freeze({
    identity: GOBLIN_TERRAIN_ID,
    revision: state.world.revision,
    frame: TERRAIN_FRAME,
    spacingM: Object.freeze([
      TERRAIN_VOXEL_METRIC.horizontalM,
      TERRAIN_VOXEL_METRIC.verticalM,
      TERRAIN_VOXEL_METRIC.horizontalM,
    ] as const),
    bounds: Object.freeze({
      min: Object.freeze([
        TERRAIN_FRAME.x,
        bounds.minY,
        TERRAIN_FRAME.z,
      ] as const),
      max: Object.freeze([
        TERRAIN_FRAME.x + 15,
        bounds.maxY,
        TERRAIN_FRAME.z + 15,
      ] as const),
    }),
    solidAt(x: number, y: number, z: number) {
      const material = world.readPoint({ x, y, z });
      if (material === MATERIAL.air) return false;
      if (material === MATERIAL.soil || material === MATERIAL.stone)
        return true;
      throw new Error("unknown terrain solidity");
    },
  });
}

/** Display-only finite surfaces from the same volume owner; unmodeled soil is not dry. */
const waterViews = new WeakMap<
  object,
  readonly {
    x: number;
    z: number;
    height: number;
    depthM: number;
    massKg: number;
  }[]
>();
export function terrainWater(state: GeneratedTerrain) {
  let water = waterViews.get(state);
  if (!water) {
    water = Object.freeze(
      terrainFacts(state)
        .soil.nodes.filter((node: { kind: string }) => node.kind === "pit")
        .map(
          (node: {
            at: number[];
            baseYM: number;
            depthM: number;
            massKg: number;
          }) =>
            Object.freeze({
              x: node.at[0] - TERRAIN_FRAME.x,
              z: node.at[2] - TERRAIN_FRAME.z,
              height:
                node.baseYM +
                node.depthM -
                TERRAIN_FRAME.y * TERRAIN_VOXEL_METRIC.verticalM,
              depthM: node.depthM,
              massKg: node.massKg,
            }),
        ),
    );
    waterViews.set(state, water!);
  }
  return water!;
}

export function terrainExcavatedColumns(state: GeneratedTerrain) {
  const columns = new Map<string, ReturnType<typeof terrainColumn>>();
  for (const cell of adapter.definition.baseSoilGeometry.cells) {
    const at = voxelSchema.parse(cell.at);
    if (terrainMaterial(state, at) !== MATERIAL.air) continue;
    const column = terrainColumn(at);
    columns.set(`${column.x},${column.z}`, column);
  }
  return [...columns.values()];
}

/** Exact geometry content, computed once; restored branches cannot alias by revision. */
const visualKeys = new WeakMap<object, string>();
export function terrainGeometryKey(state: GeneratedTerrain): string {
  let key = visualKeys.get(state);
  if (key === undefined) {
    key = JSON.stringify(state.world);
    visualKeys.set(state, key);
  }
  return key;
}
