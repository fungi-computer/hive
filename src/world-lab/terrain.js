// Isolated World Lab terrain contract. This module deliberately has no game,
// Clearing, command, job, actor, camera, or persistence imports.

export const WORLD_LAB_SPEC = Object.freeze({
  seed: "hive-world-lab-seed-20260907",
  generatorVersion: "world-lab-terrain-lod-v3",
  chunkSize: 16,
  overview: Object.freeze({
    width: 512,
    height: 512,
    bounds: Object.freeze({ minX: -2048, minZ: -2048, maxXExclusive: 2048, maxZExclusive: 2048 }),
  }),
  local: Object.freeze({ windowChunks: 5, maxResidentChunks: 25 }),
});

export const WORLD_LAB_NON_CLAIMS = Object.freeze([
  "generated terrain is not a Clearing chunk",
  "render residency is not decoded-world eviction",
  "chunk keys are cache identity only; chunks do not own geography or create borders",
  "the lab has no actors, caravan, jobs, routes, commands, or simulation",
  "overview samples are not a playable world-size or capacity claim",
]);

function integer(value, label) {
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer`);
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
  const spec = {
    ...WORLD_LAB_SPEC,
    ...overrides,
    overview: { ...WORLD_LAB_SPEC.overview, ...(overrides.overview || {}) },
    local: { ...WORLD_LAB_SPEC.local, ...(overrides.local || {}) },
  };
  if (!spec.seed || !spec.generatorVersion) throw new Error("world identity is required");
  if (spec.chunkSize !== 16) throw new Error("the first contract requires 16-cell chunks");
  if (spec.local.windowChunks % 2 !== 1) throw new Error("local window must be odd");
  return Object.freeze({
    ...spec,
    identity: `${spec.generatorVersion}:${spec.seed}`,
    overview: Object.freeze(spec.overview),
    local: Object.freeze(spec.local),
  });
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashLattice(spec, x, z, salt) {
  return hashString(`${spec.identity}|${x}|${z}|${salt}`) / 0xffffffff;
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
  return 180 * Math.sin((x + p * 90) / 620) + 0.14 * x + 42 * (coherentNoise(spec, x / 700, 0.37, "coast-warp") - 0.5);
}

function ridgeLine(spec, x) {
  const p = phase(spec, "ridge-phase");
  return coastLine(spec, x) + 180 + 38 * Math.sin((x + p * 60) / 360);
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
    result += octave.amplitude * coherentNoise(spec, x / octave.scale, z / octave.scale, `${salt}-${octave.salt}`);
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

export function sampleTerrain(spec, x, z, footprint = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new TypeError("terrain coordinates must be finite");
  if (!(footprint > 0)) throw new RangeError("terrain footprint must be positive");
  // Chunk metadata is diagnostic/cache identity only. Every terrain value below
  // is derived from the signed world coordinate, never from chunk-local edges.
  const chunk = chunkOf(spec, Math.floor(x), Math.floor(z));
  const broad = filteredField(spec, x, z, footprint, "elevation");
  const moisture = filteredField(spec, x + 311, z - 127, footprint, "moisture");
  const coastDistance = z - coastLine(spec, x);
  const ridgeDistance = z - ridgeLine(spec, x);
  const coastBand = Math.max(6, footprint * 0.75);
  const ridgeBand = Math.max(22, footprint * 0.75);
  const feature = Math.abs(coastDistance) <= coastBand ? "coast" : Math.abs(ridgeDistance) <= ridgeBand ? "ridge" : null;
  const elevation = Math.max(0, Math.min(1, 0.18 + broad * 0.82 + (coastDistance > 0 ? 0.08 : -0.1)));
  const terrain = coastDistance < -coastBand ? "water" : feature === "coast" ? "coast" : feature === "ridge" ? "ridge" : "land";
  return {
    x,
    z,
    footprint,
    chunk,
    sampleId: `${spec.identity}/sample/${x},${z}`,
    elevation,
    moisture: Math.max(0, Math.min(1, moisture)),
    coastDistance,
    ridgeDistance,
    feature,
    terrain,
  };
}

export function namedFeatures(spec) {
  const coastX = -720;
  const ridgeX = 420;
  return {
    coast: { name: "Northwater Coast", x: coastX, z: Math.round(coastLine(spec, coastX)) },
    ridge: { name: "Lantern Ridge", x: ridgeX, z: Math.round(ridgeLine(spec, ridgeX)) },
  };
}

export function sampleCell(spec, x, z) {
  integer(x, "x");
  integer(z, "z");
  return sampleTerrain(spec, x, z, 1);
}

export function overviewPixelToWorldCell(overview, column, row) {
  integer(column, "overview column");
  integer(row, "overview row");
  if (column < 0 || column >= overview.width || row < 0 || row >= overview.height)
    throw new RangeError("overview pixel is outside the sampled image");
  return {
    x: Math.floor(overview.bounds.minX + (column / overview.width) * overview.bounds.spanX),
    z: Math.floor(overview.bounds.minZ + (row / overview.height) * overview.bounds.spanZ),
    column,
    row,
  };
}

export function worldCellToOverviewPixel(overview, x, z) {
  integer(x, "world x");
  integer(z, "world z");
  const column = Math.max(0, Math.min(overview.width - 1, Math.floor(((x - overview.bounds.minX) / overview.bounds.spanX) * overview.width)));
  const row = Math.max(0, Math.min(overview.height - 1, Math.floor(((z - overview.bounds.minZ) / overview.bounds.spanZ) * overview.height)));
  return { column, row, index: row * overview.width + column };
}

export function localViewport(spec, centerChunkX, centerChunkZ) {
  integer(centerChunkX, "centerChunkX");
  integer(centerChunkZ, "centerChunkZ");
  const radius = Math.floor(spec.local.windowChunks / 2);
  const size = spec.chunkSize;
  const minX = (centerChunkX - radius) * size;
  const minZ = (centerChunkZ - radius) * size;
  const width = spec.local.windowChunks * size;
  return {
    minX,
    minZ,
    maxXExclusive: minX + width,
    maxZExclusive: minZ + width,
    width,
    height: width,
    centerX: minX + (width - 1) / 2,
    centerZ: minZ + (width - 1) / 2,
    cellsPerPixel: 1,
    centerChunkX,
    centerChunkZ,
  };
}

export function overviewRectForViewport(overview, viewport) {
  return {
    left: ((viewport.minX - overview.bounds.minX) / overview.bounds.spanX) * overview.width,
    top: ((viewport.minZ - overview.bounds.minZ) / overview.bounds.spanZ) * overview.height,
    width: (viewport.width / overview.bounds.spanX) * overview.width,
    height: (viewport.height / overview.bounds.spanZ) * overview.height,
  };
}

function terrainCode(terrain) {
  return terrain === "water" ? 0 : terrain === "coast" ? 1 : terrain === "ridge" ? 2 : 3;
}

function featureCode(feature) {
  return feature === "coast" ? 1 : feature === "ridge" ? 2 : 0;
}

export function checksumBytes(bytes) {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function generateChunk(spec, chunkX, chunkZ) {
  integer(chunkX, "chunkX");
  integer(chunkZ, "chunkZ");
  const size = spec.chunkSize;
  const terrain = new Uint8Array(size * size);
  const elevation = new Uint8Array(size * size);
  const moisture = new Uint8Array(size * size);
  for (let localZ = 0; localZ < size; localZ += 1) {
    for (let localX = 0; localX < size; localX += 1) {
      const x = chunkX * size + localX;
      const z = chunkZ * size + localZ;
      // Local render residency asks the same authoritative global sampler for
      // each cell; it does not generate or resize a chunk-local map.
      const cell = sampleCell(spec, x, z);
      const index = localZ * size + localX;
      terrain[index] = terrainCode(cell.terrain);
      elevation[index] = Math.round(cell.elevation * 255);
      moisture[index] = Math.round(cell.moisture * 255);
    }
  }
  return {
    key: `${spec.identity}/chunk/${chunkX},${chunkZ}`,
    chunkX,
    chunkZ,
    size,
    sampleCount: size * size,
    terrain,
    elevation,
    moisture,
    checksum: checksumBytes(new Uint8Array([...terrain, ...elevation, ...moisture])),
  };
}

function overviewBounds(spec, bounds) {
  const source = bounds || spec.overview.bounds;
  const minX = source.minX;
  const minZ = source.minZ;
  const maxXExclusive = source.maxXExclusive;
  const maxZExclusive = source.maxZExclusive;
  if (![minX, minZ, maxXExclusive, maxZExclusive].every(Number.isFinite) || maxXExclusive <= minX || maxZExclusive <= minZ)
    throw new RangeError("overview bounds must have finite positive spans");
  return { minX, minZ, maxXExclusive, maxZExclusive, spanX: maxXExclusive - minX, spanZ: maxZExclusive - minZ };
}

export function sampleOverview(spec, options = {}) {
  const width = options.width ?? spec.overview.width;
  const height = options.height ?? spec.overview.height;
  integer(width, "overview width");
  integer(height, "overview height");
  const bounds = overviewBounds(spec, options.bounds);
  const terrain = new Uint8Array(width * height);
  const features = new Uint8Array(width * height);
  const elevation = new Uint8Array(width * height);
  const moisture = new Uint8Array(width * height);
  const footprint = Math.max(bounds.spanX / width, bounds.spanZ / height);
  const featureCounts = { coast: 0, ridge: 0 };
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const x = bounds.minX + ((column + 0.5) / width) * bounds.spanX - 0.5;
      const z = bounds.minZ + ((row + 0.5) / height) * bounds.spanZ - 0.5;
      const cell = sampleTerrain(spec, x, z, footprint);
      const index = row * width + column;
      terrain[index] = terrainCode(cell.terrain);
      features[index] = featureCode(cell.feature);
      elevation[index] = Math.round(cell.elevation * 255);
      moisture[index] = Math.round(cell.moisture * 255);
      if (cell.feature) featureCounts[cell.feature] += 1;
    }
  }
  return {
    width,
    height,
    bounds: { ...bounds },
    footprint,
    source: "same global sampleTerrain(seed, x, z, footprint)",
    filtering: "omit fine frequencies below the requested world-space footprint",
    sampleCount: terrain.length,
    terrain,
    features,
    elevation,
    moisture,
    featureCounts,
    checksum: checksumBytes(terrain),
    visualChecksum: checksumBytes(new Uint8Array([...terrain, ...elevation, ...moisture])),
  };
}

export function createResidency(spec, options = {}) {
  const radius = options.radiusChunks ?? Math.floor(spec.local.windowChunks / 2);
  const maxResidentChunks = options.maxResidentChunks ?? spec.local.maxResidentChunks;
  const cache = new Map();
  let clock = 0;
  let generatedChunks = 0;
  let cacheHits = 0;
  let evictions = 0;

  function get(chunkX, chunkZ) {
    const key = `${spec.identity}/chunk/${chunkX},${chunkZ}`;
    const cached = cache.get(key);
    if (cached) {
      cached.lastUsed = ++clock;
      cacheHits += 1;
      return cached.chunk;
    }
    const chunk = generateChunk(spec, chunkX, chunkZ);
    cache.set(key, { chunk, lastUsed: ++clock });
    generatedChunks += 1;
    while (cache.size > maxResidentChunks) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0][0];
      cache.delete(oldest);
      evictions += 1;
    }
    return chunk;
  }

  function loadWindow(centerChunkX, centerChunkZ) {
    const chunks = [];
    for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1)
      for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1)
        chunks.push(get(chunkX, chunkZ));
    return chunks;
  }

  return {
    get,
    loadWindow,
    stats() {
      return {
        radiusChunks: radius,
        windowChunks: radius * 2 + 1,
        maxResidentChunks,
        residentChunks: cache.size,
        generatedChunks,
        cacheHits,
        evictions,
        residentKeys: [...cache.keys()].sort(),
      };
    },
  };
}

export function renderChunkBuffer(spec, chunks) {
  if (chunks.length === 0) throw new Error("chunks must not be empty");
  const size = Math.sqrt(chunks.length) * spec.chunkSize;
  if (!Number.isInteger(size)) throw new Error("chunks must form a square window");
  const pixels = new Uint8Array(size * size);
  const elevation = new Uint8Array(size * size);
  const moisture = new Uint8Array(size * size);
  const originChunkX = Math.min(...chunks.map((chunk) => chunk.chunkX));
  const originChunkZ = Math.min(...chunks.map((chunk) => chunk.chunkZ));
  for (const chunk of chunks) {
    const offsetX = (chunk.chunkX - originChunkX) * spec.chunkSize;
    const offsetZ = (chunk.chunkZ - originChunkZ) * spec.chunkSize;
    for (let localZ = 0; localZ < spec.chunkSize; localZ += 1)
      for (let localX = 0; localX < spec.chunkSize; localX += 1) {
        const sourceIndex = localZ * spec.chunkSize + localX;
        const targetIndex = (offsetZ + localZ) * size + offsetX + localX;
        pixels[targetIndex] = chunk.terrain[sourceIndex];
        elevation[targetIndex] = chunk.elevation[sourceIndex];
        moisture[targetIndex] = chunk.moisture[sourceIndex];
      }
  }
  return {
    width: size,
    height: size,
    sampleCount: pixels.length,
    pixels,
    elevation,
    moisture,
    originChunkX,
    originChunkZ,
    checksum: checksumBytes(pixels),
    visualChecksum: checksumBytes(new Uint8Array([...pixels, ...elevation, ...moisture])),
  };
}
