import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createWorldSpec, sampleCell } from '../height-sea/terrain.js';
import { drainage } from './drainage.mjs';

const out = new URL('./run-v1/', import.meta.url);
await mkdir(out, { recursive: true });
const report = { scope: 'D4 bounded spill analysis; no water solver, terrain carving or cave hydrology', checks: [], errors: [] };
const check = (name, run) => { run(); report.checks.push(name); };
const hash = data => createHash('sha256').update(data).digest('hex');
const [w, h] = [7, 9];
// Independent slow minimax fixed-point relaxation, no heap/settlement ancestry.
function escapeOracle(bed, width, height) {
  const values = bed.map((v, i) => i < width || i >= bed.length - width || i % width === 0 || i % width === width - 1 ? v : Infinity);
  for (let pass = 0; pass < bed.length; pass++) {
    const before = [...values];
    let changed = false;
    for (let row = 1; row < height - 1; row++) for (let col = 1; col < width - 1; col++) {
      const i = row * width + col;
      const next = Math.max(bed[i], Math.min(before[i - 1], before[i + 1], before[i - width], before[i + width]));
      if (next < values[i]) { values[i] = next; changed = true; }
    }
    if (!changed) return values;
  }
  throw new Error('oracle did not converge within graph diameter bound');
}
function build(bed, width = w, height = h, roots = []) {
  return drainage({ origin: [-17, -33], size: [width, height], stride: 1, seaMetres: 1,
    bedMetres: bed, marineRoots: roots, sourceIdentity: 'explicit-synthetic-metres' });
}
const start = performance.now();
try {
  check('independent minimax oracle matches every escape elevation across 20 varied fixtures', () => {
    for (let fixture = 0; fixture < 20; fixture++) {
      const bed = Array.from({ length: w * h }, (_, i) => ((Math.imul(i + 13, fixture * 17 + 43) ^ Math.imul(i * i + 7, 29)) >>> 0) % 9);
      const expected = escapeOracle(bed, w, h), actual = build(bed);
      for (let i = 0; i < bed.length; i++) {
        const cell = actual.atIndex(i);
        assert.equal(cell.escapeElevationMetres, expected[i]);
        if (cell.parentIndex >= 0) {
          const p = actual.atIndex(cell.parentIndex);
          assert.equal(Math.abs(cell.x - p.x) + Math.abs(cell.z - p.z), 1);
          assert(p.rank < cell.rank);
        }
      }
      assert.equal(actual.describe().outletContribution, bed.length);
    }
  });
  check('marine connectivity rejects diagonal-only contact and exact-datum beds', () => {
    const bed = Array(25).fill(2); bed[0] = 0; bed[6] = 0; bed[1] = 1;
    const atlas = build(bed, 5, 5, [0]);
    assert.equal(atlas.atIndex(0).oceanConnected, true);
    assert.equal(atlas.atIndex(1).oceanConnected, false);
    assert.equal(atlas.atIndex(6).oceanConnected, false);
    assert.throws(() => build(bed, 5, 5, [1]), /strictly below/);
    bed[1] = .5;
    assert.equal(build(bed, 5, 5, [0]).atIndex(6).oceanConnected, true);
  });
  check('enclosed unit basin has exact geometric fill capacity and no water creation', () => {
    const bed = Array(25).fill(2); bed[12] = 0;
    const atlas = build(bed, 5, 5);
    assert.deepEqual(atlas.components(), [{ id: 0, cells: 1, escapeElevationMetres: 2,
      maximumDepthMetres: 2, rectangularPrismCapacityM3: 2 }]);
    assert.equal(atlas.atIndex(12).bedMetres, 0);
    assert(!('water' in atlas.atIndex(12)));
  });
  check('inputs and query results cannot rewrite the owned analysis', () => {
    const origin = [-1, -1], size = [3, 3], bed = Array(9).fill(2); bed[4] = 0;
    const atlas = drainage({ origin, size, stride: 1, seaMetres: 1, bedMetres: bed, sourceIdentity: 'copy-check' });
    const before = atlas.atIndex(4); origin[0] = 99; size[0] = 99; bed[4] = 99;
    atlas.describe().origin[0] = 100; atlas.components()[0].cells = 900;
    assert.deepEqual(atlas.atIndex(4), before); assert.equal(atlas.components()[0].cells, 1);
  });
  const spec = createWorldSpec();
  report.actual = [];
  for (const fixture of [
    { name: 'whole-world-coarse', origin: [-2048, -2048], size: [128, 128], stride: 32 },
    { name: 'exact-local-coast', origin: [-784, -1184], size: [128, 128], stride: 1 },
  ]) {
    const sampledStart = performance.now(), beds = [], marineRoots = [];
    const [width, height] = fixture.size;
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const cell = sampleCell(spec, fixture.origin[0] + col * fixture.stride, fixture.origin[1] + row * fixture.stride);
      assert.equal(cell.bedMetres, cell.bedLevel * spec.terrain.verticalVoxelMetres);
      assert.equal(cell.terrain === 'surface-water', cell.bedLevel < spec.terrain.seaSurfaceLevel);
      beds.push(cell.bedMetres);
      // Explicit study boundary: below-datum perimeter beds contact the sea.
      // This says nothing about other sub-datum inland lakes or fine-scale paths.
      if ((row === 0 || col === 0 || row === height - 1 || col === width - 1) && cell.bedLevel < spec.terrain.seaSurfaceLevel)
        marineRoots.push(row * width + col);
    }
    const sampledMs = performance.now() - sampledStart, solveStart = performance.now();
    const atlas = drainage({ ...fixture, bedMetres: beds, marineRoots,
      seaMetres: spec.terrain.seaSurfaceLevel * spec.terrain.verticalVoxelMetres, sourceIdentity: spec.identity });
    const solveMs = performance.now() - solveStart;
    const cells = Array.from({ length: beds.length }, (_, i) => atlas.atIndex(i));
    for (const cell of cells) if (cell.parentIndex >= 0) {
      assert(cells[cell.parentIndex].rank < cell.rank);
      assert.equal(Math.abs(cell.x - cell.parent.x) + Math.abs(cell.z - cell.parent.z), fixture.stride);
    }
    const payload = { ...atlas.describe(), source: spec.identity, samples: cells, components: atlas.components() };
    const json = JSON.stringify(payload);
    await writeFile(new URL(`${fixture.name}.json`, out), json + '\n');
    report.actual.push({ fixture: fixture.name, samplingMs: sampledMs, drainageMs: solveMs,
      samples: beds.length, checksum: hash(json + '\n'), bytes: Buffer.byteLength(json + '\n'),
      marineRoots: marineRoots.length, oceanSamples: cells.filter(c => c.oceanConnected).length,
      components: atlas.components().length, ...atlas.describe() });
  }
  report.checks.push('corrected generator sampled once per declared bed for coarse and exact grids; source heights unchanged');
  report.checks.push('actual parent graph uses only declared faces and all contributions reach finite analysis boundary');
} catch (e) { report.errors.push(e.stack); process.exitCode = 1; }
report.wallMs = performance.now() - start;
report.hashes = {};
for (const path of ['./drainage.mjs', './qualify.mjs', '../height-sea/terrain.js'])
  report.hashes[path] = hash(await readFile(new URL(path, import.meta.url)));
report.limitations = ['coarse points do not prove a traversable river corridor between samples',
  'perimeter discharge is an explicit finite analysis boundary, not an implicit chunk boundary',
  'surface-only bed analysis does not model caves, soil water, liquid quantities, rain or erosion',
  'equal-spill connected components are not a nested depression hierarchy',
  'typed array counts exclude JS objects and the caller-retained evidence arrays; runtime may retain scratch until owner collection'];
await writeFile(new URL('proof.json', out), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors,
  wallMs: report.wallMs, actual: report.actual?.map(r => ({ name: r.fixture, samplingMs: r.samplingMs, drainageMs: r.drainageMs })) }));
