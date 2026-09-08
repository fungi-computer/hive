import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  MAX_OVERVIEW_DIMENSION,
  WORLD_LAB_NON_CLAIMS,
  createOverviewSampler,
  createResidency,
  createWorldSpec,
  generateChunk,
  floorDiv,
  localViewport,
  namedFeatures,
  overviewRectForViewport,
  renderChunkBuffer,
  sampleCell,
  sampleOverview,
  sampleTerrain,
  terrainCode,
  overviewPixelToWorldCell,
  worldCellToOverviewPixel,
} from "../src/world-lab/terrain.js";
import {
  SECTION_LIMITS,
  assembleSurfaceSection,
  prepareIsometricSection,
  sampleSectionCells,
} from "../src/world-lab/section.js";
import { generateOverview } from "../src/world-lab/worker.js";

const output = process.argv[2] || ".botanical/world-lab-proof";
const spec = createWorldSpec();
const features = namedFeatures(spec);
const started = performance.now();
const checks = {};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

await mkdir(output, { recursive: true });

const negative = sampleCell(spec, -1, 0);
const positive = sampleCell(spec, 16, 0);
checks.globalSignedCoordinates = {
  negative: {
    x: negative.x,
    chunkX: negative.chunk.chunkX,
    localX: negative.chunk.localX,
  },
  positive: {
    x: positive.x,
    chunkX: positive.chunk.chunkX,
    localX: positive.chunk.localX,
  },
  pass:
    negative.chunk.chunkX === -1 &&
    negative.chunk.localX === 15 &&
    positive.chunk.chunkX === 1 &&
    positive.chunk.localX === 0,
};
assert(
  checks.globalSignedCoordinates.pass,
  "floor division failed at negative chunk edge",
);

const fineBounds = {
  minX: -1024,
  minZ: -1024,
  maxXExclusive: 1024,
  maxZExclusive: 1024,
};
const localAuthorityPoints = [
  [features.coast.x, features.coast.z],
  [features.ridge.x, features.ridge.z],
  [features.canyon.x, features.canyon.z],
  [-1, 0],
  [16, 0],
];
const localBeforeOverview = localAuthorityPoints.map(([x, z]) =>
  sampleCell(spec, x, z),
);
const coarseStart = performance.now();
const coarseOverview = sampleOverview(spec, {
  width: 512,
  height: 512,
  bounds: spec.overview.bounds,
});
const coarseMs = performance.now() - coarseStart;
const fineStart = performance.now();
const fineOverview = sampleOverview(spec, {
  width: 512,
  height: 512,
  bounds: fineBounds,
});
const fineMs = performance.now() - fineStart;
const fixedOutputSamples = 512 * 512;

const incrementalSampler = createOverviewSampler(spec, {
  width: 64,
  height: 64,
  bounds: fineBounds,
});
const incrementalProgress = [];
while (true) {
  const progress = incrementalSampler.sampleRows(7);
  incrementalProgress.push(progress.completedRows);
  if (progress.done) break;
}
const incrementalOverview = incrementalSampler.result();
const synchronous64 = sampleOverview(spec, {
  width: 64,
  height: 64,
  bounds: fineBounds,
});
let cancellationYields = 0;
const canceledWorkerResult = await generateOverview(
  {
    type: "sample",
    requestId: 41,
    spec,
    options: { width: 64, height: 64, bounds: fineBounds },
  },
  {
    shouldCancel: () => cancellationYields > 0,
    yieldControl: async () => {
      cancellationYields += 1;
    },
  },
);
const workerResult = await generateOverview(
  {
    type: "sample",
    requestId: 42,
    spec,
    options: { width: 32, height: 32, bounds: fineBounds },
  },
  { yieldControl: async () => {} },
);
let oversizedRejected = false;
try {
  sampleOverview(spec, {
    width: MAX_OVERVIEW_DIMENSION + 1,
    height: 1,
    bounds: fineBounds,
  });
} catch (error) {
  oversizedRejected = error instanceof RangeError;
}
checks.boundedIncrementalWorkerSampler = {
  rowBatches: incrementalProgress,
  synchronousChecksum: synchronous64.visualChecksum,
  incrementalChecksum: incrementalOverview.visualChecksum,
  canceledRequest: canceledWorkerResult,
  completedRequest: {
    type: workerResult.type,
    requestId: workerResult.requestId,
    sampleCount: workerResult.overview?.sampleCount,
    typedArrays: workerResult.overview
      ? [
          workerResult.overview.terrain,
          workerResult.overview.features,
          workerResult.overview.elevation,
          workerResult.overview.moisture,
        ].every((value) => value instanceof Uint8Array)
      : false,
  },
  maxDimension: MAX_OVERVIEW_DIMENSION,
  oversizedRejected,
  pass:
    incrementalOverview.visualChecksum === synchronous64.visualChecksum &&
    incrementalProgress.length > 1 &&
    canceledWorkerResult.type === "canceled" &&
    canceledWorkerResult.requestId === 41 &&
    cancellationYields === 1 &&
    workerResult.type === "result" &&
    workerResult.requestId === 42 &&
    workerResult.overview.sampleCount === 32 * 32 &&
    oversizedRejected,
};
assert(
  checks.boundedIncrementalWorkerSampler.pass,
  "bounded incremental worker sampling or cancellation failed",
);
const overviewPixelFor = (overview, x, z) => {
  const column = Math.max(
    0,
    Math.min(
      overview.width - 1,
      Math.round(
        ((x - overview.bounds.minX) / overview.bounds.spanX) * overview.width -
          0.5,
      ),
    ),
  );
  const row = Math.max(
    0,
    Math.min(
      overview.height - 1,
      Math.round(
        ((z - overview.bounds.minZ) / overview.bounds.spanZ) * overview.height -
          0.5,
      ),
    ),
  );
  return { column, row, index: row * overview.width + column };
};
const overviewFeatureCode = { coast: 1, ridge: 2, canyon: 3 };
checks.multiscaleGeography = {
  coarse: {
    bounds: coarseOverview.bounds,
    footprint: coarseOverview.footprint,
    sampleCount: coarseOverview.sampleCount,
    checksum: coarseOverview.checksum,
    featureCounts: coarseOverview.featureCounts,
    ms: Number(coarseMs.toFixed(3)),
  },
  fineSpan: {
    bounds: fineOverview.bounds,
    footprint: fineOverview.footprint,
    sampleCount: fineOverview.sampleCount,
    checksum: fineOverview.checksum,
    featureCounts: fineOverview.featureCounts,
    elevationSamples: fineOverview.elevation.length,
    moistureSamples: fineOverview.moisture.length,
    ms: Number(fineMs.toFixed(3)),
  },
  fixedOutputSamples,
  spans: {
    coarse: { x: coarseOverview.bounds.spanX, z: coarseOverview.bounds.spanZ },
    fine: { x: fineOverview.bounds.spanX, z: fineOverview.bounds.spanZ },
  },
  pass:
    coarseOverview.sampleCount === fixedOutputSamples &&
    fineOverview.sampleCount === fixedOutputSamples &&
    coarseOverview.elevation.length === fixedOutputSamples &&
    coarseOverview.moisture.length === fixedOutputSamples &&
    fineOverview.elevation.length === fixedOutputSamples &&
    fineOverview.moisture.length === fixedOutputSamples &&
    coarseOverview.bounds.spanX > fineOverview.bounds.spanX &&
    coarseOverview.featureCounts.coast > 0 &&
    fineOverview.featureCounts.coast > 0 &&
    coarseOverview.featureCounts.ridge > 0 &&
    fineOverview.featureCounts.ridge > 0 &&
    coarseOverview.featureCounts.canyon > 0 &&
    fineOverview.featureCounts.canyon > 0,
};
assert(
  checks.multiscaleGeography.pass,
  "multiscale geography did not preserve spans/features within bounded output work",
);

const featureProbe = {};
for (const [kind, feature] of Object.entries(features)) {
  const local = sampleTerrain(spec, feature.x, feature.z, 1);
  const coarse = sampleTerrain(
    spec,
    feature.x,
    feature.z,
    coarseOverview.footprint,
  );
  const fine = sampleTerrain(
    spec,
    feature.x,
    feature.z,
    fineOverview.footprint,
  );
  featureProbe[kind] = {
    name: feature.name,
    coordinate: { x: feature.x, z: feature.z },
    local: { feature: local.feature, terrain: local.terrain },
    coarse: { feature: coarse.feature, terrain: coarse.terrain },
    fineSpan: { feature: fine.feature, terrain: fine.terrain },
    coarseOverviewPixel: (() => {
      const pixel = overviewPixelFor(coarseOverview, feature.x, feature.z);
      return { ...pixel, featureCode: coarseOverview.features[pixel.index] };
    })(),
    fineOverviewPixel: (() => {
      const pixel = overviewPixelFor(fineOverview, feature.x, feature.z);
      return { ...pixel, featureCode: fineOverview.features[pixel.index] };
    })(),
  };
}
checks.namedFeatures = {
  features: featureProbe,
  pass: Object.entries(featureProbe).every(
    ([kind, samples]) =>
      samples.local.feature === kind &&
      samples.coarse.feature === kind &&
      samples.fineSpan.feature === kind &&
      samples.coarseOverviewPixel.featureCode === overviewFeatureCode[kind] &&
      samples.fineOverviewPixel.featureCode === overviewFeatureCode[kind],
  ),
};
assert(
  checks.namedFeatures.pass,
  "named coast/ridge/canyon did not survive local and two overview spans",
);

const ridgeCenter = sampleTerrain(spec, features.ridge.x, features.ridge.z, 1);
const ridgeNorthShoulder = sampleTerrain(
  spec,
  features.ridge.x,
  features.ridge.z - 110,
  1,
);
const ridgeSouthShoulder = sampleTerrain(
  spec,
  features.ridge.x,
  features.ridge.z + 110,
  1,
);
const canyonCenter = sampleTerrain(
  spec,
  features.canyon.x,
  features.canyon.z,
  1,
);
const canyonNorthBank = sampleTerrain(
  spec,
  features.canyon.x,
  features.canyon.z - 110,
  1,
);
const canyonSouthBank = sampleTerrain(
  spec,
  features.canyon.x,
  features.canyon.z + 110,
  1,
);
const ridgeFootprints = [
  1,
  fineOverview.footprint,
  coarseOverview.footprint,
].map((footprint) =>
  sampleTerrain(spec, features.ridge.x, features.ridge.z, footprint),
);
const canyonFootprints = [
  1,
  fineOverview.footprint,
  coarseOverview.footprint,
].map((footprint) =>
  sampleTerrain(spec, features.canyon.x, features.canyon.z, footprint),
);
checks.realLandformGeometry = {
  ridge: {
    center: {
      elevation: ridgeCenter.elevation,
      baseElevation: ridgeCenter.baseElevation,
      ridgeLift: ridgeCenter.ridgeLift,
    },
    shoulders: [ridgeNorthShoulder.elevation, ridgeSouthShoulder.elevation],
    footprintSupport: ridgeFootprints.map((cell) => ({
      footprint: cell.footprint,
      feature: cell.feature,
      ridgeLift: cell.ridgeLift,
    })),
  },
  canyon: {
    center: {
      elevation: canyonCenter.elevation,
      baseElevation: canyonCenter.baseElevation,
      canyonCarve: canyonCenter.canyonCarve,
    },
    banks: [canyonNorthBank.elevation, canyonSouthBank.elevation],
    footprintSupport: canyonFootprints.map((cell) => ({
      footprint: cell.footprint,
      feature: cell.feature,
      canyonCarve: cell.canyonCarve,
    })),
  },
  pass:
    ridgeCenter.elevation > ridgeNorthShoulder.elevation &&
    ridgeCenter.elevation > ridgeSouthShoulder.elevation &&
    ridgeCenter.ridgeLift > 0 &&
    canyonCenter.elevation < canyonNorthBank.elevation &&
    canyonCenter.elevation < canyonSouthBank.elevation &&
    canyonCenter.canyonCarve > 0 &&
    ridgeFootprints.every(
      (cell) =>
        cell.feature === "ridge" && cell.ridgeLift === ridgeCenter.ridgeLift,
    ) &&
    canyonFootprints.every(
      (cell) =>
        cell.feature === "canyon" &&
        cell.canyonCarve === canyonCenter.canyonCarve,
    ),
};
assert(
  checks.realLandformGeometry.pass,
  "ridge lift or canyon carve failed geometry or footprint identity",
);

const authorityPoints = [
  [-719, features.coast.z],
  [420, features.ridge.z],
  [features.canyon.x, features.canyon.z],
  [-1, 0],
  [16, 0],
];
const authorityResults = authorityPoints.map(([x, z]) => {
  const cell = sampleCell(spec, x, z);
  const direct = sampleTerrain(spec, x, z, 1);
  return {
    x,
    z,
    sampleId: cell.sampleId,
    cellTerrain: cell.terrain,
    directTerrain: direct.terrain,
    elevationDelta: Math.abs(cell.elevation - direct.elevation),
    moistureDelta: Math.abs(cell.moisture - direct.moisture),
  };
});
checks.authoritativeLocal = {
  points: authorityResults,
  pass: authorityResults.every(
    (point) =>
      point.elevationDelta === 0 &&
      point.moistureDelta === 0 &&
      point.cellTerrain === point.directTerrain,
  ),
};
assert(
  checks.authoritativeLocal.pass,
  "local authoritative terrain changed between integer caller paths",
);

const localAfterOverview = localAuthorityPoints.map(([x, z]) =>
  sampleCell(spec, x, z),
);
checks.localResolutionAuthority = {
  points: localBeforeOverview.map((before, index) => {
    const after = localAfterOverview[index];
    return {
      x: before.x,
      z: before.z,
      unchanged:
        before.elevation === after.elevation &&
        before.moisture === after.moisture &&
        before.terrain === after.terrain,
    };
  }),
  pass: localBeforeOverview.every((before, index) => {
    const after = localAfterOverview[index];
    return (
      before.elevation === after.elevation &&
      before.moisture === after.moisture &&
      before.terrain === after.terrain
    );
  }),
};
assert(
  checks.localResolutionAuthority.pass,
  "overview sampling mutated authoritative local terrain",
);

const seamBoundaries = [-32, -16, 0, 16, 32];
const seamSamples = [];
for (const boundary of seamBoundaries) {
  const xLeft = sampleTerrain(spec, boundary - 1e-4, 4.25, 1);
  const xRight = sampleTerrain(spec, boundary + 1e-4, 4.25, 1);
  const zLeft = sampleTerrain(spec, 4.25, boundary - 1e-4, 1);
  const zRight = sampleTerrain(spec, 4.25, boundary + 1e-4, 1);
  seamSamples.push({
    boundary,
    x: {
      elevationDelta: Math.abs(xLeft.elevation - xRight.elevation),
      moistureDelta: Math.abs(xLeft.moisture - xRight.moisture),
      ridgeLiftDelta: Math.abs(xLeft.ridgeLift - xRight.ridgeLift),
      canyonCarveDelta: Math.abs(xLeft.canyonCarve - xRight.canyonCarve),
    },
    z: {
      elevationDelta: Math.abs(zLeft.elevation - zRight.elevation),
      moistureDelta: Math.abs(zLeft.moisture - zRight.moisture),
      ridgeLiftDelta: Math.abs(zLeft.ridgeLift - zRight.ridgeLift),
      canyonCarveDelta: Math.abs(zLeft.canyonCarve - zRight.canyonCarve),
    },
  });
}
const seamTolerance = 0.002;
checks.signedGlobalSeams = {
  seamSamples,
  seamTolerance,
  pass: seamSamples.every(
    (seam) =>
      seam.x.elevationDelta < seamTolerance &&
      seam.x.moistureDelta < seamTolerance &&
      seam.x.ridgeLiftDelta < seamTolerance &&
      seam.x.canyonCarveDelta < seamTolerance &&
      seam.z.elevationDelta < seamTolerance &&
      seam.z.moistureDelta < seamTolerance &&
      seam.z.ridgeLiftDelta < seamTolerance &&
      seam.z.canyonCarveDelta < seamTolerance,
  ),
};
assert(
  checks.signedGlobalSeams.pass,
  "signed seam continuity failed at a cache-tile boundary",
);

const leftChunk = generateChunk(spec, 0, 0);
const rightChunk = generateChunk(spec, 1, 0);
const edgeMatches = [];
for (let z = 0; z < spec.chunkSize; z += 1) {
  edgeMatches.push({
    z,
    left: leftChunk.terrain[z * spec.chunkSize + 15],
    leftExpected: terrainCode(sampleCell(spec, 15, z).terrain),
    right: rightChunk.terrain[z * spec.chunkSize],
    rightExpected: terrainCode(sampleCell(spec, 16, z).terrain),
  });
}
const nearSeamLeft = sampleTerrain(spec, 15.999, 4.25, 1);
const nearSeamRight = sampleTerrain(spec, 16.001, 4.25, 1);
const seamElevationDelta = Math.abs(
  nearSeamLeft.elevation - nearSeamRight.elevation,
);
checks.cacheTileIdentity = {
  edgeMatches,
  nearBoundary: {
    leftX: nearSeamLeft.x,
    rightX: nearSeamRight.x,
    elevationDelta: seamElevationDelta,
  },
  pass:
    edgeMatches.every(
      (edge) =>
        edge.left === edge.leftExpected && edge.right === edge.rightExpected,
    ) && seamElevationDelta < 0.02,
};
assert(
  checks.cacheTileIdentity.pass,
  "cache tile rendering lost global sample identity",
);

const requestedCoordinates = [
  [-1, 0],
  [0, 0],
  [0, -1],
];
const firstResidency = createResidency(spec, { maxResidentChunks: 25 });
const reverseResidency = createResidency(spec, { maxResidentChunks: 25 });
const firstOrder = requestedCoordinates.map(([chunkX, chunkZ]) =>
  firstResidency.get(chunkX, chunkZ),
);
const reverseOrder = [...requestedCoordinates]
  .reverse()
  .map(([chunkX, chunkZ]) => reverseResidency.get(chunkX, chunkZ));
checks.orderIndependentChunks = {
  first: firstOrder.map((chunk) => ({
    key: chunk.key,
    checksum: chunk.checksum,
  })),
  reverse: reverseOrder.map((chunk) => ({
    key: chunk.key,
    checksum: chunk.checksum,
  })),
  pass:
    firstOrder
      .map((chunk) => chunk.checksum)
      .sort()
      .join(",") ===
    reverseOrder
      .map((chunk) => chunk.checksum)
      .sort()
      .join(","),
};
assert(
  checks.orderIndependentChunks.pass,
  "chunk checksum changed with request order",
);

const residency = createResidency(spec);
const generationStart = performance.now();
const visible = residency.loadWindow(0, 0);
const generationMs = performance.now() - generationStart;
const renderStart = performance.now();
const render = renderChunkBuffer(spec, visible);
const shuffledRender = renderChunkBuffer(spec, [...visible].reverse());
const renderMs = performance.now() - renderStart;
const beforeEviction = residency.stats();
const distant = residency.loadWindow(37, -29);
const afterJump = residency.stats();
const regenerated = residency.get(0, 0);
const afterReturn = residency.stats();
checks.boundedLocal = {
  visibleWindow: `${spec.local.windowChunks}x${spec.local.windowChunks}`,
  generatedTerrainChunks: beforeEviction.generatedChunks,
  visibleCells: render.sampleCount,
  renderBuffer: {
    width: render.width,
    height: render.height,
    checksum: render.checksum,
  },
  maxResidentChunks: afterReturn.maxResidentChunks,
  residentRenderChunks: afterReturn.residentChunks,
  evictions: afterReturn.evictions,
  distantWindowCells: distant.length * spec.chunkSize * spec.chunkSize,
  returnedOriginChecksum: regenerated.checksum,
  originChecksum: firstOrder[1].checksum,
  shuffledRenderChecksum: shuffledRender.checksum,
  shuffledRenderVisualChecksum: shuffledRender.visualChecksum,
  pass:
    beforeEviction.residentChunks === 25 &&
    afterReturn.residentChunks <= 25 &&
    regenerated.checksum === firstOrder[1].checksum &&
    shuffledRender.checksum === render.checksum &&
    shuffledRender.visualChecksum === render.visualChecksum,
};
assert(
  checks.boundedLocal.pass,
  "local residency exceeded its bounded cache or failed regeneration",
);

const mappingCells = [
  [coarseOverview.bounds.minX, coarseOverview.bounds.minZ],
  [
    coarseOverview.bounds.maxXExclusive - 1,
    coarseOverview.bounds.maxZExclusive - 1,
  ],
  [-1, 0],
  [0, 0],
  [features.coast.x, features.coast.z],
  [features.ridge.x, features.ridge.z],
  [features.canyon.x, features.canyon.z],
];
const mappingResults = mappingCells.map(([x, z]) => {
  const pixel = worldCellToOverviewPixel(coarseOverview, x, z);
  const mapped = overviewPixelToWorldCell(
    coarseOverview,
    pixel.column,
    pixel.row,
  );
  const cellWidth = coarseOverview.bounds.spanX / coarseOverview.width;
  const cellHeight = coarseOverview.bounds.spanZ / coarseOverview.height;
  const pixelMinX = coarseOverview.bounds.minX + pixel.column * cellWidth;
  const pixelMinZ = coarseOverview.bounds.minZ + pixel.row * cellHeight;
  return {
    requested: { x, z },
    pixel,
    representativeCell: mapped,
    withinPixelFootprint:
      x >= pixelMinX &&
      (x < pixelMinX + cellWidth ||
        (pixel.column === coarseOverview.width - 1 &&
          x < coarseOverview.bounds.maxXExclusive)) &&
      z >= pixelMinZ &&
      (z < pixelMinZ + cellHeight ||
        (pixel.row === coarseOverview.height - 1 &&
          z < coarseOverview.bounds.maxZExclusive)),
    signed: x < 0 || z < 0,
  };
});
checks.coordinateMapping = {
  edgeAndSignedSamples: mappingResults,
  pass:
    mappingResults.every((result) => result.withinPixelFootprint) &&
    mappingResults.filter((result) => result.signed).length >= 2 &&
    mappingResults.every(
      (result) =>
        overviewPixelToWorldCell(
          coarseOverview,
          result.pixel.column,
          result.pixel.row,
        ).column === result.pixel.column &&
        overviewPixelToWorldCell(
          coarseOverview,
          result.pixel.column,
          result.pixel.row,
        ).row === result.pixel.row,
    ),
};
assert(
  checks.coordinateMapping.pass,
  "overview pixel/world-cell mapping lost an edge or signed coordinate",
);

const signedViewport = localViewport(
  spec,
  floorDiv(-1, spec.chunkSize),
  floorDiv(0, spec.chunkSize),
);
const signedRender = renderChunkBuffer(
  spec,
  createResidency(spec).loadWindow(
    signedViewport.centerChunkX,
    signedViewport.centerChunkZ,
  ),
);
const signedCell = sampleCell(spec, -1, 0);
const signedLocalIndex =
  (0 - signedViewport.minZ) * signedRender.width + (-1 - signedViewport.minX);
const signedOverview = sampleTerrain(spec, -1, 0, coarseOverview.footprint);
checks.crossScaleSampleFacts = {
  selected: {
    x: -1,
    z: 0,
    overviewFootprint: coarseOverview.footprint,
    overviewElevation: signedOverview.elevation,
    overviewMoisture: signedOverview.moisture,
    localElevation: signedCell.elevation,
    localMoisture: signedCell.moisture,
    localRenderElevationByte: signedRender.elevation[signedLocalIndex],
    localRenderMoistureByte: signedRender.moisture[signedLocalIndex],
  },
  pass:
    signedCell.elevation === sampleTerrain(spec, -1, 0, 1).elevation &&
    signedCell.moisture === sampleTerrain(spec, -1, 0, 1).moisture &&
    signedRender.elevation[signedLocalIndex] ===
      Math.round(signedCell.elevation * 255) &&
    signedRender.moisture[signedLocalIndex] ===
      Math.round(signedCell.moisture * 255) &&
    Number.isFinite(signedOverview.elevation) &&
    Number.isFinite(signedOverview.moisture),
};
assert(
  checks.crossScaleSampleFacts.pass,
  "selected global cell facts diverged between overview sampler and local render arrays",
);

checks.visualTerrainData = {
  overviewElevationValues: new Set(coarseOverview.elevation).size,
  overviewMoistureValues: new Set(coarseOverview.moisture).size,
  localElevationValues: new Set(render.elevation).size,
  localMoistureValues: new Set(render.moisture).size,
  pass:
    new Set(coarseOverview.elevation).size > 1 &&
    new Set(coarseOverview.moisture).size > 1 &&
    new Set(render.elevation).size > 1 &&
    new Set(render.moisture).size > 1,
};
assert(
  checks.visualTerrainData.pass,
  "terrain visualization arrays did not contain elevation/moisture variation",
);

const sectionSampleStarted = performance.now();
const sampledSection = sampleSectionCells(spec, {
  focusX: features.canyon.x,
  focusZ: features.canyon.z,
  width: SECTION_LIMITS.maxWidth,
  depth: SECTION_LIMITS.maxDepth,
  halo: SECTION_LIMITS.halo,
});
const sectionSampleMs = performance.now() - sectionSampleStarted;
const sectionAssemblyStarted = performance.now();
const assembledSection = assembleSurfaceSection(sampledSection);
const sectionAssemblyMs = performance.now() - sectionAssemblyStarted;
const sectionDrawPreparationStarted = performance.now();
const preparedSection = prepareIsometricSection(assembledSection);
const sectionDrawPreparationMs =
  performance.now() - sectionDrawPreparationStarted;
let missingHaloRejected = false;
try {
  sampleSectionCells(spec, {
    focusX: features.canyon.x,
    focusZ: features.canyon.z,
    width: SECTION_LIMITS.maxWidth,
    depth: SECTION_LIMITS.maxDepth,
    halo: 0,
  });
} catch (error) {
  missingHaloRejected = error instanceof RangeError;
}
const sectionEquality = sampledSection.samples.map((sample) => {
  const direct = sampleCell(spec, sample.x, sample.z);
  return {
    x: sample.x,
    z: sample.z,
    exact:
      sample.sampleId === direct.sampleId &&
      sample.elevation === direct.elevation &&
      sample.moisture === direct.moisture &&
      sample.ridgeLift === direct.ridgeLift &&
      sample.canyonCarve === direct.canyonCarve &&
      sample.terrain === direct.terrain,
  };
});
const expectedSectionSamples =
  (SECTION_LIMITS.maxWidth + SECTION_LIMITS.halo * 2) *
  (SECTION_LIMITS.maxDepth + SECTION_LIMITS.halo * 2);
checks.boundedSurfaceSection = {
  limits: SECTION_LIMITS,
  focus: assembledSection.focus,
  visibleCells: assembledSection.visibleCellCount,
  sampleCount: sampledSection.sampleCount,
  expectedSampleCount: expectedSectionSamples,
  source: sampledSection.source,
  prepared: {
    width: preparedSection.width,
    height: preparedSection.height,
    tiles: preparedSection.tiles.length,
    surfaceOnly: preparedSection.surfaceOnly,
  },
  timings: {
    sampleMs: Number(sectionSampleMs.toFixed(3)),
    assemblyMs: Number(sectionAssemblyMs.toFixed(3)),
    drawPreparationMs: Number(sectionDrawPreparationMs.toFixed(3)),
  },
  missingHaloRejected,
  exactSampleCellMatches: sectionEquality.filter((entry) => entry.exact).length,
  pass:
    sampledSection.sampleCount === 468 &&
    sampledSection.sampleCount === expectedSectionSamples &&
    assembledSection.visibleCellCount === 24 * 16 &&
    preparedSection.tiles.length === 24 * 16 &&
    preparedSection.surfaceOnly === true &&
    missingHaloRejected &&
    sectionEquality.every((entry) => entry.exact),
};
assert(
  checks.boundedSurfaceSection.pass,
  "surface section exceeded its 24x16+halo budget or diverged from sampleCell",
);

const source = await readFile("src/world-lab/terrain.js", "utf8");
const sectionSource = await readFile("src/world-lab/section.js", "utf8");
const mainSource = await readFile("src/world-lab/main.js", "utf8");
const workerSource = await readFile("src/world-lab/worker.js", "utf8");
const pageSource = await readFile("world-lab.html", "utf8");
const stylesSource = await readFile("src/world-lab/styles.css", "utf8");
const forbiddenImport = /^\s*import\s/m.test(source);
checks.isolatedSource = {
  importsRuntimeOrSimulation: forbiddenImport,
  pass: !forbiddenImport,
};
assert(checks.isolatedSource.pass, "isolated terrain must remain import-free");
checks.sectionSourceOwner = {
  importsOnlyTerrain:
    sectionSource.includes('import { sampleCell } from "./terrain.js"') &&
    (sectionSource.match(/^import /gm)?.length ?? 0) === 1,
  derivesFromSampleCell:
    sectionSource.includes("sampleCell(spec, sampleMinX + localX") &&
    sectionSource.includes("assembleSurfaceSection") &&
    sectionSource.includes("prepareIsometricSection"),
  noIndependentNoiseOrWorker:
    !/(coherentNoise|hashLattice|new Worker|postMessage|cave|voxel)/i.test(
      sectionSource,
    ),
  pass:
    sectionSource.includes('import { sampleCell } from "./terrain.js"') &&
    (sectionSource.match(/^import /gm)?.length ?? 0) === 1 &&
    sectionSource.includes("sampleCell(spec, sampleMinX + localX") &&
    sectionSource.includes("assembleSurfaceSection") &&
    sectionSource.includes("prepareIsometricSection") &&
    !/(coherentNoise|hashLattice|new Worker|postMessage|cave|voxel)/i.test(
      sectionSource,
    ),
};
assert(
  checks.sectionSourceOwner.pass,
  "surface section introduced a second geography, worker, or cave path",
);
checks.footprintAwareGenerator = {
  sameGlobalSampler: source.includes("sampleTerrain(spec, x, z, footprint)"),
  frequencyOmission: source.includes("octave.scale < footprint * 1.5"),
  noChunkGeographyClaim: WORLD_LAB_NON_CLAIMS.some((claim) =>
    claim.includes("chunks do not own geography"),
  ),
  pass:
    source.includes("sampleTerrain(spec, x, z, footprint)") &&
    source.includes("octave.scale < footprint * 1.5") &&
    WORLD_LAB_NON_CLAIMS.some((claim) =>
      claim.includes("chunks do not own geography"),
    ),
};
assert(
  checks.footprintAwareGenerator.pass,
  "generator source did not expose the footprint-aware global contract",
);

const coastViewport = localViewport(
  spec,
  floorDiv(features.coast.x, spec.chunkSize),
  floorDiv(features.coast.z, spec.chunkSize),
);
const coastMarker = overviewRectForViewport(coarseOverview, coastViewport);
checks.userFacingLabShape = {
  noDiagnosticCallerOrButton: !/(1024|world-lab-diagnostic)/.test(
    `${mainSource}\n${pageSource}`,
  ),
  namedGlobalButtons:
    [
      'data-feature="coast"',
      'data-feature="ridge"',
      'data-feature="canyon"',
    ].every((marker) => pageSource.includes(marker)) &&
    mainSource.includes("const feature = features[button.dataset.feature]") &&
    mainSource.includes("button.dataset.cell = `${feature.x},${feature.z}`"),
  markerData: {
    viewport: coastViewport,
    overviewRect: coastMarker,
  },
  markerHasPositiveArea: coastMarker.width > 0 && coastMarker.height > 0,
  markerUpdatedFromRender:
    mainSource.includes("drawViewportMarker(local.viewport)") &&
    mainSource.includes("chunkX: floorDiv(x, spec.chunkSize)") &&
    mainSource.includes('overviewCanvas.addEventListener("click"'),
  clickMapsToCell:
    mainSource.includes("overviewPixelToWorldCell(overview, column, row)") &&
    mainSource.includes('moveFocus("Overview cell", cell.x, cell.z)'),
  localSelectionMarker:
    mainSource.includes("localGridContext.strokeRect") &&
    mainSource.includes("focus.x - viewport.minX"),
  sharedFactsPanel:
    mainSource.includes("sampleCell(spec, focus.x, focus.z)") &&
    mainSource.includes("sampleTerrain(spec, focus.x, focus.z, 1)") &&
    mainSource.includes("sharedSampler") &&
    mainSource.includes("data-field=selection") &&
    mainSource.includes("matchesSampler"),
  fullDetailInspectorLaw:
    /local\.buffer\.elevation\[localIndex\]\s*===\s*Math\.round\(selectedLocal\.elevation \* 255\)/.test(
      mainSource,
    ) &&
    /local\.buffer\.moisture\[localIndex\]\s*===\s*Math\.round\(selectedLocal\.moisture \* 255\)/.test(
      mainSource,
    ) &&
    !mainSource.includes(
      "selectedOverview.elevation === selectedLocal.elevation",
    ),
  halfOpenBounds:
    source.includes("maxXExclusive") &&
    source.includes("maxZExclusive") &&
    mainSource.includes("maxXExclusive") &&
    mainSource.includes("maxZExclusive"),
  explicitOverviewScale:
    mainSource.includes("cellsPerPixel") &&
    mainSource.includes("overview.bounds.spanX"),
  explicitLocalScale:
    mainSource.includes("one pixel = one world cell") &&
    pageSource.includes("80×80 local view at 1 pixel per world cell"),
  readableLegend:
    pageSource.includes("Terrain palette legend") &&
    stylesSource.includes(".swatch.water") &&
    stylesSource.includes(".swatch.canyon") &&
    stylesSource.includes(".legend"),
  surfaceSection:
    pageSource.includes('id="world-lab-section"') &&
    pageSource.includes("Surface-only 24×16 isometric section") &&
    mainSource.includes("sampleSectionCells(spec") &&
    mainSource.includes("assembleSurfaceSection(sampled)") &&
    mainSource.includes("prepareIsometricSection(section)") &&
    mainSource.includes("data-field=section") &&
    stylesSource.includes(".section-figure"),
  componentDiagnostics:
    mainSource.includes("baseElevation: selectedShared.baseElevation") &&
    mainSource.includes("ridgeLift: selectedShared.ridgeLift") &&
    mainSource.includes("canyonCarve: selectedShared.canyonCarve"),
  responsiveNavigation:
    pageSource.includes('data-pan="0,-0.25"') &&
    pageSource.includes('data-atlas-zoom="in"') &&
    pageSource.includes('data-atlas-zoom="out"') &&
    pageSource.includes('id="world-lab-atlas-status"') &&
    mainSource.includes("function panAtlas") &&
    mainSource.includes("function zoomAtlas") &&
    mainSource.includes("boundsAround"),
  visibleScaleStatus:
    pageSource.includes('aria-live="polite"') &&
    pageSource.includes('id="world-lab-request-status"') &&
    mainSource.includes("function scaleForBounds") &&
    mainSource.includes("function scaleStatusLabel") &&
    mainSource.includes(
      "`Updating to ${requested}; showing ${scaleForBounds(overview.bounds)}`",
    ) &&
    mainSource.includes("`Showing ${scaleForBounds(overview.bounds)}`") &&
    mainSource.includes("cells/pixel") &&
    stylesSource.includes(".atlas-status"),
  zoomLimitsAndNoOp:
    mainSource.includes("const MIN_ATLAS_SPAN = 512") &&
    mainSource.includes("const MAX_ATLAS_SPAN = 8192") &&
    mainSource.includes("zoomInButton.disabled = span <= MIN_ATLAS_SPAN") &&
    mainSource.includes("zoomOutButton.disabled = span >= MAX_ATLAS_SPAN") &&
    mainSource.includes("if (nextSpan === currentSpan)") &&
    mainSource.includes("return false") &&
    mainSource.includes('document.querySelectorAll("[data-atlas-zoom]")'),
  workerLifecycle:
    mainSource.includes('new Worker(new URL("./worker.js", import.meta.url)') &&
    mainSource.includes("activeRequest") &&
    mainSource.includes("queuedRequest") &&
    mainSource.includes("latestRequestId") &&
    mainSource.includes('worker.postMessage({ type: "cancel"') &&
    mainSource.includes('globalThis.addEventListener("pagehide", dispose') &&
    mainSource.includes("worker.terminate()") &&
    workerSource.includes("ROW_BATCH = 8") &&
    workerSource.includes(
      "globalThis.postMessage(message, transferOverview(message))",
    ),
  pass:
    !/(1024|world-lab-diagnostic)/.test(`${mainSource}\n${pageSource}`) &&
    [
      'data-feature="coast"',
      'data-feature="ridge"',
      'data-feature="canyon"',
    ].every((marker) => pageSource.includes(marker)) &&
    mainSource.includes("const feature = features[button.dataset.feature]") &&
    mainSource.includes("button.dataset.cell = `${feature.x},${feature.z}`") &&
    coastMarker.width > 0 &&
    coastMarker.height > 0 &&
    mainSource.includes("drawViewportMarker(local.viewport)") &&
    mainSource.includes("chunkX: floorDiv(x, spec.chunkSize)") &&
    mainSource.includes('overviewCanvas.addEventListener("click"') &&
    mainSource.includes("overviewPixelToWorldCell(overview, column, row)") &&
    mainSource.includes('moveFocus("Overview cell", cell.x, cell.z)') &&
    mainSource.includes("localGridContext.strokeRect") &&
    mainSource.includes("focus.x - viewport.minX") &&
    mainSource.includes("sampleCell(spec, focus.x, focus.z)") &&
    mainSource.includes("sampleTerrain(spec, focus.x, focus.z, 1)") &&
    mainSource.includes("sharedSampler") &&
    mainSource.includes("data-field=selection") &&
    mainSource.includes("matchesSampler") &&
    /local\.buffer\.elevation\[localIndex\]\s*===\s*Math\.round\(selectedLocal\.elevation \* 255\)/.test(
      mainSource,
    ) &&
    /local\.buffer\.moisture\[localIndex\]\s*===\s*Math\.round\(selectedLocal\.moisture \* 255\)/.test(
      mainSource,
    ) &&
    !mainSource.includes(
      "selectedOverview.elevation === selectedLocal.elevation",
    ) &&
    source.includes("maxXExclusive") &&
    source.includes("maxZExclusive") &&
    mainSource.includes("maxXExclusive") &&
    mainSource.includes("maxZExclusive") &&
    mainSource.includes("cellsPerPixel") &&
    mainSource.includes("overview.bounds.spanX") &&
    mainSource.includes("one pixel = one world cell") &&
    pageSource.includes("80×80 local view at 1 pixel per world cell") &&
    pageSource.includes("Terrain palette legend") &&
    stylesSource.includes(".swatch.water") &&
    stylesSource.includes(".swatch.canyon") &&
    stylesSource.includes(".legend") &&
    pageSource.includes('id="world-lab-section"') &&
    pageSource.includes("Surface-only 24×16 isometric section") &&
    mainSource.includes("sampleSectionCells(spec") &&
    mainSource.includes("assembleSurfaceSection(sampled)") &&
    mainSource.includes("prepareIsometricSection(section)") &&
    mainSource.includes("data-field=section") &&
    stylesSource.includes(".section-figure") &&
    mainSource.includes("baseElevation: selectedShared.baseElevation") &&
    mainSource.includes("ridgeLift: selectedShared.ridgeLift") &&
    mainSource.includes("canyonCarve: selectedShared.canyonCarve") &&
    pageSource.includes('data-pan="0,-0.25"') &&
    pageSource.includes('data-atlas-zoom="in"') &&
    pageSource.includes('data-atlas-zoom="out"') &&
    pageSource.includes('id="world-lab-atlas-status"') &&
    pageSource.includes('aria-live="polite"') &&
    pageSource.includes('id="world-lab-request-status"') &&
    mainSource.includes("function panAtlas") &&
    mainSource.includes("function zoomAtlas") &&
    mainSource.includes("boundsAround") &&
    mainSource.includes("function scaleForBounds") &&
    mainSource.includes("function scaleStatusLabel") &&
    mainSource.includes(
      "`Updating to ${requested}; showing ${scaleForBounds(overview.bounds)}`",
    ) &&
    mainSource.includes("`Showing ${scaleForBounds(overview.bounds)}`") &&
    mainSource.includes("cells/pixel") &&
    stylesSource.includes(".atlas-status") &&
    mainSource.includes("const MIN_ATLAS_SPAN = 512") &&
    mainSource.includes("const MAX_ATLAS_SPAN = 8192") &&
    mainSource.includes("zoomInButton.disabled = span <= MIN_ATLAS_SPAN") &&
    mainSource.includes("zoomOutButton.disabled = span >= MAX_ATLAS_SPAN") &&
    mainSource.includes("if (nextSpan === currentSpan)") &&
    mainSource.includes("return false") &&
    mainSource.includes('document.querySelectorAll("[data-atlas-zoom]")') &&
    mainSource.includes('new Worker(new URL("./worker.js", import.meta.url)') &&
    mainSource.includes("activeRequest") &&
    mainSource.includes("queuedRequest") &&
    mainSource.includes("latestRequestId") &&
    mainSource.includes('worker.postMessage({ type: "cancel"') &&
    mainSource.includes('globalThis.addEventListener("pagehide", dispose') &&
    mainSource.includes("worker.terminate()") &&
    workerSource.includes("ROW_BATCH = 8") &&
    workerSource.includes(
      "globalThis.postMessage(message, transferOverview(message))",
    ),
};
assert(
  checks.userFacingLabShape.pass,
  "World Lab page shape omitted required coordinates, marker, scale, palette, or diagnostic removal",
);

const proof = {
  kind: "world-lab-coherent-lod-contract-measurement-and-readable-view",
  generatedAt: new Date().toISOString(),
  contract: {
    seed: spec.seed,
    generatorVersion: spec.generatorVersion,
    identity: spec.identity,
    chunkSize: spec.chunkSize,
    globalCoordinates: "signed integer x,z; mathematical floor division",
    overviewBounds:
      "explicit half-open [minX,minZ,maxXExclusive,maxZExclusive) world bounds",
    sampleIdentity: "generatorVersion:seed/sample/x,z",
    chunkIdentity:
      "generatorVersion:seed/chunk/chunkX,chunkZ (cache identity only; not geography)",
    coherentRecipe:
      "shared smooth broad fields, fixed-support ridge lift and canyon carve, plus footprint-omitted fine octaves; no output resize of a fine grid",
    authoritativeLocal:
      "sampleCell uses the same footprint=1 terrain query as direct local sampling",
    overviewBudget: { width: 512, height: 512, samples: fixedOutputSamples },
    localResidency: spec.local,
    overviewVisualData:
      "terrain, elevation, and moisture arrays come from the same sampleTerrain query",
    localVisualData:
      "terrain, elevation, and moisture arrays come from the same generated cell arrays",
    surfaceSection:
      "24x16 visible surface cells plus one-cell neighbor halo, derived only from authoritative sampleCell",
  },
  measurements: {
    coarse512Ms: Number(coarseMs.toFixed(3)),
    fineSpan512Ms: Number(fineMs.toFixed(3)),
    visibleGenerationMs: Number(generationMs.toFixed(3)),
    visibleRenderPreparationMs: Number(renderMs.toFixed(3)),
    sectionSampleMs: Number(sectionSampleMs.toFixed(3)),
    sectionAssemblyMs: Number(sectionAssemblyMs.toFixed(3)),
    sectionDrawPreparationMs: Number(sectionDrawPreparationMs.toFixed(3)),
    totalNodeCheckMs: Number((performance.now() - started).toFixed(3)),
    note: "Render timing is bounded buffer preparation in this source-backed check; browser canvas timing remains a separate page measurement.",
  },
  checks,
  diagnostic1024: {
    executed: false,
    reason:
      "1024 is diagnostic only after measured 512; this bounded check stops at 512.",
  },
  claims: [
    "deterministic terrain query",
    "coherent named coast/ridge/canyon across two spans",
    "numeric ridge lift and canyon carve with fixed footprint support",
    "signed global-coordinate seam continuity",
    "bounded fixed-output LOD work",
    "bounded local render residency",
    "order-independent local render buffer",
    "readable elevation/moisture variation with named viewport marker",
    "overview pixel to signed global cell to local one-cell trace",
    "bounded surface-only isometric section derived exactly from sampleCell",
  ],
  nonClaims: WORLD_LAB_NON_CLAIMS,
};
await writeFile(`${output}/proof.json`, `${JSON.stringify(proof, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      output,
      status: "passed",
      proof: `${output}/proof.json`,
      measurements: proof.measurements,
      checks: Object.fromEntries(
        Object.entries(checks).map(([key, value]) => [key, value.pass]),
      ),
    },
    null,
    2,
  ),
);
