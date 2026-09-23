import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  WORLD_LAB_SPEC, createResidency, createWorldSpec, namedFeatures,
  renderChunkBuffer, sampleCell, sampleTerrain, terrainCode,
} from './terrain.js';
import { generateOverview } from './world-lab/worker.js';

const here = new URL('./', import.meta.url);
const report = {
  scope: 'isolated height/sea sampler and copied World Lab caller; no live page, browser, water stock, physics, or terrain integration',
  checks: [], errors: [],
};
const hash = async relative => createHash('sha256').update(await readFile(new URL(relative, import.meta.url))).digest('hex');
async function check(name, fn) { await fn(); report.checks.push(name); }
try {
  const spec = createWorldSpec({ seed: 'height-sea-fixed-sample-v2' });
  await check('versioned terrain definition owns physical quantization and sea datum', () => {
    assert.equal(spec.terrain.seaSurfaceLevel, 12);
    assert.equal(spec.terrain.verticalVoxelMetres, .54);
    assert.equal(spec.terrain.surfaceWaterInitialization, 'all-below-datum-surface-basins-at-waterline-v1');
    assert(spec.identity.includes(spec.terrain.id));
    assert.throws(() => createWorldSpec({ terrain: {} }), /fixed/);
  });
  await check('final bed alone labels water, dry sea-level ground, or land without calling equality a coast', () => {
    const labels = { 'surface-water': 0, 'sea-level-ground': 0, land: 0 };
    for (let z = -2048; z < 2048; z += 32) for (let x = -2048; x < 2048; x += 32) {
      const cell = sampleCell(spec, x, z); labels[cell.terrain]++;
      assert(Number.isInteger(cell.bedLevel));
      assert.equal(cell.bedMetres, cell.bedLevel * .54);
      assert.equal(cell.surfaceWaterPotentialDepthLevels, Math.max(0, 12 - cell.bedLevel));
      if (cell.terrain === 'surface-water') assert(cell.bedLevel < 12);
      if (cell.terrain === 'sea-level-ground') assert.equal(cell.bedLevel, 12);
      if (cell.terrain === 'land') assert(cell.bedLevel > 12);
    }
    assert(labels['surface-water'] > 0 && labels.land > 0);
    report.labelCounts = labels;
  });
  await check('named coast jump is an exact cardinal wet/dry boundary rather than a shaping or datum-equality point', () => {
    const features = namedFeatures(spec);
    assert.equal(features.coast, undefined);
    assert(features.coastShaping && features.wetDryBoundary);
    const selected = sampleCell(spec, features.wetDryBoundary.x, features.wetDryBoundary.z);
    assert.equal(selected.wetDryBoundary, true);
    const opposite = selected.wetDryNeighbours.filter(neighbour => neighbour.wet !== selected.wet);
    assert.deepEqual(features.wetDryBoundary.adjacentDirections, opposite.map(neighbour => neighbour.direction));
    assert(opposite.length > 0);
    report.namedBoundary = {
      ...features.wetDryBoundary,
      terrain: selected.terrain,
      bedLevel: selected.bedLevel,
      opposite: opposite.map(({ direction, x, z, terrain, bedLevel, wet }) => ({ direction, x, z, terrain, bedLevel, wet })),
      shapingLine: features.coastShaping,
    };
  });
  await check('local residency and bounded worker overview share the copied height/sea generator', async () => {
    const boundary = namedFeatures(spec).wetDryBoundary;
    const centerChunkX = Math.floor(boundary.x / spec.chunkSize);
    const centerChunkZ = Math.floor(boundary.z / spec.chunkSize);
    const residency = createResidency(spec, { radiusChunks: 0, maxResidentChunks: 1 });
    const local = renderChunkBuffer(spec, residency.loadWindow(centerChunkX, centerChunkZ));
    const localX = boundary.x - centerChunkX * spec.chunkSize;
    const localZ = boundary.z - centerChunkZ * spec.chunkSize;
    const localIndex = localZ * local.width + localX;
    const exact = sampleCell(spec, boundary.x, boundary.z);
    assert.equal(local.bedLevels[localIndex], exact.bedLevel);
    assert.equal(local.pixels[localIndex], terrainCode(exact.terrain));
    const message = await generateOverview({
      requestId: 1,
      spec: { seed: spec.seed, generatorVersion: spec.generatorVersion, chunkSize: spec.chunkSize, overview: spec.overview, local: spec.local },
      options: { width: 16, height: 16, bounds: { minX: boundary.x - 32, minZ: boundary.z - 32, maxXExclusive: boundary.x + 32, maxZExclusive: boundary.z + 32 } },
    });
    assert.equal(message.type, 'result');
    assert.equal(message.overview.source, 'same global sampleTerrain(seed, x, z, footprint)');
    assert.equal(message.overview.terrainLabelScope, 'per-pixel footprint approximation; exact clicked cells use sampleCell');
    const firstOverviewCell = sampleTerrain(spec, boundary.x - 30.5, boundary.z - 30.5, 4);
    assert.equal(message.overview.terrain[0], terrainCode(firstOverviewCell.terrain));
    report.sharedGenerator = { localBedLevel: local.bedLevels[localIndex], exactTerrain: exact.terrain, overviewFootprint: message.overview.footprint, overviewChecksum: message.overview.checksum };
  });
  await check('copied caller has no stale coast selector or independent terrain import', async () => {
    const [main, worker, section, html] = await Promise.all([
      readFile(new URL('./world-lab/main.js', import.meta.url), 'utf8'),
      readFile(new URL('./world-lab/worker.js', import.meta.url), 'utf8'),
      readFile(new URL('./world-lab/section.js', import.meta.url), 'utf8'),
      readFile(new URL('./world-lab.html', import.meta.url), 'utf8'),
    ]);
    assert.match(main, /features\.wetDryBoundary/);
    assert.doesNotMatch(main, /features\.coast\b/);
    assert.match(main, /bedLevels/);
    assert.match(main, /sea-level-ground/);
    assert.match(worker, /from "\.\.\/terrain\.js"/);
    assert.match(section, /from "\.\.\/terrain\.js"/);
    assert.match(html, /data-feature="wetDryBoundary"/);
    assert.doesNotMatch(html, /data-feature="coast"/);
  });
  report.choices = {
    legacyCoastLine: 'coastLine remains continuous height shaping only',
    seaLevelGround: 'bedLevel === seaSurfaceLevel is dry sea-level ground, not a shore label',
    shore: 'only sampleCell cardinal wet/dry disagreement establishes the named wet/dry boundary',
    waterLimit: 'surface-water remains all-below-datum initialization metadata; no ocean connectivity, cave flooding, or live stock is represented',
  };
  report.hashes = {
    sourceTerrain: await hash('../reference/terrain.js'),
    candidateTerrain: await hash('./terrain.js'),
    callerMain: await hash('./world-lab/main.js'),
    callerWorker: await hash('./world-lab/worker.js'),
    callerSection: await hash('./world-lab/section.js'),
    callerHtml: await hash('./world-lab.html'),
    probe: await hash('./probe.mjs'),
  };
} catch (error) { report.errors.push(error.stack); process.exitCode = 1; }
await writeFile(new URL('./proof.json', here), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors.length, labelCounts: report.labelCounts, namedBoundary: report.namedBoundary, sharedGenerator: report.sharedGenerator }));
