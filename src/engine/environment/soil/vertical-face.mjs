import { requireCondition } from './soil.mjs';

// One signed soil -> pit rate. No stock, geometry, solver or clock mutation.
export function verticalPitFace(soil, input) {
  const { soilHeadM, soilCenterYM, baseYM, heightM, widthM, pitHeadM,
    soilDistanceM, traceDistanceM } = input;
  requireCondition(Object.values(input).every(Number.isFinite) &&
    heightM > 0 && widthM > 0 && soilDistanceM > 0 && traceDistanceM > 0,
    'finite vertical contact geometry and head');
  const properties = soil.at(soilHeadM), saturated = soil.at(0);
  const leftResistance = soilDistanceM / properties.conductivityMPerS;
  const resistance = leftResistance + traceDistanceM / saturated.conductivityMPerS;
  const mobility = widthM / resistance;
  const s = soilHeadM + soilCenterYM - baseYM;
  const depth = Math.max(pitHeadM, 0), wet = Math.min(heightM, depth);
  const seep = Math.max(0, Math.min(heightM, s) - wet);
  // Stable trapezoid/triangle integral; avoid subtracting two large squares.
  const dryIntegral = seep * (s - wet - seep / 2);
  const bracket = wet * (s - depth) + dryIntegral;
  const mobilitySlope = mobility * leftResistance / resistance *
    properties.conductivityDerivativePerS / properties.conductivityMPerS;
  const depthSlope = pitHeadM < 0 ? 0 : depth >= heightM ? -heightM :
    -wet + Math.min(s - depth, 0);
  const result = {
    volumeRateM3S: mobility * bracket,
    derivativeSoilM2S: mobilitySlope * bracket + mobility * (wet + seep),
    derivativePitM2S: mobility * depthSlope,
    wetHeightM: wet,
    seepageHeightM: seep,
  };
  requireCondition(Object.values(result).every(Number.isFinite),
    'finite integrated contact rate and derivatives');
  return Object.freeze(result);
}
