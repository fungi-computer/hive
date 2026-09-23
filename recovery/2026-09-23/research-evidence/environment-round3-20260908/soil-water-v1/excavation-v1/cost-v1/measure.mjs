import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { fixedExcavationFixture } from '../fixture.mjs';
import { createExcavationAdapter } from '../excavation.mjs';
import { createVolume } from '../volume-with-pit-v1/volume.mjs';
import { restoreWorld, assertRegionWorld, assertVented, pitContacts } from '../world-binding.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url)), parent = path.dirname(directory);
const output = process.argv[2];
assert.ok(output && !fs.existsSync(output), 'one fresh explicit cost output');
fs.mkdirSync(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const acceptedInventory = JSON.parse(fs.readFileSync(path.join(parent, 'run-v1/source-inventory.json'), 'utf8'));
for (const [name, expected] of Object.entries(acceptedInventory))
  assert.equal(hash(fs.readFileSync(path.resolve(parent, name))), expected, `unchanged accepted source ${name}`);
const inventory = { acceptedSourceCount: Object.keys(acceptedInventory).length,
  acceptedInventorySha256: hash(fs.readFileSync(path.join(parent, 'run-v1/source-inventory.json'))),
  sources: Object.fromEntries(['measure.mjs', 'CONTRACT.md', '.fallowrc.json'].map(name => {
    const bytes = fs.readFileSync(path.join(directory, name));
    const target = path.join(output, 'sources', name); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes); return [name, hash(bytes)];
  })) };
const referenceBytes = fs.readFileSync(path.join(parent, 'run-v1/moving-result.json'));
const accepted = JSON.parse(referenceBytes);
inventory.acceptedResultSha256 = hash(referenceBytes); write('source-inventory.json', inventory);
const report = { inventory, phases: [], ordering: 'one observation per phase; fixed order, no warmup or forced GC',
  privateAdapterWorldCounters: 'not exposed; public independent binding pass measured separately' };
const start = performance.now(), totalCpu = process.cpuUsage();
let active = null;
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
const equalWire = (actual, expected, label) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, label);

try {
  const fixture = measure('fixture-build', () => fixedExcavationFixture());
  report.fixtureSource = fixture.source; report.fixtureWorldWork = fixture.world.stats();
  const initial = measure('adapter-initial', () => fixture.adapter.initial({ world: fixture.input.world,
    soilGeometry: fixture.input.soilGeometry, soilState: fixture.input.soilState }));
  equalWire(initial, fixture.input, 'same canonical initialization');
  const initialWire = JSON.stringify(initial);
  const cut = measure('adapter-excavate', () => fixture.adapter.excavate(initial, fixture.command));
  equalWire(cut.state, JSON.parse(fs.readFileSync(path.join(parent, 'run-v1/excavated.json'), 'utf8')),
    'same accepted edit and physical stocks');
  assert.equal(JSON.stringify(initial), initialWire, 'edit input unchanged');
  const cutWire = JSON.stringify(cut.state);

  const soil = measure('bare-soil-create', () => createVolume(cut.state.soilGeometry));
  const bare = measure('bare-soil-advance-600s-dt6', () => soil.advance(cut.state.soilState, 600, { dtMaxS: 6 }));
  equalWire(bare, { state: accepted.state.soilState, receipt: accepted.receipt, work: accepted.work },
    'bare complete state/receipt/work equal accepted');
  const combined = measure('adapter-advance-600s-dt6', () => fixture.adapter.advance(cut.state, 600, { dtMaxS: 6 }));
  equalWire(combined, accepted, 'complete adapter result equals accepted result');
  assert.equal(JSON.stringify(cut.state), cutWire, 'both advances preserve same initial state');

  const facts = measure('adapter-read', () => fixture.adapter.read(combined.state));
  equalWire(facts.balance, accepted.balance, 'read uses accepted finite balance');
  const encoded = measure('adapter-encode', () => fixture.adapter.encode(combined.state));
  equalWire(JSON.parse(encoded), accepted.state, 'encoded complete accepted state');
  const fresh = measure('fresh-adapter-create', () => createExcavationAdapter({
    worldIdentity: fixture.source.id, regionId: fixture.input.soilGeometry.regionId }));
  const decoded = measure('fresh-adapter-decode', () => fresh.decode(encoded));
  equalWire(decoded, accepted.state, 'fresh complete decode equals accepted state');

  const world = measure('public-world-restore', () => restoreWorld(fixture.source.id, combined.state.world));
  const beforeWorldReads = world.stats();
  const contacts = measure('public-world-region-vent-contact-read', () => {
    assertRegionWorld(world, combined.state.soilGeometry);
    assertVented(world, combined.state.pit.at);
    return pitContacts(world, combined.state.soilGeometry, combined.state.pit.at);
  });
  equalWire(contacts, facts.contacts, 'same actual geometry through public binding read');
  report.worldBindingWork = { before: beforeWorldReads, after: world.stats() };
  report.solverWork = bare.work;
  report.physical = { nodes: bare.state.massKg.length, acceptedSteps: bare.receipt.steps.length,
    activeFaces: bare.receipt.faceIds.length, finalPitKg: accepted.balance.pitWaterKg,
    exportWaterKg: accepted.balance.exportWaterKg, balanceResidualKg: accepted.balance.residualKg };
  report.outputBytes = { encodedState: Buffer.byteLength(encoded), bareResult: Buffer.byteLength(JSON.stringify(bare)),
    combinedResult: Buffer.byteLength(JSON.stringify(combined)) };
  report.equality = { acceptedSourcePins: true, cut: true, bareStateReceiptWork: true,
    completeAdapterResult: true, freshDecode: true, inputPreservation: true, physicalContacts: true };
  report.intervalWallMs = performance.now() - start; report.intervalCpuMicros = process.cpuUsage(totalCpu);
  report.endProcessMemory = process.memoryUsage();
  report.intervalScope = 'after pinning; includes all measured phases plus untimed equality/report operations';
  write('proof.json', report);
  process.stdout.write(`${JSON.stringify({ status: 'passed', phaseCount: report.phases.length,
    intervalWallMs: report.intervalWallMs, finalPitKg: report.physical.finalPitKg,
    phases: report.phases.map(p => ({ name: p.name, wallMs: p.wallMs, cpuTotalMs: p.cpuTotalMs })) })}\n`);
} catch (error) {
  write('failure.json', { ...report, active, error: { name: error.name, message: error.message,
    stack: error.stack, candidate: error.candidate, partial: error.partial } });
  throw error;
}
