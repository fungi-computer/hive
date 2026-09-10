import { z } from "zod";
import { changeQuantity } from "../arithmetic.mjs";
import { ATMOSPHERE_LIMITS, type CompiledAtmosphere } from "./definition.ts";
import {
  copyState,
  parcelPressure,
  parcelTemperature,
  validateState,
} from "./state.ts";
import type {
  AtmosphereAdvanceReceipt,
  AtmosphereSource,
  AtmosphereState,
} from "./types.ts";

const sourceSchema = z.strictObject({
  volumeId: z.string().min(1).max(160),
  smokeKgS: z.number().finite().nonnegative(),
  heatJS: z.number().finite(),
});

type MutableParcel = {
  volumeId: string;
  carrierKg: number;
  smokeKg: number;
  heatJ: number;
};
type MutableState = Omit<AtmosphereState, "parcels"> & {
  parcels: MutableParcel[];
};

function changed(before: number, delta: number) {
  return delta === 0 ? before : changeQuantity(before, delta);
}

function mutableState(state: AtmosphereState): MutableState {
  return { ...state, parcels: state.parcels.map((entry) => ({ ...entry })) };
}

function admittedSources(
  g: CompiledAtmosphere,
  input: readonly AtmosphereSource[],
) {
  const parsed = z
    .array(sourceSchema)
    .max(ATMOSPHERE_LIMITS.sources)
    .parse(input);
  if (
    new Set(parsed.map((entry) => entry.volumeId)).size !== parsed.length ||
    parsed.some((entry) => !g.volumeById.has(entry.volumeId))
  )
    throw new Error("atmosphere sources need unique known volumes");
  return parsed;
}

function applySources(
  g: CompiledAtmosphere,
  state: MutableState,
  sources: ReturnType<typeof admittedSources>,
  dt: number,
) {
  let smokeKg = 0,
    heatJ = 0;
  for (const source of sources) {
    const parcel = state.parcels[g.volumeIndex.get(source.volumeId)!],
      smoke = source.smokeKgS * dt,
      heat = source.heatJS * dt;
    if (!Number.isFinite(smoke) || !Number.isFinite(heat))
      throw new Error("atmosphere source interval is not representable");
    parcel.smokeKg = changed(parcel.smokeKg, smoke);
    parcel.heatJ = changed(parcel.heatJ, heat);
    smokeKg = changed(smokeKg, smoke);
    heatJ = changed(heatJ, heat);
  }
  state.smokeSourceKg = changed(state.smokeSourceKg, smokeKg);
  state.heatSourceJ = changed(state.heatSourceJ, heatJ);
  return { smokeKg, heatJ };
}

type Exchange = {
  carrier: number[];
  smoke: number[];
  heat: number[];
  outgoingM3: number[];
  carrierBoundaryKg: number;
  smokeBoundaryKg: number;
  heatBoundaryJ: number;
};

type Transfer =
  | {
      readonly kind: "parcel";
      readonly from: number;
      readonly to: number | null;
      readonly volumeM3: number;
    }
  | {
      readonly kind: "ambient";
      readonly to: number;
      readonly volumeM3: number;
    };

function exchangeWorkspace(g: CompiledAtmosphere): Exchange {
  const empty = () => Array(g.volumes.length).fill(0);
  return {
    carrier: empty(),
    smoke: empty(),
    heat: empty(),
    outgoingM3: empty(),
    carrierBoundaryKg: 0,
    smokeBoundaryKg: 0,
    heatBoundaryJ: 0,
  };
}

function moveParcel(
  g: CompiledAtmosphere,
  parcels: readonly MutableParcel[],
  exchange: Exchange,
  from: number,
  to: number | null,
  volumeM3: number,
) {
  if (volumeM3 <= 0) return;
  const owner = g.volumes[from],
    parcel = parcels[from],
    fraction = volumeM3 / owner.volumeM3,
    carrier = parcel.carrierKg * fraction,
    smoke = parcel.smokeKg * fraction,
    heat = parcel.heatJ * fraction;
  exchange.outgoingM3[from] += volumeM3;
  exchange.carrier[from] -= carrier;
  exchange.smoke[from] -= smoke;
  exchange.heat[from] -= heat;
  if (to === null) {
    exchange.carrierBoundaryKg += carrier;
    exchange.smokeBoundaryKg += smoke;
    exchange.heatBoundaryJ += heat;
  } else {
    exchange.carrier[to] += carrier;
    exchange.smoke[to] += smoke;
    exchange.heat[to] += heat;
  }
}

function moveAmbient(
  g: CompiledAtmosphere,
  exchange: Exchange,
  to: number,
  volumeM3: number,
) {
  if (volumeM3 <= 0) return;
  const carrier = g.ambientDensityKgM3 * volumeM3;
  exchange.carrier[to] += carrier;
  exchange.carrierBoundaryKg -= carrier;
}

function openingExchange(
  g: CompiledAtmosphere,
  parcels: readonly MutableParcel[],
  dt: number,
) {
  const result = exchangeWorkspace(g),
    transfers: Transfer[] = [],
    model = g.definition.model,
    ambient = g.definition.ambient;
  for (const opening of g.openings) {
    if (opening.permeability === 0) continue;
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
      mixedM3 =
        opening.areaM2 *
        opening.permeability *
        (model.mixingVelocityMPS + buoyancy) *
        dt,
      leftPressure = parcelPressure(g, g.volumes[left], parcels[left]),
      rightPressure =
        right === null
          ? ambient.pressurePa
          : parcelPressure(g, g.volumes[right], parcels[right]),
      pressureM3 =
        opening.areaM2 *
        opening.permeability *
        model.pressureVelocityMPSPa *
        Math.abs(leftPressure - rightPressure) *
        dt;
    transfers.push({
      kind: "parcel",
      from: left,
      to: right,
      volumeM3: mixedM3,
    });
    if (right === null)
      transfers.push({ kind: "ambient", to: left, volumeM3: mixedM3 });
    else
      transfers.push({
        kind: "parcel",
        from: right,
        to: left,
        volumeM3: mixedM3,
      });
    if (leftPressure > rightPressure)
      transfers.push({
        kind: "parcel",
        from: left,
        to: right,
        volumeM3: pressureM3,
      });
    else if (right === null)
      transfers.push({ kind: "ambient", to: left, volumeM3: pressureM3 });
    else
      transfers.push({
        kind: "parcel",
        from: right,
        to: left,
        volumeM3: pressureM3,
      });
  }
  const outgoing = Array(g.volumes.length).fill(0),
    incoming = Array(g.volumes.length).fill(0);
  for (const transfer of transfers) {
    if (transfer.kind === "parcel") {
      outgoing[transfer.from] += transfer.volumeM3;
      if (transfer.to !== null) incoming[transfer.to] += transfer.volumeM3;
    } else incoming[transfer.to] += transfer.volumeM3;
  }
  const outgoingScale = outgoing.map((amount, index) =>
      amount === 0
        ? 1
        : Math.min(
            1,
            (g.volumes[index].volumeM3 * model.maxExchangeFraction) / amount,
          ),
    ),
    incomingScale = incoming.map((amount, index) =>
      amount === 0
        ? 1
        : Math.min(
            1,
            (g.volumes[index].volumeM3 * model.maxExchangeFraction) / amount,
          ),
    );
  for (const transfer of transfers) {
    if (transfer.kind === "ambient")
      moveAmbient(
        g,
        result,
        transfer.to,
        transfer.volumeM3 * incomingScale[transfer.to],
      );
    else
      moveParcel(
        g,
        parcels,
        result,
        transfer.from,
        transfer.to,
        transfer.volumeM3 *
          Math.min(
            outgoingScale[transfer.from],
            transfer.to === null ? 1 : incomingScale[transfer.to],
          ),
      );
  }
  return result;
}

function applyExchange(state: MutableState, exchange: Exchange) {
  state.parcels.forEach((parcel, index) => {
    parcel.carrierKg = changed(parcel.carrierKg, exchange.carrier[index]);
    parcel.smokeKg = changed(parcel.smokeKg, exchange.smoke[index]);
    parcel.heatJ = changed(parcel.heatJ, exchange.heat[index]);
  });
  state.carrierBoundaryKg = changed(
    state.carrierBoundaryKg,
    exchange.carrierBoundaryKg,
  );
  state.smokeBoundaryKg = changed(
    state.smokeBoundaryKg,
    exchange.smokeBoundaryKg,
  );
  state.heatBoundaryJ = changed(state.heatBoundaryJ, exchange.heatBoundaryJ);
}

export function advanceAtmosphere(
  g: CompiledAtmosphere,
  input: unknown,
  seconds: number,
  options: { readonly sources?: readonly AtmosphereSource[] } = {},
) {
  const state = validateState(g, input);
  if (
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > ATMOSPHERE_LIMITS.intervalS ||
    (seconds > 0 && seconds < ATMOSPHERE_LIMITS.minIntervalS)
  )
    throw new TypeError("invalid bounded atmosphere interval");
  const sources = admittedSources(g, options.sources ?? []),
    steps =
      seconds === 0 ? 0 : Math.ceil(seconds / g.definition.model.maxStepS);
  if (steps > ATMOSPHERE_LIMITS.steps)
    throw new Error("atmosphere interval exceeds its step budget");
  const candidate = mutableState(state),
    beforeBoundary = {
      carrierKg: state.carrierBoundaryKg,
      smokeKg: state.smokeBoundaryKg,
      heatJ: state.heatBoundaryJ,
    },
    beforeSource = {
      smokeKg: state.smokeSourceKg,
      heatJ: state.heatSourceJ,
    },
    dt = steps === 0 ? 0 : seconds / steps;
  for (let step = 0; step < steps; step++) {
    applySources(g, candidate, sources, dt);
    applyExchange(candidate, openingExchange(g, candidate.parcels, dt));
    validateState(g, candidate);
  }
  const next = copyState(validateState(g, candidate));
  const receipt: AtmosphereAdvanceReceipt = Object.freeze({
    seconds,
    steps,
    sourceSmokeKg: next.smokeSourceKg - beforeSource.smokeKg,
    sourceHeatJ: next.heatSourceJ - beforeSource.heatJ,
    carrierBoundaryKg: next.carrierBoundaryKg - beforeBoundary.carrierKg,
    smokeBoundaryKg: next.smokeBoundaryKg - beforeBoundary.smokeKg,
    heatBoundaryJ: next.heatBoundaryJ - beforeBoundary.heatJ,
  });
  return Object.freeze({ state: next, receipt });
}
