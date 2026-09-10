import { z } from "zod";
import type { Cell, Clearing } from "./model.ts";
import { terrainEnvironment, TERRAIN_VOXEL_METRIC } from "./terrain.ts";
import { waterEnvironmentFacts } from "./world-presets/goblin-environment/water-state.ts";
import {
  createNavigationSpaces,
  HUMAN_NAVIGATION,
} from "./navigation-space.ts";
import { standing } from "./engine/navigation/index.ts";
import { inside } from "./world.js";
import { knownFootings } from "./exploration.ts";

/** Goblin content units, not a rule imposed on every engine material. */
export const FIELD_WATER = Object.freeze({
  id: "goblin-water-1kg-per-unit-v1" as const,
  material: "water" as const,
  kgPerUnit: 1,
  litresPerUnit: 1,
  maxDrawReachM: TERRAIN_VOXEL_METRIC.verticalM,
});
export const fieldWaterReferenceSchema = z
  .object({
    binding: z.literal(FIELD_WATER.id),
    nodeId: z.string().min(1).max(160),
  })
  .strict();
export type FieldWaterReference = z.infer<typeof fieldWaterReferenceSchema>;
export type FieldWaterState = Pick<Clearing, "terrain" | "water" | "sites">;
type FieldCell = Readonly<{
  kind: string;
  id: string;
  at: readonly [number, number, number];
  massKg: number;
  capacityKg: number;
  liquidVolumeM3: number;
}>;
type FieldCache = {
  water: Clearing["water"];
  terrain: Clearing["terrain"];
  sites: Clearing["sites"];
  siteStamp: string;
  cells: readonly FieldCell[];
  navigation?: ReturnType<typeof createNavigationSpaces>;
  sources?: FieldWaterSource[];
  supplyKey?: string;
};
const fieldCaches = new WeakMap<object, FieldCache>();
function siteStamp(sites: Clearing["sites"]): string {
  return JSON.stringify(
    sites.map(({ id, type, x, z, level, direction, finishedAt }) => [
      id,
      type,
      x,
      z,
      level,
      direction,
      finishedAt,
    ]),
  );
}
export type FieldWaterSource = FieldWaterReference & {
  accessCells: readonly Cell[];
  availableUnits: number;
};
export function fieldWaterCells(state: FieldWaterState): readonly FieldCell[] {
  const stamp = siteStamp(state.sites), cached = fieldCaches.get(state as object);
  if (
    cached && cached.water === state.water && cached.terrain === state.terrain &&
    cached.sites === state.sites && cached.siteStamp === stamp
  ) return cached.cells;
  const cells = waterEnvironmentFacts(state.water, {
    terrain: terrainEnvironment(state.terrain),
    sites: state.sites,
  }).cells.filter((cell) => cell.kind === "void");
  fieldCaches.set(state as object, {
    water: state.water,
    terrain: state.terrain,
    sites: state.sites,
    siteStamp: stamp,
    cells,
  });
  return cells;
}
/** Draining changes availability, not the stable physical cell reference. */
export function fieldWaterProblem(
  state: FieldWaterState,
  reference: FieldWaterReference,
): string | null {
  if (!fieldWaterReferenceSchema.safeParse(reference).success)
    return "unknown field water binding";
  return fieldWaterCells(state).some((cell) => cell.id === reference.nodeId)
    ? null
    : "missing field water cell";
}
function accessCells(
  state: Clearing,
  cell: FieldCell,
  space: ReturnType<ReturnType<typeof createNavigationSpaces>>,
  known: ReturnType<typeof knownFootings>,
): Cell[] {
  const at = { x: cell.at[0], y: cell.at[1], z: cell.at[2] };
  if (!inside(at) || !known(at)) return [];
  const spacing = terrainEnvironment(state.terrain).terrain.spacingM;
  const depth = cell.liquidVolumeM3 / (spacing[0] * spacing[2]);
  const result: Cell[] = [];
  for (const y of [at.y, at.y + 1]) {
    const reach = Math.abs((y - at.y) * spacing[1] - depth);
    if (reach > FIELD_WATER.maxDrawReachM) continue;
    // A covered cell cannot be reached from the level above its physical face.
    if (y > at.y && space.face("y", [at.x, y, at.z]) !== "open") continue;
    if (space.point([at.x, y, at.z]) !== "empty") continue;
    for (const [dx, dz] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]) {
      const rim = { x: at.x + dx, y, z: at.z + dz };
      if (standing(space, rim, HUMAN_NAVIGATION) !== "supported") continue;
      const face: [number, number, number] = [
        at.x + Math.max(0, dx),
        y,
        at.z + Math.max(0, dz),
      ];
      if (space.face(dx ? "x" : "z", face) === "open")
        result.push(Object.freeze(rim));
    }
  }
  return result;
}
/** Candidate footings are checked for real support, body access, knowledge and fixed
 * occupancy. The actual worker's route and current draw recheck remain separate. */
export function fieldWaterSources(state: Clearing): FieldWaterSource[] {
  const stamp = siteStamp(state.sites), cached = fieldCaches.get(state);
  const navigation = createNavigationSpaces(state);
  if (
    cached && cached.water === state.water && cached.terrain === state.terrain &&
    cached.sites === state.sites && cached.siteStamp === stamp &&
    cached.navigation === navigation &&
    cached.sources
  ) return cached.sources;
  const space = navigation();
  const known = knownFootings(state);
  const sources = fieldWaterCells(state)
    .filter((cell) => cell.massKg >= FIELD_WATER.kgPerUnit)
    .map((cell) => ({
      binding: FIELD_WATER.id,
      nodeId: cell.id,
      availableUnits: Math.floor(cell.massKg / FIELD_WATER.kgPerUnit),
      accessCells: accessCells(state, cell, space, known),
    }))
    .filter((source) => source.accessCells.length > 0)
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const entry = fieldCaches.get(state);
  if (entry) {
    entry.sources = sources;
    entry.navigation = navigation;
    entry.supplyKey = JSON.stringify(
      sources.map((source) => [
        source.nodeId,
        source.availableUnits,
        source.accessCells.map((cell) => [cell.x, cell.y, cell.z]),
      ]),
    );
  }
  return sources;
}
export function fieldWaterSupplyKey(state: Clearing): string {
  const stamp = siteStamp(state.sites), cached = fieldCaches.get(state);
  const navigation = createNavigationSpaces(state);
  if (
    cached && cached.water === state.water && cached.terrain === state.terrain &&
    cached.sites === state.sites && cached.siteStamp === stamp &&
    cached.navigation === navigation &&
    cached.supplyKey !== undefined
  ) return cached.supplyKey;
  fieldWaterSources(state);
  return fieldCaches.get(state)?.supplyKey ?? "[]";
}
export function fieldWaterAccess(
  state: Clearing,
  reference: FieldWaterReference,
  direction: "withdraw" | "deposit",
): Cell[] {
  if (!fieldWaterReferenceSchema.safeParse(reference).success) return [];
  const cell = fieldWaterCells(state).find(
    (cell) => cell.id === reference.nodeId,
  );
  if (!cell || (direction === "withdraw" && cell.massKg <= 0)) return [];
  return accessCells(
    state,
    cell,
    createNavigationSpaces(state)(),
    knownFootings(state),
  );
}
