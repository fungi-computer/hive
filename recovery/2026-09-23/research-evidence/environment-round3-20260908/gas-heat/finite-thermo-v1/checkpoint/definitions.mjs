import { UNIVERSAL_GAS_CONSTANT as R } from './thermodynamics.mjs';

// Deliberately calorically perfect inert study definitions, not chemical kinetics.
// Constant cv is an approximation within the declared study envelope. The energy
// zero at 0 K is an algebraic convention; the model is NOT qualified near 0 K.
export const INERT_DEFINITION = Object.freeze({
  version: 'inert-air-helium-constant-capacity-v1',
  energyConvention: 'constant-cv-u-zero-at-zero-k',
  species: Object.freeze([
    Object.freeze({
      id: 'inert-air',
      molarMassKgPerMol: 0.02897,
      cvJPerKgK: 2.5 * R / 0.02897,
      minTemperatureK: 200,
      maxTemperatureK: 600,
    }),
    Object.freeze({
      id: 'inert-helium',
      molarMassKgPerMol: 0.004002602,
      cvJPerKgK: 1.5 * R / 0.004002602,
      minTemperatureK: 200,
      maxTemperatureK: 600,
    }),
  ]),
});
