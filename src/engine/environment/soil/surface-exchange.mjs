import { requireCondition } from './soil.mjs';

export const SURFACE_EXCHANGE_VERSION = 'broad-crested-normalized-cms-067-v1';
const FIELDS = ['leftSurfaceM', 'rightSurfaceM', 'crestM', 'openingLengthM', 'coefficient'];
const GRAVITY_M_S2 = 9.81, SUBMERGENCE_ONSET = 0.67, SUBMERGENCE_SPAN = 0.33;
const ZERO = Object.freeze({ volumeRateM3S: 0, derivativeLeftM2S: 0, derivativeRightM2S: 0 });

function admit(input) {
  requireCondition(input !== null && typeof input === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(input)), 'surface exchange requires a plain record');
  const properties = Object.getOwnPropertyDescriptors(input);
  requireCondition(Reflect.ownKeys(properties).length === FIELDS.length && FIELDS.every(key =>
    Object.hasOwn(properties, key) && Object.hasOwn(properties[key], 'value') &&
    Number.isFinite(properties[key].value)), 'exact finite surface exchange data fields');
  const values = Object.fromEntries(FIELDS.map(key => [key, properties[key].value]));
  requireCondition(values.openingLengthM > 0 && values.coefficient >= 0 && values.coefficient <= 1,
    'positive opening length and dimensionless coefficient in 0..1');
  return values;
}

// USACE CMS SR-24-3, equations 6-10/6-12 (p58): broad-crested overflow
// Q=C' sqrt(g) L hu^1.5 with a submerged cubic fit. Its rounded coefficient
// 27.8 is normalized to 1/.33^3 so equal surfaces have exactly zero flow.
// https://erdc-library.erdc.dren.mil/server/api/core/bitstreams/465be97e-91c2-4fdd-8827-ab31cd518c8d/content
// This head-driven game-scale relation carries no momentum, wave or jet state;
// it does not repair or qualify the retained failed SWE moving-ledge method.
export function surfaceExchange(input) {
  const { leftSurfaceM, rightSurfaceM, crestM, openingLengthM, coefficient } = admit(input);
  if (coefficient === 0) return ZERO;
  const forward = leftSurfaceM >= rightSurfaceM;
  const up = forward ? leftSurfaceM : rightSurfaceM, down = forward ? rightSurfaceM : leftSurfaceM;
  const hu = Math.max(up - crestM, 0), hd = Math.max(down - crestM, 0);
  requireCondition(Number.isFinite(hu) && Number.isFinite(hd), 'representable surface heads');
  if (hu === 0) return ZERO;
  const scale = coefficient * Math.sqrt(GRAVITY_M_S2) * openingLengthM * Math.sqrt(hu);
  const ratio = hd / hu;
  let factor = 1, factorSlope = 0;
  if (ratio > SUBMERGENCE_ONSET) {
    // t=(1-r)/.33; use the physical surface difference to preserve small
    // nonzero discharges when hd/hu rounds to one. 1-(1-t)^3 is evaluated
    // without subtracting nearly equal powers.
    const t = ((up - down) / hu) / SUBMERGENCE_SPAN;
    factor = t * (3 - 3 * t + t * t);
    factorSlope = -3 * (1 - t) ** 2 / SUBMERGENCE_SPAN;
  }
  const rate = scale * (hu * factor);
  const upstreamSlope = scale * (1.5 * factor - ratio * factorSlope);
  const downstreamSlope = scale * factorSlope;
  const result = {
    volumeRateM3S: rate === 0 ? 0 : forward ? rate : -rate,
    derivativeLeftM2S: forward ? upstreamSlope : -downstreamSlope,
    derivativeRightM2S: forward ? downstreamSlope : -upstreamSlope,
  };
  requireCondition(Object.values(result).every(Number.isFinite), 'representable surface discharge and derivatives');
  return Object.freeze(result);
}
