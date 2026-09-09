import { hashString, latticeHash3 } from "../engine/world/lattice-hash.mjs";
import {
  sameWorldData as matchesWorldIdentity,
  assertWorldRecord,
  copyWorldData,
} from "../engine/world/data-contract.mjs";
import { createVoxelStore } from "../engine/world/index.js";
import { createWorldSpec, sampleTerrain } from "./height.js";
import { createCaveFeatures, CAVE_FEATURE_RECIPE } from "./features.mjs";
const clone = (value) => structuredClone(value);
const RECIPE = Object.freeze({
  codecSchema: 2,
  heightSource:
    "530464448725cacb73836f34c2c48ddbf3e4a8c0d8a353498e7fe6da03f45bdf",
  voxelRecipe: "height-sea-connected-caves-v3",
  features: CAVE_FEATURE_RECIPE,
  units: Object.freeze({
    horizontalMetres: 1,
    verticalMetres: 0.54,
    voxelsPerStorey: 4,
  }),
  bounds: Object.freeze({
    minX: -2048,
    maxX: 2048,
    minZ: -2048,
    maxZ: 2048,
    minY: -64,
    maxY: 64,
  }),
  brickSide: 16,
  residentBrickCap: 8,
  cave: Object.freeze({
    id: "global-trilinear-two-octave-cave-v1",
    sampleNamespace: "height-sea-cave-density-v2", // Preserve the original cavity component's field.
    macro: Object.freeze({
      horizontalMetres: 32,
      verticalMetres: 18,
      weight: 0.78,
      salt: "cave-macro",
    }),
    detail: Object.freeze({
      horizontalMetres: 11,
      verticalMetres: 7,
      weight: 0.22,
      salt: "cave-detail",
    }),
    voidThreshold: 0.42,
    protectedSolidLayers: 3,
  }),
});
export const MATERIAL = Object.freeze({ air: 0, soil: 1, stone: 2 });

function smooth(value) {
  return value * value * (3 - 2 * value);
}

function caveLattice(fieldHash, x, y, z, salt) {
  return latticeHash3(fieldHash, x, y, z, salt) / 0xffffffff;
}
function signedNoise3D(fieldHash, x, y, z, salt) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    z0 = Math.floor(z);
  const fx = smooth(x - x0),
    fy = smooth(y - y0),
    fz = smooth(z - z0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const at = (dx, dy, dz) =>
    caveLattice(fieldHash, x0 + dx, y0 + dy, z0 + dz, salt) * 2 - 1;
  const x00 = lerp(at(0, 0, 0), at(1, 0, 0), fx);
  const x10 = lerp(at(0, 1, 0), at(1, 1, 0), fx);
  const x01 = lerp(at(0, 0, 1), at(1, 0, 1), fx);
  const x11 = lerp(at(0, 1, 1), at(1, 1, 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

export function worldIdentity({ worldId, spaceId = "surface", seed } = {}) {
  if (
    typeof worldId !== "string" ||
    !worldId ||
    typeof spaceId !== "string" ||
    !spaceId
  )
    throw new TypeError("world and space identities required");
  if (seed !== undefined && (typeof seed !== "string" || !seed))
    throw new TypeError("nonempty string seed required");
  const spec = createWorldSpec(seed === undefined ? {} : { seed });
  return {
    worldId,
    spaceId,
    base: {
      heightIdentity: spec.identity,
      heightSeed: spec.seed,
      ...clone(RECIPE),
    },
  };
}

/** Original world recipe, outside the material-blind storage owner. */
export function createVoxelWorld(identity, options = {}) {
  assertWorldRecord(options, [], "world options", [
    "checkpoint",
    "maxResidentBricks",
    "maxChangedCells",
  ]);
  identity = copyWorldData(identity);
  const expected = worldIdentity({
    worldId: identity?.worldId,
    spaceId: identity?.spaceId,
    seed: identity?.base?.heightSeed,
  });
  if (!matchesWorldIdentity(identity, expected))
    throw new Error("unsupported or incompatible world recipe");
  const spec = createWorldSpec({ seed: expected.base.heightSeed });
  const fieldIdentity =
    spec.identity + ":" + RECIPE.cave.sampleNamespace + ":" + RECIPE.cave.id;
  const fieldHash = hashString(fieldIdentity + "|");
  const features = createCaveFeatures({
    spec,
    units: RECIPE.units,
    bounds: RECIPE.bounds,
  });
  let heightSamples = 0,
    caveMetricEvaluations = 0;
  function caveMetric(at) {
    caveMetricEvaluations++;
    const scaled = (field) =>
      signedNoise3D(
        fieldHash,
        at.x / field.horizontalMetres,
        (at.y * RECIPE.units.verticalMetres) / field.verticalMetres,
        at.z / field.horizontalMetres,
        field.salt,
      );
    return (
      RECIPE.cave.macro.weight * scaled(RECIPE.cave.macro) +
      RECIPE.cave.detail.weight * scaled(RECIPE.cave.detail)
    );
  }
  const generator = {
    id: RECIPE.voxelRecipe,
    column(x, z) {
      const cell = sampleTerrain(spec, x, z, 1),
        carve = features.column(x, z),
        bed = cell.bedLevel;
      heightSamples++;
      return (y) => {
        if (y >= bed || carve(y)) return MATERIAL.air;
        if (y >= bed - 2) return MATERIAL.soil;
        if (y >= bed - RECIPE.cave.protectedSolidLayers) return MATERIAL.stone;
        return caveMetric({ x, y, z }) >= RECIPE.cave.voidThreshold
          ? MATERIAL.air
          : MATERIAL.stone;
      };
    },
  };
  const layout = {
    bounds: clone(RECIPE.bounds),
    brickSide: RECIPE.brickSide,
    materialIds: Object.values(MATERIAL),
  };
  const checkpoint = options.checkpoint ?? null;
  const world = createVoxelStore(
    { identity: expected, ...layout, generator },
    { ...options, checkpoint },
  );
  return Object.freeze({
    ...world,
    caveFeature: ({ x, z }) => features.atRegion(x, z),
    evictAll() {
      world.evictAll();
      features.evictAll();
    },
    stats(query) {
      return {
        ...world.stats(query),
        heightSamples,
        caveMetricEvaluations,
        caveFeatures: features.stats(),
      };
    },
  });
}
