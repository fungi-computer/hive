import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { compensatedSum } from '../../column-v1/source-v2/soil.mjs';
import { balanceTolerance, maxAbs } from '../state.mjs';
import { createVolume } from '../volume.mjs';
import { FIXTURE, createMovingBlock, movingBlockDescriptor } from './fixture.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url)), output = process.argv[2];
assert.ok(output && !fs.existsSync(output), 'fresh explicit moving-block output required');
fs.mkdirSync(output, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const files = ['CONTRACT.md', 'fixture.mjs', 'qualify.mjs', '../CONTRACT.md', '../geometry.mjs', '../faces.mjs',
  '../residual.mjs', '../state.mjs', '../guess.mjs', '../linear.mjs', '../newton.mjs', '../closure.mjs',
  '../volume.mjs', '../../column-v1/source-v2/soil.mjs'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inventory = Object.fromEntries(files.map(name => {
  const bytes = fs.readFileSync(path.resolve(directory, name));
  const destination = path.join(output, 'sources', name.replaceAll('../', 'parent/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes);
  return [name, digest(bytes)];
}));
write('source-inventory.json', inventory);
const start = performance.now(), cpu = process.cpuUsage(), report = { inventory, fixture: FIXTURE, groups: [], progress: [] };
let checks = 0;
const check = (value, label) => { checks++; assert.ok(value, label); };
const near = (value, expected, tolerance, label) => check(Number.isFinite(value) && Math.abs(value - expected) <= tolerance,
  `${label}: ${value} vs ${expected}, tolerance ${tolerance}`);
function group(name, run) {
  report.currentGroup = name; report.progress = []; const before = checks;
  write('progress.json', report);
  const facts = run(); report.groups.push({ name, checks: checks - before, ...facts }); write('progress.json', report);
}
function checkpoint(facts) { report.progress.push(facts); write('progress.json', report); }

function soilNodes(g) { return g.nodes.map((node, index) => ({ node, index })).filter(x => x.node.kind === 'soil'); }
function symmetryPairs(g) {
  const indices = new Map(soilNodes(g).map(({ node, index }) => [node.at.join(','), index]));
  return soilNodes(g).flatMap(({ node, index }) => {
    const [x, y, z] = node.at;
    return [[-x, y, z], [x, y, -z], [z, y, x]].map(at => [index, indices.get(at.join(','))]);
  });
}

function verifyLedger(g, initial, result) {
  const tolerance = balanceTolerance(initial.initialTotalKg), pairs = symmetryPairs(g);
  let oldMass = [...initial.massKg], maxPairKg = 0, maxSymmetryKg = 0, symmetryTimeS = initial.timeS;
  for (const step of result.receipt.steps) {
    const paired = [...oldMass];
    for (const [k, face] of g.faces.entries()) {
      paired[face.left] -= step.ledger.transferKg[k]; paired[face.right] += step.ledger.transferKg[k];
    }
    const pairKg = maxAbs(paired.map((m, i) => m - step.massKg[i]));
    maxPairKg = Math.max(maxPairKg, pairKg);
    near(pairKg, 0, tolerance, 'independent every-face paired stock reconstruction');
    near(compensatedSum(step.massKg), initial.initialTotalKg, tolerance, 'every accepted finite total');
    check(step.massKg.every((m, i) => m >= g.nodes[i].minMassKg && m <= g.nodes[i].maxMassKg), 'strict pore/pond bounds');
    const metric = step.metrics;
    check([metric.mixedKg, metric.constitutiveKg, metric.darcyKg, metric.treeCorrectionKg].every(x => x <= 2e-9) &&
      Math.abs(metric.rootCompatibilityKg) <= tolerance && metric.chordDifferenceKg === 0 && metric.complementarityM2 <= 1e-12,
    'all original mixed/face/root/chord/complementarity limits');
    const symmetry = maxAbs(pairs.map(([a, b]) => step.massKg[a] - step.massKg[b]));
    if (symmetry > maxSymmetryKg) { maxSymmetryKg = symmetry; symmetryTimeS = step.endS; }
    near(symmetry, 0, FIXTURE.symmetryKg, 'x/z reflection and interchange symmetry at every accepted endpoint');
    oldMass = step.massKg;
  }
  return { maxPairKg, maxSymmetryKg, symmetryTimeS };
}

function transferFacts(g, result) {
  const interiorAbsoluteKg = [0, 0, 0];
  for (const step of result.receipt.steps) for (const [k, face] of g.faces.entries())
    if (!face.boundary) interiorAbsoluteKg[face.axis] += Math.abs(step.ledger.transferKg[k]);
  const pond = g.nodes.findIndex(n => n.kind === 'reservoir');
  const dry = result.receipt.steps.find(s => s.massKg[pond] === 0);
  return { interiorAbsoluteKg, pondMassKg: result.state.massKg[pond],
    pondDryBracketS: dry ? [dry.startS, dry.endS] : null };
}

function writeCellRecording(name, g, initial, result) {
  const soils = soilNodes(g), pond = g.nodes.findIndex(n => n.kind === 'reservoir');
  const cells = soils.map(({ node, index }) => ({ nodeId: node.id, voxel: node.at, centerM: node.centerM,
    soilId: node.soilId, initialMassKg: initial.massKg[index], volumeM3: node.volumeM3,
    poreCapacityKg: node.maxMassKg, densityKgM3: g.densityKgM3 }));
  const frame = (timeS, mass, transfer = null) => {
    const net = Array(g.nodes.length).fill(0);
    if (transfer) for (const [k, face] of g.faces.entries()) {
      net[face.left] -= transfer[k]; net[face.right] += transfer[k];
    }
    return { timeS, pondMassKg: mass[pond], massKg: soils.map(({ index }) => mass[index]),
      theta: soils.map(({ node, index }) => mass[index] / (g.densityKgM3 * node.volumeM3)),
      poreAirM3: soils.map(({ node, index }) => (node.maxMassKg - mass[index]) / g.densityKgM3),
      netFaceTransferKg: transfer ? soils.map(({ index }) => net[index]) : null };
  };
  write(name, { schema: 'soil-block-physical-recording-v1', units: 'metres-seconds-kilograms',
    sourceIdentity: initial.identity, cells, frames: [frame(initial.timeS, initial.massKg),
      ...result.receipt.steps.map(s => frame(s.endS, s.massKg, s.ledger.transferKg))],
    note: 'Arrays index the stable cells list. Water masses are canonical stocks and transfers come from paired faces. poreAirM3 is available vented pore void capacity, not finite gas inventory. Values are not display-normalized.' });
}

const completed = new Map();
try {
  group('fixed geometry and canonical hydrostatic initial soil stock', () => {
    const { g, owner, initial } = createMovingBlock();
    check(g.nodes.length === 28 && g.faces.length === 55 && g.closedFaces.length === 53,
      '27 soils, one pond,54 interior faces and53 closed exterior faces');
    check(g.faces.filter(f => f.boundary).length === 1, 'exactly one explicit finite water port');
    const closed = new Set(g.closedFaces.map(f => f.id));
    check(g.faces.every(f => !closed.has(f.id)), 'no closed exterior face appears in transfer ledger');
    const read = owner.read(initial);
    check(read.nodes.filter(n => n.kind === 'soil').every(n => n.retentionHeadM < 0 && n.poreAirM3 > 0),
      'all initial soil stock is genuinely unsaturated');
    for (const { node, index } of soilNodes(g)) near(read.nodes[index].retentionHeadM + node.centerM[1],
      FIXTURE.totalHeadM, 2e-12, 'canonical hydrostatic stock retains initial total head');
    near(initial.massKg.at(-1), 1, 0, 'finite pond starts with exactly one kilogram');
    checkpoint({ identity: owner.identity, totalKg: read.totalMassKg, nodes: read.nodes });
    return { unknowns: g.nodes.length, activeFaces: g.faces.length, closedFaces: g.closedFaces.length,
      chords: g.tree.chords.length, initialTotalKg: read.totalMassKg };
  });

  group('genuinely moving nonlinear 3D infiltration at three fixed timesteps', () => {
    const runs = [];
    for (const dtS of FIXTURE.dtS) {
      const f = createMovingBlock(), before = f.owner.encode(f.initial);
      const result = f.owner.advance(f.initial, FIXTURE.endS, { dtMaxS: dtS });
      write(`dt${dtS}-result.json`, result); checkpoint({ dtS, work: result.work, maxima: result.receipt.maxAbsMetrics });
      writeCellRecording(`dt${dtS}-cells.json`, f.g, f.initial, result);
      check(f.owner.encode(f.initial) === before, 'successful request never mutates caller input');
      const law = verifyLedger(f.g, f.initial, result), flow = transferFacts(f.g, result);
      const centre = f.g.nodes.findIndex(n => n.id === 'cell:0,-1,0');
      const gainKg = result.state.massKg[centre] - f.initial.massKg[centre];
      check(flow.pondMassKg === 0, 'fixed600s horizon exhausts the finite pond');
      check(gainKg >= FIXTURE.minimumCentralGainKg, 'central upper soil receives a meaningful finite stock');
      check(flow.interiorAbsoluteKg.every(m => m > FIXTURE.minimumInteriorAxisTransferKg),
        'real internal x/y/z transfer, beyond floating noise and boundary-only inflow');
      check(result.work.matrixBuilds > 0 && result.work.iterations > 0 && result.work.peakDenseBytes === 28 * 28 * 8,
        'actual moving28-unknown Newton/LU workload');
      check(result.work.matrixUpdates <= 30000000 && result.receipt.steps.length <= 512, 'unchanged work/step bounds');
      const facts = { dtS, gainKg, ...law, ...flow, work: result.work, maxima: result.receipt.maxAbsMetrics,
        aggregateResidual: result.receipt.aggregateResidual, rejectedStages: result.receipt.rejectedStages };
      checkpoint(facts); runs.push(facts); completed.set(dtS, { ...f, result });
    }
    return { runs };
  });

  group('fixed-mesh nonlinear time self-refinement', () => {
    const theta = dt => {
      const run = completed.get(dt);
      return soilNodes(run.g).map(({ node, index }) => run.result.state.massKg[index] /
        (run.g.densityKgM3 * node.volumeM3));
    };
    const a = theta(12), b = theta(6), c = theta(3);
    const coarseDifferenceTheta = maxAbs(a.map((v, i) => v - b[i]));
    const fineDifferenceTheta = maxAbs(b.map((v, i) => v - c[i]));
    checkpoint({ coarseDifferenceTheta, fineDifferenceTheta });
    check(fineDifferenceTheta <= FIXTURE.refinementFactor * coarseDifferenceTheta + FIXTURE.refinementFloorTheta,
      'dt6/3 profile difference decreases relative to dt12/6');
    return { coarseDifferenceTheta, fineDifferenceTheta,
      scope: 'same-owner time self-convergence at fixed mesh; not independent continuum or spatial convergence' };
  });

  group('actual moving file restart with deterministic canonical pressure rebuild', () => {
    const f = createMovingBlock(), first = f.owner.advance(f.initial, FIXTURE.restartS, { dtMaxS: 3 });
    write('restart-first.json', first); checkpoint({ phase: 'before-save', work: first.work });
    const last = first.receipt.steps.at(-1);
    check(f.g.faces.some((face, k) => !face.boundary && Math.abs(last.ledger.transferKg[k]) > 1e-7),
      'actual saved state has meaningful ongoing internal flow');
    const raw = f.owner.encode(first.state); fs.writeFileSync(path.join(output, 'moving-soil-save.json'), raw);
    const fresh = createVolume(movingBlockDescriptor());
    const loaded = fresh.decode(fs.readFileSync(path.join(output, 'moving-soil-save.json'), 'utf8'));
    const continued = fresh.advance(loaded, FIXTURE.endS - FIXTURE.restartS, { dtMaxS: 3 });
    write('restart-continued.json', continued); checkpoint({ phase: 'continued', work: continued.work });
    verifyLedger(f.g, f.initial, first); verifyLedger(f.g, loaded, continued);
    check(fresh.encode(continued.state) === f.owner.encode(completed.get(3).result.state),
      'fresh file restart exactly matches the complete moving unsplit state');
    return { savedTimeS: loaded.timeS, finalTimeS: continued.state.timeS,
      savedHash: digest(raw), finalHash: digest(fresh.encode(continued.state)),
      firstWork: first.work, continuedWork: continued.work };
  });
  for (const file of files) check(digest(fs.readFileSync(path.resolve(directory, file))) === inventory[file],
    'all runtime/reference/caller sources remain frozen');
  report.status = 'passed'; report.checks = checks; delete report.currentGroup;
  report.elapsedMs = performance.now() - start; report.cpuMicros = process.cpuUsage(cpu); report.rssBytes = process.memoryUsage().rss;
  report.timingScope = 'one shared-host qualifier window after imports/source freezing; includes full receipts/recordings and restart work; not solver-only benchmark';
  write('proof.json', report);
  process.stdout.write(JSON.stringify({ status: report.status, groups: report.groups.length, checks, elapsedMs: report.elapsedMs }) + '\n');
} catch (error) {
  write('failure.json', { ...report, checks, elapsedMs: performance.now() - start,
    error: { name: error.name, message: error.message, stack: error.stack, candidate: error.candidate, partial: error.partial } });
  throw error;
}
