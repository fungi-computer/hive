// World Lab projections, navigation labels and disposable presentation residency.
import {
  DEFAULT_WORLD_SPEC as WORLD_LAB_SPEC,
  createWorldSpec,
  floorDiv,
  mod,
  chunkOf,
  quantizeBedLevel,
  sampleTerrain,
  sampleCell,
} from "../world-presets/height.js";
export {
  WORLD_LAB_SPEC,
  createWorldSpec,
  floorDiv,
  mod,
  chunkOf,
  quantizeBedLevel,
  sampleTerrain,
  sampleCell,
};
function integer(value, label) {
  if (!Number.isInteger(value))
    throw new TypeError(`${label} must be an integer`);
  return value;
}

export const MAX_OVERVIEW_DIMENSION = 512;

export const WORLD_LAB_NON_CLAIMS = Object.freeze([
  "generated terrain is not a Clearing chunk",
  "render residency is not decoded-world eviction",
  "chunk keys are cache identity only; chunks do not own geography or create borders",
  "the lab has no actors, caravan, jobs, routes, commands, or simulation",
  "overview samples are not a playable world-size or capacity claim",
]);

export function namedFeatures(spec) {
  const coastX = -720;
  const ridgeX = 420;
  const canyonX = -240;
  return {
    coastShaping: {
      name: "Northwater coastal shaping line (not shoreline)",
      x: coastX,
      z: Math.round(-sampleTerrain(spec, coastX, 0).coastDistance),
    },
    ridge: {
      name: "Lantern Ridge",
      x: ridgeX,
      z: Math.round(-sampleTerrain(spec, ridgeX, 0).ridgeDistance),
    },
    canyon: {
      name: "Mallowcut Canyon",
      x: canyonX,
      z: Math.round(-sampleTerrain(spec, canyonX, 0).canyonDistance),
    },
    wetDryBoundary: nearestWetDryBoundary(
      spec,
      coastX,
      Math.round(-sampleTerrain(spec, coastX, 0).coastDistance),
    ),
  };
}

export function nearestWetDryBoundary(
  spec,
  anchorX,
  anchorZ,
  maxDistance = 1024,
) {
  integer(anchorX, "wet/dry boundary anchor x");
  integer(anchorZ, "wet/dry boundary anchor z");
  integer(maxDistance, "wet/dry boundary maximum distance");
  if (maxDistance < 0)
    throw new RangeError(
      "wet/dry boundary maximum distance must be nonnegative",
    );
  for (let distance = 0; distance <= maxDistance; distance += 1) {
    const offsets = distance === 0 ? [0] : [-distance, distance];
    for (const offset of offsets) {
      const cell = sampleCell(spec, anchorX, anchorZ + offset);
      if (!cell.wetDryBoundary) continue;
      return {
        name: "Northwater wet/dry boundary",
        x: cell.x,
        z: cell.z,
        anchor: { x: anchorX, z: anchorZ },
        distance,
        wet: cell.wet,
        adjacentDirections: cell.wetDryNeighbours
          .filter((neighbour) => neighbour.wet !== cell.wet)
          .map((neighbour) => neighbour.direction),
      };
    }
  }
  throw new Error(
    `no wet/dry boundary within ${maxDistance} cells of ${anchorX},${anchorZ}`,
  );
}

export function overviewPixelToWorldCell(overview, column, row) {
  integer(column, "overview column");
  integer(row, "overview row");
  if (
    column < 0 ||
    column >= overview.width ||
    row < 0 ||
    row >= overview.height
  )
    throw new RangeError("overview pixel is outside the sampled image");
  return {
    x: Math.floor(
      overview.bounds.minX + (column / overview.width) * overview.bounds.spanX,
    ),
    z: Math.floor(
      overview.bounds.minZ + (row / overview.height) * overview.bounds.spanZ,
    ),
    column,
    row,
  };
}

export function worldCellToOverviewPixel(overview, x, z) {
  integer(x, "world x");
  integer(z, "world z");
  const column = Math.max(
    0,
    Math.min(
      overview.width - 1,
      Math.floor(
        ((x - overview.bounds.minX) / overview.bounds.spanX) * overview.width,
      ),
    ),
  );
  const row = Math.max(
    0,
    Math.min(
      overview.height - 1,
      Math.floor(
        ((z - overview.bounds.minZ) / overview.bounds.spanZ) * overview.height,
      ),
    ),
  );
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
    left:
      ((viewport.minX - overview.bounds.minX) / overview.bounds.spanX) *
      overview.width,
    top:
      ((viewport.minZ - overview.bounds.minZ) / overview.bounds.spanZ) *
      overview.height,
    width: (viewport.width / overview.bounds.spanX) * overview.width,
    height: (viewport.height / overview.bounds.spanZ) * overview.height,
  };
}

export function terrainCode(terrain) {
  return terrain === "surface-water"
    ? 0
    : terrain === "sea-level-ground"
      ? 1
      : 3;
}

function featureCode(feature) {
  return feature === "coast-shaping"
    ? 1
    : feature === "ridge"
      ? 2
      : feature === "canyon"
        ? 3
        : 0;
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
  const bedLevels = new Uint8Array(size * size);
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
      bedLevels[index] = cell.bedLevel;
      moisture[index] = Math.round(cell.moisture * 255);
    }
  }
  return {
    key: `${spec.identity}/chunk/${chunkX},${chunkZ}`,
    chunkX,
    chunkZ,
    size,
    sampleCount: size * size,
    terrainLabelScope: "exact-cell samples",
    terrain,
    elevation,
    bedLevels,
    moisture,
    checksum: checksumBytes(
      new Uint8Array([...terrain, ...elevation, ...bedLevels, ...moisture]),
    ),
  };
}

function overviewBounds(spec, bounds) {
  const source = bounds || spec.overview.bounds;
  const minX = source.minX;
  const minZ = source.minZ;
  const maxXExclusive = source.maxXExclusive;
  const maxZExclusive = source.maxZExclusive;
  if (
    ![minX, minZ, maxXExclusive, maxZExclusive].every(Number.isFinite) ||
    maxXExclusive <= minX ||
    maxZExclusive <= minZ
  )
    throw new RangeError("overview bounds must have finite positive spans");
  return {
    minX,
    minZ,
    maxXExclusive,
    maxZExclusive,
    spanX: maxXExclusive - minX,
    spanZ: maxZExclusive - minZ,
  };
}

export function createOverviewSampler(spec, options = {}) {
  const width = options.width ?? spec.overview.width;
  const height = options.height ?? spec.overview.height;
  integer(width, "overview width");
  integer(height, "overview height");
  if (
    width <= 0 ||
    height <= 0 ||
    width > MAX_OVERVIEW_DIMENSION ||
    height > MAX_OVERVIEW_DIMENSION
  )
    throw new RangeError(
      `overview dimensions must be between 1 and ${MAX_OVERVIEW_DIMENSION}`,
    );
  const bounds = overviewBounds(spec, options.bounds);
  const terrain = new Uint8Array(width * height);
  const features = new Uint8Array(width * height);
  const elevation = new Uint8Array(width * height);
  const moisture = new Uint8Array(width * height);
  const footprint = Math.max(bounds.spanX / width, bounds.spanZ / height);
  const featureCounts = { coastShaping: 0, ridge: 0, canyon: 0 };
  let nextRow = 0;

  return {
    sampleRows(rowCount) {
      integer(rowCount, "overview row count");
      if (rowCount <= 0)
        throw new RangeError("overview row count must be positive");
      const endRow = Math.min(height, nextRow + rowCount);
      for (let row = nextRow; row < endRow; row += 1) {
        for (let column = 0; column < width; column += 1) {
          const x = bounds.minX + ((column + 0.5) / width) * bounds.spanX - 0.5;
          const z = bounds.minZ + ((row + 0.5) / height) * bounds.spanZ - 0.5;
          const cell = sampleTerrain(spec, x, z, footprint);
          const index = row * width + column;
          terrain[index] = terrainCode(cell.terrain);
          features[index] = featureCode(cell.feature);
          elevation[index] = Math.round(cell.elevation * 255);
          moisture[index] = Math.round(cell.moisture * 255);
          if (cell.feature)
            featureCounts[
              cell.feature === "coast-shaping" ? "coastShaping" : cell.feature
            ] += 1;
        }
      }
      nextRow = endRow;
      return {
        completedRows: nextRow,
        totalRows: height,
        done: nextRow === height,
      };
    },
    result() {
      if (nextRow !== height)
        throw new Error("overview sampling is incomplete");
      return {
        width,
        height,
        bounds: { ...bounds },
        footprint,
        source: "same global sampleTerrain(seed, x, z, footprint)",
        terrainLabelScope:
          "per-pixel footprint approximation; exact clicked cells use sampleCell",
        filtering:
          "omit fine frequencies below the requested world-space footprint",
        sampleCount: terrain.length,
        terrain,
        features,
        elevation,
        moisture,
        featureCounts,
        checksum: checksumBytes(terrain),
        visualChecksum: checksumBytes(
          new Uint8Array([...terrain, ...elevation, ...moisture]),
        ),
      };
    },
  };
}

export function sampleOverview(spec, options = {}) {
  const sampler = createOverviewSampler(spec, options);
  while (!sampler.sampleRows(MAX_OVERVIEW_DIMENSION).done) {
    // The synchronous API remains useful for bounded tests and host callers.
    // Browser interaction uses the worker's smaller yielding row batches.
  }
  return sampler.result();
}

export function createResidency(spec, options = {}) {
  const radius =
    options.radiusChunks ?? Math.floor(spec.local.windowChunks / 2);
  const maxResidentChunks =
    options.maxResidentChunks ?? spec.local.maxResidentChunks;
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
      const oldest = [...cache.entries()].sort(
        (a, b) => a[1].lastUsed - b[1].lastUsed,
      )[0][0];
      cache.delete(oldest);
      evictions += 1;
    }
    return chunk;
  }

  function loadWindow(centerChunkX, centerChunkZ) {
    const chunks = [];
    for (
      let chunkZ = centerChunkZ - radius;
      chunkZ <= centerChunkZ + radius;
      chunkZ += 1
    )
      for (
        let chunkX = centerChunkX - radius;
        chunkX <= centerChunkX + radius;
        chunkX += 1
      )
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
  if (!Number.isInteger(size))
    throw new Error("chunks must form a square window");
  const pixels = new Uint8Array(size * size);
  const elevation = new Uint8Array(size * size);
  const bedLevels = new Uint8Array(size * size);
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
        bedLevels[targetIndex] = chunk.bedLevels[sourceIndex];
        moisture[targetIndex] = chunk.moisture[sourceIndex];
      }
  }
  return {
    width: size,
    height: size,
    sampleCount: pixels.length,
    pixels,
    elevation,
    bedLevels,
    moisture,
    originChunkX,
    originChunkZ,
    checksum: checksumBytes(pixels),
    visualChecksum: checksumBytes(
      new Uint8Array([...pixels, ...elevation, ...bedLevels, ...moisture]),
    ),
  };
}
