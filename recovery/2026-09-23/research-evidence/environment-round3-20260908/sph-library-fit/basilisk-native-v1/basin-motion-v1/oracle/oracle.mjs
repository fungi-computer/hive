// Independent linear potential-flow reference; never advances fluid state.
const positive = x => Number.isFinite(x) && x > 0;
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };

export function createStandingWave(input) {
  const keys = ['lengthM', 'waterDepthM', 'airDepthM', 'waterDensityKgM3',
    'airDensityKgM3', 'gravityMS2', 'amplitudeM'];
  requireValue(input && Object.keys(input).sort().join('|') === [...keys].sort().join('|') &&
    keys.every(k => positive(input[k])), 'exact positive SI wave definition');
  const d = Object.freeze({ ...input });
  requireValue(d.waterDensityKgM3 > d.airDensityKgM3 &&
    d.amplitudeM <= 0.01 * Math.min(d.waterDepthM, d.airDepthM),
    'stable phases and small-amplitude reference envelope');
  const k = Math.PI / d.lengthM;
  requireValue(positive(k) && k * Math.max(d.waterDepthM, d.airDepthM) <= 20 &&
    k * d.amplitudeM <= .01, 'bounded depth and small-steepness reference envelope');
  const waterCoth = 1 / Math.tanh(k * d.waterDepthM);
  const airCoth = 1 / Math.tanh(k * d.airDepthM);
  const omega = Math.sqrt((d.waterDensityKgM3 - d.airDensityKgM3) * d.gravityMS2 * k /
    (d.waterDensityKgM3 * waterCoth + d.airDensityKgM3 * airCoth));
  const energy = (d.waterDensityKgM3 - d.airDensityKgM3) * d.gravityMS2 *
    d.lengthM * d.amplitudeM ** 2 / 4;
  const period = 2 * Math.PI / omega;
  requireValue([omega, energy, period].every(positive), 'finite positive derived wave scales');

  function time(t) {
    requireValue(Number.isFinite(t) && t >= 0 && t <= 1000 * period, 'bounded physical reference time');
    return { sin: Math.sin(omega * t), cos: Math.cos(omega * t) };
  }

  function mode(t) {
    const phase = time(t);
    return { amplitudeM: d.amplitudeM * phase.cos,
      amplitudeRateMS: -d.amplitudeM * omega * phase.sin,
      kineticEnergyJPerM: energy * phase.sin ** 2,
      potentialEnergyAboveFlatJPerM: energy * phase.cos ** 2,
      totalPerturbationEnergyJPerM: energy };
  }

  function field(phaseName, xM, yM, t) {
    requireValue(phaseName === 'water' || phaseName === 'air', 'named physical phase');
    requireValue(Number.isFinite(xM) && xM >= 0 && xM <= d.lengthM && Number.isFinite(yM),
      'reference horizontal coordinate');
    const water = phaseName === 'water';
    requireValue(water ? yM >= -d.waterDepthM && yM <= 0 : yM >= 0 && yM <= d.airDepthM,
      'coordinate within the flat reference phase domain');
    const depth = water ? d.waterDepthM : d.airDepthM;
    const distance = water ? yM + depth : depth - yM;
    const density = water ? d.waterDensityKgM3 : d.airDensityKgM3;
    const coefficient = (water ? -1 : 1) * d.amplitudeM * omega / (k * Math.sinh(k * depth));
    const temporal = time(t), cosX = Math.cos(k * xM), sinX = Math.sin(k * xM);
    const coshY = Math.cosh(k * distance), sinhY = Math.sinh(k * distance);
    return { potentialM2S: coefficient * coshY * cosX * temporal.sin,
      velocityMS: [-k * coefficient * coshY * sinX * temporal.sin,
        (water ? 1 : -1) * k * coefficient * sinhY * cosX * temporal.sin],
      pressurePerturbationPa: -density * coefficient * omega * coshY * cosX * temporal.cos };
  }

  return Object.freeze({ definition: d, wavenumberPerM: k, omegaPerS: omega,
    periodS: period, mode, field });
}
