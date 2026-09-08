import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  WORLD_LAB_NON_CLAIMS,
  createResidency,
  createWorldSpec,
  generateChunk,
  namedFeatures,
  renderChunkBuffer,
  sampleCell,
  sampleOverview,
  sampleTerrain,
} from "../src/world-lab/terrain.js";

const output = process.argv[2] || ".botanical/world-lab-proof";
const spec = createWorldSpec();
const started = performance.now();
const checks = {};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

await mkdir(output, { recursive: true });

const negative = sampleCell(spec, -1, 0);
const positive = sampleCell(spec, 16, 0);
checks.globalSignedCoordinates = {
  negative: { x: negative.x, chunkX: negative.chunk.chunkX, localX: negative.chunk.localX },
  positive: { x: positive.x, chunkX: positive.chunk.chunkX, localX: positive.chunk.localX },
  pass: negative.chunk.chunkX === -1 && negative.chunk.localX === 15 && positive.chunk.chunkX === 1 && positive.chunk.localX === 0,
};
assert(checks.globalSignedCoordinates.pass, "floor division failed at negative chunk edge");

const fineBounds = { minX: -1024, minZ: -1024, maxX: 1024, maxZ: 1024 };
const localAuthorityPoints = [[-719, -100], [420, 320], [-1, 0], [16, 0]];
const localBeforeOverview = localAuthorityPoints.map(([x, z]) => sampleCell(spec, x, z));
const coarseStart = performance.now();
const coarseOverview = sampleOverview(spec, { width: 512, height: 512, bounds: spec.overview.bounds });
const coarseMs = performance.now() - coarseStart;
const fineStart = performance.now();
const fineOverview = sampleOverview(spec, { width: 512, height: 512, bounds: fineBounds });
const fineMs = performance.now() - fineStart;
const fixedOutputSamples = 512 * 512;
const overviewPixelFor = (overview, x, z) => {
  const column = Math.max(0, Math.min(overview.width - 1, Math.round(((x - overview.bounds.minX) / overview.bounds.spanX) * overview.width - 0.5)));
  const row = Math.max(0, Math.min(overview.height - 1, Math.round(((z - overview.bounds.minZ) / overview.bounds.spanZ) * overview.height - 0.5)));
  return { column, row, index: row * overview.width + column };
};
const overviewFeatureCode = { coast: 1, ridge: 2 };
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
    coarseOverview.bounds.spanX > fineOverview.bounds.spanX &&
    coarseOverview.featureCounts.coast > 0 &&
    fineOverview.featureCounts.coast > 0 &&
    coarseOverview.featureCounts.ridge > 0 &&
    fineOverview.featureCounts.ridge > 0,
};
assert(checks.multiscaleGeography.pass, "multiscale geography did not preserve spans/features within bounded output work");

const features = namedFeatures(spec);
const featureProbe = {};
for (const [kind, feature] of Object.entries(features)) {
  const local = sampleTerrain(spec, feature.x, feature.z, 1);
  const coarse = sampleTerrain(spec, feature.x, feature.z, coarseOverview.footprint);
  const fine = sampleTerrain(spec, feature.x, feature.z, fineOverview.footprint);
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
  pass: Object.entries(featureProbe).every(([kind, samples]) =>
    samples.local.feature === kind &&
    samples.coarse.feature === kind &&
    samples.fineSpan.feature === kind &&
    samples.coarseOverviewPixel.featureCode === overviewFeatureCode[kind] &&
    samples.fineOverviewPixel.featureCode === overviewFeatureCode[kind]),
};
assert(checks.namedFeatures.pass, "named coast/ridge did not survive local and two overview spans");

const authorityPoints = [[-719, features.coast.z], [420, features.ridge.z], [-1, 0], [16, 0]];
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
  pass: authorityResults.every((point) => point.elevationDelta === 0 && point.moistureDelta === 0 && point.cellTerrain === point.directTerrain),
};
assert(checks.authoritativeLocal.pass, "local authoritative terrain changed between integer caller paths");

const localAfterOverview = localAuthorityPoints.map(([x, z]) => sampleCell(spec, x, z));
checks.localResolutionAuthority = {
  points: localBeforeOverview.map((before, index) => {
    const after = localAfterOverview[index];
    return {
      x: before.x,
      z: before.z,
      unchanged: before.elevation === after.elevation && before.moisture === after.moisture && before.terrain === after.terrain,
    };
  }),
  pass: localBeforeOverview.every((before, index) => {
    const after = localAfterOverview[index];
    return before.elevation === after.elevation && before.moisture === after.moisture && before.terrain === after.terrain;
  }),
};
assert(checks.localResolutionAuthority.pass, "overview sampling mutated authoritative local terrain");

const seamBoundaries = [-32, -16, 0, 16, 32];
const seamSamples = [];
for (const boundary of seamBoundaries) {
  const xLeft = sampleTerrain(spec, boundary - 1e-4, 4.25, 1);
  const xRight = sampleTerrain(spec, boundary + 1e-4, 4.25, 1);
  const zLeft = sampleTerrain(spec, 4.25, boundary - 1e-4, 1);
  const zRight = sampleTerrain(spec, 4.25, boundary + 1e-4, 1);
  seamSamples.push({
    boundary,
    x: { elevationDelta: Math.abs(xLeft.elevation - xRight.elevation), moistureDelta: Math.abs(xLeft.moisture - xRight.moisture) },
    z: { elevationDelta: Math.abs(zLeft.elevation - zRight.elevation), moistureDelta: Math.abs(zLeft.moisture - zRight.moisture) },
  });
}
const seamTolerance = 0.002;
checks.signedGlobalSeams = {
  seamSamples,
  seamTolerance,
  pass: seamSamples.every((seam) =>
    seam.x.elevationDelta < seamTolerance && seam.x.moistureDelta < seamTolerance &&
    seam.z.elevationDelta < seamTolerance && seam.z.moistureDelta < seamTolerance),
};
assert(checks.signedGlobalSeams.pass, "signed seam continuity failed at a cache-tile boundary");

const terrainCodes = { water: 0, coast: 1, ridge: 2, land: 3 };
const leftChunk = generateChunk(spec, 0, 0);
const rightChunk = generateChunk(spec, 1, 0);
const edgeMatches = [];
for (let z = 0; z < spec.chunkSize; z += 1) {
  edgeMatches.push({
    z,
    left: leftChunk.terrain[z * spec.chunkSize + 15],
    leftExpected: terrainCodes[sampleCell(spec, 15, z).terrain],
    right: rightChunk.terrain[z * spec.chunkSize],
    rightExpected: terrainCodes[sampleCell(spec, 16, z).terrain],
  });
}
const nearSeamLeft = sampleTerrain(spec, 15.999, 4.25, 1);
const nearSeamRight = sampleTerrain(spec, 16.001, 4.25, 1);
const seamElevationDelta = Math.abs(nearSeamLeft.elevation - nearSeamRight.elevation);
checks.cacheTileIdentity = {
  edgeMatches,
  nearBoundary: { leftX: nearSeamLeft.x, rightX: nearSeamRight.x, elevationDelta: seamElevationDelta },
  pass: edgeMatches.every((edge) => edge.left === edge.leftExpected && edge.right === edge.rightExpected) && seamElevationDelta < 0.02,
};
assert(checks.cacheTileIdentity.pass, "cache tile rendering lost global sample identity");

const requestedCoordinates = [[-1, 0], [0, 0], [0, -1]];
const firstResidency = createResidency(spec, { maxResidentChunks: 25 });
const reverseResidency = createResidency(spec, { maxResidentChunks: 25 });
const firstOrder = requestedCoordinates.map(([chunkX, chunkZ]) => firstResidency.get(chunkX, chunkZ));
const reverseOrder = [...requestedCoordinates].reverse().map(([chunkX, chunkZ]) => reverseResidency.get(chunkX, chunkZ));
checks.orderIndependentChunks = {
  first: firstOrder.map((chunk) => ({ key: chunk.key, checksum: chunk.checksum })),
  reverse: reverseOrder.map((chunk) => ({ key: chunk.key, checksum: chunk.checksum })),
  pass: firstOrder.map((chunk) => chunk.checksum).sort().join(",") === reverseOrder.map((chunk) => chunk.checksum).sort().join(","),
};
assert(checks.orderIndependentChunks.pass, "chunk checksum changed with request order");

const residency = createResidency(spec);
const generationStart = performance.now();
const visible = residency.loadWindow(0, 0);
const generationMs = performance.now() - generationStart;
const renderStart = performance.now();
const render = renderChunkBuffer(spec, visible);
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
  renderBuffer: { width: render.width, height: render.height, checksum: render.checksum },
  maxResidentChunks: afterReturn.maxResidentChunks,
  residentRenderChunks: afterReturn.residentChunks,
  evictions: afterReturn.evictions,
  distantWindowCells: distant.length * spec.chunkSize * spec.chunkSize,
  returnedOriginChecksum: regenerated.checksum,
  originChecksum: firstOrder[1].checksum,
  pass: beforeEviction.residentChunks === 25 && afterReturn.residentChunks <= 25 && regenerated.checksum === firstOrder[1].checksum,
};
assert(checks.boundedLocal.pass, "local residency exceeded its bounded cache or failed regeneration");

const source = await readFile("src/world-lab/terrain.js", "utf8");
const forbiddenImport = /^\s*import\s/m.test(source);
checks.isolatedSource = { importsRuntimeOrSimulation: forbiddenImport, pass: !forbiddenImport };
assert(checks.isolatedSource.pass, "isolated terrain must remain import-free");
checks.footprintAwareGenerator = {
  sameGlobalSampler: source.includes("sampleTerrain(spec, x, z, footprint)"),
  frequencyOmission: source.includes("octave.scale < footprint * 1.5"),
  noChunkGeographyClaim: WORLD_LAB_NON_CLAIMS.some((claim) => claim.includes("chunks do not own geography")),
  pass: source.includes("sampleTerrain(spec, x, z, footprint)") && source.includes("octave.scale < footprint * 1.5") && WORLD_LAB_NON_CLAIMS.some((claim) => claim.includes("chunks do not own geography")),
};
assert(checks.footprintAwareGenerator.pass, "generator source did not expose the footprint-aware global contract");

const proof = {
  kind: "world-lab-coherent-lod-contract-and-measurement",
  generatedAt: new Date().toISOString(),
  contract: {
    seed: spec.seed,
    generatorVersion: spec.generatorVersion,
    identity: spec.identity,
    chunkSize: spec.chunkSize,
    globalCoordinates: "signed integer x,z; mathematical floor division",
    sampleIdentity: "generatorVersion:seed/sample/x,z",
    chunkIdentity: "generatorVersion:seed/chunk/chunkX,chunkZ (cache identity only; not geography)",
    coherentRecipe: "shared smooth broad fields plus footprint-omitted fine octaves; no output resize of a fine grid",
    authoritativeLocal: "sampleCell uses the same footprint=1 terrain query as direct local sampling",
    overviewBudget: { width: 512, height: 512, samples: fixedOutputSamples },
    localResidency: spec.local,
  },
  measurements: {
    coarse512Ms: Number(coarseMs.toFixed(3)),
    fineSpan512Ms: Number(fineMs.toFixed(3)),
    visibleGenerationMs: Number(generationMs.toFixed(3)),
    visibleRenderPreparationMs: Number(renderMs.toFixed(3)),
    totalNodeCheckMs: Number((performance.now() - started).toFixed(3)),
    note: "Render timing is bounded buffer preparation in this source-backed check; browser canvas timing remains a separate page measurement.",
  },
  checks,
  diagnostic1024: { executed: false, reason: "1024 is diagnostic only after measured 512; this bounded check stops at 512." },
  claims: ["deterministic terrain query", "coherent named coast/ridge across two spans", "signed global-coordinate seam continuity", "bounded fixed-output LOD work", "bounded local render residency"],
  nonClaims: WORLD_LAB_NON_CLAIMS,
};
await writeFile(`${output}/proof.json`, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify({ output, status: "passed", proof: `${output}/proof.json`, measurements: proof.measurements, checks: Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, value.pass])) }, null, 2));
