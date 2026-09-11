import type { TerrainSurface } from "../contracts";

export interface TerrainWireWater {
  readonly id?: string;
  readonly at: readonly [number, number, number];
  readonly kind?: string;
  readonly massKg: number;
  readonly capacityKg?: number;
  readonly mobileKg?: number;
  readonly liquidVolumeM3: number;
  readonly moisture?: number;
}

export interface TerrainWireFrame {
  readonly revision: number;
  readonly verticalMetres: number;
  readonly surfaces: readonly TerrainSurface[];
  readonly water: readonly TerrainWireWater[];
}
export interface TerrainWireReference {
  readonly revision: number;
  readonly verticalMetres: number;
  readonly surfacesRevision: number;
  readonly water: readonly TerrainWireWater[];
}
export type TerrainWireObservation = TerrainWireFrame | TerrainWireReference;

/** Emit a complete baseline until this connection has received this revision. */
export function terrainWireForRevision(
  frame: TerrainWireFrame,
  knownRevision: number | undefined,
): TerrainWireObservation {
  if (knownRevision !== frame.revision) return frame;
  return {
    revision: frame.revision,
    verticalMetres: frame.verticalMetres,
    surfacesRevision: frame.revision,
    water: frame.water,
  };
}

const MIN_I32 = -2147483648;
const MAX_I32 = 2147483647;
const MAX_SURFACES = 4096;
const MAX_WATER = 2048;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function safeRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function coordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_I32 && value <= MAX_I32;
}
function cell(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(coordinate);
}
function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function parseSurface(value: unknown): TerrainSurface | undefined {
  if (!record(value) || !cell(value.cell) || !Number.isInteger(value.material) ||
    (value.material as number) < 0 || (value.material as number) > 65535)
    return undefined;
  return Object.freeze({
    cell: Object.freeze([value.cell[0], value.cell[1], value.cell[2]]) as TerrainSurface["cell"],
    material: value.material as number,
  });
}

function parseWater(value: unknown): TerrainWireWater | undefined {
  if (!record(value) || !cell(value.at) || !finite(value.massKg) || value.massKg < 0 || !finite(value.liquidVolumeM3) || value.liquidVolumeM3 < 0)
    return undefined;
  for (const field of ["capacityKg", "mobileKg", "moisture"])
    if (field in value && !finite(value[field])) return undefined;
  if (value.id !== undefined && !boundedString(value.id, 160)) return undefined;
  if (value.kind !== undefined && !boundedString(value.kind, 64)) return undefined;
  const parsed: TerrainWireWater = {
    at: Object.freeze([value.at[0], value.at[1], value.at[2]]) as TerrainWireWater["at"],
    massKg: value.massKg,
    liquidVolumeM3: value.liquidVolumeM3,
    ...(value.id === undefined ? {} : { id: value.id }),
    ...(value.kind === undefined ? {} : { kind: value.kind }),
    ...(value.capacityKg === undefined ? {} : { capacityKg: value.capacityKg as number }),
    ...(value.mobileKg === undefined ? {} : { mobileKg: value.mobileKg as number }),
    ...(value.moisture === undefined ? {} : { moisture: value.moisture as number }),
  };
  return Object.freeze(parsed);
}

/** Parse the bounded optional terrain capability carried by an observation. */
export function parseTerrainFrame(value: unknown): TerrainWireFrame | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || !safeRevision(value.revision) || !finite(value.verticalMetres) ||
    value.verticalMetres <= 0 || !Array.isArray(value.surfaces) || value.surfaces.length > MAX_SURFACES ||
    !Array.isArray(value.water) || value.water.length > MAX_WATER)
    throw new Error("invalid terrain observation");
  const surfaces = value.surfaces.map(parseSurface);
  const water = value.water.map(parseWater);
  if (surfaces.some((surface): surface is undefined => surface === undefined) ||
    water.some((entry): entry is undefined => entry === undefined))
    throw new Error("invalid terrain observation");
  return Object.freeze({
    revision: value.revision,
    verticalMetres: value.verticalMetres,
    surfaces: Object.freeze(surfaces as TerrainSurface[]),
    water: Object.freeze(water as TerrainWireWater[]),
  });
}

/** Hydrate an explicit same-revision surface reference from this connection's cache. */
export function parseTerrainObservation(
  value: unknown,
  cached: TerrainWireFrame | undefined,
): TerrainWireFrame | undefined {
  if (value === undefined) return undefined;
  if (record(value) && Array.isArray(value.surfaces)) return parseTerrainFrame(value);
  if (
    !record(value) ||
    !safeRevision(value.revision) ||
    !safeRevision(value.surfacesRevision) ||
    value.surfacesRevision !== value.revision ||
    !cached ||
    cached.revision !== value.surfacesRevision
  )
    throw new Error("terrain surface reference is unavailable");
  return parseTerrainFrame({
    revision: value.revision,
    verticalMetres: value.verticalMetres,
    surfaces: cached.surfaces,
    water: value.water,
  });
}
