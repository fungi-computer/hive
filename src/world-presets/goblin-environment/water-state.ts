import { z } from "zod";
import { encode, decode } from "../../engine/region/codec.ts";
import { createWater } from "../../engine/environment/water/index.js";
import { freeze } from "../../engine/environment/water/geometry.mjs";
import { createStructureGeometry } from "../../structure-environment.ts";
import type { goblinTerrainProjection } from "./terrain-projection.ts";
import { GOBLIN_ENVIRONMENT_BOUNDS, GOBLIN_WATER_LIMITS } from "./content.ts";
import {
  goblinWaterGeometry,
  initialGoblinWaterStocks,
  originalGoblinWaterKg,
  waterCoverageCeiling,
} from "./water-geometry.ts";

export type EnvironmentGeometry = Readonly<{
  terrain: ReturnType<typeof goblinTerrainProjection>;
  sites: Parameters<typeof createStructureGeometry>[0]["sites"];
}>;
type WaterStock = Readonly<{
  version: string;
  identity: string;
  massKg: readonly number[];
  initialTotalKg: number;
  boundaryKg: number;
}>;
/** Canonical stocks and a geometry generation, never another clock or saved query.
 * The host supplies current terrain/sites when restoring this component. */
export type WaterEnvironment = Readonly<{
  version: "goblin-water-environment-v1";
  geometryRevision: number;
  ceilingY: number;
  water: WaterStock;
}>;
const envelope = z.strictObject({
  version: z.literal("goblin-water-environment-v1"),
  geometryRevision: z.number().int().nonnegative().safe(),
  ceilingY: z.number().int().safe(),
  water: z.unknown(),
});

/** Only actual finished physical content participates in this rebuild key. */
function structureKey(source: EnvironmentGeometry) {
  return JSON.stringify(
    source.sites
      .filter((site) => site.finishedAt !== null)
      .map((site) => [
        site.id,
        site.type,
        site.x,
        site.z,
        site.level,
        site.direction,
      ])
      .sort((a, b) =>
        String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0,
      ),
  );
}
function geometry(source: EnvironmentGeometry) {
  return createStructureGeometry(
    { terrain: source.terrain.terrain, sites: source.sites },
    GOBLIN_ENVIRONMENT_BOUNDS,
  );
}
function binding(
  source: EnvironmentGeometry,
  physical: ReturnType<typeof geometry>,
  geometryRevision: number,
  ceilingY: number,
) {
  if (geometryRevision < source.terrain.checkpoint.revision)
    throw new Error("water geometry predates the actual terrain");
  const definition = goblinWaterGeometry(
    source.terrain,
    physical,
    geometryRevision,
    ceilingY,
  );
  return {
    terrain: source.terrain,
    structures: structureKey(source),
    physical,
    owner: createWater(definition, GOBLIN_WATER_LIMITS),
  };
}
type Binding = ReturnType<typeof binding>;
const admitted = new WeakMap<WaterEnvironment, Binding>();
const observations = new WeakMap<
  WaterEnvironment,
  ReturnType<Binding["owner"]["read"]>
>();
function remember(value: WaterEnvironment, bound: Binding): WaterEnvironment {
  const state = freeze(value) as WaterEnvironment;
  admitted.set(state, bound);
  return state;
}

export function initialWaterEnvironment(
  source: EnvironmentGeometry,
): WaterEnvironment {
  if (
    source.terrain.checkpoint.revision !== 0 ||
    source.sites.some((site) => site.finishedAt !== null)
  )
    throw new Error("initial water requires the original unbuilt world");
  const physical = geometry(source);
  const ceilingY = waterCoverageCeiling(
    source.terrain,
    physical,
    source.terrain.surfaceCeilingY,
    source.terrain.surfaceCeilingY - 2,
  );
  const bound = binding(source, physical, 0, ceilingY);
  const water = bound.owner.initial(
    initialGoblinWaterStocks(source.terrain, bound.owner.definition),
  );
  return remember(
    {
      version: "goblin-water-environment-v1",
      geometryRevision: 0,
      ceilingY,
      water,
    },
    bound,
  );
}

export function parseWaterEnvironment(
  input: unknown,
  source: EnvironmentGeometry,
): WaterEnvironment {
  const known = admitted.get(input as WaterEnvironment);
  if (
    known &&
    known.terrain === source.terrain &&
    known.structures === structureKey(source)
  )
    return input as WaterEnvironment;
  const data = decode(
    encode(input, GOBLIN_WATER_LIMITS.wireBytes, GOBLIN_WATER_LIMITS.dataNodes),
    GOBLIN_WATER_LIMITS.wireBytes,
    GOBLIN_WATER_LIMITS.dataNodes,
  );
  const parsed = envelope.parse(data);
  const bound = binding(
    source,
    geometry(source),
    parsed.geometryRevision,
    parsed.ceilingY,
  );
  const water = bound.owner.parse(parsed.water);
  const initialKg = originalGoblinWaterKg(source.terrain);
  if (
    Math.abs(water.initialTotalKg - initialKg) >
    1e-9 + 64 * Number.EPSILON * initialKg
  )
    throw new Error(
      "water reference disagrees with the original generated supply",
    );
  return remember({ ...parsed, water }, bound);
}

function current(input: WaterEnvironment, source: EnvironmentGeometry) {
  const state = parseWaterEnvironment(input, source);
  return { state, bound: admitted.get(state)! };
}
export function waterEnvironmentFacts(
  input: WaterEnvironment,
  source: EnvironmentGeometry,
) {
  const { state, bound } = current(input, source);
  let facts = observations.get(state);
  if (!facts) {
    facts = bound.owner.read(state.water);
    observations.set(state, facts);
  }
  return facts;
}

/** Detached candidate only. The physical-completion caller must pair removed
 * pore water with its exact spoil record and obtain air admission before commit. */
export function prepareWaterEnvironmentGeometry(
  input: WaterEnvironment,
  before: EnvironmentGeometry,
  after: EnvironmentGeometry,
) {
  const { state, bound } = current(input, before);
  const physical = geometry(after);
  const ceilingY = waterCoverageCeiling(
    after.terrain,
    physical,
    state.ceilingY,
    state.ceilingY - 2,
  );
  const geometryRevision = Math.max(
    state.geometryRevision + 1,
    after.terrain.checkpoint.revision,
  );
  const next = binding(after, physical, geometryRevision, ceilingY);
  const result = bound.owner.rebind(state.water, next.owner.definition);
  if (result.status === "blocked") return result;
  return {
    status: "applied" as const,
    state: remember(
      { ...state, geometryRevision, ceilingY, water: result.state },
      next,
    ),
    receipt: result.receipt,
  };
}

/** Host-clock interval; publication and paired gas admission stay with the host. */
export function advanceWaterEnvironment(
  input: WaterEnvironment,
  source: EnvironmentGeometry,
  seconds: number,
) {
  const { state, bound } = current(input, source);
  const result = bound.owner.advance(state.water, seconds);
  return {
    state: remember({ ...state, water: result.state }, bound),
    receipt: result.receipt,
    work: result.work,
  };
}

/** Existing material transfer owns the other half; this grants no pail or stock. */
export function exchangeWaterEnvironment(
  input: WaterEnvironment,
  source: EnvironmentGeometry,
  command: { id: string; direction: "withdraw" | "deposit"; massKg: number },
) {
  const { state, bound } = current(input, source);
  const result = bound.owner.exchange(state.water, command);
  return {
    state: remember({ ...state, water: result.state }, bound),
    receipt: result.receipt,
  };
}
