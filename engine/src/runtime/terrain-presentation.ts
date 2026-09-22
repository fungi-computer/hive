import type { EnvironmentDefinition } from "../sdk/environment";
import type { KernelPort, StructureSurface, TerrainChangeSet, TerrainPresentationDefinition, TerrainSurface } from "../contracts";
import { terrainSurfaceSchema } from "./terrain-surface";
import { terrainBaselineSchema, type TerrainBaseline } from "./terrain-regions";
import { MAX_TERRAIN_REGION_BYTES, terrainRegionPatchSchema, terrainRegionRequestSchema, type TerrainRegionRequest, type TerrainRegionRead, type TerrainRegionPatch, type TerrainRegionKey } from "./terrain-regions";
import { terrainRegionLayout, validateTerrainMaterialPatch, freezeTerrainMaterialPatch } from "./terrain-region-materials.js";

type Coordinate = readonly [number, number, number];

export interface TerrainWaterFact {
  readonly id?: string;
  readonly at: Coordinate;
  readonly kind?: string;
  readonly level: number;
  readonly massKg: number;
  readonly capacityKg?: number;
  readonly mobileKg?: number;
  readonly liquidVolumeM3: number;
  readonly moisture?: number;
  readonly [key: string]: unknown;
}

export interface TerrainPresentationFrame {
  readonly revision: number;
  readonly placementRevision: number;
  readonly verticalMetres: number;
  readonly baseline: TerrainBaseline;
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
function residentWindow(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, configured?: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  return configured ?? bounds;
}

function signedInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_I32 && value <= MAX_I32;
}

function columnKey(x: number, z: number): string {
  return `${x},${z}`;
}

function visualVariantSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function parseFacts(value: unknown): {
  readonly terrainRevision: number;
  readonly placementRevision: number;
  readonly cells: readonly TerrainWaterFact[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid environment facts");
  const facts = value as { readonly terrainRevision?: unknown; readonly placementRevision?: unknown; readonly cells?: unknown };
  if (!Number.isSafeInteger(facts.terrainRevision) || (facts.terrainRevision as number) < 0)
    throw new Error("invalid environment terrain revision");
  if (!Number.isSafeInteger(facts.placementRevision) || (facts.placementRevision as number) < 0)
    throw new Error("invalid environment placement revision");
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
      !Number.isInteger(cell.level) || (cell.level as number) < 0 || (cell.level as number) > 7 ||
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
    placementRevision: facts.placementRevision as number,
    cells: Object.freeze(cells),
  };
}

function validateDefinition(definition: EnvironmentDefinition, configured?: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
  const bounds = definition?.world?.bounds;
  const values = bounds && [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ];
  if (
    !values ||
    !values.every(Number.isSafeInteger) ||
    bounds.minX >= bounds.maxX ||
    bounds.minZ >= bounds.maxZ
  )
    throw new Error("invalid terrain presentation bounds");
  const window = residentWindow(bounds, configured);
  if (!window || ![window.minX, window.maxX, window.minZ, window.maxZ].every(Number.isSafeInteger) || window.minX < bounds.minX || window.maxX > bounds.maxX || window.minZ < bounds.minZ || window.maxZ > bounds.maxZ || window.minX >= window.maxX || window.minZ >= window.maxZ)
    throw new Error("invalid terrain presentation window");
  const columns = (window.maxX - window.minX) * (window.maxZ - window.minZ);
  if (!Number.isSafeInteger(columns) || columns < 1 || columns > MAX_COLUMNS)
    throw new Error("terrain presentation exceeds the column budget");
  if (!Number.isFinite(definition.world.verticalMetres) || definition.world.verticalMetres <= 0)
    throw new Error("invalid terrain presentation vertical scale");
}

/** Cached exterior terrain/water projection for trusted host presentation. */
export class TerrainPresentationOwner {
  verticalMetres(): number { return this.definition.world.verticalMetres; }
  private cached: CachedSurfaces | undefined;
  private readonly regions = new Map<string, { patch: TerrainRegionPatch; bytes: number }>();
  private regionBytes = 0;
  private regionEpoch: number | undefined;
  private regionRevision: number | undefined;

  private resetRegions(): void {
    this.regions.clear(); this.regionBytes = 0;
    this.regionEpoch = this.regionRevision = undefined;
  }

  constructor(
    private readonly port: KernelPort,
    private readonly definition: EnvironmentDefinition,
    private readonly configuredWindow?: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number },
    private readonly presentation?: TerrainPresentationDefinition,
  ) {
    validateDefinition(definition, configuredWindow);
    const slots = new Set(definition.materials.map(material => material.slot));
    const presented = presentation?.materials ?? [];
    if (presented.length !== new Set(presented.map(material => material.slot)).size ||
      presented.some(material => !slots.has(material.slot) || typeof material.art !== "string" || material.art.length < 1 || material.art.length > 64))
      throw new Error("invalid terrain presentation material definition");
  }

  reset(): void {
    this.cached = undefined;
    this.resetRegions();
  }

  baseline(): TerrainBaseline {
    const artBySlot = new Map(this.presentation?.materials.map(material => [material.slot, material.art]));
    return terrainBaselineSchema.parse({ protocolVersion: 5, bounds: this.definition.world.bounds,
      verticalMetres: this.definition.world.verticalMetres,
      variantSeed: visualVariantSeed(`${this.definition.world.identity}\u0000${this.definition.world.seed}`),
      materials: this.definition.materials.map(({ slot, solid }) => ({ slot, solid,
        ...(artBySlot.has(slot) ? { art: artBySlot.get(slot) } : {}) })) });
  }

  /** One complete bounded material slab per turn; cached patches are disposable
   * presentation only and are retired together on epoch or terrain mutation. */
  readRegion(raw: TerrainRegionRequest, key: TerrainRegionKey, currentEpoch: number): TerrainRegionRead {
    const request = terrainRegionRequestSchema.parse(raw);
    if (!request.regions.some(region => region[0] === key[0] && region[1] === key[1] && region[2] === key[2]))
      throw new Error("unrequested terrain region key");
    const facts = parseFacts(this.port.environmentFacts());
    const identity = { requestId: request.requestId, epoch: currentEpoch,
      terrainRevision: facts.terrainRevision };
    if (request.epoch !== currentEpoch || request.terrainRevision !== facts.terrainRevision)
      return { kind: "stale", ...identity };
    if (this.regionEpoch !== currentEpoch || this.regionRevision !== facts.terrainRevision) {
      this.resetRegions(); this.regionEpoch = currentEpoch; this.regionRevision = facts.terrainRevision;
    }
    // Replace JSON's four-byte null with the already measured immutable patch.
    const envelopeBytes = new TextEncoder().encode(JSON.stringify({kind:"patch",...identity,patch:null})).byteLength - 4;
    const id = key.join(","), cached = this.regions.get(id);
    if (cached) {
      if (cached.bytes + envelopeBytes > MAX_TERRAIN_REGION_BYTES)
        return {kind:"unavailable",...identity,reason:"terrain region exceeds byte budget"};
      this.regions.delete(id); this.regions.set(id, cached);
      return { kind: "patch", ...identity, patch: cached.patch };
    }
    const unavailable = (reason: string): TerrainRegionRead => ({ kind: "unavailable", ...identity, reason });
    const layout = terrainRegionLayout(this.definition.world.bounds, key);
    if (!layout) return unavailable("terrain region does not intersect authoritative bounds");
    const {bounds, coverage} = layout;
    const columns: TerrainRegionPatch["columns"] = [];
    const coordinates: [number, number][] = [];
    const cells: [number, number, number][] = [];
    for (let x=coverage.minX;x<coverage.maxX;x++) for(let z=coverage.minZ;z<coverage.maxZ;z++) {
      coordinates.push([x,z]);
      for(let y=coverage.minY;y<coverage.maxY;y++) cells.push([x,y,z]);
    }
    // At most 10*10*130 samples, including the halo. Sample exact slots even
    // above the exterior surface: non-solid material is not necessarily air.
    const palette = new Set(this.definition.materials.map(material => material.slot));
    const materials: number[] = [];
    for(let offset=0;offset<cells.length;offset+=256) {
      const batch=cells.slice(offset,offset+256), sampled=this.port.terrainMaterials(batch);
      if(sampled.length!==batch.length) throw new Error("terrain material query returned the wrong count");
      for(const slot of sampled) {
        if(!Number.isInteger(slot)||!palette.has(slot)) throw new Error("terrain material query returned an unknown slot");
        materials.push(slot);
      }
    }
    let index=0;
    for(const [x,z] of coordinates) {
      const runs: [number,number][]=[];
      for(let y=coverage.minY;y<coverage.maxY;y++) {
        const slot=materials[index++], previous=runs[runs.length-1];
        if(previous?.[1]===slot) previous[0]=y+1;
        else runs.push([y+1,slot]);
      }
      columns.push({x,z,runs});
    }
    const surfaces=[...this.sampleSurfaceColumns(coordinates).values()].filter(Boolean);
    const patch=terrainRegionPatchSchema.parse({key,bounds,coverage,columns,surfaces});
    validateTerrainMaterialPatch(patch, this.baseline());
    const bytes = new TextEncoder().encode(JSON.stringify(patch)).byteLength;
    if(bytes + envelopeBytes > MAX_TERRAIN_REGION_BYTES) return unavailable("terrain region exceeds byte budget");
    // Consumers borrow these facts; mutating one cached response cannot poison
    // a later client or request. No atlas or camera state enters this cache.
    freezeTerrainMaterialPatch(patch);
    this.regions.set(id,{patch,bytes}); this.regionBytes += bytes;
    while(this.regions.size > 128 || this.regionBytes > 4*1024*1024) {
      const oldest = this.regions.keys().next().value!;
      this.regionBytes -= this.regions.get(oldest)!.bytes; this.regions.delete(oldest);
    }
    return {kind:"patch",...identity,patch};
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
    const water = facts.cells.filter((cell) => this.isObservedWater(cell));
    return Object.freeze({
      revision: facts.terrainRevision,
      placementRevision: facts.placementRevision,
      verticalMetres: this.definition.world.verticalMetres,
      baseline: this.baseline(),
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
    const { minX, maxX, minZ, maxZ } = residentWindow(this.definition.world.bounds, this.configuredWindow);
    const columns: [number, number][] = [];
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++) columns.push([x, z]);
    return columns;
  }

  private inBounds(column: readonly [number, number]): boolean {
    const { minX, maxX, minZ, maxZ } = residentWindow(this.definition.world.bounds, this.configuredWindow);
    return column[0] >= minX && column[0] < maxX && column[1] >= minZ && column[1] < maxZ;
  }

  /** One authority-side cover projection shared by push observations and
   * camera-demanded region reads. Native current cover, when present, overrides
   * fresh-world decoration. Cover-only mutations must publish authoritative
   * invalidation; querying or rendering does not create that mutation owner. */
  private sampleSurfaceColumns(columns: readonly [number, number][]): ReadonlyMap<string, TerrainSurface | null> {
    const byColumn = new Map<string, TerrainSurface | null>();
    for (let offset = 0; offset < columns.length; offset += SURFACE_BATCH) {
      const batch = columns.slice(offset, offset + SURFACE_BATCH);
      const result = this.port.terrainSurfaces(batch);
      if (result.length !== batch.length) throw new Error("terrain surface query returned the wrong count");
      for (let index = 0; index < batch.length; index++) {
        const column = batch[index], surface = result[index];
        if (surface === null) { byColumn.set(columnKey(column[0], column[1]), null); continue; }
        const parsed = terrainSurfaceSchema.parse(surface), cell = parsed.cell;
        if (cell[0] !== column[0] || cell[2] !== column[1]) throw new Error("invalid terrain surface projection");
        const cover = parsed.cover ?? (cell[1] === parsed.generatedTop
          ? this.presentation?.generatedCover?.({ cell, material: parsed.material, generatedTop: parsed.generatedTop,
              worldSeed: this.definition.world.seed, worldIdentity: this.definition.world.identity }) ?? undefined
          : undefined);
        byColumn.set(columnKey(column[0], column[1]), terrainSurfaceSchema.parse({ ...parsed,
          ...(cover === undefined ? {} : { cover }) }));
      }
    }
    return byColumn;
  }

  private sampleColumns(columns: readonly [number, number][]): {
    readonly byColumn: ReadonlyMap<string, TerrainSurface | null>;
    readonly structuresByColumn: ReadonlyMap<string, readonly StructureSurface[]>;
  } {
    const byColumn = new Map<string, TerrainSurface | null>();
    const structuresByColumn = new Map<string, readonly StructureSurface[]>();
    for (let offset = 0; offset < columns.length; offset += SURFACE_BATCH) {
      const batch = columns.slice(offset, offset + SURFACE_BATCH);
      const result = this.sampleSurfaceColumns(batch);
      const structures = this.port.structureSurfaces(batch);
      if (structures.length !== batch.length) throw new Error("structure surface query returned the wrong count");
      for (let index = 0; index < batch.length; index++) {
        const column = batch[index];
        byColumn.set(columnKey(column[0], column[1]), result.get(columnKey(column[0], column[1])) ?? null);
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

  private isObservedWater(cell: TerrainWaterFact): boolean {
    const { minX, maxX, minY, maxY, minZ, maxZ } = this.definition.world.bounds;
    const [x, y, z] = cell.at;
    if (x < minX || x >= maxX || z < minZ || z >= maxZ || y < minY || y >= maxY) return false;
    const window = residentWindow(this.definition.world.bounds, this.configuredWindow);
    return x >= window.minX && x < window.maxX && z >= window.minZ && z < window.maxZ;
  }
}
