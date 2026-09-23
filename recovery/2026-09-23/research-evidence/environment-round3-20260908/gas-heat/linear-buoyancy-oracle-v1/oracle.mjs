// Independent continuous initial-acceleration limit, not a time integrator.
// No numerical solver, geometry, pressure or transport imports.
const VERSION = 'sealed-y-periodic-xz-linear-buoyancy-average-v1';
const positive = x => Number.isFinite(x) && x > 0;
const sinc = x => x === 0 ? 1 : Math.sin(x) / x;
const requireValue = (ok, message) => { if (!ok) throw new RangeError(message); };

export function createBuoyancyOracle({ lengthsM, densityKgM3, epsilon,
  gravityMS2 = 9.81, varyingZ = true }) {
  requireValue(Array.isArray(lengthsM) && lengthsM.length === 3 && lengthsM.every(positive),
    'three finite positive physical lengths');
  requireValue(positive(densityKgM3) && positive(epsilon) && epsilon <= 0.1 &&
    positive(gravityMS2) && typeof varyingZ === 'boolean', 'bounded physical reference parameters');
  const lengths = [...lengthsM], rho = densityKgM3, B = gravityMS2 * epsilon;
  const k = [2 * Math.PI / lengths[0], Math.PI / lengths[1], varyingZ ? 2 * Math.PI / lengths[2] : 0];
  const k2 = k.reduce((sum, value) => sum + value * value, 0);
  requireValue(Number.isFinite(k2) && k2 > 0 && Number.isFinite(rho * B), 'representable reference scales');
  const identity = JSON.stringify({ version: VERSION, lengthsM: lengths, densityKgM3: rho,
    epsilon, gravityMS2, varyingZ });

  function averages(centerM, widthsM) {
    requireValue(Array.isArray(centerM) && centerM.length === 3 && centerM.every(Number.isFinite),
      'finite three-coordinate center');
    requireValue(Array.isArray(widthsM) && widthsM.length === 3 &&
      widthsM.every((width, axis) => Number.isFinite(width) && width >= 0 && width <= lengths[axis]),
    'bounded physical averaging widths; zero means a point or face');
    const phase = centerM.map((x, axis) => x * k[axis]);
    requireValue(phase.every(Number.isFinite), 'representable analytic phase');
    const attenuation = widthsM.map((width, axis) => sinc(k[axis] * width / 2));
    const s = phase.map((x, axis) => Math.sin(x) * attenuation[axis]);
    const c = phase.map((x, axis) => Math.cos(x) * attenuation[axis]);
    const shape = c[0] * s[1] * c[2];
    const pressureGradientPaM = [
      rho * B * k[1] * k[0] / k2 * s[0] * c[1] * c[2],
      rho * B * k[1] ** 2 / k2 * c[0] * s[1] * c[2],
      rho * B * k[1] * k[2] / k2 * c[0] * c[1] * s[2],
    ];
    return {
      densityKgM3: rho * (1 - epsilon * shape),
      densityAnomalyKgM3: -rho * epsilon * shape,
      buoyancyMS2: B * shape,
      accelerationMS2: [-pressureGradientPaM[0] / rho,
        B * (k[0] ** 2 + k[2] ** 2) / k2 * shape, -pressureGradientPaM[2] / rho],
      pressurePerturbationPa: -rho * B * k[1] / k2 * c[0] * c[1] * c[2],
      pressureGradientPaM,
    };
  }
  return Object.freeze({ identity, averages });
}
