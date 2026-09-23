// Versioned physical height/sea generator shared by maps and edited voxel worlds.
import { hashString, latticeHash2 } from "../engine/world/lattice-hash.mjs";

// Recipe identity and physical samples are independent of a scene, controller,
// renderer and simulation clock. Map presentation remains outside this owner.

export const DEFAULT_WORLD_SPEC = Object.freeze({
  seed: "hive-world-lab-seed-20260907",
  generatorVersion: "world-lab-terrain-height-sea-v5",
  chunkSize: 16,
  overview: Object.freeze({
    width: 512,
    height: 512,
    bounds: Object.freeze({
      minX: -2048,
      minZ: -2048,
      maxXExclusive: 2048,
      maxZExclusive: 2048,
    }),
  }),
  local: Object.freeze({ windowChunks: 5, maxResidentChunks: 25 }),
  // This candidate's sole height/sea authority. Level is a quantized bed
  // height, and one level is one voxel-height in the stated physical metric.
  terrain: Object.freeze({
    id: "layered-landforms-continuous-coast-height-sea-v1",
    verticalVoxelMetres: 0.54,
    quantization: Object.freeze({
      kind: "round-normalized-height-times-32",
      steps: 32,
      minimum: 0,
      maximum: 32,
    }),
    seaSurfaceLevel: 12,
    coastShaping: Object.freeze({
      transitionWorldUnits: 96,
      waterwardOffset: -0.1,
      landwardOffset: 0.08,
    }),
    surfaceWaterInitialization:
      "all-below-datum-surface-basins-at-waterline-v1",
  }),
});

function integer(value, label) {
  if (!Number.isInteger(value))
    throw new TypeError(`${label} must be an integer`);
  return value;
}

export function floorDiv(value, divisor) {
  integer(value, "value");
  integer(divisor, "divisor");
  if (divisor <= 0) throw new RangeError("divisor must be positive");
  return Math.floor(value / divisor);
}

export function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

export function createWorldSpec(overrides = {}) {
  if (overrides.terrain !== undefined)
    throw new Error("height/sea definition is fixed by this candidate version");
  const spec = {
    ...DEFAULT_WORLD_SPEC,
    ...overrides,
    overview: { ...DEFAULT_WORLD_SPEC.overview, ...(overrides.overview || {}) },
    local: { ...DEFAULT_WORLD_SPEC.local, ...(overrides.local || {}) },
    terrain: DEFAULT_WORLD_SPEC.terrain,
  };
  if (!spec.seed || !spec.generatorVersion)
    throw new Error("world identity is required");
  if (spec.chunkSize !== 16)
    throw new Error("the first contract requires 16-cell chunks");
  if (spec.local.windowChunks % 2 !== 1)
    throw new Error("local window must be odd");
  return Object.freeze({
    ...spec,
    identity: `${spec.generatorVersion}:${spec.terrain.id}:${spec.seed}`,
    overview: Object.freeze(spec.overview),
    local: Object.freeze(spec.local),
    terrain: DEFAULT_WORLD_SPEC.terrain,
  });
}

const identityPrefixes = new WeakMap();

function hashLattice(spec, x, z, salt) {
  let prefix = identityPrefixes.get(spec);
  if (!prefix || prefix.identity !== spec.identity) {
    prefix = { identity: spec.identity, hash: hashString(`${spec.identity}|`) };
    identityPrefixes.set(spec, prefix);
  }
  return latticeHash2(prefix.hash, x, z, salt) / 0xffffffff;
}

function smooth(value) {
  return value * value * (3 - 2 * value);
}

function coherentNoise(spec, x, z, salt) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hashLattice(spec, x0, z0, salt);
  const b = hashLattice(spec, x0 + 1, z0, salt);
  const c = hashLattice(spec, x0, z0 + 1, salt);
  const d = hashLattice(spec, x0 + 1, z0 + 1, salt);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function phase(spec, salt) {
  return hashLattice(spec, 0, 0, salt) * Math.PI * 2;
}

function coastLine(spec, x) {
  const p = phase(spec, "coast-phase");
  return (
    180 * Math.sin((x + p * 90) / 620) +
    0.14 * x +
    42 * (coherentNoise(spec, x / 700, 0.37, "coast-warp") - 0.5)
  );
}

function ridgeLine(spec, x, coast = coastLine(spec, x)) {
  const p = phase(spec, "ridge-phase");
  return coast + 180 + 38 * Math.sin((x + p * 60) / 360);
}

function canyonLine(spec, x, coast = coastLine(spec, x)) {
  const p = phase(spec, "canyon-phase");
  return (
    coast +
    430 +
    52 * Math.sin((x - p * 70) / 410) +
    18 * (coherentNoise(spec, x / 560, -0.41, "canyon-warp") - 0.5)
  );
}

function bellProfile(distance, radius) {
  const normalized = Math.min(1, Math.abs(distance) / radius);
  const falloff = 1 - smooth(normalized);
  return falloff * falloff;
}

function filteredField(spec, x, z, footprint, salt) {
  const octaves = [
    { scale: 1024, amplitude: 0.56, salt: "broad" },
    { scale: 512, amplitude: 0.26, salt: "region" },
    { scale: 256, amplitude: 0.12, salt: "landform" },
    { scale: 64, amplitude: 0.05, salt: "detail" },
    { scale: 24, amplitude: 0.025, salt: "fine" },
    { scale: 8, amplitude: 0.012, salt: "grain" },
  ];
  let result = 0;
  for (const octave of octaves) {
    // Frequency omission is footprint-aware and keeps every surviving octave's
    // seed, coordinate scale, and amplitude unchanged.
    if (octave.scale < footprint * 1.5) continue;
    result +=
      octave.amplitude *
      coherentNoise(
        spec,
        x / octave.scale,
        z / octave.scale,
        `${salt}-${octave.salt}`,
      );
  }
  return result;
}

export function chunkOf(spec, x, z) {
  integer(x, "x");
  integer(z, "z");
  const size = spec.chunkSize;
  const chunkX = floorDiv(x, size);
  const chunkZ = floorDiv(z, size);
  const localX = mod(x, size);
  const localZ = mod(z, size);
  return {
    chunkX,
    chunkZ,
    localX,
    localZ,
    key: `${spec.identity}/chunk/${chunkX},${chunkZ}`,
  };
}

export function quantizeBedLevel(spec, elevation) {
  if (!Number.isFinite(elevation))
    throw new TypeError("normalized elevation must be finite");
  const quantization = spec.terrain.quantization;
  return Math.round(Math.max(0, Math.min(1, elevation)) * quantization.steps);
}

function coastHeightOffset(spec, coastDistance) {
  const shape = spec.terrain.coastShaping;
  const raw = Math.max(
    0,
    Math.min(
      1,
      (coastDistance + shape.transitionWorldUnits) /
        (2 * shape.transitionWorldUnits),
    ),
  );
  return (
    shape.waterwardOffset +
    (shape.landwardOffset - shape.waterwardOffset) * smooth(raw)
  );
}

export function sampleTerrain(spec, x, z, footprint = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(z))
    throw new TypeError("terrain coordinates must be finite");
  if (!(footprint > 0))
    throw new RangeError("terrain footprint must be positive");
  // Chunk metadata is diagnostic/cache identity only. Every terrain value below
  // is derived from the signed world coordinate, never from chunk-local edges.
  const chunk = chunkOf(spec, Math.floor(x), Math.floor(z));
  const broad = filteredField(spec, x, z, footprint, "elevation");
  const moisture = filteredField(spec, x + 311, z - 127, footprint, "moisture");
  const coast = coastLine(spec, x);
  const coastDistance = z - coast;
  const ridgeDistance = z - ridgeLine(spec, x, coast);
  const canyonDistance = z - canyonLine(spec, x, coast);
  const coastBand = Math.max(6, footprint * 0.75);
  const ridgeBand = Math.max(22, footprint * 0.75);
  const canyonBand = Math.max(28, footprint * 0.75);
  // Coast remains a continuous landform input, never a water classifier.
  const baseElevation = Math.max(
    0,
    Math.min(1, 0.18 + broad * 0.82 + coastHeightOffset(spec, coastDistance)),
  );
  const ridgeLift = 0.3 * bellProfile(ridgeDistance, 92);
  const canyonCarve = 0.34 * bellProfile(canyonDistance, 82);
  const feature =
    Math.abs(coastDistance) <= coastBand
      ? "coast-shaping"
      : Math.abs(canyonDistance) <= canyonBand
        ? "canyon"
        : Math.abs(ridgeDistance) <= ridgeBand
          ? "ridge"
          : null;
  const elevation = Math.max(
    0,
    Math.min(1, baseElevation + ridgeLift - canyonCarve),
  );
  const bedLevel = quantizeBedLevel(spec, elevation);
  const seaSurfaceLevel = spec.terrain.seaSurfaceLevel;
  const surfaceWaterPotentialDepthLevels = Math.max(
    0,
    seaSurfaceLevel - bedLevel,
  );
  // Equality is dry ground at the datum. A shore requires exact cardinal
  // wet/dry adjacency; water remains initialization metadata only.
  const terrain =
    bedLevel < seaSurfaceLevel
      ? "surface-water"
      : bedLevel === seaSurfaceLevel
        ? "sea-level-ground"
        : "land";
  return {
    x,
    z,
    footprint,
    chunk,
    sampleId: `${spec.identity}/sample/${x},${z}`,
    elevation,
    bedLevel,
    bedMetres: bedLevel * spec.terrain.verticalVoxelMetres,
    seaSurfaceLevel,
    seaSurfaceMetres: seaSurfaceLevel * spec.terrain.verticalVoxelMetres,
    surfaceWaterPotentialDepthLevels,
    surfaceWaterPotentialDepthMetres:
      surfaceWaterPotentialDepthLevels * spec.terrain.verticalVoxelMetres,
    classificationScope: "footprint-approximation",
    moisture: Math.max(0, Math.min(1, moisture)),
    coastDistance,
    ridgeDistance,
    canyonDistance,
    baseElevation,
    ridgeLift,
    canyonCarve,
    feature,
    terrain,
  };
}

const CARDINAL_NEIGHBOURS = Object.freeze([
  Object.freeze({ x: 0, z: -1, name: "north" }),
  Object.freeze({ x: 1, z: 0, name: "east" }),
  Object.freeze({ x: 0, z: 1, name: "south" }),
  Object.freeze({ x: -1, z: 0, name: "west" }),
]);

function isSurfaceWater(cell) {
  return cell.bedLevel < cell.seaSurfaceLevel;
}

function exactWetDryBoundary(spec, cell) {
  const wet = isSurfaceWater(cell);
  const neighbours = CARDINAL_NEIGHBOURS.map((offset) => {
    const neighbour = sampleTerrain(
      spec,
      cell.x + offset.x,
      cell.z + offset.z,
      1,
    );
    return {
      direction: offset.name,
      x: neighbour.x,
      z: neighbour.z,
      terrain: neighbour.terrain,
      bedLevel: neighbour.bedLevel,
      wet: isSurfaceWater(neighbour),
    };
  });
  return {
    wetDryBoundary: neighbours.some((neighbour) => neighbour.wet !== wet),
    wet,
    neighbours,
  };
}

export function sampleCell(spec, x, z) {
  integer(x, "x");
  integer(z, "z");
  const cell = sampleTerrain(spec, x, z, 1);
  const boundary = exactWetDryBoundary(spec, cell);
  return {
    ...cell,
    classificationScope: "exact-cell",
    wet: boundary.wet,
    wetDryBoundary: boundary.wetDryBoundary,
    wetDryNeighbours: boundary.neighbours,
  };
}
