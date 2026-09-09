import { hashString, latticeHash3 } from "./lattice-hash.mjs";
// Isolated height-authoritative generated base + durable sparse-change codec.
// No Clearing, live water/gas stock, pathfinding, mesh, or clock owner.
import { createWorldSpec, sampleTerrain, floorDiv, mod } from "./height.js";
import { createCaveFeatures, CAVE_FEATURE_RECIPE } from "./features.mjs";

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
const SIDE = RECIPE.brickSide;
const VOLUME = SIDE ** 3;
const clone = (value) => structuredClone(value);
const canonical = (value) =>
  value && typeof value === "object"
    ? Array.isArray(value)
      ? value.map(canonical)
      : Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
    : value;
const equal = (left, right) =>
  JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const encodedBytes = (value) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
function integer(value, label) {
  if (!Number.isSafeInteger(value))
    throw new TypeError(`${label}: safe integer required`);
  return value;
}
function cellKey({ x, y, z }) {
  return `${x},${y},${z}`;
}
function brickKey({ x, y, z }) {
  return `${floorDiv(x, SIDE)},${floorDiv(y, SIDE)},${floorDiv(z, SIDE)}`;
}
function index({ x, y, z }) {
  return (mod(y, SIDE) * SIDE + mod(z, SIDE)) * SIDE + mod(x, SIDE);
}
function checkCell(at) {
  const bounds = RECIPE.bounds;
  for (const axis of ["x", "y", "z"]) integer(at?.[axis], axis);
  if (
    at.x < bounds.minX ||
    at.x >= bounds.maxX ||
    at.y < bounds.minY ||
    at.y >= bounds.maxY ||
    at.z < bounds.minZ ||
    at.z >= bounds.maxZ
  )
    throw new RangeError("cell outside this finite study domain");
  return { x: at.x, y: at.y, z: at.z };
}
function checkMaterial(value) {
  if (![MATERIAL.air, MATERIAL.soil, MATERIAL.stone].includes(value))
    throw new TypeError("unsupported solid material");
  return value;
}
function compareCells(left, right) {
  return left.x - right.x || left.z - right.z || left.y - right.y;
}
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
function checkBrickAddress(input) {
  for (const axis of ["x", "y", "z"]) integer(input?.[axis], `brick ${axis}`);
  const origin = { x: input.x * SIDE, y: input.y * SIDE, z: input.z * SIDE };
  checkCell(origin);
  checkCell({
    x: origin.x + SIDE - 1,
    y: origin.y + SIDE - 1,
    z: origin.z + SIDE - 1,
  });
  return origin;
}

function readCheckpoint(identity, checkpoint, baseAt) {
  if (checkpoint === null) return { revision: 0, entries: [] };
  if (
    !checkpoint ||
    checkpoint.schema !== RECIPE.codecSchema ||
    !equal(checkpoint.identity, identity)
  )
    throw new Error("checkpoint world/recipe mismatch");
  integer(checkpoint.revision, "checkpoint revision");
  if (checkpoint.revision < 0 || !Array.isArray(checkpoint.changes))
    throw new Error("invalid checkpoint");
  const entries = [],
    seen = new Set();
  for (const entry of checkpoint.changes) {
    const at = checkCell(entry);
    checkMaterial(entry.material);
    integer(entry.revision, "change revision");
    if (
      entry.revision < 1 ||
      entry.revision > checkpoint.revision ||
      seen.has(cellKey(at))
    )
      throw new Error("duplicate or invalid change revision");
    if (entry.material === baseAt(at))
      throw new Error("redundant base-equal override");
    entries.push({ ...at, material: entry.material, revision: entry.revision });
    seen.add(cellKey(at));
  }
  // Compacted state overlay: latest patch revision may be older than world revision.
  return { revision: checkpoint.revision, entries };
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

/** Edits are authoritative sparse state; resident brick arrays are disposable projections. */
export function createVoxelWorld(
  identity,
  { checkpoint = null, maxResidentBricks = RECIPE.residentBrickCap } = {},
) {
  const expected = worldIdentity({
    worldId: identity?.worldId,
    spaceId: identity?.spaceId,
    seed: identity?.base?.heightSeed,
  });
  if (!equal(identity, expected))
    throw new Error("unsupported or incompatible world recipe");
  identity = clone(identity);
  integer(maxResidentBricks, "resident cap");
  if (maxResidentBricks < 1 || maxResidentBricks > RECIPE.residentBrickCap)
    throw new RangeError(`resident cap must be 1-${RECIPE.residentBrickCap}`);
  const spec = createWorldSpec({ seed: identity.base.heightSeed });
  const fieldIdentity = `${spec.identity}:${RECIPE.cave.sampleNamespace}:${RECIPE.cave.id}`;
  const fieldHash = hashString(`${fieldIdentity}|`);
  const features = createCaveFeatures({
    spec,
    units: RECIPE.units,
    bounds: RECIPE.bounds,
  });
  const changes = new Map(),
    byBrick = new Map(),
    cache = new Map();
  let pointReads = 0,
    generatedPointReads = 0;
  let revision = 0,
    generatedBricks = 0,
    evictions = 0,
    heightSamples = 0,
    caveMetricEvaluations = 0;

  function columnAt(x, z) {
    // Exact physical height only; the display sampleCell would also query four neighbors.
    const cell = sampleTerrain(spec, x, z, 1);
    heightSamples += 1;
    return { bedLevel: cell.bedLevel, carve: features.column(x, z) };
  }
  function caveMetric(at) {
    caveMetricEvaluations += 1;
    const verticalMetres = RECIPE.units.verticalMetres;
    const scaled = (field) =>
      signedNoise3D(
        fieldHash,
        at.x / field.horizontalMetres,
        (at.y * verticalMetres) / field.verticalMetres,
        at.z / field.horizontalMetres,
        field.salt,
      );
    return (
      RECIPE.cave.macro.weight * scaled(RECIPE.cave.macro) +
      RECIPE.cave.detail.weight * scaled(RECIPE.cave.detail)
    );
  }
  // This is the sole generated material owner for point reads, bricks, edits, and restore validation.
  function baseMaterialAt(at, column = columnAt(at.x, at.z)) {
    const bed = column.bedLevel;
    if (at.y >= bed || column.carve(at.y)) return MATERIAL.air;
    if (at.y >= bed - 2) return MATERIAL.soil;
    if (at.y >= bed - RECIPE.cave.protectedSolidLayers) return MATERIAL.stone;
    return caveMetric(at) >= RECIPE.cave.voidThreshold
      ? MATERIAL.air
      : MATERIAL.stone;
  }
  function putChange(entry) {
    const key = cellKey(entry),
      brick = brickKey(entry);
    changes.set(key, entry);
    if (!byBrick.has(brick)) byBrick.set(brick, new Map());
    byBrick.get(brick).set(key, entry);
  }
  function removeChange(at) {
    const key = cellKey(at),
      brick = brickKey(at),
      entries = byBrick.get(brick);
    changes.delete(key);
    entries?.delete(key);
    if (entries?.size === 0) byBrick.delete(brick);
  }
  function decodeOrigin(origin) {
    const key = brickKey(origin),
      hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const material = new Uint8Array(VOLUME);
    for (let localZ = 0; localZ < SIDE; localZ += 1)
      for (let localX = 0; localX < SIDE; localX += 1) {
        const x = origin.x + localX,
          z = origin.z + localZ,
          column = columnAt(x, z);
        for (let localY = 0; localY < SIDE; localY += 1) {
          const y = origin.y + localY;
          material[(localY * SIDE + localZ) * SIDE + localX] = baseMaterialAt(
            { x, y, z },
            column,
          );
        }
      }
    for (const entry of byBrick.get(key)?.values() ?? [])
      material[index(entry)] = entry.material;
    generatedBricks += 1;
    cache.set(key, material);
    while (cache.size > maxResidentBricks) {
      cache.delete(cache.keys().next().value);
      evictions += 1;
    }
    return material;
  }
  function decode(at) {
    return decodeOrigin({
      x: floorDiv(at.x, SIDE) * SIDE,
      y: floorDiv(at.y, SIDE) * SIDE,
      z: floorDiv(at.z, SIDE) * SIDE,
    });
  }
  function read(at) {
    at = checkCell(at);
    return decode(at)[index(at)];
  }
  // Sparse physical validation should not allocate a whole 16³ projection.
  // Resident bytes, sparse changes and generated samples have the same owner.
  function readPoint(input) {
    const at = checkCell(input);
    pointReads += 1;
    const resident = cache.get(brickKey(at));
    if (resident) return resident[index(at)];
    const change = changes.get(cellKey(at));
    if (change) return change.material;
    generatedPointReads += 1;
    return baseMaterialAt(at);
  }
  function save() {
    return {
      schema: RECIPE.codecSchema,
      identity: clone(identity),
      revision,
      changes: [...changes.values()].map(clone).sort(compareCells),
    };
  }
  const restored = readCheckpoint(identity, checkpoint, (at) =>
    baseMaterialAt(at),
  );
  for (const entry of restored.entries) putChange(entry);
  revision = restored.revision;

  return Object.freeze({
    read,
    readPoint,
    caveFeature: ({ x, z }) => features.atRegion(x, z),
    readBrick(brick) {
      const origin = checkBrickAddress(brick),
        material = decodeOrigin(origin);
      // A caller gets a disposable snapshot, never the canonical cache array.
      return {
        key: brickKey(origin),
        origin,
        side: SIDE,
        material: material.slice(),
      };
    },
    describe() {
      return {
        identity: clone(identity),
        revision,
        residentProjectionCapBytes: maxResidentBricks * VOLUME,
        coldBrickBudget: {
          cells: VOLUME,
          heightColumns: SIDE * SIDE,
          caveMetricsAtMost: VOLUME,
          featurePrimitiveTestsAtMost: VOLUME * 4,
        },
        sparseOverlay:
          "actual count/bytes reported by stats; no total overlay admission limit in this study",
      };
    },
    edit({ expectedRevision, cells }) {
      if (expectedRevision !== revision)
        return { ok: false, reason: "stale-revision", revision };
      if (!Array.isArray(cells) || cells.length === 0 || cells.length > VOLUME)
        throw new Error("bounded nonempty cell batch required");
      const seen = new Set(),
        next = [];
      for (const input of cells) {
        const at = checkCell(input),
          material = checkMaterial(input.material),
          expectedMaterial = checkMaterial(input.expectedMaterial);
        if (seen.has(cellKey(at))) throw new Error("duplicate edit cell");
        seen.add(cellKey(at));
        if (readPoint(at) !== expectedMaterial)
          return { ok: false, reason: "cell-changed", revision };
        if (expectedMaterial !== material)
          next.push({
            entry: { ...at, material, revision: revision + 1 },
            base: baseMaterialAt(at),
          });
      }
      if (next.length === 0) return { ok: true, revision, changedBricks: [] };
      if (!Number.isSafeInteger(revision + 1))
        throw new RangeError("revision exhausted");
      for (const { entry, base } of next) {
        if (entry.material === base) removeChange(entry);
        else putChange(entry);
        const decoded = cache.get(brickKey(entry));
        if (decoded) decoded[index(entry)] = entry.material;
      }
      revision += 1;
      return {
        ok: true,
        revision,
        changedBricks: [
          ...new Set(next.map(({ entry }) => brickKey(entry))),
        ].sort(),
      };
    },
    save,
    evictAll() {
      evictions += cache.size;
      cache.clear();
      features.evictAll();
    },
    stats() {
      const changesSnapshot = [...changes.values()].sort(compareCells);
      return {
        revision,
        changedCells: changes.size,
        changedBricks: byBrick.size,
        sparseOverlayBytes: encodedBytes(changesSnapshot),
        checkpointBytes: encodedBytes(save()),
        residentBricks: cache.size,
        residentBytes: cache.size * VOLUME,
        maxResidentBricks,
        residentProjectionCapBytes: maxResidentBricks * VOLUME,
        generatedBricks,
        pointReads,
        generatedPointReads,
        heightSamples,
        caveMetricEvaluations,
        caveFeatures: features.stats(),
        evictions,
      };
    },
  });
}
