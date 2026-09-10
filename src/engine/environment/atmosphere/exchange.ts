import { resolveQuantityChange } from "../arithmetic.mjs";
import type { CompiledAtmosphere } from "./definition.ts";
import { parcelPressure, parcelTemperature } from "./state.ts";
import type { AtmosphereParcel, AtmosphereState } from "./types.ts";

type Quantity = "carrierKg" | "smokeKg" | "heatJ";
type MutableParcel = {
  -readonly [K in keyof AtmosphereParcel]: AtmosphereParcel[K];
};
export type MutableAtmosphere = {
  -readonly [K in keyof AtmosphereState]: K extends "parcels"
    ? MutableParcel[]
    : AtmosphereState[K];
};
type Flow = {
  left: number;
  right: number | null;
  mixedM3: number;
  /** Positive is left to right/ambient; negative is the reverse. */
  pressureM3: number;
};
const quantities = ["carrierKg", "smokeKg", "heatJ"] as const;
const boundaryKey = {
  carrierKg: "carrierBoundaryKg",
  smokeKg: "smokeBoundaryKg",
  heatJ: "heatBoundaryJ",
} as const;

function openingFlows(
  g: CompiledAtmosphere,
  parcels: readonly AtmosphereParcel[],
  dt: number,
): Flow[] {
  const { model, ambient } = g.definition;
  return g.openings
    .filter((opening) => opening.permeability > 0)
    .map((opening) => {
      const left = g.volumeIndex.get(opening.from)!,
        right = opening.to === null ? null : g.volumeIndex.get(opening.to)!,
        leftTemperature = parcelTemperature(g, parcels[left]),
        rightTemperature =
          right === null
            ? ambient.temperatureK
            : parcelTemperature(g, parcels[right]),
        leftElevation = g.volumes[left].elevationM,
        rightElevation =
          right === null ? opening.elevationM : g.volumes[right].elevationM,
        lowerTemperature =
          leftElevation <= rightElevation ? leftTemperature : rightTemperature,
        upperTemperature =
          leftElevation <= rightElevation ? rightTemperature : leftTemperature,
        buoyancy =
          model.buoyancyVelocityMPSK *
          Math.max(0, lowerTemperature - upperTemperature) *
          (Math.abs(rightElevation - leftElevation) / opening.distanceM),
        openingInterval = opening.areaM2 * opening.permeability * dt,
        leftPressure = parcelPressure(g, g.volumes[left], parcels[left]),
        rightPressure =
          right === null
            ? ambient.pressurePa
            : parcelPressure(g, g.volumes[right], parcels[right]);
      return {
        left,
        right,
        mixedM3: openingInterval * (model.mixingVelocityMPS + buoyancy),
        pressureM3:
          openingInterval *
          model.pressureVelocityMPSPa *
          (leftPressure - rightPressure),
      };
    });
}

/** Budget gross reciprocal mixing, not merely the smaller net stock change. */
function boundedFlows(g: CompiledAtmosphere, flows: readonly Flow[]): Flow[] {
  const outgoing = Array(g.volumes.length).fill(0),
    incoming = Array(g.volumes.length).fill(0);
  for (const flow of flows) {
    outgoing[flow.left] += flow.mixedM3 + Math.max(0, flow.pressureM3);
    incoming[flow.left] += flow.mixedM3 + Math.max(0, -flow.pressureM3);
    if (flow.right !== null) {
      outgoing[flow.right] += flow.mixedM3 + Math.max(0, -flow.pressureM3);
      incoming[flow.right] += flow.mixedM3 + Math.max(0, flow.pressureM3);
    }
  }
  const scales = (amounts: number[]) =>
    amounts.map((amount, index) =>
      amount === 0
        ? 1
        : Math.min(
            1,
            (g.volumes[index].volumeM3 *
              g.definition.model.maxExchangeFraction) /
              amount,
          ),
    );
  const out = scales(outgoing),
    into = scales(incoming);
  return flows.map((flow) => ({
    ...flow,
    // One two-way mixing volume respects both directions at both endpoints.
    mixedM3:
      flow.mixedM3 *
      Math.min(
        out[flow.left],
        into[flow.left],
        flow.right === null ? 1 : out[flow.right],
        flow.right === null ? 1 : into[flow.right],
      ),
    pressureM3:
      flow.pressureM3 *
      (flow.pressureM3 >= 0
        ? Math.min(out[flow.left], flow.right === null ? 1 : into[flow.right])
        : Math.min(into[flow.left], flow.right === null ? 1 : out[flow.right])),
  }));
}

function concentration(
  g: CompiledAtmosphere,
  parcels: readonly AtmosphereParcel[],
  index: number | null,
  quantity: Quantity,
) {
  if (index === null)
    return quantity === "carrierKg" ? g.ambientDensityKgM3 : 0;
  return parcels[index][quantity] / g.volumes[index].volumeM3;
}

/** Both representable endpoints are prepared before either can change. */
function preparePair(
  state: MutableAtmosphere,
  flow: Flow,
  quantity: Quantity,
  deltaLeft: number,
) {
  const left = resolveQuantityChange(
      state.parcels[flow.left][quantity],
      deltaLeft,
    ),
    right = resolveQuantityChange(
      flow.right === null
        ? state[boundaryKey[quantity]]
        : state.parcels[flow.right][quantity],
      -deltaLeft,
    );
  return left === null || right === null ? null : { quantity, left, right };
}

function publishPair(
  state: MutableAtmosphere,
  flow: Flow,
  pair: NonNullable<ReturnType<typeof preparePair>>,
) {
  state.parcels[flow.left][pair.quantity] = pair.left;
  if (flow.right === null) state[boundaryKey[pair.quantity]] = pair.right;
  else state.parcels[flow.right][pair.quantity] = pair.right;
}

function mix(
  g: CompiledAtmosphere,
  state: MutableAtmosphere,
  snapshot: readonly AtmosphereParcel[],
  flow: Flow,
) {
  if (flow.mixedM3 === 0) return;
  for (const quantity of quantities) {
    const delta =
      (concentration(g, snapshot, flow.right, quantity) -
        concentration(g, snapshot, flow.left, quantity)) *
      flow.mixedM3;
    const pair = preparePair(state, flow, quantity, delta);
    // A sub-resolution constituent stays at both endpoints without preventing
    // other, representable smoke/heat gradients from mixing.
    if (pair !== null) publishPair(state, flow, pair);
  }
}

function advect(
  g: CompiledAtmosphere,
  state: MutableAtmosphere,
  snapshot: readonly AtmosphereParcel[],
  flow: Flow,
) {
  if (flow.pressureM3 === 0) return;
  const donor = flow.pressureM3 > 0 ? flow.left : flow.right;
  const pairs: NonNullable<ReturnType<typeof preparePair>>[] = [];
  for (const quantity of quantities) {
    const pair = preparePair(
      state,
      flow,
      quantity,
      -flow.pressureM3 * concentration(g, snapshot, donor, quantity),
    );
    // Pressure carries one parcel: defer all its constituents together.
    if (pair === null) return;
    pairs.push(pair);
  }
  for (const pair of pairs) publishPair(state, flow, pair);
}

/** Opening-local paired transfers use one source snapshot and bounded face
 * budgets. Unresolved exchanges remain in their owners; paid sources use the
 * stricter admission path in advance.ts and are never silently deferred. */
export function exchangeAtmosphere(
  g: CompiledAtmosphere,
  state: MutableAtmosphere,
  dt: number,
) {
  const snapshot = state.parcels.map((parcel) => ({ ...parcel }));
  for (const flow of boundedFlows(g, openingFlows(g, snapshot, dt))) {
    mix(g, state, snapshot, flow);
    advect(g, state, snapshot, flow);
  }
}
