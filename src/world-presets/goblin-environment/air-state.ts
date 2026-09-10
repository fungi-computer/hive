import { z } from "zod";
import {
  ATMOSPHERE_LIMITS,
  createAtmosphere,
  type AtmosphereState,
} from "../../engine/environment/atmosphere/index.ts";
import { compensatedSum } from "../../engine/environment/arithmetic.mjs";
import { decode, encode } from "../../engine/region/codec.ts";
import { GOBLIN_WORLD_IDENTITY, GOBLIN_WATER_LIMITS } from "./content.ts";
import { goblinGasGeometry } from "./gas-geometry.ts";
import { createVoxelWorld } from "../height-caves.mjs";
import { goblinAtmosphereFromGeometry } from "../goblin-atmosphere.ts";
import { goblinTerrainProjection } from "./terrain-projection.ts";
import {
  initialWaterEnvironment,
  parseWaterEnvironment,
  waterEnvironmentGeometry,
  type EnvironmentGeometry,
  type WaterEnvironment,
} from "./water-state.ts";

export type AirEnvironment = Readonly<{
  version: "goblin-air-environment-v1";
  /** Monotone gas geometry generation, always at least the water generation. */
  geometryRevision: number;
  air: AtmosphereState;
}>;

export type CellAtmosphereSource = Readonly<{
  cellId: string;
  smokeKgS: number;
  heatJS: number;
}>;

const WIRE_BYTES = ATMOSPHERE_LIMITS.encodedStateBytes + 65_536;
const DATA_NODES = ATMOSPHERE_LIMITS.dataNodes + 64;
const SOURCE_WIRE_BYTES = 65_536;
const SOURCE_DATA_NODES = 4_096;
const envelope = z.strictObject({
  version: z.literal("goblin-air-environment-v1"),
  geometryRevision: z.number().int().nonnegative().safe(),
  air: z.unknown(),
});
const sourceSchema = z.strictObject({
  cellId: z.string().min(1).max(160),
  smokeKgS: z.number().finite().nonnegative(),
  heatJS: z.number().finite(),
});

/** Conservative rebuild key over the actual immutable source records. Keeping
 * complete finished sites may rebuild for nonphysical metadata, but cannot miss
 * a future field that the shared structure owner starts using. */
function physicalSourceKey(source: EnvironmentGeometry) {
  return JSON.stringify({
    terrain: source.terrain.checkpoint,
    finishedSites: source.sites
      .filter((site) => site.finishedAt !== null)
      .map((site) => ({ ...site }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  });
}

function detached(input: unknown, bytes: number, nodes: number) {
  return decode(encode(input, bytes, nodes), bytes, nodes);
}

function sameData(left: unknown, right: unknown, bytes: number, nodes: number) {
  return encode(left, bytes, nodes) === encode(right, bytes, nodes);
}

function observe(water: WaterEnvironment, source: EnvironmentGeometry) {
  const geometry = waterEnvironmentGeometry(water, source);
  return {
    terrain: source.terrain,
    physicalSource: physicalSourceKey(source),
    geometry,
    voidWater: JSON.stringify(
      geometry.facts.cells
        .filter((cell) => cell.kind === "void")
        .map((cell) => [cell.id, cell.liquidVolumeM3]),
    ),
  };
}
type Observation = ReturnType<typeof observe>;

function sameGasInput(left: Observation, right: Observation) {
  return (
    left.physicalSource === right.physicalSource &&
    left.geometry.geometryRevision === right.geometry.geometryRevision &&
    left.geometry.ceilingY === right.geometry.ceilingY &&
    left.voidWater === right.voidWater
  );
}

function compileBinding(observation: Observation, revision: number) {
  const water = observation.geometry,
    snapshot = goblinGasGeometry(
      observation.terrain,
      water.physical,
      water.definition,
      water.facts,
      revision,
      water.ceilingY,
    ),
    registered = goblinAtmosphereFromGeometry(snapshot, {
      regionId: GOBLIN_WORLD_IDENTITY.worldId,
    }),
    owner = createAtmosphere(registered.definition);
  return { observation, snapshot, registered, owner };
}
type Binding = ReturnType<typeof compileBinding>;

const admitted = new WeakMap<AirEnvironment, Binding>();
const observations = new WeakMap<
  AirEnvironment,
  ReturnType<typeof readBinding>
>();

function remember(value: AirEnvironment, binding: Binding) {
  const state = Object.freeze(value);
  admitted.set(state, binding);
  return state;
}

function ambientInitial(binding: Binding) {
  const definition = binding.owner.definition,
    densityKgM3 =
      definition.ambient.pressurePa /
      (definition.model.specificGasConstantJKgK *
        definition.ambient.temperatureK);
  return binding.owner.initial(
    definition.volumes.map((volume) => ({
      volumeId: volume.id,
      carrierKg:
        densityKgM3 *
        volume.members.reduce((total, member) => total + member.volumeM3, 0),
      smokeKg: 0,
      heatJ: 0,
    })),
  );
}

let originalCarrierKg: number | undefined;
function canonicalInitialCarrierKg() {
  if (originalCarrierKg !== undefined) return originalCarrierKg;
  const terrain = goblinTerrainProjection(
      createVoxelWorld(GOBLIN_WORLD_IDENTITY).save(),
    ),
    source = { terrain, sites: [] },
    water = initialWaterEnvironment(source),
    binding = compileBinding(observe(water, source), 0);
  originalCarrierKg = ambientInitial(binding).initialCarrierKg;
  return originalCarrierKg;
}

function validateInitialReference(air: AtmosphereState) {
  if (
    air.initialCarrierKg !== canonicalInitialCarrierKg() ||
    air.initialSmokeKg !== 0 ||
    air.initialHeatJ !== 0
  )
    throw new Error("air reference disagrees with the original ambient field");
}

function establishInitialReference(air: AtmosphereState) {
  if (originalCarrierKg === undefined) originalCarrierKg = air.initialCarrierKg;
  validateInitialReference(air);
}

function parseWithObservation(
  input: unknown,
  observation: Observation,
): AirEnvironment {
  const parsed = envelope.parse(detached(input, WIRE_BYTES, DATA_NODES)),
    binding = compileBinding(observation, parsed.geometryRevision),
    air = binding.owner.decode(JSON.stringify(parsed.air));
  validateInitialReference(air);
  return remember({ ...parsed, air }, binding);
}

function current(
  input: AirEnvironment,
  water: WaterEnvironment,
  source: EnvironmentGeometry,
) {
  const observation = observe(water, source),
    known = admitted.get(input);
  if (known && sameGasInput(known.observation, observation))
    return { state: input, binding: known };
  const state = parseWithObservation(input, observation);
  return { state, binding: admitted.get(state)! };
}

/** Fresh ambient stock exists only for the exact original unbuilt world and
 * original water state. It is never called by geometry rebind or restore. */
export function initialAirEnvironment(
  waterInput: WaterEnvironment,
  source: EnvironmentGeometry,
): AirEnvironment {
  if (
    source.terrain.checkpoint.revision !== 0 ||
    source.sites.some((site) => site.finishedAt !== null)
  )
    throw new Error("initial air requires the original unbuilt world");
  const water = parseWaterEnvironment(waterInput, source),
    expected = initialWaterEnvironment(source);
  if (
    !sameData(
      water,
      expected,
      GOBLIN_WATER_LIMITS.wireBytes,
      GOBLIN_WATER_LIMITS.dataNodes,
    )
  )
    throw new Error("initial air requires the original water state");
  const binding = compileBinding(observe(water, source), 0),
    air = ambientInitial(binding);
  establishInitialReference(air);
  return remember(
    { version: "goblin-air-environment-v1", geometryRevision: 0, air },
    binding,
  );
}

/** Cold admission reconstructs the exact current gas geometry from canonical
 * terrain, finished sites and water; no compiled query or clock is saved. */
export function parseAirEnvironment(
  input: unknown,
  water: WaterEnvironment,
  source: EnvironmentGeometry,
) {
  const observation = observe(water, source),
    known = admitted.get(input as AirEnvironment);
  return known && sameGasInput(known.observation, observation)
    ? (input as AirEnvironment)
    : parseWithObservation(input, observation);
}

function readBinding(state: AirEnvironment, binding: Binding) {
  const facts = binding.owner.read(state.air),
    byVolume = new Map(
      facts.volumes.map((volume) => [volume.volumeId, volume]),
    );
  return Object.freeze({
    geometryRevision: state.geometryRevision,
    initial: Object.freeze({
      carrierKg: state.air.initialCarrierKg,
      smokeKg: state.air.initialSmokeKg,
      heatJ: state.air.initialHeatJ,
    }),
    source: Object.freeze({
      smokeKg: state.air.smokeSourceKg,
      heatJ: state.air.heatSourceJ,
    }),
    boundary: Object.freeze({
      carrierKg: state.air.carrierBoundaryKg,
      smokeKg: state.air.smokeBoundaryKg,
      heatJ: state.air.heatBoundaryJ,
    }),
    balance: facts.balance,
    volumes: facts.volumes,
    cells: Object.freeze(
      binding.snapshot.cells.map((cell) => {
        const volumeId = binding.registered.volumeAt(cell.id),
          volume = byVolume.get(volumeId)!;
        return Object.freeze({
          ...cell,
          volumeId,
          pressurePa: volume.pressurePa,
          temperatureK: volume.temperatureK,
          smokeKgM3: volume.smokeKgM3,
        });
      }),
    ),
  });
}

export function airEnvironmentFacts(
  input: AirEnvironment,
  water: WaterEnvironment,
  source: EnvironmentGeometry,
) {
  const { state, binding } = current(input, water, source);
  let result = observations.get(state);
  if (!result) {
    result = readBinding(state, binding);
    observations.set(state, result);
  }
  return result;
}

/** Prepare a detached candidate for a paired water/solid geometry transition.
 * An unchanged void-water/source projection avoids atmosphere reconstruction. */
export function prepareAirEnvironmentGeometry(
  input: AirEnvironment,
  beforeWater: WaterEnvironment,
  before: EnvironmentGeometry,
  afterWater: WaterEnvironment,
  after: EnvironmentGeometry,
) {
  const { state, binding } = current(input, beforeWater, before),
    observation = observe(afterWater, after);
  if (sameGasInput(binding.observation, observation))
    return Object.freeze({
      status: "applied" as const,
      state: remember({ ...state }, { ...binding, observation }),
      receipt: null,
    });
  if (state.geometryRevision === Number.MAX_SAFE_INTEGER)
    throw new Error("air geometry revision exhausted");
  const geometryRevision = Math.max(
      state.geometryRevision + 1,
      observation.geometry.geometryRevision,
    ),
    next = compileBinding(observation, geometryRevision),
    result = binding.owner.rebind(state.air, next.owner.definition);
  if (result.status === "blocked") return result;
  return Object.freeze({
    status: "applied" as const,
    state: remember({ ...state, geometryRevision, air: result.state }, next),
    receipt: result.receipt,
  });
}

function admittedSources(input: unknown) {
  return z
    .array(sourceSchema)
    .max(ATMOSPHERE_LIMITS.sources)
    .parse(detached(input, SOURCE_WIRE_BYTES, SOURCE_DATA_NODES));
}

/** Advance only the finite atmosphere stock. The host supplies the authoritative
 * interval and explicit rates already justified by its paid material receipt. */
export function advanceAirEnvironment(
  input: AirEnvironment,
  water: WaterEnvironment,
  source: EnvironmentGeometry,
  seconds: number,
  sourceInput: readonly CellAtmosphereSource[] = [],
) {
  const { state, binding } = current(input, water, source),
    grouped = new Map<string, { smokeKgS: number[]; heatJS: number[] }>();
  for (const item of admittedSources(sourceInput)) {
    const volumeId = binding.registered.volumeAt(item.cellId),
      rates = grouped.get(volumeId) ?? { smokeKgS: [], heatJS: [] };
    rates.smokeKgS.push(item.smokeKgS);
    rates.heatJS.push(item.heatJS);
    grouped.set(volumeId, rates);
  }
  const result = binding.owner.advance(state.air, seconds, {
    sources: [...grouped].map(([volumeId, rates]) => ({
      volumeId,
      smokeKgS: compensatedSum(rates.smokeKgS),
      heatJS: compensatedSum(rates.heatJS),
    })),
  });
  return Object.freeze({
    state: remember({ ...state, air: result.state }, binding),
    receipt: result.receipt,
  });
}
