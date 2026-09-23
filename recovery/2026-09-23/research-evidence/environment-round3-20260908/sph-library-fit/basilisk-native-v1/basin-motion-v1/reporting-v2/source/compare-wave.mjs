// Passive comparison with the separately qualified oracle. No field updates.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStandingWave } from './oracle/oracle.mjs';

const oraclePath = fileURLToPath(new URL('./oracle/oracle.mjs', import.meta.url));
const oracleSha256 = createHash('sha256').update(readFileSync(oraclePath)).digest('hex');
if (oracleSha256 !== '1b9ae075cc53816831945a0f9f8f023f6bf395da53352ac4dfe8ceeb02076c84')
  throw new Error('unreviewed oracle bytes');
const oracle = createStandingWave({ lengthM: 1, waterDepthM: .54, airDepthM: .54,
  waterDensityKgM3: 1000, airDensityKgM3: 1.2, gravityMS2: 9.81, amplitudeM: .002 });
const limits = Object.freeze({
  coarse: { delta: .02, columns: 50, cells: 2700, profile: .08, rms: .05,
    period: .02, crossing: .01, returned: .08, energy: .12 },
  fine: { delta: .01, columns: 100, cells: 10800, profile: .04, rms: .025,
    period: .01, crossing: .005, returned: .04, energy: .06 },
});
const finite = x => typeof x === 'number' && Number.isFinite(x);
const near = (a, b, tol = 1e-12) => finite(a) && finite(b) && Math.abs(a - b) <= tol;
const all = object => Object.values(object).every(Boolean);
const max = xs => xs.length ? Math.max(...xs) : null;

function profile(row, grid) {
  const heights = row.columnHeightsM;
  const times = [row.nominalFractionTimeSeconds, row.velocityTimeSeconds];
  if (!Array.isArray(heights) || heights.length !== grid.columns ||
      !heights.every(finite) || !times.every(finite) || times.some(t => t < 0))
    throw new Error('invalid column profile or field time');
  const k = oracle.wavenumberPerM, a = oracle.definition.amplitudeM;
  const sinc = Math.sin(k * grid.delta / 2) / (k * grid.delta / 2);
  const weights = heights.map((_, j) => sinc * Math.cos(k * (j + .5) * grid.delta));
  const eta = heights.map(h => h - oracle.definition.waterDepthM);
  const amplitude = eta.reduce((s, h, j) => s + h * weights[j], 0) /
    weights.reduce((s, w) => s + w * w, 0);
  const expected = oracle.mode(times[0]), velocityExpected = oracle.mode(times[1]);
  const l2 = Math.sqrt(eta.reduce((s, h, j) =>
    s + grid.delta * (h - expected.amplitudeM * weights[j]) ** 2, 0) / a ** 2);
  const residue = Math.sqrt(eta.reduce((s, h, j) =>
    s + grid.delta * (h - amplitude * weights[j]) ** 2, 0) / a ** 2);
  const K = row.kineticEnergyJPerMetre, PE = row.potentialAboveFlatJPerMetre;
  if (![K, PE, row.roundoffEnergyBoundJPerMetre].every(finite))
    throw new Error('invalid energy observation');
  const E0 = expected.totalPerturbationEnergyJPerM;
  const energyTarget = velocityExpected.kineticEnergyJPerM + expected.potentialEnergyAboveFlatJPerM;
  return { step: row.step, fractionTime: times[0], velocityTime: times[1],
    amplitudeM: amplitude, expectedAmplitudeM: expected.amplitudeM,
    signedModeError: (amplitude - expected.amplitudeM) / a,
    profileL2: l2, higherModeResidueL2: residue,
    kineticErrorOverE0: (K - velocityExpected.kineticEnergyJPerM) / E0,
    potentialErrorOverE0: (PE - expected.potentialEnergyAboveFlatJPerM) / E0,
    staggeredEnergyErrorOverE0: (K + PE - energyTarget) / E0,
    roundoffEnergyBoundOverE0: row.roundoffEnergyBoundJPerMetre / E0 };
}

function temporalMetrics(samples) {
  let squaredErrorIntegral = 0;
  const crossings = [];
  for (let j = 1; j < samples.length; j++) {
    const before = samples[j - 1], after = samples[j];
    const interval = after.fractionTime - before.fractionTime;
    if (!(interval > 0)) throw new Error('non-increasing nominal fraction time');
    squaredErrorIntegral += interval * (before.signedModeError ** 2 + after.signedModeError ** 2) / 2;
    let direction = null;
    if (before.amplitudeM > 0 && after.amplitudeM <= 0) direction = 'down';
    if (before.amplitudeM < 0 && after.amplitudeM >= 0) direction = 'up';
    if (direction) crossings.push({ direction, fractionTime: before.fractionTime + interval *
      before.amplitudeM / (before.amplitudeM - after.amplitudeM) });
  }
  const elapsed = samples.at(-1).fractionTime - samples[0].fractionTime;
  const down = crossings.filter(c => c.direction === 'down');
  const up = crossings.filter(c => c.direction === 'up');
  const onePair = down.length === 1 && up.length === 1 && up[0].fractionTime > down[0].fractionTime;
  const measuredPeriod = onePair ? 2 * (up[0].fractionTime - down[0].fractionTime) : null;
  return { timeWeightedModeRms: elapsed > 0 ? Math.sqrt(squaredErrorIntegral / elapsed) : null,
    integratedFractionTimeSeconds: elapsed, crossings, measuredPeriodSeconds: measuredPeriod,
    periodRelativeError: onePair ? Math.abs(measuredPeriod / oracle.periodS - 1) : null,
    firstCrossingPhaseError: down.length === 1 ? Math.abs(down[0].fractionTime / oracle.periodS - .25) : null,
    oneDownAndUpCrossing: onePair };
}

function nativeControls(capture, rows, grid) {
  const definitions = capture.rows.filter(r => r.kind === 'definition');
  const terminals = capture.rows.filter(r => r.kind === 'terminal');
  const definition = definitions[0], terminal = terminals[0];
  const initial = rows[0], steps = rows.slice(1);
  let previousTime = 0, previousDt = 0, transport = 0;
  let clocks = Boolean(initial && initial.step === 0 && steps.length);
  for (let j = 0; j < steps.length; j++) {
    const row = steps[j], dt = row.dtSeconds;
    transport += dt;
    clocks &&= row.step === j + 1 && row.vofInvocationCount === j + 1 &&
      finite(dt) && dt > 0 && dt <= oracle.periodS / 1600 * (1 + 1e-12) &&
      near(row.intervalBeginSeconds, previousTime) && near(row.previousDtSeconds, previousDt) &&
      near(row.velocityTimeSeconds, previousTime + dt) &&
      near(row.nominalFractionTimeSeconds, previousTime + dt / 2) &&
      near(row.vofTransportSeconds, transport);
    previousTime = row.velocityTimeSeconds; previousDt = dt;
  }
  const rowStates = rows.every(r => r.case === capture.caseName && r.valid === true && r.clockValid === true && r.solveValid === true &&
    r.nonfiniteCount === 0 && r.invalidColumnCells === 0 && r.invalidMomentCells === 0 &&
    r.cells === grid.cells && near(r.areaM2, 1.08, 1e-10) &&
    near(r.waterM3PerMetre, .54, 1e-10) && near(r.airM3PerMetre, .54, 1e-10) &&
    r.fractionMin >= -1e-12 && r.fractionMax <= 1 + 1e-12 &&
    finite(r.wallNormalSpeedMps) && r.wallNormalSpeedMps <= 1e-6);
  return {
    nativeCompleted: capture.exitCode === 0 && !capture.timedOut,
    recordsDecoded: capture.parseErrors.length === 0 && capture.nonfiniteTokens.length === 0,
    nativeStderrEmpty: capture.stderrBytes === 0,
    oneFixedDefinition: definitions.length === 1 && definition.case === capture.caseName &&
      near(definition.widthM, 1) && near(definition.heightM, 1.08) && near(definition.waterDepthM, .54) &&
      near(definition.amplitudeM, .002) && near(definition.gravityMps2, 9.81) &&
      near(definition.waterDensityKgM3, 1000) && near(definition.airDensityKgM3, 1.2) &&
      near(definition.periodSeconds, oracle.periodS) && near(definition.dtCapSeconds, oracle.periodS / 1600) &&
      near(definition.deltaM, grid.delta) && definition.columns === grid.columns &&
      definition.expectedCells === grid.cells && definition.dimension === 2 && definition.unitDepthM === 1 &&
      definition.maxSteps === 2000 && Number.isInteger(definition.observerWorkspaceBytes) &&
      definition.observerWorkspaceBytes > 0,
    actualNativeStateControls: rows.length > 1 && rowStates,
    oneInitial: rows.filter(r => r.step === 0).length === 1 && initial.step === 0 &&
      near(initial.velocityTimeSeconds, 0) && near(initial.nominalFractionTimeSeconds, 0),
    contiguousIntervalsAndOneVofPerStep: clocks,
    actualProjectionConvergence: steps.length > 0 && steps.every(r => finite(r.projectionResidual) &&
      finite(r.projectionTarget) && r.projectionResidual <= r.projectionTarget &&
      near(r.projectionTarget, 1e-10 / r.dtSeconds ** 2) && r.projectionIterations < 100),
    completedOnePeriod: near(previousTime, oracle.periodS),
    oneCompletedTerminal: terminals.length === 1 && terminal.exitCode === 0 && terminal.completedInterval === true &&
      terminal.steps === steps.length && near(terminal.completedSeconds, oracle.periodS) &&
      terminal.vofInvocationCount === steps.length && near(terminal.vofTransportSeconds, transport),
  };
}

function compareCase(capture) {
  const grid = limits[capture.caseName];
  if (!grid) return { caseName: capture.caseName, passed: false, error: 'unexpected fixed case' };
  try {
    const rows = capture.rows.filter(r => r.kind === 'observation');
    const controls = nativeControls(capture, rows, grid);
    const samples = rows.map(row => profile(row, grid));
    const temporal = temporalMetrics(samples);
    const maxima = {
      profileL2: max(samples.map(s => s.profileL2)),
      higherModeResidueL2: max(samples.map(s => s.higherModeResidueL2)),
      staggeredEnergyErrorOverE0: max(samples.map(s => Math.abs(s.staggeredEnergyErrorOverE0))),
      kineticErrorOverE0: max(samples.map(s => Math.abs(s.kineticErrorOverE0))),
      potentialErrorOverE0: max(samples.map(s => Math.abs(s.potentialErrorOverE0))),
      roundoffEnergyBoundOverE0: max(samples.map(s => s.roundoffEnergyBoundOverE0)),
    };
    const initialAmplitudeError = Math.abs(samples[0].signedModeError);
    const returnAmplitudeError = Math.abs(samples.at(-1).signedModeError);
    const completedInterval = controls.nativeCompleted && controls.completedOnePeriod &&
      controls.oneCompletedTerminal;
    const coverage = {
      status: completedInterval ? 'completed fixed interval' : 'partial recorded interval; no case qualification',
      completedInterval,
      firstNominalFractionTimeSeconds: samples[0].fractionTime,
      lastNominalFractionTimeSeconds: samples.at(-1).fractionTime,
      firstVelocityTimeSeconds: samples[0].velocityTime,
      lastVelocityTimeSeconds: samples.at(-1).velocityTime,
    };
    const accuracy = {
      initialRepresentation: initialAmplitudeError <= .002,
      fullProfile: finite(maxima.profileL2) && maxima.profileL2 <= grid.profile,
      signedModeRms: finite(temporal.timeWeightedModeRms) && temporal.timeWeightedModeRms <= grid.rms,
      period: temporal.oneDownAndUpCrossing && temporal.periodRelativeError <= grid.period,
      firstCrossing: finite(temporal.firstCrossingPhaseError) && temporal.firstCrossingPhaseError <= grid.crossing,
      returnedAmplitude: completedInterval && returnAmplitudeError <= grid.returned,
      staggeredEnergyDiagnostic: finite(maxima.staggeredEnergyErrorOverE0) && maxima.staggeredEnergyErrorOverE0 <= grid.energy,
      boundedRoundoffEnergyUncertainty: samples.every(s => finite(s.roundoffEnergyBoundOverE0) &&
        s.roundoffEnergyBoundOverE0 >= 0 && s.roundoffEnergyBoundOverE0 <= 2e-6),
    };
    return { caseName: capture.caseName, passed: all(controls) && all(accuracy), controls, accuracy,
      coverage,
      accuracyScope: 'Profile, RMS, energy and first-crossing flags describe the recorded interval only; returned amplitude requires completion. Overall acceptance still requires every native control.',
      limits: grid, initialAmplitudeError,
      lastRecordedAmplitudeError: returnAmplitudeError,
      returnAmplitudeError: completedInterval ? returnAmplitudeError : null, temporal, maxima,
      terminal: capture.rows.find(r => r.kind === 'terminal') ?? null, samples };
  } catch (error) {
    return { caseName: capture.caseName, passed: false, error: String(error.message),
      scope: 'incomplete/invalid diagnostic records; raw capture preserved' };
  }
}

const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const cases = input.cases.map(compareCase);
const coarse = cases.find(c => c.caseName === 'coarse'), fine = cases.find(c => c.caseName === 'fine');
const coarseRms = coarse?.temporal?.timeWeightedModeRms, fineRms = fine?.temporal?.timeWeightedModeRms;
const matchedCompleteInterval = Boolean(coarse?.coverage?.completedInterval && fine?.coverage?.completedInterval &&
  near(coarse.coverage.firstNominalFractionTimeSeconds, fine.coverage.firstNominalFractionTimeSeconds) &&
  near(coarse.coverage.lastNominalFractionTimeSeconds, fine.coverage.lastNominalFractionTimeSeconds));
const refinement = matchedCompleteInterval && finite(coarseRms) && finite(fineRms) &&
  (fineRms <= .8 * coarseRms || (coarseRms <= .01 && fineRms <= .01));
const result = { scope: 'Fixed 2D linear-wave comparison with finite-amplitude and nominal-stage limitations. Energy is a staggered diagnostic.',
  oracleSha256, periodSeconds: oracle.periodS, omegaPerSecond: oracle.omegaPerS,
  sourceCapture: process.argv[2], cases, refinement: { passed: refinement,
    eligible: matchedCompleteInterval,
    status: matchedCompleteInterval ? 'matched completed interval' : 'not qualified: incomplete or unmatched intervals',
    coarseRms, fineRms,
    rule: 'fine <= .8 coarse, or both <= .01; no convergence-order claim' },
  passed: cases.length === 2 && cases.every(c => c.passed) && Boolean(coarse && fine) && refinement };
writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: result.passed, cases: cases.map(({ samples, ...c }) => c), refinement: result.refinement }, null, 2));
process.exitCode = result.passed ? 0 : 1;
