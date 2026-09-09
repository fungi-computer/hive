import { array, assert, record } from "./data.mjs";

export const LIMITS = Object.freeze({
  maxIntervalS: 6,
  maxDtS: 0.2,
  minDtS: 1e-6,
  maxSteps: 512,
  maxTrials: 512,
  maxHalvings: 12,
  maxProjectionIterations: 65536,
});

export function budget(work, key, limit) {
  assert(
    work[key] < work[limit],
    `air ${key} work budget exhausted; input uncommitted`,
  );
  work[key]++;
}

function boundedInteger(value, maximum, label) {
  assert(Number.isSafeInteger(value) && value > 0 && value <= maximum, label);
  return value;
}

function sourceRates(g, input) {
  array(input, g.n);
  const seen = new Set();
  const sources = input.map((source) => {
    record(source, ["cellId", "smokeKgS", "heatJS"]);
    const cell = g.cellIndex.get(source.cellId);
    assert(
      cell !== undefined && g.fluid[cell] && !seen.has(cell),
      "unique known fluid source cell",
    );
    seen.add(cell);
    assert(
      Number.isFinite(source.smokeKgS) &&
        source.smokeKgS >= 0 &&
        Number.isFinite(source.heatJS),
      "finite smoke and signed heat rates",
    );
    return { cell, smokeKgS: source.smokeKgS, heatJS: source.heatJS };
  });
  return sources.sort((a, b) => a.cell - b.cell);
}

export function admitRequest(g, input, intervalS, options) {
  record(
    options,
    [],
    ["sources", "dtMaxS", "maxSteps", "maxTrials", "maxProjectionIterations"],
  );
  const endS = input.timeS + intervalS,
    dtMaxS = options.dtMaxS ?? LIMITS.maxDtS;
  assert(
    Number.isFinite(intervalS) &&
      intervalS >= 0 &&
      intervalS <= LIMITS.maxIntervalS &&
      (intervalS === 0 || intervalS >= LIMITS.minDtS),
    "bounded air interval",
  );
  assert(
    Number.isFinite(endS) && (intervalS === 0 || endS > input.timeS),
    "representable air interval",
  );
  assert(
    intervalS === 0 ||
      Number.EPSILON * Math.max(1, input.timeS, endS) <= LIMITS.minDtS / 16,
    "absolute air clock resolution too coarse",
  );
  assert(
    Number.isFinite(dtMaxS) &&
      dtMaxS >= LIMITS.minDtS &&
      dtMaxS <= LIMITS.maxDtS,
    "bounded air timestep",
  );
  const maxSteps = boundedInteger(
    options.maxSteps ?? LIMITS.maxSteps,
    LIMITS.maxSteps,
    "bounded air accepted steps",
  );
  const maxTrials = boundedInteger(
    options.maxTrials ?? LIMITS.maxTrials,
    LIMITS.maxTrials,
    "bounded air trials",
  );
  const maxProjectionIterations = boundedInteger(
    options.maxProjectionIterations ?? LIMITS.maxProjectionIterations,
    LIMITS.maxProjectionIterations,
    "bounded air projection work",
  );
  assert(
    Math.ceil(intervalS / dtMaxS) <= Math.min(maxSteps, maxTrials) &&
      Number.isSafeInteger(input.steps + maxSteps),
    "requested air interval exceeds step/trial budget",
  );
  return {
    intervalS,
    endS,
    dtMaxS,
    maxSteps,
    maxTrials,
    maxProjectionIterations,
    sources: sourceRates(g, options.sources ?? []),
  };
}

export function newWork(request) {
  return {
    accepted: 0,
    trials: 0,
    rejected: 0,
    projections: 0,
    projectionIterations: 0,
    maxAccepted: request.maxSteps,
    maxTrials: request.maxTrials,
    maxRejected: request.maxTrials,
    maxProjections: request.maxTrials,
    maxProjectionIterations: request.maxProjectionIterations,
  };
}

export function proposedStep(elapsed, compensation, request) {
  const remaining = request.intervalS - elapsed + compensation;
  const roundoff =
    16 * Number.EPSILON * Math.max(1, request.intervalS, request.dtMaxS);
  if (remaining <= request.dtMaxS + roundoff)
    return remaining <= LIMITS.maxDtS ? remaining : remaining / 2;
  return request.dtMaxS;
}
