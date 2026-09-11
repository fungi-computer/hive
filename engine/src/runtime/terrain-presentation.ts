import type { EnvironmentDefinition } from "../sdk/environment";
import type { KernelPort, StructureSurface, TerrainSurface } from "../contracts";

type Coordinate = readonly [number, number, number];

export interface TerrainWaterFact {
  readonly id?: string;
  readonly at: Coordinate;
  readonly kind?: string;
  readonly massKg: number;
  readonly capacityKg?: number;
  readonly mobileKg?: number;
  readonly liquidVolumeM3: number;
  readonly moisture?: number;
  readonly [key: string]: unknown;
}

export interface TerrainPresentationFrame {
  readonly revision: number;
  readonly verticalMetres: number;
  readonly surfaces: readonly TerrainSurface[];
  readonly structureSurfaces: readonly StructureSurface[];
  readonly water: readonly TerrainWaterFact[];
}

interface CachedSurfaces {
  readonly revision: number;
  readonly surfaces: readonly TerrainSurface[];
  readonly byColumn: ReadonlyMap<string, TerrainSurface | null>;
  readonly structureSurfaces: readonly StructureSurface[];
}

const MIN_I32 = -2147483648;
const MAX_I32 = 2147483647;
const MAX_COLUMNS = 4096;
const SURFACE_BATCH = 64;
const MAX_STRUCTURE_SURFACES = 16384;

function signedInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_I32 && value <= MAX_I32;
}

function columnKey(x: number, z: number): string {
  return `${x},${z}`;
}

function parseFacts(value: unknown): {
  readonly terrainRevision: number;
  readonly cells: readonly TerrainWaterFact[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid environment facts");
  const facts = value as { readonly terrainRevision?: unknown; readonly cells?: unknown };
  if (!Number.isSafeInteger(facts.terrainRevision) || (facts.terrainRevision as number) < 0)
    throw new Error("invalid environment terrain revision");
  if (!Array.isArray(facts.cells)) throw new Error("invalid environment water cells");
  const cells = facts.cells.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("invalid environment water cell");
    const cell = raw as Record<string, unknown>;
    const at = cell.at;
    if (
      !Array.isArray(at) ||
      at.length !== 3 ||
      !at.every(signedInteger) ||
      typeof cell.massKg !== "number" ||
      !Number.isFinite(cell.massKg) || cell.massKg < 0 ||
      typeof cell.liquidVolumeM3 !== "number" ||
      !Number.isFinite(cell.liquidVolumeM3) || cell.liquidVolumeM3 < 0
    )
      throw new Error("invalid environment water cell values");
    for (const field of ["capacityKg", "mobileKg", "moisture"])
      if (field in cell && (typeof cell[field] !== "number" || !Number.isFinite(cell[field] as number)))
        throw new Error("invalid environment water cell values");
    return Object.freeze({
      ...cell,
      at: Object.freeze([at[0], at[1], at[2]]) as Coordinate,
    }) as TerrainWaterFact;
  });
  return {
    terrainRevision: facts.terrainRevision as number,
    cells: Object.freeze(cells),
  };
}

function validateDefinition(definition: EnvironmentDefinition): void {
  const bounds = definition?.world?.bounds;
  const values = bounds && [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ];
  if (
    !values ||
    !values.every(Number.isSafeInteger) ||
    bounds.minX >= bounds.maxX ||
    bounds.minZ >= bounds.maxZ
  )
    throw new Error("invalid terrain presentation bounds");
  const columns = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
  if (!Number.isSafeInteger(columns) || columns < 1 || columns > MAX_COLUMNS)
    throw new Error("terrain presentation exceeds the column budget");
  if (!Number.isFinite(definition.world.verticalMetres) || definition.world.verticalMetres <= 0)
    throw new Error("invalid terrain presentation vertical scale");
}

/** Cached exterior terrain/water projection for trusted host presentation. */
export class TerrainPresentationOwner {
  private cached: CachedSurfaces | undefined;

  constructor(
    private readonly port: KernelPort,
    private readonly definition: EnvironmentDefinition,
  ) {
    validateDefinition(definition);
  }

  reset(): void {
    this.cached = undefined;
  }

  read(): TerrainPresentationFrame {
    const facts = parseFacts(this.port.environmentFacts());
    if (!this.cached || this.cached.revision !== facts.terrainRevision)
      this.cached = this.sampleSurfaces(facts.terrainRevision);
    const water = facts.cells.filter((cell) => this.isExteriorWater(cell));
    return Object.freeze({
      revision: facts.terrainRevision,
      verticalMetres: this.definition.world.verticalMetres,
      surfaces: this.cached.surfaces,
      structureSurfaces: this.cached.structureSurfaces,
      water: Object.freeze(water),
    });
  }

  private sampleSurfaces(revision: number): CachedSurfaces {
    const { minX, maxX, minZ, maxZ } = this.definition.world.bounds;
    const columns: [number, number][] = [];
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++) columns.push([x, z]);
    const byColumn = new Map<string, TerrainSurface | null>();
    const surfaces: TerrainSurface[] = [];
    const structureSurfaces: StructureSurface[] = [];
    let structureCount = 0;
    for (let offset = 0; offset < columns.length; offset += SURFACE_BATCH) {
      const batch = columns.slice(offset, offset + SURFACE_BATCH);
      const result = this.port.terrainSurfaces(batch);
      const structures = this.port.structureSurfaces(batch);
      if (result.length !== batch.length)
        throw new Error("terrain surface query returned the wrong count");
      if (structures.length !== batch.length)
        throw new Error("structure surface query returned the wrong count");
      for (let index = 0; index < batch.length; index++) {
        const surface = result[index];
        if (surface !== null) {
          const cell = surface.cell;
          if (
            cell[0] !== batch[index][0] ||
            cell[2] !== batch[index][1] ||
            !signedInteger(cell[1]) ||
            !Number.isInteger(surface.material) ||
            surface.material < 0 ||
            surface.material > 65535
          )
            throw new Error("invalid terrain surface projection");
          const copy = Object.freeze({
            cell: Object.freeze([cell[0], cell[1], cell[2]]) as TerrainSurface["cell"],
            material: surface.material,
          });
          byColumn.set(columnKey(batch[index][0], batch[index][1]), copy);
          surfaces.push(copy);
        } else byColumn.set(columnKey(batch[index][0], batch[index][1]), null);
        const parsed: StructureSurface[] = [];
        const seenCells = new Set<string>();
        const seenHeights = new Set<number>();
        if (!Array.isArray(structures[index]))
          throw new Error("invalid structure surface projection");
        for (const surface of structures[index]) {
          const cell = surface?.cell;
          if (!cell || cell.length !== 3 || cell[0] !== batch[index][0] ||
            cell[2] !== batch[index][1] || !signedInteger(cell[1]))
            throw new Error("invalid structure surface projection");
          const key = `${cell[0]},${cell[1]},${cell[2]}`;
          if (seenCells.has(key) || seenHeights.has(cell[1]))
            throw new Error("duplicate structure surface projection");
          seenCells.add(key);
          seenHeights.add(cell[1]);
          if (++structureCount > MAX_STRUCTURE_SURFACES)
            throw new Error("structure surface projection exceeds the budget");
          parsed.push(Object.freeze({
            cell: Object.freeze([cell[0], cell[1], cell[2]]) as StructureSurface["cell"],
          }));
        }
        structureSurfaces.push(...parsed);
      }
    }
    return {
      revision,
      surfaces: Object.freeze(surfaces),
      byColumn,
      structureSurfaces: Object.freeze(structureSurfaces),
    };
  }

  private isExteriorWater(cell: TerrainWaterFact): boolean {
    const { minX, maxX, minY, maxY, minZ, maxZ } = this.definition.world.bounds;
    const [x, y, z] = cell.at;
    if (x < minX || x >= maxX || z < minZ || z >= maxZ || y < minY || y >= maxY) return false;
    const surface = this.cached?.byColumn.get(columnKey(x, z));
    return surface === null || (surface !== undefined && y >= surface.cell[1]);
  }
}
