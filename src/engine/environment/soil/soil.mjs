export const SOIL_FIELDS = Object.freeze(['id', 'thetaR', 'porosity', 'alphaPerM', 'n', 'ksMPerS', 'ell', 'minHeadM', 'maxHeadM', 'densityKgM3']);

export function requireCondition(ok, message) {
  if (!ok) throw new Error(message);
}

export function compensatedSum(values) {
  let total = 0, correction = 0;
  for (const x of values) {
    const y = x - correction, next = total + y;
    correction = (next - total) - y; total = next;
  }
  return total;
}

export function createSoil(input) {
  requireCondition(input && Object.keys(input).sort().join('|') ===
    [...SOIL_FIELDS].sort().join('|'), 'exact soil definition fields');
  const d = Object.freeze({ ...input });
  requireCondition(typeof d.id === 'string' && d.id.length > 0 && d.id.length <= 96,
    'soil definition identity');
  requireCondition(Object.entries(d).every(([key, value]) => key === 'id' || Number.isFinite(value)),
    'finite SI soil coefficients');
  requireCondition(d.thetaR >= 0 && d.thetaR < d.porosity && d.porosity < 1 &&
    d.alphaPerM > 0 && d.alphaPerM <= 10 && d.n >= 2 && d.n <= 4 &&
    d.ksMPerS > 0 && d.ksMPerS <= 0.01 && d.ell >= 0 && d.ell <= 2 &&
    d.minHeadM >= -20 && d.minHeadM < 0 && d.maxHeadM > 0 && d.maxHeadM <= 20 &&
    d.densityKgM3 === 1000, 'supported rigid-pore definition envelope');
  const m = 1 - 1 / d.n, span = d.porosity - d.thetaR;

  function at(headM) {
    requireCondition(Number.isFinite(headM) && headM >= d.minHeadM && headM <= d.maxHeadM,
      'head outside soil definition envelope');
    if (headM >= 0) return { theta: d.porosity, capacityPerM: 0,
      conductivityMPerS: d.ksMPerS, conductivityDerivativePerS: 0 };
    const y = -d.alphaPerM * headM, x = y ** d.n;
    const se = Math.exp(-m * Math.log1p(x));
    const sePrime = m * d.n * d.alphaPerM * y ** (d.n - 1) * se / (1 + x);
    const ratio = x / (1 + x), b = -Math.expm1(m * Math.log(ratio));
    const bPrime = m * d.n * d.alphaPerM * y ** (d.n * m - 1) /
      (1 + x) ** (m + 1);
    const seEll = se ** d.ell;
    const conductivityMPerS = d.ksMPerS * seEll * b * b;
    const conductivityDerivativePerS = d.ksMPerS * seEll *
      (d.ell * sePrime / se * b * b + 2 * b * bPrime);
    requireCondition(Number.isFinite(conductivityMPerS) && conductivityMPerS > 0 &&
      Number.isFinite(conductivityDerivativePerS), 'representable positive retention conductivity');
    return { theta: d.thetaR + span * se, capacityPerM: span * sePrime,
      conductivityMPerS, conductivityDerivativePerS };
  }

  const minimumTheta = at(d.minHeadM).theta;
  function unsaturatedHead(theta) {
    requireCondition(Number.isFinite(theta) && theta >= minimumTheta && theta < d.porosity,
      'strictly unsaturated water content in finite envelope');
    const se = (theta - d.thetaR) / span;
    const head = -(Math.expm1(-Math.log(se) / m) ** (1 / d.n)) / d.alphaPerM;
    // Inverse evaluation may differ by one ulp at the declared endpoint.
    // Return that exact endpoint only if the input is exactly its forward value.
    return theta === minimumTheta ? d.minHeadM : head;
  }

  return Object.freeze({ definition: d, identity: JSON.stringify(d), at,
    unsaturatedHead, minimumTheta });
}
