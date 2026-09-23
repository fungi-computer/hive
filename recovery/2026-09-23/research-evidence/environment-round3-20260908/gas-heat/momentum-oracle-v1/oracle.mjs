// Continuous manufactured Euler flow. No simulation, mesh, projection or
// discrete transport imports: averages are analytic integrals over a box.
export const ORACLE_VERSION = 'cyclic-periodic-euler-volume-average-v1';
const positive = (x) => Number.isFinite(x) && x > 0;
const sinc = (x) => x === 0 ? 1 : Math.sin(x) / x;
const assert = (ok, message) => { if (!ok) throw new RangeError(message); };

export function createMomentumOracle({ lengthsM, densityKgPerM3,
  amplitudeMPerS = 0.04, angularFrequencyPerS = 1,
  pressureAmplitudeM2PerS2 = 0.001 }) {
  assert(Array.isArray(lengthsM) && lengthsM.length === 3 && lengthsM.every(positive), 'three positive domain lengths');
  assert(positive(densityKgPerM3) && positive(amplitudeMPerS) && positive(angularFrequencyPerS)
    && positive(pressureAmplitudeM2PerS2), 'finite positive oracle parameters');
  const lengths = [...lengthsM], wave = lengths.map((l) => 2 * Math.PI / l);
  const rho = densityKgPerM3, A0 = amplitudeMPerS, omega = angularFrequencyPerS, B = pressureAmplitudeM2PerS2;
  const identity = JSON.stringify({ version: ORACLE_VERSION, lengthsM: lengths, densityKgPerM3: rho,
    amplitudeMPerS: A0, angularFrequencyPerS: omega, pressureAmplitudeM2PerS2: B });

  function averages(centerM, widthsM, timeS) {
    assert(Array.isArray(centerM) && centerM.length === 3 && centerM.every(Number.isFinite), 'finite three-coordinate center');
    assert(Array.isArray(widthsM) && widthsM.length === 3 && widthsM.every((w, a) => Number.isFinite(w) && w >= 0 && w <= lengths[a]), 'box widths within one period; zero denotes point sampling');
    assert(Number.isFinite(timeS) && timeS >= 0, 'finite nonnegative time');
    const phase = centerM.map((x, a) => wave[a] * x);
    assert(phase.every(Number.isFinite) && Number.isFinite(omega * timeS), 'representable analytic phase');
    const attenuation = widthsM.map((w, a) => sinc(wave[a] * w / 2));
    const sine = phase.map((p, a) => Math.sin(p) * attenuation[a]);
    const cosine = phase.map((p, a) => Math.cos(p) * attenuation[a]);
    const sineSquared = phase.map((p, a) => (1 - Math.cos(2 * p) * sinc(wave[a] * widthsM[a])) / 2);
    const A = A0 * Math.cos(omega * timeS), Adot = -A0 * omega * Math.sin(omega * timeS);
    const velocity = [], timeDerivative = [], advection = [], gradient = [], acceleration = [];
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3, c = (a + 2) % 3;
      velocity[a] = A * sine[b];
      timeDerivative[a] = Adot * sine[b];
      advection[a] = A * A * wave[b] * cosine[b] * sine[c];
      gradient[a] = -rho * B * wave[a] * sine[a] * cosine[b] * cosine[c];
      acceleration[a] = timeDerivative[a] + advection[a] + gradient[a] / rho;
    }
    return {
      velocityMPerS: velocity,
      momentumDensityKgM2S: velocity.map((u) => rho * u),
      velocityTimeDerivativeMPerS2: timeDerivative,
      advectiveAccelerationMPerS2: advection,
      bodyAccelerationMPerS2: acceleration,
      perturbationPressurePa: rho * B * cosine.reduce((p, c) => p * c, 1),
      pressureGradientPaPerM: gradient,
      kineticEnergyDensityJPerM3: 0.5 * rho * A * A * sineSquared.reduce((s, v) => s + v, 0),
    };
  }
  return Object.freeze({ identity, averages });
}
