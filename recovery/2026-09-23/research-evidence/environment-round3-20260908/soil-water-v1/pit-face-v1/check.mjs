import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createSoil, REFERENCE_SOIL } from '../column-v1/source-v2/soil.mjs';
import { verticalPitFace } from './vertical-face.mjs';

const soil = createSoil(REFERENCE_SOIL);
const geometry = { soilCenterYM: .27, baseYM: 0, heightM: .54, widthM: 1,
  soilDistanceM: .25, traceDistanceM: .25 };
const pairs = [[-.8, -.2], [-.8, .1], [-.1, -.2], [-.1, .07], [-.1, .3],
  [.1, -.2], [.1, .1], [.1, .4], [.5, .2], [.5, .6], [-.4, .6]];
const proof = { scope: 'Integrated side boundary only; no physical region advancement',
  source: createHash('sha256').update(readFileSync(new URL('./vertical-face.mjs', import.meta.url))).digest('hex'),
  cases: [], quadratureSamples: 16384, checks: 0, status: 'running' };
function check(condition, label) { proof.checks++; assert(condition, label); }

function quadrature(input) {
  const k = soil.at(input.soilHeadM).conductivityMPerS;
  const ks = soil.at(0).conductivityMPerS;
  const resistance = input.soilDistanceM / k + input.traceDistanceM / ks;
  const dz = input.heightM / proof.quadratureSamples;
  const surface = input.baseYM + Math.max(0, input.pitHeadM);
  const totalSoil = input.soilHeadM + input.soilCenterYM;
  let rate = 0;
  for (let i = 0; i < proof.quadratureSamples; i++) {
    const z = input.baseYM + (i + .5) * dz;
    const submerged = z < surface;
    const traceHead = submerged ? surface - z : 0;
    const signed = (totalSoil - z - traceHead) / resistance;
    rate += input.widthM * dz * (submerged ? signed : Math.max(0, signed));
  }
  return rate;
}

try {
  for (const [soilHeadM, pitHeadM] of pairs) {
    const input = { ...geometry, soilHeadM, pitHeadM }, result = verticalPitFace(soil, input);
    const independent = quadrature(input);
    const quadratureError = Math.abs(independent - result.volumeRateM3S);
    // Independent midpoint quadrature has a waterline jump for infiltration
    // and one continuous seepage kink. Bound its own integration error rather
    // than accepting one loose absolute tolerance for tiny and large flows.
    const dz = geometry.heightM / proof.quadratureSamples;
    const s = soilHeadM + geometry.soilCenterYM - geometry.baseYM;
    const depth = Math.max(pitHeadM, 0);
    const mobility = geometry.widthM / (geometry.soilDistanceM / soil.at(soilHeadM).conductivityMPerS +
      geometry.traceDistanceM / soil.at(0).conductivityMPerS);
    const jump = depth > 0 && depth < geometry.heightM ? Math.max(depth - s, 0) : 0;
    const quadratureBound = mobility * (.5 * dz * jump + dz * dz / 4) +
      512 * Number.EPSILON * mobility * Math.max(1, geometry.heightM * (Math.abs(s) + depth + geometry.heightM));
    check(quadratureError <= quadratureBound, 'independent pointwise wet/seepage quadrature');
    const derivativeErrors = {};
    for (const [key, field] of [['soilHeadM', 'derivativeSoilM2S'], ['pitHeadM', 'derivativePitM2S']]) {
      const epsilon = 1e-6;
      const lower = verticalPitFace(soil, { ...input, [key]: input[key] - epsilon }).volumeRateM3S;
      const upper = verticalPitFace(soil, { ...input, [key]: input[key] + epsilon }).volumeRateM3S;
      const difference = (upper - lower) / (2 * epsilon);
      derivativeErrors[key] = Math.abs(difference - result[field]);
      check(derivativeErrors[key] <= 1e-11 + 1e-7 * Math.abs(result[field]), 'analytic normal-flux Jacobian');
    }
    if (pitHeadM < 0) check(result.volumeRateM3S >= 0 && result.derivativePitM2S === 0,
      'negative floor multiplier cannot draw through exposed sides');
    if (pitHeadM > 0 && soilHeadM + .27 < pitHeadM)
      check(result.volumeRateM3S < 0, 'submerged side permits finite pond infiltration');
    proof.cases.push({ soilHeadM, pitHeadM, result, quadratureError, quadratureBound, derivativeErrors });
  }
  for (const depth of [0, .05, .2, .4, .54, .7]) {
    const result = verticalPitFace(soil, { ...geometry, pitHeadM: depth, soilHeadM: depth - .27 });
    check(Math.abs(result.volumeRateM3S) < 1e-18, 'wet/dry hydrostatic face remains at rest');
  }
  for (const depth of [0, .54]) {
    const before = verticalPitFace(soil, { ...geometry, soilHeadM: -.1, pitHeadM: depth - 1e-9 });
    const after = verticalPitFace(soil, { ...geometry, soilHeadM: -.1, pitHeadM: depth + 1e-9 });
    check(Math.abs(after.volumeRateM3S - before.volumeRateM3S) < 1e-12,
      'continuous side flux at empty/fully wet waterline');
  }
  proof.status = 'passed';
} catch (error) {
  proof.status = 'failed'; proof.error = error.message; process.exitCode = 1;
} finally {
  writeFileSync(new URL('./proof-v2.json', import.meta.url), JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify({ status: proof.status, checks: proof.checks,
    completedCases: proof.cases.length, error: proof.error }));
}
