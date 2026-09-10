import { z } from "zod";
import type { CompiledAtmosphere, CompiledVolume } from "./definition.ts";
import type {
  AtmosphereFacts,
  AtmosphereParcel,
  AtmosphereState,
} from "./types.ts";

const finite = z.number().finite();
const parcelSchema = z.strictObject({
  volumeId: z.string().min(1).max(160),
  carrierKg: finite.nonnegative(),
  smokeKg: finite.nonnegative(),
  heatJ: finite,
});
const stateSchema = z.strictObject({
  version: z.literal("connected-atmosphere-state-v1"),
  identity: z.string().min(1),
  parcels: z.array(parcelSchema).min(1),
  initialCarrierKg: finite.positive(),
  initialSmokeKg: finite.nonnegative(),
  initialHeatJ: finite,
  smokeSourceKg: finite.nonnegative(),
  heatSourceJ: finite,
  carrierBoundaryKg: finite,
  smokeBoundaryKg: finite,
  heatBoundaryJ: finite,
});

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

function tolerance(values: readonly number[]) {
  return (
    256 *
    Number.EPSILON *
    Math.max(1, ...values.map((value) => Math.abs(value))) *
    Math.max(1, values.length)
  );
}

export function parcelTemperature(
  g: CompiledAtmosphere,
  parcel: AtmosphereParcel,
) {
  if (parcel.carrierKg === 0)
    return parcel.smokeKg === 0 && parcel.heatJ === 0
      ? g.definition.ambient.temperatureK
      : Number.POSITIVE_INFINITY;
  return (
    g.definition.ambient.temperatureK +
    parcel.heatJ / (parcel.carrierKg * g.definition.model.heatCapacityJKgK)
  );
}

export function parcelPressure(
  g: CompiledAtmosphere,
  volume: CompiledVolume,
  parcel: AtmosphereParcel,
) {
  return (
    (parcel.carrierKg *
      g.definition.model.specificGasConstantJKgK *
      parcelTemperature(g, parcel)) /
    volume.volumeM3
  );
}

function validatePhysicalParcel(
  g: CompiledAtmosphere,
  volume: CompiledVolume,
  parcel: AtmosphereParcel,
) {
  const temperatureK = parcelTemperature(g, parcel),
    pressurePa = parcelPressure(g, volume, parcel),
    pressureRatio = pressurePa / g.definition.ambient.pressurePa,
    model = g.definition.model;
  if (
    !Number.isFinite(temperatureK) ||
    Math.abs(temperatureK - g.definition.ambient.temperatureK) >
      model.maxTemperatureDeltaK ||
    !Number.isFinite(pressureRatio) ||
    (parcel.carrierKg > 0 && pressureRatio < 1 / model.maxPressureRatio) ||
    pressureRatio > model.maxPressureRatio ||
    (parcel.carrierKg === 0
      ? parcel.smokeKg !== 0 || parcel.heatJ !== 0
      : parcel.smokeKg / parcel.carrierKg > model.maxSmokeMassFraction)
  )
    throw new Error(
      `atmosphere parcel ${parcel.volumeId} exceeds its envelope`,
    );
}

function balance(state: AtmosphereState) {
  const carrier = [
      ...state.parcels.map((entry) => entry.carrierKg),
      state.carrierBoundaryKg,
      -state.initialCarrierKg,
    ],
    smoke = [
      ...state.parcels.map((entry) => entry.smokeKg),
      state.smokeBoundaryKg,
      -state.smokeSourceKg,
      -state.initialSmokeKg,
    ],
    heat = [
      ...state.parcels.map((entry) => entry.heatJ),
      state.heatBoundaryJ,
      -state.heatSourceJ,
      -state.initialHeatJ,
    ];
  const result = {
    carrierKg: sum(carrier),
    smokeKg: sum(smoke),
    heatJ: sum(heat),
  };
  if (
    Math.abs(result.carrierKg) > tolerance(carrier) ||
    Math.abs(result.smokeKg) > tolerance(smoke) ||
    Math.abs(result.heatJ) > tolerance(heat)
  )
    throw new Error("atmosphere stock and ledger balance disagree");
  return result;
}

export function validateState(
  g: CompiledAtmosphere,
  input: unknown,
): AtmosphereState {
  const state = stateSchema.parse(input);
  if (
    state.identity !== g.identity ||
    state.parcels.length !== g.volumes.length ||
    state.parcels.some((entry, index) => entry.volumeId !== g.volumes[index].id)
  )
    throw new Error("atmosphere state and definition identity disagree");
  state.parcels.forEach((entry, index) =>
    validatePhysicalParcel(g, g.volumes[index], entry),
  );
  balance(state);
  return state;
}

export function copyState(state: AtmosphereState): AtmosphereState {
  return Object.freeze({
    ...state,
    parcels: Object.freeze(
      state.parcels.map((entry) => Object.freeze({ ...entry })),
    ),
  });
}

export function initialState(g: CompiledAtmosphere, input: unknown) {
  const parsed = z.array(parcelSchema).parse(input);
  if (
    parsed.length !== g.volumes.length ||
    new Set(parsed.map((entry) => entry.volumeId)).size !== parsed.length
  )
    throw new Error("atmosphere initial state needs one parcel per volume");
  const byId = new Map(parsed.map((entry) => [entry.volumeId, entry]));
  const parcels = g.volumes.map((entry) => {
    const parcel = byId.get(entry.id);
    if (!parcel)
      throw new Error(`atmosphere initial parcel missing ${entry.id}`);
    return parcel;
  });
  const state = {
    version: "connected-atmosphere-state-v1" as const,
    identity: g.identity,
    parcels,
    initialCarrierKg: sum(parcels.map((entry) => entry.carrierKg)),
    initialSmokeKg: sum(parcels.map((entry) => entry.smokeKg)),
    initialHeatJ: sum(parcels.map((entry) => entry.heatJ)),
    smokeSourceKg: 0,
    heatSourceJ: 0,
    carrierBoundaryKg: 0,
    smokeBoundaryKg: 0,
    heatBoundaryJ: 0,
  };
  validateState(g, state);
  return copyState(state);
}

export function atmosphereFacts(g: CompiledAtmosphere, input: unknown) {
  const state = validateState(g, input),
    result: AtmosphereFacts = {
      volumes: Object.freeze(
        state.parcels.map((parcel, index) => {
          const volume = g.volumes[index],
            temperatureK = parcelTemperature(g, parcel);
          return Object.freeze({
            ...parcel,
            volumeM3: volume.volumeM3,
            elevationM: volume.elevationM,
            pressurePa: parcelPressure(g, volume, parcel),
            temperatureK,
            smokeKgM3: parcel.smokeKg / volume.volumeM3,
          });
        }),
      ),
      balance: Object.freeze(balance(state)),
    };
  return Object.freeze(result);
}
