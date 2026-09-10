import { z } from "zod";
import {
  ATMOSPHERE_LIMITS,
  type AtmosphereState,
} from "../../engine/environment/atmosphere/index.ts";
import { compensatedSum } from "../../engine/environment/arithmetic.mjs";
import { decode, encode } from "../../engine/region/codec.ts";
import { GOBLIN_WORLD_IDENTITY, GOBLIN_WATER_LIMITS } from "./content.ts";
import {
  goblinGasGeometry,
  updateGoblinGasGeometry,
} from "./gas-geometry.ts";
import { createVoxelWorld } from "../height-caves.mjs";
import {
  goblinAtmosphereFromGeometry,
  updateGoblinAtmosphereGeometry,
} from "../goblin-atmosphere.ts";
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

function detached(input: unknown, bytes: number, nodes: number) {
  return decode(encode(input, bytes, nodes), bytes, nodes);
}

function sameData(left: unknown, right: unknown, bytes: number, nodes: number) {
  return encode(left, bytes, nodes) === encode(right, bytes, nodes);
}

type WaterGeometry = ReturnType<typeof waterEnvironmentGeometry>;
type GasSnapshot = ReturnType<typeof goblinGasGeometry>;
type Observation = {
  readonly terrain: EnvironmentGeometry["terrain"];
  readonly waterState: WaterEnvironment;
  readonly waterPhysical: WaterGeometry["physical"];
  readonly waterDefinition: WaterGeometry["definition"];
  readonly ceilingY: number;
  readonly geometryRevision: number;
  readonly geometry: GasSnapshot;
};

function observe(
  water: WaterEnvironment,
  source: EnvironmentGeometry,
  previous?: Observation,
  knownGeometry?: ReturnType<typeof waterEnvironmentGeometry>,
) {
  const geometry = knownGeometry ?? waterEnvironmentGeometry(water, source);
  if (
    previous &&
    previous.waterState === water &&
    previous.waterPhysical === geometry.physical &&
    previous.waterDefinition === geometry.definition &&
    previous.ceilingY === geometry.ceilingY
  )
    return previous;
  const geometryRevision =
    previous &&
    (previous.waterPhysical !== geometry.physical ||
      previous.waterDefinition !== geometry.definition)
      ? Math.max(previous.geometryRevision, geometry.geometryRevision)
      : previous?.geometryRevision ?? geometry.geometryRevision;
  let gas: GasSnapshot;
  if (
    previous &&
    previous.waterPhysical === geometry.physical &&
    previous.waterDefinition === geometry.definition &&
    previous.ceilingY === geometry.ceilingY
  ) {
    const updated = updateGoblinGasGeometry(
      previous.geometry,
      geometry.physical,
      geometry.definition,
      geometry.facts,
      geometryRevision,
      geometry.ceilingY,
    );
    gas =
      updated.status === "reused"
        ? updated.snapshot
        : goblinGasGeometry(
            source.terrain,
            geometry.physical,
            geometry.definition,
            geometry.facts,
            geometryRevision,
            geometry.ceilingY,
          );
  } else {
    gas = goblinGasGeometry(
      source.terrain,
      geometry.physical,
      geometry.definition,
      geometry.facts,
      geometryRevision,
      geometry.ceilingY,
    );
  }
  return {
    terrain: source.terrain,
    waterState: water,
    waterPhysical: geometry.physical,
    waterDefinition: geometry.definition,
    ceilingY: geometry.ceilingY,
    geometryRevision,
    geometry: gas,
  };
}

function sameGasInput(left: Observation, right: Observation) {
  return (
    left.waterPhysical === right.waterPhysical &&
    left.waterDefinition === right.waterDefinition &&
    left.ceilingY === right.ceilingY &&
    left.geometry === right.geometry
  );
}

type AtmosphereOwner = ReturnType<typeof goblinAtmosphereFromGeometry>;
type Binding = {
  readonly observation: Observation;
  readonly snapshot: GasSnapshot;
  readonly registered: AtmosphereOwner;
  readonly owner: AtmosphereOwner;
};

function compileBinding(
  observation: Observation,
  revision: number,
  previous?: Binding,
) {
  const snapshot =
    observation.geometry.revision === revision
      ? observation.geometry
      : Object.freeze({ ...observation.geometry, revision });
  const registered =
    previous &&
    observation.waterPhysical === previous.observation.waterPhysical &&
    observation.waterDefinition === previous.observation.waterDefinition
      ? updateGoblinAtmosphereGeometry(snapshot, previous.registered) ??
        goblinAtmosphereFromGeometry(snapshot, {
          regionId: GOBLIN_WORLD_IDENTITY.worldId,
        })
      : goblinAtmosphereFromGeometry(snapshot, {
          regionId: GOBLIN_WORLD_IDENTITY.worldId,
        });
  return { observation, snapshot, registered, owner: registered };
}

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
  const parsed = envelope.parse(detached(input, WIRE_BYTES, DATA_NODES));
  if (parsed.geometryRevision < observation.geometryRevision)
    throw new Error("air geometry predates the current water generation");
  const binding = compileBinding(observation, parsed.geometryRevision),
    air = binding.owner.decode(JSON.stringify(parsed.air));
  validateInitialReference(air);
  return remember({ ...parsed, air }, binding);
}

function current(
  input: AirEnvironment,
  water: WaterEnvironment,
  source: EnvironmentGeometry,
) {
  const known = admitted.get(input);
  const geometry = waterEnvironmentGeometry(water, source);
  if (
    known &&
    known.observation.waterState === water &&
    known.observation.waterPhysical === geometry.physical &&
    known.observation.waterDefinition === geometry.definition &&
    known.observation.ceilingY === geometry.ceilingY
  )
    return { state: input, binding: known };
  const observation = observe(water, source, known?.observation, geometry);
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
  const known = admitted.get(input as AirEnvironment),
    observation = observe(
      water,
      source,
      known?.observation,
      waterEnvironmentGeometry(water, source),
    );
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

/** Physical release admission needs the canonical source ledger and receiver
 * membership, without constructing per-cell pressure/temperature display facts.
 * The existing geometry admission still rejects stale or untrusted input. */
export function airEnvironmentAdmission(
  input: AirEnvironment,
  water: WaterEnvironment,
  source: EnvironmentGeometry,
) {
  const { state, binding } = current(input, water, source);
  return Object.freeze({
    source: Object.freeze({
      smokeKg: state.air.smokeSourceKg,
      heatJ: state.air.heatSourceJ,
    }),
    hasCell: binding.registered.hasCell,
  });
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
    observation = observe(afterWater, after, binding.observation);
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
      observation.geometryRevision,
    ),
    next = compileBinding(observation, geometryRevision, binding),
    result = binding.owner.rebind(state.air, next.owner.definition);
  if (result.status === "blocked") return result;
  return Object.freeze({
    status: "applied" as const,
    state: remember(
      { ...state, geometryRevision, air: next.owner.admit(result.state) },
      next,
    ),
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
