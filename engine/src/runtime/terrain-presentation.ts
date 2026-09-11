import type { EnvironmentDefinition } from "../sdk/environment";
import type { KernelPort, StructureSurface, TerrainChangeSet, TerrainSurface } from "../contracts";

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
  readonly structuresByColumn: ReadonlyMap<string, readonly StructureSurface[]>;
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
    if (!this.cached) this.cached = this.sampleSurfaces(facts.terrainRevision);
    else if (this.cached.revision !== facts.terrainRevision) {
      const changes = this.port.terrainChanges(this.cached.revision);
      if (changes.revision !== facts.terrainRevision)
        throw new Error("terrain change revision does not match environment facts");
      this.cached = changes.kind === "full-reset"
        ? this.sampleSurfaces(facts.terrainRevision)
        : this.patchSurfaces(this.cached, facts.terrainRevision, changes);
    }
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
    const columns = this.columns();
    const sampled = this.sampleColumns(columns);
    return this.assemble(revision, columns, sampled.byColumn, sampled.structuresByColumn);
  }

  private patchSurfaces(
    cached: CachedSurfaces,
    revision: number,
    changes: Extract<TerrainChangeSet, { readonly kind: "changed-columns" }>,
  ): CachedSurfaces {
    const seen = new Set<string>();
    for (const column of changes.columns) {
      const key = columnKey(column[0], column[1]);
      if (!this.inBounds(column) || seen.has(key)) throw new Error("invalid terrain changed column");
      seen.add(key);
    }
    const sampled = this.sampleColumns(changes.columns.map(([x, z]): [number, number] => [x, z]));
    const byColumn = new Map(cached.byColumn);
    const structuresByColumn = new Map(cached.structuresByColumn);
    for (const column of changes.columns) {
      const key = columnKey(column[0], column[1]);
      byColumn.set(key, sampled.byColumn.get(key) ?? null);
      structuresByColumn.set(key, sampled.structuresByColumn.get(key) ?? []);
    }
    return this.assemble(revision, this.columns(), byColumn, structuresByColumn);
  }

  private columns(): [number, number][] {
    const { minX, maxX, minZ, maxZ } = this.definition.world.bounds;
    const columns: [number, number][] = [];
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++) columns.push([x, z]);
    return columns;
  }

  private inBounds(column: readonly [number, number]): boolean {
    const { minX, maxX, minZ, maxZ } = this.definition.world.bounds;
    return column[0] >= minX && column[0] < maxX && column[1] >= minZ && column[1] < maxZ;
  }

  private sampleColumns(columns: readonly [number, number][]): {
    readonly byColumn: ReadonlyMap<string, TerrainSurface | null>;
    readonly structuresByColumn: ReadonlyMap<string, readonly StructureSurface[]>;
  } {
    const byColumn = new Map<string, TerrainSurface | null>();
    const structuresByColumn = new Map<string, readonly StructureSurface[]>();
    for (let offset = 0; offset < columns.length; offset += SURFACE_BATCH) {
      const batch = columns.slice(offset, offset + SURFACE_BATCH);
      const result = this.port.terrainSurfaces(batch);
      const structures = this.port.structureSurfaces(batch);
      if (result.length !== batch.length) throw new Error("terrain surface query returned the wrong count");
      if (structures.length !== batch.length) throw new Error("structure surface query returned the wrong count");
      for (let index = 0; index < batch.length; index++) {
        const column = batch[index];
        const surface = result[index];
        if (surface !== null) {
          const cell = surface.cell;
          if (cell[0] !== column[0] || cell[2] !== column[1] || !signedInteger(cell[1]) ||
            !Number.isInteger(surface.material) || surface.material < 0 || surface.material > 65535)
            throw new Error("invalid terrain surface projection");
          byColumn.set(columnKey(column[0], column[1]), Object.freeze({
            cell: Object.freeze([cell[0], cell[1], cell[2]]) as TerrainSurface["cell"],
            material: surface.material,
          }));
        } else byColumn.set(columnKey(column[0], column[1]), null);
        const parsed: StructureSurface[] = [];
        const seenHeights = new Set<number>();
        if (!Array.isArray(structures[index])) throw new Error("invalid structure surface projection");
        for (const surface of structures[index]) {
          const cell = surface?.cell;
          if (!cell || cell.length !== 3 || cell[0] !== column[0] || cell[2] !== column[1] || !signedInteger(cell[1]))
            throw new Error("invalid structure surface projection");
          if (seenHeights.has(cell[1])) throw new Error("duplicate structure surface projection");
          seenHeights.add(cell[1]);
          parsed.push(Object.freeze({ cell: Object.freeze([cell[0], cell[1], cell[2]]) as StructureSurface["cell"] }));
        }
        structuresByColumn.set(columnKey(column[0], column[1]), Object.freeze(parsed));
      }
    }
    return { byColumn, structuresByColumn };
  }

  private assemble(
    revision: number,
    columns: readonly [number, number][],
    byColumn: ReadonlyMap<string, TerrainSurface | null>,
    structuresByColumn: ReadonlyMap<string, readonly StructureSurface[]>,
  ): CachedSurfaces {
    const surfaces: TerrainSurface[] = [];
    const structureSurfaces: StructureSurface[] = [];
    for (const column of columns) {
      const key = columnKey(column[0], column[1]);
      const surface = byColumn.get(key);
      if (surface !== undefined && surface !== null) surfaces.push(surface);
      const structures = structuresByColumn.get(key);
      if (!structures) throw new Error("terrain structure projection is missing a column");
      if (structureSurfaces.length + structures.length > MAX_STRUCTURE_SURFACES)
        throw new Error("structure surface projection exceeds the budget");
      structureSurfaces.push(...structures);
    }
    return {
      revision,
      surfaces: Object.freeze(surfaces),
      byColumn,
      structuresByColumn,
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
