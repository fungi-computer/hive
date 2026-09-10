import { z } from "zod";
import { compensatedSum } from "../../engine/environment/arithmetic.mjs";
import { ATMOSPHERE_LIMITS } from "../../engine/environment/atmosphere/index.ts";
import { createFiniteRelease } from "../../engine/environment/finite-release.ts";
import { decode, encode } from "../../engine/region/codec.ts";
import type { MaterialsState } from "../../model.ts";
import { STEP_SECONDS } from "../../ticker.js";
import {
  GOBLIN_BREW_ATMOSPHERE_RELEASE,
  paidBrewAtmosphereRelease,
} from "../goblin-atmosphere.ts";
import type { airEnvironmentFacts } from "./air-state.ts";

type AirFacts = ReturnType<typeof airEnvironmentFacts>;
export type PaidAtmosphereRelease = Readonly<{
  transformationId: string;
  cellId: string;
  /** Cumulative admitted release ticks, bounded by the finite duration. */
  elapsedTicks: number;
}>;
export type PaidAtmosphereReleases = Readonly<{
  version: "goblin-paid-atmosphere-releases-v1";
  obligations: readonly PaidAtmosphereRelease[];
}>;

const LIMITS = Object.freeze({
  obligations: 4_096,
  bytes: 1_048_576,
  nodes: 65_536,
});
const release = createFiniteRelease({
  durationS: GOBLIN_BREW_ATMOSPHERE_RELEASE.durationS,
  totals: GOBLIN_BREW_ATMOSPHERE_RELEASE.totals,
});
const RELEASE_TICKS = release.definition.durationS / STEP_SECONDS;
if (!Number.isSafeInteger(RELEASE_TICKS) || RELEASE_TICKS < 1)
  throw new Error("paid atmosphere duration is not a whole host tick count");

const id = z.string().min(1).max(160);
const obligationSchema = z.strictObject({
  transformationId: id,
  cellId: id,
  elapsedTicks: z.number().int().nonnegative().max(RELEASE_TICKS),
});
const stateSchema = z.strictObject({
  version: z.literal("goblin-paid-atmosphere-releases-v1"),
  obligations: z.array(obligationSchema).max(LIMITS.obligations),
});
const tickSchema = z.number().int().nonnegative().max(RELEASE_TICKS);

function copy(input: unknown) {
  return decode(
    encode(input, LIMITS.bytes, LIMITS.nodes),
    LIMITS.bytes,
    LIMITS.nodes,
  );
}

function secondsForTicks(ticks: number) {
  return ticks * STEP_SECONDS;
}

function paidTransformations(materials: MaterialsState) {
  const paid = new Set<string>();
  for (const transformation of materials.transformations) {
    const definition = paidBrewAtmosphereRelease(materials, transformation.id);
    if (!definition) continue;
    if (paid.has(transformation.id))
      throw new Error("duplicate paid atmosphere transformation");
    paid.add(transformation.id);
  }
  return paid;
}

function releasedTotals(obligations: readonly PaidAtmosphereRelease[]) {
  const smoke: number[] = [],
    heat: number[] = [];
  for (const obligation of obligations) {
    const facts = release.read(0, secondsForTicks(obligation.elapsedTicks));
    smoke.push(facts.released.smokeKg);
    heat.push(facts.released.heatJ);
  }
  return {
    smokeKg: compensatedSum(smoke),
    heatJ: compensatedSum(heat),
  };
}

function sameQuantity(actual: number, expected: number, terms: number) {
  if (expected === 0) return actual === 0;
  return (
    Number.isFinite(actual) &&
    Math.abs(actual - expected) <=
      64 *
        Number.EPSILON *
        Math.max(Math.abs(actual), Math.abs(expected)) *
        Math.max(1, terms)
  );
}

function validateLedger(
  obligations: readonly PaidAtmosphereRelease[],
  air: AirFacts,
) {
  const expected = releasedTotals(obligations),
    arithmeticTerms = obligations.reduce(
      (sum, entry) => sum + entry.elapsedTicks,
      obligations.length,
    );
  if (
    !sameQuantity(air.source.smokeKg, expected.smokeKg, arithmeticTerms) ||
    !sameQuantity(air.source.heatJ, expected.heatJ, arithmeticTerms)
  )
    throw new Error("paid release progress disagrees with air source totals");
}

function activeSourceCells(obligations: readonly PaidAtmosphereRelease[]) {
  return new Set(
    obligations
      .filter((entry) => entry.elapsedTicks < RELEASE_TICKS)
      .map((entry) => entry.cellId),
  );
}

function parsedState(input: unknown) {
  const parsed = stateSchema.parse(copy(input)),
    obligations = [...parsed.obligations].sort((a, b) =>
      a.transformationId < b.transformationId
        ? -1
        : a.transformationId > b.transformationId
          ? 1
          : 0,
    ),
    byTransformation = new Map(
      obligations.map((entry) => [entry.transformationId, entry]),
    );
  if (
    byTransformation.size !== obligations.length ||
    activeSourceCells(obligations).size > ATMOSPHERE_LIMITS.sources
  )
    throw new Error("invalid paid atmosphere release obligations");
  return Object.freeze({
    version: parsed.version,
    obligations: Object.freeze(
      obligations.map((entry) => Object.freeze({ ...entry })),
    ),
  }) satisfies PaidAtmosphereReleases;
}

function receiverAdmission(state: PaidAtmosphereReleases, air: AirFacts) {
  const available = new Set(air.cells.map((cell) => cell.id));
  return state.obligations.some(
    (entry) =>
      entry.elapsedTicks < RELEASE_TICKS && !available.has(entry.cellId),
  )
    ? Object.freeze({
        status: "blocked" as const,
        reason: "source-cell-unavailable" as const,
      })
    : Object.freeze({ status: "ready" as const });
}

function admittedState(
  input: unknown,
  materials: MaterialsState,
  air: AirFacts,
  allowedMissing: string | null = null,
) {
  const state = parsedState(input),
    byTransformation = new Map(
      state.obligations.map((entry) => [entry.transformationId, entry]),
    ),
    paid = paidTransformations(materials);
  if (
    state.obligations.some((entry) => !paid.has(entry.transformationId)) ||
    [...paid].some(
      (transformationId) =>
        !byTransformation.has(transformationId) &&
        transformationId !== allowedMissing,
    ) ||
    (allowedMissing === null
      ? paid.size !== state.obligations.length
      : paid.size !== state.obligations.length + 1 ||
        !paid.has(allowedMissing) ||
        byTransformation.has(allowedMissing))
  )
    throw new Error("paid transformations and atmosphere obligations disagree");
  validateLedger(state.obligations, air);
  return state;
}

function requirePaidAtmosphereReceivers(
  state: PaidAtmosphereReleases,
  air: AirFacts,
) {
  if (receiverAdmission(state, air).status === "blocked")
    throw new Error("active paid atmosphere source cell unavailable");
  return state;
}

/** Preflight prospective gas geometry without advancing or requiring a new
 * material receipt. Every still-owed release must keep its exact gas cell. */
export function admitPaidAtmosphereReceivers(
  input: unknown,
  prospectiveAir: AirFacts,
) {
  return receiverAdmission(parsedState(input), prospectiveAir);
}

export function initialPaidAtmosphereReleases(
  materials: MaterialsState,
  air: AirFacts,
) {
  return requirePaidAtmosphereReceivers(
    admittedState(
      { version: "goblin-paid-atmosphere-releases-v1", obligations: [] },
      materials,
      air,
    ),
    air,
  );
}

export function parsePaidAtmosphereReleases(
  input: unknown,
  materials: MaterialsState,
  air: AirFacts,
) {
  return requirePaidAtmosphereReceivers(
    admittedState(input, materials, air),
    air,
  );
}

/** Attach the one newly paid transformation to its actual current gas cell.
 * Material consumption and physical source placement remain caller-owned. */
export function registerPaidAtmosphereRelease(
  input: unknown,
  materials: MaterialsState,
  air: AirFacts,
  transformationId: string,
  cellId: string,
) {
  id.parse(transformationId);
  id.parse(cellId);
  const state = admittedState(input, materials, air, transformationId);
  if (state.obligations.length >= LIMITS.obligations)
    return Object.freeze({
      status: "blocked" as const,
      reason: "history-capacity" as const,
    });
  const candidate = {
    ...state,
    obligations: [
      ...state.obligations,
      { transformationId, cellId, elapsedTicks: 0 },
    ],
  };
  if (activeSourceCells(candidate.obligations).size > ATMOSPHERE_LIMITS.sources)
    return Object.freeze({
      status: "blocked" as const,
      reason: "source-capacity" as const,
    });
  let parsedCandidate: PaidAtmosphereReleases;
  try {
    parsedCandidate = parsedState(candidate);
  } catch (error) {
    if (error instanceof Error && error.message === "region-byte-budget")
      return Object.freeze({
        status: "blocked" as const,
        reason: "history-byte-capacity" as const,
      });
    throw error;
  }
  const receiver = receiverAdmission(parsedCandidate, air);
  if (receiver.status === "blocked") return receiver;
  const next = admittedState(parsedCandidate, materials, air);
  return Object.freeze({ status: "applied" as const, state: next });
}

export function paidAtmosphereReleaseFacts(
  input: unknown,
  materials: MaterialsState,
  air: AirFacts,
) {
  const state = parsePaidAtmosphereReleases(input, materials, air);
  return Object.freeze({
    obligations: Object.freeze(
      state.obligations.map((obligation) => {
        const facts = release.read(0, secondsForTicks(obligation.elapsedTicks));
        return Object.freeze({ ...obligation, ...facts });
      }),
    ),
    released: Object.freeze(releasedTotals(state.obligations)),
  });
}

/** Read one admitted receipt projection for HUD/presentation consumers. This
 * has no material, geometry, mutable status or saved derived fact. */
export function paidAtmosphereRelease(
  input: unknown,
  transformationId: string,
) {
  id.parse(transformationId);
  const obligation = parsedState(input).obligations.find(
    (entry) => entry.transformationId === transformationId,
  );
  if (!obligation) return null;
  return Object.freeze({
    ...obligation,
    ...release.read(0, secondsForTicks(obligation.elapsedTicks)),
  });
}

function intervalBoundaries(state: PaidAtmosphereReleases, ticks: number) {
  const boundaries = new Set([0, ticks]);
  for (const obligation of state.obligations) {
    const remaining = RELEASE_TICKS - obligation.elapsedTicks;
    if (remaining > 0 && remaining < ticks) boundaries.add(remaining);
  }
  return [...boundaries].sort((a, b) => a - b);
}

/** Plan one authoritative host tick batch. Returned progress is a detached
 * candidate; publish it only after every cell-addressed air segment succeeds. */
export function planPaidAtmosphereTicks(
  input: unknown,
  materials: MaterialsState,
  air: AirFacts,
  ticks: number,
) {
  tickSchema.parse(ticks);
  const state = admittedState(input, materials, air),
    receiver = receiverAdmission(state, air);
  if (receiver.status === "blocked") return receiver;
  const boundaries = intervalBoundaries(state, ticks);
  const segments = boundaries.slice(1).map((endTick, index) => {
    const startTick = boundaries[index],
      segmentTicks = endTick - startTick,
      seconds = secondsForTicks(segmentTicks),
      byCell = new Map<string, { smokeKgS: number[]; heatJS: number[] }>();
    for (const obligation of state.obligations) {
      if (obligation.elapsedTicks + startTick >= RELEASE_TICKS) continue;
      const fromS = secondsForTicks(obligation.elapsedTicks + startTick),
        toS = secondsForTicks(
          Math.min(RELEASE_TICKS, obligation.elapsedTicks + endTick),
        ),
        quantities = release.releasedBetween(0, fromS, toS),
        rates = {
          smokeKg: quantities.smokeKg / seconds,
          heatJ: quantities.heatJ / seconds,
        };
      if (
        !Number.isFinite(rates.smokeKg) ||
        !Number.isFinite(rates.heatJ) ||
        (quantities.smokeKg !== 0 && rates.smokeKg === 0) ||
        (quantities.heatJ !== 0 && rates.heatJ === 0)
      )
        throw new Error("paid release rate is not representable");
      const cellRates = byCell.get(obligation.cellId) ?? {
        smokeKgS: [],
        heatJS: [],
      };
      cellRates.smokeKgS.push(rates.smokeKg);
      cellRates.heatJS.push(rates.heatJ);
      byCell.set(obligation.cellId, cellRates);
    }
    const sources = [...byCell]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([cellId, rates]) =>
        Object.freeze({
          cellId,
          smokeKgS: compensatedSum(rates.smokeKgS),
          heatJS: compensatedSum(rates.heatJS),
        }),
      );
    return Object.freeze({
      ticks: segmentTicks,
      seconds,
      sources: Object.freeze(sources),
    });
  });
  const next = Object.freeze({
    version: state.version,
    obligations: Object.freeze(
      state.obligations.map((obligation) =>
        Object.freeze({
          ...obligation,
          elapsedTicks: Math.min(
            RELEASE_TICKS,
            obligation.elapsedTicks + ticks,
          ),
        }),
      ),
    ),
  }) satisfies PaidAtmosphereReleases;
  return Object.freeze({
    status: "ready" as const,
    state: next,
    segments: Object.freeze(segments),
  });
}
