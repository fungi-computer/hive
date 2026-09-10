import { z } from "zod";
import { changeQuantity } from "../arithmetic.mjs";
import { ATMOSPHERE_LIMITS, type CompiledAtmosphere } from "./definition.ts";
import {
  publishCandidateState,
  validateCandidateState,
  validateState,
} from "./state.ts";
import type {
  AtmosphereAdvanceReceipt,
  AtmosphereSource,
  AtmosphereState,
} from "./types.ts";
import { copyAtmosphereData } from "./data.ts";
import { exchangeAtmosphere, type MutableAtmosphere } from "./exchange.ts";

const sourceSchema = z.strictObject({
  volumeId: z.string().min(1).max(160),
  smokeKgS: z.number().finite().nonnegative(),
  heatJS: z.number().finite(),
});
const optionsSchema = z.strictObject({
  sources: z.array(sourceSchema).max(ATMOSPHERE_LIMITS.sources).optional(),
});

function changed(before: number, delta: number) {
  return delta === 0 ? before : changeQuantity(before, delta);
}

function mutableState(state: AtmosphereState): MutableAtmosphere {
  return { ...state, parcels: state.parcels.map((entry) => ({ ...entry })) };
}

function admittedSources(g: CompiledAtmosphere, input: unknown) {
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
  state: MutableAtmosphere,
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
  const admittedOptions = optionsSchema.parse(copyAtmosphereData(options)),
    sources = admittedSources(g, admittedOptions.sources ?? []),
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
    exchangeAtmosphere(g, candidate, dt);
    validateCandidateState(g, candidate);
  }
  const next = publishCandidateState(g, candidate);
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
