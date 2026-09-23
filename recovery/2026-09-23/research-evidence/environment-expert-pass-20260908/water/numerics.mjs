// Isolated falsification fixture, not Hive code or a validated hydraulic solver.
// SI units; two rectangular storage cells. No dependencies or production imports.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const g = 9.81;
const clone = value => JSON.parse(JSON.stringify(value));
const sum = values => values.reduce((a, b) => a + b, 0);

// All transports (surface, soil, withdrawal) must enter one proposal set.
// Conservative capacity policy does not borrow space freed in this substep.
function settle(cells, proposals) {
  const ordered = proposals.toSorted((a, b) => a.id.localeCompare(b.id));
  const outgoing = cells.map(() => 0);
  for (const p of ordered) outgoing[p.from] += p.volume;
  const donor = cells.map((c, i) => outgoing[i] ? Math.min(1, c.v / outgoing[i]) : 1);
  const incoming = cells.map(() => 0);
  for (const p of ordered) incoming[p.to] += p.volume * donor[p.from];
  const room = cells.map((c, i) => incoming[i]
    ? Math.min(1, Math.max(0, (c.cap ?? Infinity) - c.v) / incoming[i]) : 1);
  const accepted = ordered.map(p => ({ ...p, volume: p.volume * donor[p.from] * room[p.to] }));
  const next = clone(cells);
  for (const p of accepted) { next[p.from].v -= p.volume; next[p.to].v += p.volume; }
  for (const c of next) assert(c.v >= -1e-12 && c.v <= (c.cap ?? Infinity) + 1e-12);
  return { cells: next, accepted };
}

function substep(state, dt, method) {
  const [left, right] = state.cells;
  const etaL = left.z + left.v / left.area;
  const etaR = right.z + right.v / right.area;
  const h = Math.max(0, Math.max(etaL, etaR) - Math.max(left.z, right.z, state.sill));
  const gradient = (etaR - etaL) / state.length;
  let q = 0;
  if (h > 1e-8) {
    if (method === 'explicit-diffusion') {
      q = -Math.sign(gradient) * h ** (5 / 3) * Math.sqrt(Math.abs(gradient)) / state.n;
    } else {
      // Two-cell closed domain: the two neighbouring collinear boundary faces
      // have zero discharge; de Almeida-style theta averaging reduces to theta*q.
      q = (state.theta * state.q - g * h * dt * gradient)
        / (1 + g * dt * state.n ** 2 * Math.abs(state.q) / h ** (7 / 3));
    }
  }
  const proposal = { id: 'face', from: q >= 0 ? 0 : 1, to: q >= 0 ? 1 : 0,
    volume: Math.abs(q) * state.width * dt };
  const result = settle(state.cells, [proposal]);
  // Persist the actually accepted discharge, not an unspent hidden request.
  return { ...state, cells: result.cells, q: Math.sign(q) * result.accepted[0].volume / (state.width * dt) };
}

function makeState(delta = 0) {
  return { cells: [{ z: 0, area: 1, v: 1 + delta }, { z: 0.25, area: 1, v: 0.75 - delta }],
    q: 0, sill: 0, length: 1, width: 1, n: 0.04, theta: 0.7 };
}

function run(state, count, dt, method) {
  const total = sum(state.cells.map(c => c.v));
  let maxLevelDifference = 0, maxMassError = 0, signFlips = 0, previousSign = 0;
  for (let i = 0; i < count; i++) {
    state = substep(state, dt, method);
    const diff = state.cells[0].z + state.cells[0].v - state.cells[1].z - state.cells[1].v;
    maxLevelDifference = Math.max(maxLevelDifference, Math.abs(diff));
    maxMassError = Math.max(maxMassError, Math.abs(sum(state.cells.map(c => c.v)) - total));
    const sign = Math.sign(diff);
    if (sign && previousSign && sign !== previousSign) signFlips++;
    previousSign = sign;
  }
  return { state, maxLevelDifference, maxMassError, signFlips };
}

const started = performance.now();
const result = { scope: 'two-cell SI fixture; no 2D performance or production claim', dtSeconds: 0.05, steps: 2000 };
result.rest = run(makeState(), 2000, 0.05, 'local-inertial');
assert.deepEqual(result.rest.state, makeState());
result.diffusionPerturbation = run(makeState(1e-6), 2000, 0.05, 'explicit-diffusion');
result.inertialPerturbation = run(makeState(1e-6), 2000, 0.05, 'local-inertial');
// Reject the fixed-step explicit Manning + stock limiter candidate on this fixture.
assert(result.diffusionPerturbation.maxLevelDifference > 1000 * 2e-6);
assert(result.inertialPerturbation.maxLevelDifference <= 2e-6);

const starCells = [{ v: 1 }, { v: 0, cap: 0.1 }, { v: 0, cap: 0.2 }, { v: 0 }, { v: 0 }];
const starProposals = [1, 2, 3, 4].map(to => ({ id: `to-${to}`, from: 0, to, volume: 0.8 }));
result.sharedLimiter = settle(starCells, starProposals);
assert.deepEqual(result.sharedLimiter, settle(starCells, starProposals.toReversed()));
assert(Math.abs(sum(result.sharedLimiter.cells.map(c => c.v)) - 1) < 1e-12);

const checkpoint = run(makeState(0.1), 5, 0.05, 'local-inertial').state;
const direct = run(checkpoint, 50, 0.05, 'local-inertial');
const resumed = run(clone(checkpoint), 50, 0.05, 'local-inertial');
const resetQ = run({ ...clone(checkpoint), q: 0 }, 50, 0.05, 'local-inertial');
assert.deepEqual(direct, resumed);
result.restart = { exactWithQ: true, finalVolumeDifferenceIfQDiscardedM3: Math.abs(direct.state.cells[0].v - resetQ.state.cells[0].v) };
assert(result.restart.finalVolumeDifferenceIfQDiscardedM3 > 1e-6);

const dug = makeState();
dug.cells[1].z -= 0.25;
const afterDig = run(dug, 2000, 0.05, 'local-inertial');
result.dig = { beforeVolume: sum(dug.cells.map(c => c.v)), afterVolume: sum(afterDig.state.cells.map(c => c.v)),
  afterCells: afterDig.state.cells, transportedIntoExcavation: afterDig.state.cells[1].v - dug.cells[1].v };
assert(result.dig.transportedIntoExcavation > 0.1);
assert(Math.abs(result.dig.beforeVolume - result.dig.afterVolume) < 1e-12);

result.execution = { node: process.version, platform: process.platform, arch: process.arch,
  elapsedMs: performance.now() - started, timestamp: new Date().toISOString() };
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
