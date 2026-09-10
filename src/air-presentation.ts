import type { Clearing } from "./model.ts";
import { currentVisibility } from "./exploration.ts";
import { terrainEnvironment } from "./terrain.ts";
import { viewLayer, worldView } from "./game-space.ts";
import { GOBLIN_ATMOSPHERE_AMBIENT } from "./world-presets/goblin-atmosphere.ts";
import { airEnvironmentFacts } from "./world-presets/goblin-environment/air-state.ts";

/** Fixed display scales only. They neither clamp nor alter atmosphere facts. */
export const CLEARING_AIR_VISUAL = Object.freeze({
  heatDeltaK: 0.5,
  smokeKgM3: 0.0001,
});

export type ClearingAirCell = Readonly<{
  id: string;
  at: Readonly<{ x: number; y: number; z: number }>;
  local: Readonly<{ x: number; z: number; level: number }>;
  layer: number;
  volumeId: string;
  temperatureC: number;
  temperatureDeltaK: number;
  smokeMgM3: number;
  heatStrength: number;
  smokeStrength: number;
}>;

export type ClearingAirLayer = Readonly<{
  level: number;
  cells: readonly ClearingAirCell[];
  minTemperatureC: number;
  maxTemperatureC: number;
  maxSmokeMgM3: number;
}>;

export type ClearingAirPresentation = Readonly<{
  geometryRevision: number;
  layers: readonly ClearingAirLayer[];
  visibleCellCount: number;
}>;

type CacheEntry = Readonly<{
  water: Clearing["water"];
  terrain: Clearing["terrain"];
  exploration: Clearing["exploration"];
  sight: string;
  result: ClearingAirPresentation;
}>;

const cache = new WeakMap<Clearing["air"], CacheEntry>();

function currentSightKey(state: Clearing) {
  return JSON.stringify([
    Object.values(state.actors).map(({ id, x, y, z }) => [id, x, y, z]),
    state.sites
      .filter((site) => site.finishedAt !== null)
      .map(({ id, type, x, z, level, direction, finishedAt }) => [
        id,
        type,
        x,
        z,
        level,
        direction,
        finishedAt,
      ]),
  ]);
}

function cellFooting(id: string) {
  const match = /^cell:(-?\d+),(-?\d+),(-?\d+)$/.exec(id);
  if (!match) throw new Error(`invalid atmosphere cell identity ${id}`);
  const at = { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
  if (!Object.values(at).every(Number.isSafeInteger))
    throw new Error(`invalid atmosphere cell identity ${id}`);
  return Object.freeze(at);
}

function strength(value: number, scale: number) {
  return Math.min(1, Math.abs(value) / scale);
}

function presentCell(fact: {
  readonly id: string;
  readonly volumeId: string;
  readonly temperatureK: number;
  readonly smokeKgM3: number;
}): ClearingAirCell {
  const at = cellFooting(fact.id),
    local = Object.freeze(worldView(at)),
    temperatureDeltaK =
      fact.temperatureK - GOBLIN_ATMOSPHERE_AMBIENT.temperatureK;
  return Object.freeze({
    id: fact.id,
    at,
    local,
    layer: viewLayer(at),
    volumeId: fact.volumeId,
    temperatureC: fact.temperatureK - 273.15,
    temperatureDeltaK,
    smokeMgM3: fact.smokeKgM3 * 1_000_000,
    heatStrength: strength(temperatureDeltaK, CLEARING_AIR_VISUAL.heatDeltaK),
    smokeStrength: strength(fact.smokeKgM3, CLEARING_AIR_VISUAL.smokeKgM3),
  });
}

function summarizeLayers(cells: readonly ClearingAirCell[]) {
  const byLayer = new Map<number, ClearingAirCell[]>();
  for (const cell of cells) {
    const entries = byLayer.get(cell.layer) ?? [];
    entries.push(cell);
    byLayer.set(cell.layer, entries);
  }
  return Object.freeze(
    [...byLayer]
      .sort(([left], [right]) => left - right)
      .map(([level, entries]) =>
        Object.freeze({
          level,
          cells: Object.freeze(entries),
          minTemperatureC: Math.min(
            ...entries.map((cell) => cell.temperatureC),
          ),
          maxTemperatureC: Math.max(
            ...entries.map((cell) => cell.temperatureC),
          ),
          maxSmokeMgM3: Math.max(...entries.map((cell) => cell.smokeMgM3)),
        }),
      ),
  );
}

/**
 * Current-sight display facts from the canonical atmosphere component. Hidden
 * and merely remembered cells never enter this projection. The expensive
 * physical/fact read is shared until committed air, water, geometry or sight
 * changes; render frames do not reconstruct the atmosphere owner.
 */
export function clearingAirPresentation(
  state: Clearing,
): ClearingAirPresentation {
  const sight = currentSightKey(state),
    known = cache.get(state.air);
  if (
    known &&
    known.water === state.water &&
    known.terrain === state.terrain &&
    known.exploration === state.exploration &&
    known.sight === sight
  )
    return known.result;

  const visible = currentVisibility(state),
    facts = airEnvironmentFacts(state.air, state.water, {
      terrain: terrainEnvironment(state.terrain),
      sites: state.sites,
    }),
    cells = facts.cells.map(presentCell).filter((cell) => visible(cell.at)),
    layers = summarizeLayers(cells);
  const result = Object.freeze({
    geometryRevision: facts.geometryRevision,
    layers: Object.freeze(layers),
    visibleCellCount: cells.length,
  });
  cache.set(state.air, {
    water: state.water,
    terrain: state.terrain,
    exploration: state.exploration,
    sight,
    result,
  });
  return result;
}

export function clearingAirLayer(
  presentation: ClearingAirPresentation,
  level: number,
) {
  return presentation.layers.find((layer) => layer.level === level) ?? null;
}
