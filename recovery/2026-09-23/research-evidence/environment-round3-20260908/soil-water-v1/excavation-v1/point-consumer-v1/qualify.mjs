import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { fixedExcavationFixture } from './fixture.mjs';
import { createExcavationAdapter } from './excavation.mjs';
import { restoreWorld, assertRegionWorld, assertVented, pitContacts } from './world-binding.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url)), parent = path.dirname(directory);
const output = process.argv[2];
assert.ok(output && !fs.existsSync(output), 'one fresh explicit comparison output');
fs.mkdirSync(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const wire = value => JSON.stringify(value);
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const acceptedPath = name => path.join(parent, 'run-v1', name);
const accepted = name => JSON.parse(fs.readFileSync(acceptedPath(name), 'utf8'));
const sourceNames = ['qualify.mjs', 'CONTRACT.md', 'REVIEW.md', '.fallowrc.json',
  'excavation.mjs', 'world-binding.mjs', 'fixture.mjs',
  '../../../worldgen/point-query-v1/voxel-world.mjs'];
const acceptedInventoryBytes = fs.readFileSync(acceptedPath('source-inventory.json'));
const acceptedInventory = JSON.parse(acceptedInventoryBytes);

function verifyAcceptedPins() {
  for (const [name, expected] of Object.entries(acceptedInventory))
    assert.equal(hash(fs.readFileSync(path.resolve(parent, name))), expected, `preserved accepted ${name}`);
}
function pinSources() {
  verifyAcceptedPins();
  const sources = Object.fromEntries(sourceNames.map(name => {
    const bytes = fs.readFileSync(path.resolve(directory, name));
    const target = path.join(output, 'sources', name.replaceAll('../', 'parent/'));
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    return [name, hash(bytes)];
  }));
  assert.equal(sources['../../../worldgen/point-query-v1/voxel-world.mjs'],
    'b3033ee3369a18600a6ef3dce8b9e83b6165bbaea86d253d59db5268c428e0ea', 'exact reviewed world owner');
  const references = Object.fromEntries(['before.json', 'excavated.json', 'moving-result.json',
    'resumed-result.json', 'moving-excavation-save.json'].map(name => [name, hash(fs.readFileSync(acceptedPath(name)))]));
  const inventory = { sources, acceptedSources: acceptedInventory,
    acceptedInventorySha256: hash(acceptedInventoryBytes), references };
  write('source-inventory.json', inventory); return inventory;
}

const report = { inventory: pinSources(), phases: [], checks: [],
  ordering: 'one observation per phase, fixed order, no warmup or forced GC',
  scope: 'unchanged fixed adapter 600s plus accepted moving-file 300s continuation; not original five-group suite',
  privateAdapterWorldCounters: 'not exposed; separate public binding pass reports actual work' };
let active = 'source-pinned';
const start = performance.now(), totalCpu = process.cpuUsage();
function measure(name, operation) {
  active = name; const cpu = process.cpuUsage(), wall = performance.now();
  let result, failure = null;
  try { result = operation(); } catch (error) { failure = error; }
  const wallMs = performance.now() - wall, cpuMicros = process.cpuUsage(cpu);
  report.phases.push({ name, completed: failure === null, wallMs, cpuMicros,
    cpuTotalMs: (cpuMicros.user + cpuMicros.system) / 1000 });
  write('progress.json', report);
  if (failure !== null) throw failure;
  return result;
}
function sameWire(actual, expected, label) {
  assert.equal(wire(actual), wire(expected), label); report.checks.push(label);
}

function initialAndEdit() {
  const fixture = measure('fixture-build', () => fixedExcavationFixture());
  report.fixtureSource = fixture.source; report.fixtureWorldWork = fixture.world.stats();
  sameWire(fixture.input, accepted('before.json'), 'complete original canonical fixture');
  const input = measure('adapter-initial', () => fixture.adapter.initial({ world: fixture.input.world,
    soilGeometry: fixture.input.soilGeometry, soilState: fixture.input.soilState }));
  sameWire(input, fixture.input, 'public initial unchanged');
  const prior = wire(input);
  const cut = measure('adapter-excavate', () => fixture.adapter.excavate(input, fixture.command));
  sameWire(cut.state, accepted('excavated.json'), 'complete accepted edit and stock');
  assert.equal(wire(input), prior, 'edit preserves original input');
  assert.throws(() => fixture.adapter.excavate(input, { ...fixture.command, expectedWorldRevision: 1 }),
    /stale excavation world revision/);
  assert.equal(wire(input), prior, 'stale edit preserves input');
  report.checks.push('edit and rejected stale-edit input preservation');
  write('excavated.json', cut.state);
  return { fixture, cut };
}

function advanceAndRead(fixture, cut) {
  const prior = wire(cut.state);
  const result = measure('adapter-advance-600s-dt6', () => fixture.adapter.advance(cut.state, 600, { dtMaxS: 6 }));
  write('moving-result.json', result);
  sameWire(result, accepted('moving-result.json'), 'complete 600s state/receipt/work/balance');
  assert.equal(wire(cut.state), prior, 'advance input unchanged');
  report.checks.push('advance input preservation');
  const facts = measure('adapter-read', () => fixture.adapter.read(result.state));
  sameWire(facts.balance, result.balance, 'read finite balance');
  const encoded = measure('adapter-encode', () => fixture.adapter.encode(result.state));
  assert.equal(encoded, wire(accepted('moving-result.json').state), 'exact accepted encoded state');
  report.checks.push('exact accepted encoded state');
  fs.writeFileSync(path.join(output, 'final-save.json'), encoded);
  const fresh = measure('fresh-adapter-create', () => createExcavationAdapter({
    worldIdentity: fixture.source.id, regionId: fixture.input.soilGeometry.regionId }));
  const raw = measure('actual-final-file-read', () => fs.readFileSync(path.join(output, 'final-save.json'), 'utf8'));
  const decoded = measure('fresh-adapter-decode', () => fresh.decode(raw));
  sameWire(decoded, result.state, 'fresh actual-file complete decode');
  sameWire(fresh.read(decoded), facts, 'fresh complete public read facts');
  const replay = fixture.adapter.excavate(result.state, fixture.command);
  assert.equal(replay.replayed, true, 'same command is replayed after flow');
  sameWire(replay.state, result.state, 'replayed edit preserves moving state and sole export');
  return { result, facts, encoded };
}

function movingRestart(fixture, result) {
  const filename = path.join(output, 'moving-save.json');
  fs.copyFileSync(acceptedPath('moving-excavation-save.json'), filename);
  const fresh = measure('moving-restart-create', () => createExcavationAdapter({
    worldIdentity: fixture.source.id, regionId: fixture.input.soilGeometry.regionId }));
  const raw = measure('actual-moving-file-read', () => fs.readFileSync(filename, 'utf8'));
  const input = measure('moving-restart-decode', () => fresh.decode(raw));
  const prior = wire(input);
  assert.equal(input.soilState.timeS, 300, 'accepted moving checkpoint at 300s');
  const resumed = measure('moving-restart-advance-300s-dt6', () => fresh.advance(input, 300, { dtMaxS: 6 }));
  write('resumed-result.json', resumed);
  sameWire(resumed, accepted('resumed-result.json'), 'complete accepted resumed output');
  sameWire(resumed.state, result.state, 'moving file restart reaches exact uninterrupted endpoint');
  assert.equal(wire(input), prior, 'resumed input unchanged');
  report.restartWork = resumed.work;
}

function worldRead(fixture, result, facts) {
  const world = measure('public-world-restore', () => restoreWorld(fixture.source.id, result.state.world));
  const before = world.stats();
  const contacts = measure('public-world-region-vent-contact-read', () => {
    assertRegionWorld(world, result.state.soilGeometry);
    assertVented(world, result.state.pit.at);
    return pitContacts(world, result.state.soilGeometry, result.state.pit.at);
  });
  sameWire(contacts, facts.contacts, 'actual physical contacts unchanged');
  const after = world.stats();
  assert.equal(after.generatedBricks, 0, 'sparse material queries decode no bricks');
  assert.equal(after.residentBytes, 0, 'sparse material queries allocate no brick projection');
  assert.equal(after.pointReads - before.pointReads, 72, 'actual same 72 validation point reads');
  report.worldBindingWork = { before, after };
  report.checks.push('zero-brick actual 72-query material validation');
}

function finish(result, encoded) {
  verifyAcceptedPins();
  for (const [name, expected] of Object.entries(report.inventory.sources))
    assert.equal(hash(fs.readFileSync(path.resolve(directory, name))), expected, `candidate pin unchanged ${name}`);
  report.checks.push('all accepted and candidate source pins unchanged');
  report.solverWork = result.work;
  report.physical = { nodes: result.state.soilState.massKg.length,
    acceptedSteps: result.receipt.steps.length, activeFaces: result.receipt.faceIds.length,
    finalPitKg: result.balance.pitWaterKg, exportWaterKg: result.balance.exportWaterKg,
    balanceResidualKg: result.balance.residualKg };
  report.outputBytes = { encodedState: Buffer.byteLength(encoded), result: Buffer.byteLength(wire(result)) };
  report.intervalWallMs = performance.now() - start; report.intervalCpuMicros = process.cpuUsage(totalCpu);
  report.endProcessMemory = process.memoryUsage();
  report.intervalScope = 'after pinning; all measured phases plus untimed assertions/report/file writes; excludes later Fallow';
  report.status = 'passed'; write('proof.json', report);
  process.stdout.write(`${wire({ status: report.status, checks: report.checks.length, phases: report.phases.length,
    intervalWallMs: report.intervalWallMs, physical: report.physical,
    phaseTimes: report.phases.map(p => ({ name: p.name, wallMs: p.wallMs, cpuTotalMs: p.cpuTotalMs })) })}\n`);
}

try {
  const { fixture, cut } = initialAndEdit();
  const { result, facts, encoded } = advanceAndRead(fixture, cut);
  movingRestart(fixture, result); worldRead(fixture, result, facts); finish(result, encoded);
} catch (error) {
  write('failure.json', { ...report, status: 'failed', active,
    error: { name: error.name, message: error.message, stack: error.stack,
      candidate: error.candidate, partial: error.partial } });
  throw error;
}
