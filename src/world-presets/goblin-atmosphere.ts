import type { MaterialsState } from "../model.ts";
import { HERBAL_ALE_V1 } from "../recipes.ts";
import {
  createAtmosphere,
  type AtmosphereDefinition,
  type AtmosphereOpeningDefinition,
  type AtmosphereVolumeDefinition,
} from "../engine/environment/atmosphere/index.ts";
import { copyAtmosphereData } from "../engine/environment/atmosphere/data.ts";
import { ATMOSPHERE_LIMITS } from "../engine/environment/atmosphere/limits.ts";
import { ROOM_FUEL } from "./brewhouse-air/fuel-definition.ts";

export type GasCell = {
  readonly id: string;
  /** Physical cell-center coordinates in metres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly freeVolumeM3: number;
};

export type GasFace = {
  readonly id: string;
  readonly a: string;
  /** Null is an explicitly declared ambient connection. */
  readonly b: string | null;
  readonly areaM2: number;
  readonly distanceM: number;
};

export type GasGeometrySnapshot = {
  readonly identity: string;
  readonly revision: number;
  readonly cells: readonly GasCell[];
  /** Absent faces are intact or unknown and never exchange gas. */
  readonly openFaces: readonly GasFace[];
};

const gasCellSchema = z.strictObject({
  id: z.string().min(1).max(160),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  freeVolumeM3: z.number().finite().positive(),
});
const gasFaceSchema = z.strictObject({
  id: z.string().min(1).max(160),
  a: z.string().min(1).max(160),
  b: z.string().min(1).max(160).nullable(),
  areaM2: z.number().finite().positive(),
  distanceM: z.number().finite().positive(),
});
const gasGeometrySchema = z.strictObject({
  identity: z.string().min(1).max(16_384),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  cells: z.array(gasCellSchema).min(1).max(ATMOSPHERE_LIMITS.rawCells),
  openFaces: z.array(gasFaceSchema).max(ATMOSPHERE_LIMITS.rawFaces),
});

export const GOBLIN_ATMOSPHERE_AMBIENT = Object.freeze({
  pressurePa: 101_325,
  temperatureK: 293.15,
});

/** Inexpensive game exchange constants, not a CFD qualification. */
export const GOBLIN_ATMOSPHERE_MODEL = Object.freeze({
  specificGasConstantJKgK: 287.05,
  heatCapacityJKgK: 1005,
  mixingVelocityMPS: 0.015,
  buoyancyVelocityMPSK: 0.001,
  pressureVelocityMPSPa: 1e-7,
  maxStepS: 0.25,
  maxExchangeFraction: 0.25,
  maxPressureRatio: 1.5,
  maxTemperatureDeltaK: 50,
  maxSmokeMassFraction: 0.02,
});

const paidFuel = HERBAL_ALE_V1.consumed.find((entry) => entry.role === "fuel");
if (!paidFuel) throw new Error("herbal ale has no paid atmosphere fuel");

export const GOBLIN_BREW_ATMOSPHERE_RELEASE = Object.freeze({
  durationS: ROOM_FUEL.durationS,
  /** The declared hearth voxel at the station footing, inside its 2x2 body.
   * Placement uses this physical cell on every storey; no nearest-air fallback. */
  sourceOffsetVoxels: Object.freeze([0, 0, 0] as const),
  totals: Object.freeze({ smokeKg: ROOM_FUEL.smokeKg, heatJ: ROOM_FUEL.heatJ }),
  paidInput: Object.freeze({
    recipe: HERBAL_ALE_V1.id,
    role: paidFuel.role,
    material: paidFuel.material,
    quantity: paidFuel.quantity,
  }),
});

/** Query an existing material receipt; this neither consumes fuel nor records
 * release progress. The caller binds its own durable obligation to the ID. */
export function paidBrewAtmosphereRelease(
  materials: MaterialsState,
  transformationId: string,
) {
  const transformation = materials.transformations.find(
    (entry) => entry.id === transformationId,
  );
  if (!transformation || transformation.definition !== HERBAL_ALE_V1.id)
    return null;
  const matches = transformation.inputs.filter(
    (entry) =>
      entry.role === paidFuel.role &&
      entry.material === paidFuel.material &&
      entry.quantity === paidFuel.quantity,
  );
  return matches.length === 1 ? GOBLIN_BREW_ATMOSPHERE_RELEASE : null;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

class Components {
  readonly parent = new Map<string, string>();
  add(value: string) {
    if (this.parent.has(value)) throw new Error(`duplicate gas cell ${value}`);
    this.parent.set(value, value);
  }
  find(value: string): string {
    const parent = this.parent.get(value);
    if (parent === undefined) throw new Error(`unknown gas cell ${value}`);
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }
  join(left: string, right: string) {
    const a = this.find(left),
      b = this.find(right);
    if (a !== b)
      this.parent.set(compare(a, b) < 0 ? b : a, compare(a, b) < 0 ? a : b);
  }
}

function finitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0)
    throw new TypeError(`${label} must be finite and positive`);
}

function sameMixingBand(left: GasCell, right: GasCell) {
  const band = (value: number) =>
    Math.floor(value / ATMOSPHERE_LIMITS.bandSpanM);
  return (
    left.y === right.y &&
    band(left.x) === band(right.x) &&
    band(left.z) === band(right.z)
  );
}

/** Compile an exact physical free-volume/open-face snapshot. Horizontal open
 * cells share a cheap well-mixed band unless a registered site face separates
 * them. Vertical shafts, doors and ambient boundaries remain explicit edges. */
export function goblinAtmosphereFromGeometry(
  input: unknown,
  options: {
    readonly regionId: string;
    readonly separatingFaceIds?: ReadonlySet<string>;
  },
) {
  const snapshot = gasGeometrySchema.parse(
      copyAtmosphereData(input),
    ) satisfies GasGeometrySnapshot,
    cells = new Map<string, GasCell>(),
    components = new Components();
  for (const cell of snapshot.cells) {
    if (!cell.id || ![cell.x, cell.y, cell.z].every(Number.isFinite))
      throw new TypeError("invalid gas cell");
    finitePositive(cell.freeVolumeM3, "free gas volume");
    components.add(cell.id);
    cells.set(cell.id, Object.freeze({ ...cell }));
  }
  if (!cells.size) throw new Error("gas geometry needs at least one cell");
  const faceIds = new Set<string>(),
    separators = options.separatingFaceIds ?? new Set();
  for (const face of snapshot.openFaces) {
    if (!face.id || faceIds.has(face.id))
      throw new Error(`duplicate gas face ${face.id}`);
    faceIds.add(face.id);
    finitePositive(face.areaM2, "gas face area");
    finitePositive(face.distanceM, "gas face distance");
    const a = cells.get(face.a),
      b = face.b === null ? null : cells.get(face.b);
    if (!a || (face.b !== null && !b) || face.a === face.b)
      throw new Error(`gas face ${face.id} has invalid endpoints`);
    if (b && sameMixingBand(a, b) && !separators.has(face.id))
      components.join(a.id, b.id);
  }
  for (const separator of separators)
    if (!faceIds.has(separator))
      throw new Error(`unknown separating gas face ${separator}`);

  const grouped = new Map<string, GasCell[]>();
  for (const cell of cells.values()) {
    const root = components.find(cell.id),
      group = grouped.get(root) ?? [];
    group.push(cell);
    grouped.set(root, group);
  }
  const volumes: AtmosphereVolumeDefinition[] = [],
    owner = new Map<string, string>();
  for (const group of grouped.values()) {
    if (group.length > ATMOSPHERE_LIMITS.bandCells)
      throw new Error("gas mixing band exceeds its cell budget");
    group.sort((a, b) => compare(a.id, b.id));
    const id = `band:${group[0].id}`;
    volumes.push({
      id,
      members: group.map((cell) => ({
        cellId: cell.id,
        volumeM3: cell.freeVolumeM3,
        elevationM: cell.y,
      })),
    });
    for (const cell of group) owner.set(cell.id, id);
  }
  const openings: AtmosphereOpeningDefinition[] = [];
  for (const face of snapshot.openFaces) {
    const from = owner.get(face.a)!,
      to = face.b === null ? null : owner.get(face.b)!;
    if (from === to) continue;
    const a = cells.get(face.a)!,
      b = face.b === null ? null : cells.get(face.b)!;
    openings.push({
      id: face.id,
      from,
      fromCellId: face.a,
      to,
      toCellId: face.b,
      areaM2: face.areaM2,
      elevationM: b ? (a.y + b.y) / 2 : a.y,
      distanceM: face.distanceM,
      permeability: 1,
    });
  }
  const definition = {
    version: "connected-atmosphere-definition-v1",
    regionId: options.regionId,
    geometryIdentity: snapshot.identity,
    revision: snapshot.revision,
    ambient: GOBLIN_ATMOSPHERE_AMBIENT,
    model: GOBLIN_ATMOSPHERE_MODEL,
    volumes,
    openings,
  } satisfies AtmosphereDefinition;
  const atmosphere = createAtmosphere(definition);
  return Object.freeze({
    definition: atmosphere.definition,
    identity: atmosphere.identity,
    hasCell(cellId: string) {
      return owner.has(cellId);
    },
    volumeAt(cellId: string) {
      const volumeId = owner.get(cellId);
      if (!volumeId) throw new Error(`gas geometry has no volume at ${cellId}`);
      return volumeId;
    },
  });
}
import { z } from "zod";
