import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { fixedExcavationFixture } from './fixture.mjs';
import { createExcavationAdapter } from './excavation.mjs';
import { createVolume } from './volume-with-pit-v1/volume.mjs';
import { createVolumeGeometry } from './volume-with-pit-v1/geometry.mjs';
import { mixedResidual } from './volume-with-pit-v1/residual.mjs';
import { canonicalAnchors } from './volume-with-pit-v1/state.mjs';
import { createVolume as originalVolume } from '../volume-v1/volume.mjs';
import { referenceColumnDescriptor } from '../volume-v1/first-caller.mjs';
import { compensatedSum } from '../column-v1/source-v2/soil.mjs';
import { balanceTolerance } from '../volume-v1/state.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url)), output = process.argv[2];
assert.ok(output && !fs.existsSync(output), 'one fresh explicit qualification output');
fs.mkdirSync(output, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const moduleNames = ['geometry', 'faces', 'state', 'residual', 'guess', 'linear', 'newton', 'closure', 'volume'];
const sources = ['CONTRACT.md', 'BOUNDARY.md', 'world-binding.mjs', 'excavation.mjs', 'fixture.mjs', 'qualify.mjs',
  'volume-with-pit-v1/pit.mjs', ...moduleNames.map(n => `volume-with-pit-v1/${n}.mjs`),
  ...moduleNames.map(n => `../volume-v1/${n}.mjs`), '../volume-v1/first-caller.mjs',
  '../column-v1/source-v2/soil.mjs', '../pit-face-v1/DECISION.md', '../pit-face-v1/vertical-face.mjs',
  ...['voxel-world.mjs', 'terrain.js', 'features.mjs', 'lattice-hash.mjs']
    .map(n => `../../worldgen/coordinate-hash-v1/${n}`)];
const inventory = {};
for (const name of sources) {
  const bytes = fs.readFileSync(path.resolve(directory, name));
  const target = path.join(output, 'sources', name.replaceAll('../', 'parent/'));
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
  inventory[name] = createHash('sha256').update(bytes).digest('hex');
}
write('source-inventory.json', inventory);
const start = performance.now(), cpu = process.cpuUsage();
const report = { inventory, groups: [], progress: [], fixture: { columns: [3, 3], soilLayers: 2,
  horizonS: 600, dtS: 6, restartS: 300, minimumPitKg: .001, minimumEachPathKg: .000001 } };
let checks = 0, active = null;
const check = (value, label) => { checks++; assert.ok(value, label); };
const equal = (a, b, label) => { checks++; assert.deepEqual(a, b, label); };
const near = (a, b, tolerance, label) => check(Number.isFinite(a) && Math.abs(a - b) <= tolerance,
  `${label}: ${a}, ${b}, tolerance ${tolerance}`);
const record = value => { report.progress.push(value); write('progress.json', report); };
function group(name, run) {
  active = name; report.progress = []; const before = checks;
  const result = run(); report.groups.push({ name, checks: checks - before, ...result });
  write('progress.json', report);
}
function rejectUnchanged(adapter, state, operation, label, pattern = undefined) {
  const before = adapter.encode(state); checks++; assert.throws(operation, pattern, label);
  equal(adapter.encode(state), before, `${label}: complete input unchanged`);
}

function verifyTransfers(g, input, result) {
  const tolerance = balanceTolerance(input.soilState.initialTotalKg), paired = [...input.soilState.massKg];
  for (const [k, face] of g.faces.entries()) {
    paired[face.left] -= result.receipt.faceTransferKg[k]; paired[face.right] += result.receipt.faceTransferKg[k];
  }
  near(Math.max(...paired.map((m, i) => Math.abs(m - result.state.soilState.massKg[i]))), 0,
    2e-9 + 64 * Number.EPSILON * input.soilState.initialTotalKg, 'aggregate one paired face ledger');
  for (const step of result.receipt.steps) {
    check([step.metrics.mixedKg, step.metrics.constitutiveKg, step.metrics.darcyKg,
      step.metrics.treeCorrectionKg].every(n => n <= 2e-9), 'unchanged original residual bounds');
    check(step.massKg.every((m, i) => m >= g.nodes[i].minMassKg && m <= g.nodes[i].maxMassKg),
      'strict pores and finite pit rim');
    check(Math.abs(step.metrics.totalKg) <= tolerance && step.metrics.pairKg <= tolerance &&
      Math.abs(step.metrics.rootCompatibilityKg) <= tolerance && step.metrics.chordDifferenceKg === 0,
      'conservative tree closure preserves Darcy chords');
    for (const [k, face] of g.faces.entries()) {
      if (face.pitRole !== 'side') continue;
      const leftSoil = g.nodes[face.left].kind === 'soil', pitIndex = leftSoil ? face.right : face.left;
      if (step.headM[pitIndex] <= 0)
        check(step.ledger.transferKg[k] * (leftSoil ? 1 : -1) >= 0, 'empty exposed side never supplies water');
    }
  }
  near(result.balance.residualKg, 0, balanceTolerance(input.initialWaterKg), 'spoil plus soil plus pit total');
  equal(result.state.exports, input.exports, 'seepage cannot rewrite or consume exported wet spoil');
  equal(result.state.world, input.world, 'flow does not rewrite terrain or its edit revision');
  check(result.work.matrixUpdates <= 30000000 && result.work.peakDenseBytes <= 72 * 72 * 8 &&
    result.receipt.steps.length <= 512, 'actual unchanged bounded nonlinear/dense work');
}

function signedPitTransfers(g, receipt) {
  const values = g.faces.flatMap((face, k) => face.pitRole ? [{ id: face.id, role: face.pitRole,
    outwardKg: receipt.faceTransferKg[k] * (g.nodes[face.left].kind === 'soil' ? 1 : -1) }] : []);
  return { values, floorKg: compensatedSum(values.filter(f => f.role === 'floor').map(f => f.outwardKg)),
    sidesKg: compensatedSum(values.filter(f => f.role === 'side').map(f => f.outwardKg)) };
}

function checkJacobian(g, state, pitIndex) {
  const dtS = .5, epsilon = 1e-6, base = g.nodes[pitIndex].baseYM;
  const heads = g.nodes.map(n => n.kind === 'soil' ? base + .22 - n.centerM[1] : .08);
  const evaluated = mixedResidual(g, state.massKg, heads, dtS), count = heads.length;
  const columns = Array.from({ length: count }, () => Array(count).fill(0));
  for (let i = 0; i < count; i++) columns[i][i] = evaluated.capacityKgPerM[i];
  for (const [k, face] of g.faces.entries()) {
    const left = 1000 * dtS * evaluated.derivativeLeftM2S[k], right = 1000 * dtS * evaluated.derivativeRightM2S[k];
    columns[face.left][face.left] += left; columns[face.left][face.right] -= left;
    columns[face.right][face.left] += right; columns[face.right][face.right] -= right;
  }
  let maxDifferenceKgPerM = 0;
  for (let col = 0; col < count; col++) {
    const plus = [...heads], minus = [...heads]; plus[col] += epsilon; minus[col] -= epsilon;
    const a = mixedResidual(g, state.massKg, plus, dtS), b = mixedResidual(g, state.massKg, minus, dtS);
    for (let row = 0; row < count; row++) {
      const fd = (a.residualKg[row] - b.residualKg[row]) / (2 * epsilon), analytic = columns[col][row];
      maxDifferenceKgPerM = Math.max(maxDifferenceKgPerM, Math.abs(fd - analytic));
      near(fd, analytic, 2e-6 + 3e-8 * Math.abs(analytic), 'assembled full nonsymmetric mixed Jacobian');
    }
  }
  const dry = [...heads]; dry[pitIndex] = -.05;
  const dryEvaluation = mixedResidual(g, state.massKg, dry, dtS);
  for (const [k, face] of g.faces.entries()) if (face.pitRole === 'side') {
    const leftSoil = g.nodes[face.left].kind === 'soil';
    check(dryEvaluation.volumeRateM3S[k] * (leftSoil ? 1 : -1) >= 0, 'negative floor multiplier cannot suck through sides');
    check((leftSoil ? dryEvaluation.derivativeRightM2S[k] : dryEvaluation.derivativeLeftM2S[k]) === 0,
      'dry side has no negative-pit-head dependence');
  }
  const rest = g.nodes.map(n => n.kind === 'soil' ? base + .15 - n.centerM[1] : .15);
  const restEvaluation = mixedResidual(g, state.massKg, rest, dtS);
  near(Math.max(...restEvaluation.volumeRateM3S.map(Math.abs)), 0, 1e-15,
    'integrated wet/dry sides and floor share hydrostatic zero flow');
  return { maxDifferenceKgPerM, perturbationM: epsilon, derivativeCases: count * count };
}

let fixture, excavation, geometry, moving;
try {
  group('original reservoir and moving-column consumer remains exactly compatible', () => {
    const descriptor = referenceColumnDescriptor(), old = originalVolume(descriptor), next = createVolume(descriptor);
    const g = createVolumeGeometry(descriptor);
    const stocks = g.nodes.map(n => ({ nodeId: n.id, massKg: n.kind === 'soil' ? n.maxMassKg :
      n.reservoirId === 'top' ? 1 : 0 }));
    const a = old.initial({ stocks }), b = next.initial({ stocks });
    equal(b, a, 'same original identity and canonical state');
    const before = old.advance(a, 10, { dtMaxS: 1 }), after = next.advance(b, 10, { dtMaxS: 1 });
    write('original-column-result.json', before); write('candidate-column-result.json', after);
    equal(after, before, 'complete original moving result, receipts and numerical work');
    return { steps: after.receipt.steps.length, work: after.work };
  });
  group('one real generated soil edit exports wet spoil and retains every other stock', () => {
    fixture = fixedExcavationFixture(); const before = fixture.adapter.encode(fixture.input);
    write('before.json', fixture.input); record(fixture.source);
    excavation = fixture.adapter.excavate(fixture.input, fixture.command);
    write('excavated.json', excavation.state); record(excavation.balance);
    equal(fixture.adapter.encode(fixture.input), before, 'successful edit preserves complete input');
    equal(fixture.world.save(), fixture.input.world, 'adapter never mutates caller world');
    const previous = fixture.adapter.read(fixture.input), current = fixture.adapter.read(excavation.state);
    const target = previous.soil.nodes.find(n => n.nodeId === fixture.targetId);
    equal(excavation.state.exports[0].waterKg, target.massKg, 'all original target water travels with wet spoil');
    equal(current.balance.pitWaterKg, 0, 'excavation does not create initial free water');
    equal(current.soil.nodes.filter(n => n.kind === 'soil').map(n => [n.nodeId, n.massKg]),
      previous.soil.nodes.filter(n => n.nodeId !== fixture.targetId).map(n => [n.nodeId, n.massKg]),
      'all retained node masses unchanged by stable identity');
    equal(current.timeS, previous.timeS, 'excavation does not advance time');
    equal(current.steps, previous.steps, 'excavation does not invent solver steps');
    geometry = createVolumeGeometry(excavation.state.soilGeometry);
    const sides = geometry.faces.filter(f => f.pitRole === 'side'), floors = geometry.faces.filter(f => f.pitRole === 'floor');
    equal(sides.length, 4, 'this fixed ordinary unlined hole has four actual soil sides');
    equal(floors.length, 1, 'one actual porous floor');
    check(sides.every(f => f.areaM2 === .54) && floors[0].areaM2 === 1, 'actual metric side and floor areas');
    near(current.balance.residualKg, 0, balanceTolerance(fixture.input.initialWaterKg), 'combined edit conservation');
    return { source: fixture.source, exportedKg: target.massKg, balance: current.balance, contacts: current.contacts };
  });
  group('actual signed faces, partial-depth Jacobian and saturated dry-pit reference', () => {
    const pitIndex = geometry.nodes.findIndex(n => n.kind === 'pit');
    const derivatives = checkJacobian(geometry, excavation.state.soilState, pitIndex);
    const saturated = fixedExcavationFixture({ soleTargetAnchor: true });
    const cut = saturated.adapter.excavate(saturated.input, saturated.command);
    const g = createVolumeGeometry(cut.state.soilGeometry);
    const anchors = canonicalAnchors(g, cut.state.soilState.massKg);
    check(anchors.some(a => a.cause === 'exposed-saturated-side-atmospheric-reference'),
      'removing the sole unsaturated target exposes a real atmospheric pressure reference');
    const result = saturated.adapter.advance(cut.state, 1, { dtMaxS: 1 });
    write('initially-saturated-pit-result.json', result); record({ balance: result.balance, work: result.work });
    verifyTransfers(g, cut.state, result);
    check(result.balance.pitWaterKg > 0, 'fully saturated adjacent soil can fill the initially empty pit');
    return { ...derivatives, dryReference: anchors, saturatedPitKg: result.balance.pitWaterKg, work: result.work };
  });
  group('one ordinary unlined excavation fills by side and floor seepage and restarts while moving', () => {
    moving = fixture.adapter.advance(excavation.state, 600, { dtMaxS: 6 });
    write('moving-result.json', moving); record({ balance: moving.balance, work: moving.work,
      maxima: moving.receipt.maxAbsMetrics });
    verifyTransfers(geometry, excavation.state, moving);
    const flow = signedPitTransfers(geometry, moving.receipt); record(flow);
    check(flow.floorKg > .000001 && flow.sidesKg > .000001 && flow.values.filter(f => f.role === 'side')
      .every(f => f.outwardKg > .000001), 'all four soil sides and the real floor contribute measurable finite seepage');
    check(moving.balance.pitWaterKg > .001 && moving.balance.pitWaterKg < 540,
      'pit fills a finite amount below its physical rim');
    const prefix = fixture.adapter.advance(excavation.state, 300, { dtMaxS: 6 });
    check(prefix.balance.pitWaterKg > 0 && prefix.balance.pitWaterKg < 540,
      'restart checkpoint contains actual finite pit water');
    const last = prefix.receipt.steps.at(-1);
    check(Math.max(...last.ledger.transferKg.map(Math.abs)) > 1e-7, 'restart occurs during actual flow');
    const file = path.join(output, 'moving-excavation-save.json');
    fs.writeFileSync(file, fixture.adapter.encode(prefix.state));
    const fresh = createExcavationAdapter({ regionId: fixture.input.soilGeometry.regionId, worldIdentity: fixture.source.id });
    const loaded = fresh.decode(fs.readFileSync(file, 'utf8'));
    equal(fresh.encode(loaded), fixture.adapter.encode(prefix.state), 'exact file reloaded complete state');
    const resumed = fresh.advance(loaded, 300, { dtMaxS: 6 });
    write('resumed-result.json', resumed);
    equal(fresh.encode(resumed.state), fixture.adapter.encode(moving.state), 'exact complete moving restart');
    const replay = fresh.excavate(resumed.state, fixture.command);
    equal(replay.state, resumed.state, 'command replay after flow cannot export or excavate again');
    check(replay.replayed, 'accepted original command receipt recognized');
    const frames = moving.receipt.steps.map(step => ({ timeS: step.endS,
      cells: geometry.nodes.map((node, i) => ({ id: node.id, kind: node.kind,
        at: node.at ?? null, massKg: step.massKg[i],
        ...(node.kind === 'pit' ? { depthM: step.massKg[i] / 1000 } : {}) })),
      faceTransferKg: step.ledger.transferKg }));
    write('moving-frames.json', { units: { mass: 'kg', depth: 'm', voxelSpacingM: [1, .54, 1] },
      faceIds: geometry.faces.map(f => f.id), exportedWaterKg: moving.balance.exportWaterKg, frames });
    return { flow, balance: moving.balance, restartPitKg: prefix.balance.pitWaterKg,
      work: moving.work, residualMaxima: moving.receipt.maxAbsMetrics, recordingFrames: frames.length };
  });
  group('unsupported edits, backfill, rim and work failures preserve canonical input', () => {
    rejectUnchanged(fixture.adapter, fixture.input, () => fixture.adapter.excavate(fixture.input,
      { ...fixture.command, expectedWorldRevision: 1 }), 'stale edit', /stale/);
    rejectUnchanged(fixture.adapter, fixture.input, () => fixture.adapter.excavate(fixture.input,
      { ...fixture.command, at: [fixture.target[0], fixture.target[1] - 1, fixture.target[2]] }),
      'buried unvented edit');
    rejectUnchanged(fixture.adapter, moving.state, () => fixture.adapter.backfill(moving.state),
      'backfill without displacement', /backfill/);
    rejectUnchanged(fixture.adapter, moving.state, () => fixture.adapter.excavate(moving.state,
      { ...fixture.command, operationId: 'different-cut' }), 'second cut', /second/);
    rejectUnchanged(fixture.adapter, excavation.state, () => fixture.adapter.advance(excavation.state, 6,
      { dtMaxS: 6, maxMatrixUpdates: 1 }), 'hard solver budget', /budget/);
    const corrupt = structuredClone(moving.state); corrupt.exports[0].waterKg += 1;
    checks++; assert.throws(() => fixture.adapter.decode(JSON.stringify(corrupt)), 'corrupt export must reject');
    const owner = createVolume(excavation.state.soilGeometry), pitIndex = geometry.nodes.findIndex(n => n.kind === 'pit');
    const stocks = geometry.nodes.map((n, i) => ({ nodeId: n.id,
      massKg: i === pitIndex ? 540.0001 : excavation.state.soilState.massKg[i] }));
    checks++; assert.throws(() => owner.initial({ stocks }), /capacity/, 'over-rim stock is rejected, not clamped');
    equal(Object.keys(moving.state.soilState).sort(), ['identity', 'initialTotalKg', 'massKg', 'steps', 'timeS', 'version'],
      'save has canonical mass, clock and identity only; no pressure cache');
    return { rejectedKinds: 7, finiteGasClaim: false, backfill: 'unsupported', overflow: 'unsupported' };
  });
  report.checks = checks; report.elapsedMs = performance.now() - start;
  report.cpuMicros = process.cpuUsage(cpu); report.rssBytes = process.memoryUsage().rss;
  write('proof.json', report);
  process.stdout.write(`${JSON.stringify({ status: 'passed', groups: report.groups.length, checks,
    elapsedMs: report.elapsedMs, cpuMicros: report.cpuMicros, rssBytes: report.rssBytes })}\n`);
} catch (error) {
  write('failure.json', { ...report, active, checks, elapsedMs: performance.now() - start,
    error: { name: error.name, message: error.message, stack: error.stack,
      candidate: error.candidate, partial: error.partial } });
  throw error;
}
