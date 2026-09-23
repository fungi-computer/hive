import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createWorldSpec, sampleCell } from '../reference/terrain.js';
import { DRAINAGE_CONTRACT, buildDrainageAtlas, createDrainageAtlas } from './drainage-atlas.mjs';

const directory = new URL('./', import.meta.url);
const hash = async relative => createHash('sha256').update(await readFile(new URL(relative, import.meta.url))).digest('hex');
const report = { scope: 'fixed 128²/stride32 derived Priority-Flood drainage atlas; no terrain or water mutation', checks: [], errors: [] };
async function check(name, fn) { await fn(); report.checks.push(name); }
const total = DRAINAGE_CONTRACT.width * DRAINAGE_CONTRACT.height;
const center = { column: 64, row: 64 };
try {
  await check('flat surface has acyclic D8 parent ranks and conserved outlet contribution', () => {
    const atlas = buildDrainageAtlas({ bedAt: () => 10 });
    assert.equal(atlas.stats().outletContribution, total); assert.equal(atlas.depressions().length, 0);
    for (let row = 0; row < DRAINAGE_CONTRACT.height; row++) for (let column = 0; column < DRAINAGE_CONTRACT.width; column++) {
      const cell = atlas.atGrid({ column, row });
      if (cell.parent) assert(atlas.at(cell.parent).settlementRank < cell.settlementRank);
    }
  });
  await check('enclosed basin records routing-only fill and spill without changing bed', () => {
    const atlas = buildDrainageAtlas({ bedAt: ({ column, row }) => column === center.column && row === center.row ? 0 : 20 });
    const basin = atlas.atGrid(center), depression = atlas.depressions()[0];
    assert.equal(basin.bedHeight, 0); assert.equal(basin.filledHeight, 20); assert.equal(basin.fillDepth, 20);
    assert.equal(depression.cells, 1); assert.equal(depression.spillHeight, 20);
  });
  await check('below-sea inland basin is not ocean without marine D8 connectivity', () => {
    const atlas = buildDrainageAtlas({
      bedAt: ({ column, row }) => (column === 0 && row === 0) || (column === center.column && row === center.row) ? 0 : 20,
      marineAt: ({ column, row }) => column === 0 && row === 0,
    });
    assert.equal(atlas.atGrid(center).oceanConnected, false);
  });
  await check('D8 policy permits explicit diagonal marine connectivity', () => {
    const diagonal = { column: 1, row: 1 };
    const atlas = buildDrainageAtlas({
      bedAt: ({ column, row }) => (column === 0 && row === 0) || (column === diagonal.column && row === diagonal.row) ? 0 : 20,
      marineAt: ({ column, row }) => column === 0 && row === 0,
    });
    assert.equal(atlas.atGrid(diagonal).oceanConnected, true);
    assert.equal(atlas.stats().connectivity, 'D8');
  });
  await check('equal-height flats choose the same settled parent under repeated construction', () => {
    const left = buildDrainageAtlas({ bedAt: () => 10 });
    const right = buildDrainageAtlas({ bedAt: () => 10 });
    assert.deepEqual(left.atGrid(center), right.atGrid(center));
  });
  await check('actual sampler atlas is fixed, query-order independent, and non-mutating', () => {
    const spec = createWorldSpec({ seed: 'drainage-sea-datum-sample-v1' });
    const before = sampleCell(spec, -1, 0), atlas = createDrainageAtlas(spec), after = sampleCell(spec, -1, 0);
    assert.deepEqual(after, before); assert.equal(atlas.stats().cells, total); assert.equal(atlas.stats().queuePops, total);
    const points = [{ x: -2048, z: -2048 }, { x: -1, z: 0 }, { x: 0, z: 0 }, { x: 2016, z: 2016 }];
    const forward = new Map(points.map(point => [`${point.x},${point.z}`, atlas.at(point)]));
    for (const point of [...points].reverse()) assert.deepEqual(atlas.at(point), forward.get(`${point.x},${point.z}`));
  });
  report.stats = createDrainageAtlas(createWorldSpec({ seed: 'drainage-sea-datum-sample-v1' })).stats();
  report.depressionScope = 'Connected fill-depth components with spillHeight only; no nested-depression hierarchy is claimed.';
  report.hashes = {
    terrain: await hash('../reference/terrain.js'),
    voxel: await hash('../voxel-world.mjs'),
    atlas: await hash('./drainage-atlas.mjs'),
    probe: await hash('./probe.mjs'),
  };
} catch (error) { report.errors.push(error.stack); process.exitCode = 1; }
await writeFile(new URL('./proof.json', directory), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors.length, stats: report.stats }));
