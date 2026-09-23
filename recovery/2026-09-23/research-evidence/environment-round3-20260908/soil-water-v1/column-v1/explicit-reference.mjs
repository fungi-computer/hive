import { createSoil, compensatedSum, requireCondition } from './soil.mjs';

// Independent time integrator for the fixed, entirely unsaturated, sealed-base
// exhaustion fixture. It does not call the BE residual, Newton, geometry or
// conservation-closure implementation. Constitutive definition is shared.
export function explicitUnsaturatedReference({ cells, lengthM, areaM2, initialHeadM,
  pondDepthM, intervalS, dtMaxS = 0.025, maxSteps = 65536 }, definition) {
  requireCondition(Number.isSafeInteger(cells) && cells >= 2 && cells <= 64 &&
    [lengthM, areaM2, intervalS, dtMaxS, pondDepthM].every(Number.isFinite) &&
    lengthM > 0 && lengthM <= 8 && areaM2 > 0 && areaM2 <= 4 && intervalS > 0 && intervalS <= 1200 &&
    pondDepthM > 0 && dtMaxS > 0 && dtMaxS <= 0.025 &&
    Number.isSafeInteger(maxSteps) && maxSteps > 0 && maxSteps <= 65536, 'bounded independent reference');
  const soil = createSoil(definition), rho = soil.definition.densityKgM3;
  const dz = lengthM / cells, volume = dz * areaM2;
  const minimum = rho * volume * soil.minimumTheta;
  const capacity = rho * volume * soil.definition.porosity;
  const mass = Array(cells).fill(rho * volume * soil.at(initialHeadM).theta);
  let pond = rho * areaM2 * pondDepthM, time = 0, steps = 0, exhaustedAt = null;
  const initialTotal = compensatedSum([pond, ...mass]);
  let minimumMarginKg = Infinity;
  while (time < intervalS) {
    requireCondition(++steps <= maxSteps, 'independent explicit reference step budget');
    const heads = mass.map(m => soil.unsaturatedHead(m / (rho * volume)));
    const conductivity = heads.map(h => soil.at(h).conductivityMPerS);
    const flux = Array(cells + 1).fill(0);
    if (pond > 0) {
      const boundaryHead = pond / (rho * areaM2), boundaryK = soil.at(boundaryHead).conductivityMPerS;
      flux[0] = areaM2 * (boundaryHead - heads[0] + dz / 2) /
        (dz / 4 / boundaryK + dz / 4 / conductivity[0]);
      requireCondition(flux[0] > 0, 'reference supports wet infiltration, not saturated seepage');
    }
    for (let i = 1; i < cells; i++) flux[i] =
      areaM2 * (heads[i - 1] - heads[i] + dz) /
      (dz / 2 / conductivity[i - 1] + dz / 2 / conductivity[i]);
    let dt = Math.min(dtMaxS, intervalS - time);
    for (let i = 0; i < cells; i++) {
      const rate = rho * (flux[i] - flux[i + 1]);
      if (rate !== 0) dt = Math.min(dt, 0.1 *
        (rate > 0 ? capacity - mass[i] : mass[i] - minimum) / Math.abs(rate));
    }
    const pondDt = pond > 0 ? pond / (rho * flux[0]) : Infinity;
    const exhausts = pondDt <= dt;
    if (exhausts) dt = pondDt;
    requireCondition(Number.isFinite(dt) && (dt >= 1e-8 || dt === intervalS - time) && time + dt > time,
      'independent reference needs unsupported saturated/dry solve or finer work');
    const transfer = flux.map(q => rho * dt * q);
    if (exhausts) transfer[0] = pond; // Exact finite-donor event, same paired debit/credit.
    pond -= transfer[0];
    for (let i = 0; i < cells; i++) {
      mass[i] += transfer[i] - transfer[i + 1];
      requireCondition(mass[i] > minimum && mass[i] < capacity,
        'independent explicit reference left its strictly unsaturated scope');
      minimumMarginKg = Math.min(minimumMarginKg, mass[i] - minimum, capacity - mass[i]);
    }
    time += dt;
    if (exhausts && exhaustedAt === null) exhaustedAt = time;
  }
  return { massKg: mass, pondMassKg: pond, theta: mass.map(m => m / (rho * volume)),
    exhaustedAtS: exhaustedAt, steps, timeS: time, minimumMarginKg,
    massErrorKg: compensatedSum([pond, ...mass]) - initialTotal };
}
