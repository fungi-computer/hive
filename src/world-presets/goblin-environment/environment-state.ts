import {
  advanceWaterEnvironment,
  exchangeWaterEnvironment,
  prepareWaterEnvironmentGeometry,
  type EnvironmentGeometry,
  type WaterEnvironment,
} from "./water-state.ts";
import {
  advanceAirEnvironment,
  prepareAirEnvironmentGeometry,
  type AirEnvironment,
  type CellAtmosphereSource,
} from "./air-state.ts";

/** The game's two physical stocks share admission, not an independent clock.
 * Every result is detached; the existing game/Region publication owns commit. */
export type EnvironmentState = Readonly<{
  water: WaterEnvironment;
  air: AirEnvironment;
}>;

function pairWater(
  before: EnvironmentState,
  water: WaterEnvironment,
  beforeSource: EnvironmentGeometry,
  afterSource: EnvironmentGeometry,
) {
  const air = prepareAirEnvironmentGeometry(
    before.air,
    before.water,
    beforeSource,
    water,
    afterSource,
  );
  if (air.status === "blocked")
    return {
      status: "blocked" as const,
      medium: "air" as const,
      reason: air.reason,
    };
  return {
    status: "applied" as const,
    state: Object.freeze({ water, air: air.state }),
    airReceipt: air.receipt,
  };
}

/** Geometry may move water, remove pore stock and displace gas. A blocked half
 * refuses the whole edit; its caller has not yet published materials or work. */
export function prepareEnvironmentGeometry(
  input: EnvironmentState,
  before: EnvironmentGeometry,
  after: EnvironmentGeometry,
) {
  const water = prepareWaterEnvironmentGeometry(input.water, before, after);
  if (water.status === "blocked")
    return {
      status: "blocked" as const,
      medium: "water" as const,
      reason: water.reason,
    };
  const paired = pairWater(input, water.state, before, after);
  return paired.status === "blocked"
    ? paired
    : { ...paired, waterReceipt: water.receipt };
}

/** The vessel/material owner still justifies quantity and custody. A deposit
 * cannot shrink occupied air without the same physical admission as a wall. */
export function prepareEnvironmentWaterTransfer(
  input: EnvironmentState,
  source: EnvironmentGeometry,
  command: Parameters<typeof exchangeWaterEnvironment>[2],
) {
  const water = exchangeWaterEnvironment(input.water, source, command);
  const paired = pairWater(input, water.state, source, source);
  return paired.status === "blocked"
    ? paired
    : { ...paired, waterReceipt: water.receipt };
}

/** A trapped-air refusal holds this proposed water step. Air can still exchange
 * through its existing faces, allowing pressure to relax while ordinary game
 * work continues. No water interval, source receipt or stock is claimed for the
 * rejected proposal. Air arithmetic/admission errors propagate to the detached
 * whole-game tick; its clock and paid-release progress must not commit either. */
export function advanceEnvironment(
  input: EnvironmentState,
  source: EnvironmentGeometry,
  seconds: number,
  sources: readonly CellAtmosphereSource[] = [],
) {
  const water = advanceWaterEnvironment(input.water, source, seconds);
  const paired = pairWater(input, water.state, source, source);
  const admitted = paired.status === "applied" ? paired.state : input;
  const air = advanceAirEnvironment(
    admitted.air,
    admitted.water,
    source,
    seconds,
    sources,
  );
  return {
    state: Object.freeze({ water: admitted.water, air: air.state }),
    waterReceipt: paired.status === "applied" ? water.receipt : null,
    waterWaiting: paired.status === "blocked" ? paired.reason : null,
    airGeometryReceipt: paired.status === "applied" ? paired.airReceipt : null,
    airReceipt: air.receipt,
  };
}
