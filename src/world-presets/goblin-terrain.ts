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
    readonly boundaryKg: number;
    readonly timeS: number;
    readonly steps: number;
  };
  readonly exports: readonly ({
    readonly id: string;
    readonly at: readonly [number, number, number];
    readonly quantity: 1;
    readonly sourceVoxelM3: number;
  } & (
    | {
        readonly kind: "porous";
        readonly materialId: 1;
        readonly nodeId: string;
        readonly soilId: string;
        readonly waterKg: number;
      }
    | {
        readonly kind: "impermeable";
        readonly materialId: 2;
        readonly waterKg: 0;
      }
  ))[];
};
export function initialTerrain(): GeneratedTerrain {
  return recipe.parseClosedState(recipe.input);
}
export function parseTerrain(value: unknown): GeneratedTerrain {
  const state: GeneratedTerrain = recipe.parseClosedState(value);
  // The engine consumer can deepen stone. Main-game yields still own only soil;
  // do not admit an imported stone source as a soil item through the old count.
  if (state.exports.some((source) => source.kind !== "porous"))
    throw new Error("Main-game stone material yields are not yet supported.");
  return state;
}
export function terrainFacts(state: GeneratedTerrain) {
  return adapter.read(parseTerrain(state));
}
export function advanceTerrain(
  state: GeneratedTerrain,
  seconds: number,
): GeneratedTerrain {
  const next: GeneratedTerrain = adapter.advance(parseTerrain(state), seconds).state;
  // Field advancement changes water only. Share the read projection through this
  // known transition; unrelated restores never alias merely by revision.
  projections.set(next.world, projection(state));
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
    x >= MAP_SIDE ||
    z >= MAP_SIDE
  )
    throw new Error("outside-clearing-terrain");
}
const boundsSchema = z.object({
  minY: z.number().int(),
  maxY: z.number().int(),
});
const MAP_SIDE = 15;
const ownedSoilCells: readonly Readonly<TerrainVoxel>[] =
  adapter.definition.baseSoilGeometry.cells.map((cell: { at: number[] }) =>
    Object.freeze(voxelSchema.parse(cell.at)),
  );
/** One bounded, private read projection. Admission remains with the adapter;
 * a query cache never authorizes excavation, custody, capacity or navigation. */
function createProjection(state: GeneratedTerrain) {
  const world = createVoxelWorld(state.world.identity, {
    checkpoint: state.world,
  });
  // The address owner rejects >= max: these registered bounds are half-open.
  const bounds = Object.freeze(
    boundsSchema.parse(world.describe().layout.bounds),
  );
  const cells = new Map<number, ReturnType<typeof readColumn>>();
  let changed:
    readonly Readonly<ReturnType<typeof terrainColumn>>[] | undefined;
  let excavated:
    readonly Readonly<ReturnType<typeof terrainColumn>>[] | undefined;
  function cell(x: number, z: number) {
    column(x, z);
    const key = x * MAP_SIDE + z;
    let fact = cells.get(key);
    if (!fact) {
      fact = readColumn(world, bounds.minY, state.world.revision, x, z);
      cells.set(key, fact);
    }
    return fact;
  }
  return {
    world,
    key: JSON.stringify(state.world),
    geometry: geometryCapability(world, bounds, state.world.revision),
    cell,
    changed() {
      if (!changed) {
        const result = [];
        for (let x = 0; x < MAP_SIDE; x++)
          for (let z = 0; z < MAP_SIDE; z++)
            if (!cell(x, z).support)
              result.push(Object.freeze({ x, z, level: 0 }));
        changed = Object.freeze(result);
      }
      return changed;
    },
    excavated() {
      if (!excavated) {
        const result = new Map<
          string,
          Readonly<ReturnType<typeof terrainColumn>>
        >();
        for (const at of ownedSoilCells) {
          if (
            world.readPoint({ x: at[0], y: at[1], z: at[2] }) !== MATERIAL.air
          )
            continue;
          const column = Object.freeze(terrainColumn([...at]));
          result.set(`${column.x},${column.z}`, column);
        }
        excavated = Object.freeze([...result.values()]);
      }
      return excavated;
    },
  };
}
const projections = new WeakMap<object, ReturnType<typeof createProjection>>();
function projection(state: GeneratedTerrain) {
  // Unknown/mutable inputs cross the maintained owner's full validation. Only
  // its detached immutable checkpoint becomes a cache key, never the input.
  const checked: GeneratedTerrain = parseTerrain(state);
  let known = projections.get(checked.world);
  if (!known) {
    known = createProjection(checked);
    projections.set(checked.world, known);
  }
  return known;
}
function readColumn(
  world: ReturnType<typeof createVoxelWorld>,
  minY: number,
  revision: number,
  x: number,
  z: number,
) {
  const wx = x + TERRAIN_FRAME.x,
    wz = z + TERRAIN_FRAME.z;
  let y = TERRAIN_FRAME.y;
  while (y >= minY && world.readPoint({ x: wx, y, z: wz }) === MATERIAL.air)
    y--;
  if (y < minY) throw new Error("no-modeled-standing-surface");
  return Object.freeze({
    height: (y + 1 - TERRAIN_FRAME.y) * TERRAIN_VOXEL_METRIC.verticalM,
    support: y + 1 === TERRAIN_FRAME.y,
    solid:
      world.readPoint({ x: wx, y: TERRAIN_FRAME.y - 1, z: wz }) !==
      MATERIAL.air,
    voxel: Object.freeze([wx, y, wz] as const),
    revision,
  });
}
export function terrainMaterial(state: GeneratedTerrain, at: TerrainVoxel) {
  return projection(state).world.readPoint({ x: at[0], y: at[1], z: at[2] });
}
export function terrainCell(state: GeneratedTerrain, x: number, z: number) {
  return projection(state).cell(x, z);
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
  const admitted: GeneratedTerrain = parseTerrain(state);
  let cached = preparations.get(admitted);
  if (!cached) {
    cached = new Map();
    preparations.set(admitted, cached);
  }
  const prior = cached.get(key);
  if (prior) return prior;
  let result: Prepared;
  try {
    result = {
      ok: true,
      state: adapter.excavate(admitted, { at: voxel }).state,
    };
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
  return projection(state).changed();
}
function geometryCapability(
  world: ReturnType<typeof createVoxelWorld>,
  bounds: { minY: number; maxY: number },
  revision: number,
) {
  return Object.freeze({
    identity: GOBLIN_TERRAIN_ID,
    revision,
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
        TERRAIN_FRAME.x + MAP_SIDE,
        bounds.maxY,
        TERRAIN_FRAME.z + MAP_SIDE,
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

export function terrainGeometry(state: GeneratedTerrain) {
  return projection(state).geometry;
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
  const checked: GeneratedTerrain = parseTerrain(state);
  let water = waterViews.get(checked);
  if (!water) {
    water = Object.freeze(
      terrainFacts(checked)
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
    waterViews.set(checked, water!);
  }
  return water!;
}

export function terrainExcavatedColumns(state: GeneratedTerrain) {
  return projection(state).excavated();
}
export function terrainGeometryKey(state: GeneratedTerrain): string {
  return projection(state).key;
}
