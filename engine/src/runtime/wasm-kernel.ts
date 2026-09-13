import { z } from "zod";
import { terrainSurfaceSchema } from "./terrain-surface";
import { physicalContactQuery } from "./physical-contact-query";
import type {
  AssignmentCandidate,
  AssignmentPair,
  ActionRequest,
  AdvanceResult,
  AtmosphereSamples,
  ConstructionReadiness,
  ConstructionAccess,
  ComponentDefinition,
  EntityId,
  KernelPort,
  QueryRow,
  QuerySpec,
  RenderFact,
  StructureSurface,
  TerrainChangeSet,
  RouteCostResult,
  RouteToAnyRequest,
  RouteToAnyResult,
  WorldPose,
  WorkMaterialFacts,
  WriteIntent,
  EntityRecord,
} from "../contracts";
import { ASSIGNMENT_MAX_EDGES, checkedAssignments } from "../sdk/assignment";
import { WasmKernelRecords } from "../../generated/hive_kernel.js";
import {
  captureKernelRecords,
  restoreKernelRecords,
  type NativeRecordBinding,
} from "./kernel-records";

export interface WasmKernelBinding extends NativeRecordBinding {
  free(): void;
  load(json: string): void;
  load_environment(json: string): void;
  environment_facts(): string;
  atmosphere_samples(json: string): string;
  construction_readiness(json: string): string;
  construction_access(json: string): string;
  physical_contacts(json: string): string;
  terrain_materials(json: string): string;
  terrain_surfaces(json: string): string;
  structure_surfaces(json: string): string;
  terrain_changes(json: string): string;
  query(json: string): string;
  work_material_snapshot(): string;
  entity_membership(json: string): string;
  advance(json: string): string;
  render_facts(): string;
  world_pose(json: string): string;
  route_costs(json: string): string;
  route_to_any(json: string): string;
  assign(json: string): string;
}
type QueryWire = { id: EntityId; components: Record<string, unknown> };
const surfaceResultsSchema = z.array(terrainSurfaceSchema.nullable()).max(64);
const entityIdWireSchema = z.custom<EntityId>(
  (value) =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value),
);
const routeToAnyResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      actor: entityIdWireSchema,
      status: z.literal("reachable"),
      targetIndex: z.number().int().nonnegative(),
      cost: z.number().finite().nonnegative(),
    })
    .strict(),
  z
    .object({
      actor: entityIdWireSchema,
      status: z.literal("unavailable"),
      reason: z.string(),
    })
    .strict(),
]);
const constructionAccessSchema = z.array(z.object({
  site: entityIdWireSchema,
  support: z.enum(["ready", "waitingForSupport", "unknown"]),
  materialsReady: z.boolean(),
  contacts: z.array(z.object({
    x: z.number().finite(), y: z.number().finite(), z: z.number().finite(),
    frame: z.null(), kind: z.enum(["origin", "landing"]),
  }).strict()).max(32),
}).strict()).max(256);
function validateConstructionAccessSites(sites: readonly EntityId[]): void {
  if (!Array.isArray(sites) || sites.length === 0 || sites.length > 256)
    throw new Error("construction access needs 1..256 sites");
  if (new Set(sites).size !== sites.length)
    throw new Error("duplicate construction access site");
}
export function parseConstructionAccess(value: unknown, sites: readonly EntityId[]): readonly ConstructionAccess[] {
  validateConstructionAccessSites(sites);
  const rows = constructionAccessSchema.parse(value);
  if (rows.length !== sites.length || rows.some((row, index) => row.site !== sites[index]))
    throw new Error("construction access result order mismatch");
  return rows;
}
function parseConstructionReadiness(value: unknown, sites: readonly EntityId[]): readonly ConstructionReadiness[] {
  if (!Array.isArray(value) || value.length !== sites.length)
    throw new Error("invalid construction readiness result");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error("invalid construction readiness row");
    const row = Object.fromEntries(Object.entries(entry));
    if (Object.keys(row).some((key) => !["site", "status", "reason"].includes(key)))
      throw new Error("invalid construction readiness row");
    const site = row.site;
    if (typeof site !== "string" || site !== sites[index])
      throw new Error("construction readiness result order mismatch");
    const statusValue = row.status;
    if (statusValue !== "ready" && statusValue !== "waitingForSupport" && statusValue !== "unknown")
      throw new Error("invalid construction readiness status");
    const reason = row.reason;
    if (reason !== undefined && reason !== "missingStructuralSupport")
      throw new Error("invalid construction readiness reason");
    if (statusValue === "waitingForSupport" && reason !== "missingStructuralSupport")
      throw new Error("construction readiness is missing its waiting reason");
    const requestedSite = sites[index];
    if (reason === undefined) return { site: requestedSite, status: statusValue };
    return { site: requestedSite, status: statusValue, reason };
  });
}
/** Adapts the generated wasm-bindgen class without exposing it to authored games. */
export function wasmKernelPort(binding: WasmKernelBinding): KernelPort {
  return {
    routeCosts(requests) {
      if (
        !Array.isArray(requests) ||
        requests.length < 1 ||
        requests.length > 32
      )
        throw new Error("route costs need 1..32 requests");
      const result: unknown = JSON.parse(
        binding.route_costs(JSON.stringify(requests)),
      );
      if (
        !Array.isArray(result) ||
        result.length !== requests.length ||
        result.some(
          (entry, index) =>
            !entry ||
            entry.actor !== requests[index].actor ||
            (entry.status === "reachable"
              ? !Number.isFinite(entry.cost) || entry.cost < 0
              : entry.status !== "unavailable" ||
                typeof entry.reason !== "string"),
        )
      )
        throw new Error("invalid route cost result");
      return result as RouteCostResult[];
    },
    routeToAny(request: RouteToAnyRequest): RouteToAnyResult {
      if (
        !request ||
        !Array.isArray(request.targets) ||
        request.targets.length < 1 ||
        request.targets.length > 32
      )
        throw new Error("route-to-any needs 1..32 targets");
      const result = routeToAnyResultSchema.parse(
        JSON.parse(binding.route_to_any(JSON.stringify(request))),
      );
      if (
        result.actor !== request.actor ||
        (result.status === "reachable" &&
          result.targetIndex >= request.targets.length)
      )
        throw new Error("invalid route-to-any result");
      return result;
    },
    dispose() {
      binding.free();
    },
    load(definition) {
      binding.load(new TextDecoder().decode(definition));
    },
    loadEnvironment(definition) {
      binding.load_environment(new TextDecoder().decode(definition));
    },
    environmentFacts() {
      return JSON.parse(binding.environment_facts()) as unknown;
    },
    atmosphereSamples(cells): AtmosphereSamples {
      if (
        cells.length === 0 ||
        cells.length > 64 ||
        cells.some(
          (cell) =>
            !Array.isArray(cell) ||
            cell.length !== 3 ||
            cell.some(
              (coordinate) =>
                !Number.isInteger(coordinate) ||
                coordinate < -2147483648 ||
                coordinate > 2147483647,
            ),
        )
      )
        throw new Error(
          "atmosphere query must contain between 1 and 64 signed integer cells",
        );
      const value: unknown = JSON.parse(
        binding.atmosphere_samples(JSON.stringify(cells)),
      );
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("invalid atmosphere sample result");
      const result = value as {
        readonly revision?: unknown;
        readonly geometryRevision?: unknown;
        readonly samples?: unknown;
      };
      if (
        !Number.isSafeInteger(result.revision) ||
        (result.revision as number) < 0 ||
        !Number.isSafeInteger(result.geometryRevision) ||
        (result.geometryRevision as number) < 0 ||
        !Array.isArray(result.samples) ||
        result.samples.length !== cells.length
      )
        throw new Error("invalid atmosphere sample result");
      const samples = result.samples.map(
        (sample): AtmosphereSamples["samples"][number] => {
          if (sample === null) return null;
          if (!sample || typeof sample !== "object" || Array.isArray(sample))
            throw new Error("invalid atmosphere sample");
          const entry = sample as Record<string, unknown>;
          if (
            typeof entry.volumeId !== "string" ||
            entry.volumeId.length === 0 ||
            entry.volumeId.length > 128 ||
            !Number.isFinite(entry.temperatureC) ||
            !Number.isFinite(entry.smokeKgM3) ||
            (entry.smokeKgM3 as number) < 0
          )
            throw new Error("invalid atmosphere sample");
          return {
            volumeId: entry.volumeId,
            temperatureC: entry.temperatureC as number,
            smokeKgM3: entry.smokeKgM3 as number,
          };
        },
      );
      return {
        revision: result.revision as number,
        geometryRevision: result.geometryRevision as number,
        samples,
      };
    },
    constructionReadiness(sites): readonly ConstructionReadiness[] {
      if (!Array.isArray(sites) || sites.length === 0 || sites.length > 256)
        throw new Error("construction readiness needs 1..256 sites");
      const value: unknown = JSON.parse(binding.construction_readiness(JSON.stringify(sites)));
      return parseConstructionReadiness(value, sites);
    },
    constructionAccess(sites): readonly ConstructionAccess[] {
      validateConstructionAccessSites(sites);
      return parseConstructionAccess(JSON.parse(binding.construction_access(JSON.stringify(sites))), sites);
    },
    physicalContacts(cells) {
      return physicalContactQuery(
        (json) => binding.physical_contacts(json),
        cells,
      );
    },
    terrainMaterials(cells) {
      if (
        cells.length === 0 ||
        cells.length > 256 ||
        cells.some(
          (cell) =>
            !Array.isArray(cell) ||
            cell.length !== 3 ||
            cell.some(
              (coordinate) =>
                !Number.isInteger(coordinate) ||
                coordinate < -2147483648 ||
                coordinate > 2147483647,
            ),
        )
      )
        throw new Error(
          "terrain material query must contain between 1 and 256 signed integer cells",
        );
      const result = JSON.parse(
        binding.terrain_materials(JSON.stringify(cells)),
      ) as unknown;
      if (
        !Array.isArray(result) ||
        result.length !== cells.length ||
        !result.every(
          (material) =>
            Number.isInteger(material) && material >= 0 && material <= 65535,
        )
      )
        throw new Error("invalid terrain material query result");
      return result;
    },
    terrainSurfaces(columns) {
      if (
        columns.length === 0 ||
        columns.length > 64 ||
        columns.some(
          (column) =>
            !Array.isArray(column) ||
            column.length !== 2 ||
            column.some(
              (coordinate) =>
                !Number.isInteger(coordinate) ||
                coordinate < -2147483648 ||
                coordinate > 2147483647,
            ),
        )
      )
        throw new Error(
          "terrain surface query must contain between 1 and 64 signed integer columns",
        );
      const result = surfaceResultsSchema.parse(
        JSON.parse(binding.terrain_surfaces(JSON.stringify(columns))),
      );
      if (
        result.length !== columns.length ||
        result.some(
          (surface, index) =>
            surface !== null &&
            (surface.cell[0] !== columns[index][0] ||
              surface.cell[2] !== columns[index][1]),
        )
      )
        throw new Error(
          "terrain surface result does not match requested columns",
        );
      return result;
    },
    structureSurfaces(columns) {
      if (
        columns.length === 0 ||
        columns.length > 64 ||
        columns.some(
          (column) =>
            !Array.isArray(column) ||
            column.length !== 2 ||
            column.some(
              (coordinate) =>
                !Number.isInteger(coordinate) ||
                coordinate < -2147483648 ||
                coordinate > 2147483647,
            ),
        )
      )
        throw new Error(
          "structure surface query must contain between 1 and 64 signed integer columns",
        );
      const result = JSON.parse(
        binding.structure_surfaces(JSON.stringify(columns)),
      ) as unknown;
      if (
        !Array.isArray(result) ||
        result.length !== columns.length ||
        result.some((entry, index) => {
          if (!Array.isArray(entry)) return true;
          const seen = new Set<string>();
          return entry.some((surface) => {
            if (
              !surface ||
              typeof surface !== "object" ||
              Array.isArray(surface)
            )
              return true;
            const cell = (surface as { readonly cell?: unknown }).cell;
            if (
              !Array.isArray(cell) ||
              cell.length !== 3 ||
              !cell.every(
                (coordinate) =>
                  Number.isInteger(coordinate) &&
                  coordinate >= -2147483648 &&
                  coordinate <= 2147483647,
              ) ||
              cell[0] !== columns[index][0] ||
              cell[2] !== columns[index][1]
            )
              return true;
            const key = `${cell[0]},${cell[1]},${cell[2]}`;
            if (seen.has(key)) return true;
            seen.add(key);
            return false;
          });
        })
      )
        throw new Error("invalid structure surface query result");
      return result as readonly (readonly StructureSurface[])[];
    },
    terrainChanges(sinceRevision): TerrainChangeSet {
      if (!Number.isSafeInteger(sinceRevision) || sinceRevision < 0)
        throw new Error(
          "terrain change revision must be a nonnegative safe integer",
        );
      const result: unknown = JSON.parse(
        binding.terrain_changes(JSON.stringify(sinceRevision)),
      );
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new Error("invalid terrain change result");
      const value = result as {
        readonly kind?: unknown;
        readonly revision?: unknown;
        readonly reason?: unknown;
        readonly columns?: unknown;
      };
      if (
        !Number.isSafeInteger(value.revision) ||
        (value.revision as number) < 0
      )
        throw new Error("invalid terrain change result");
      if (
        value.kind === "full-reset" &&
        (value.reason === "history" ||
          value.reason === "restored" ||
          value.reason === "stale")
      )
        return {
          kind: "full-reset",
          revision: value.revision as number,
          reason: value.reason,
        };
      if (
        value.kind !== "changed-columns" ||
        !Array.isArray(value.columns) ||
        value.columns.length > 4096
      )
        throw new Error("invalid terrain change result");
      const seen = new Set<string>();
      const columns = value.columns.map((column): readonly [number, number] => {
        if (
          !Array.isArray(column) ||
          column.length !== 2 ||
          !column.every(
            (coordinate) =>
              Number.isInteger(coordinate) &&
              coordinate >= -2147483648 &&
              coordinate <= 2147483647,
          )
        )
          throw new Error("invalid terrain changed column");
        const parsed = [column[0] as number, column[1] as number] as const;
        const key = `${parsed[0]},${parsed[1]}`;
        if (seen.has(key)) throw new Error("duplicate terrain changed column");
        seen.add(key);
        return parsed;
      });
      return {
        kind: "changed-columns",
        revision: value.revision as number,
        columns,
      };
    },
    query(spec: QuerySpec): readonly QueryRow[] {
      const ids = spec.components.map((component) => component.id);
      return (
        JSON.parse(binding.query(JSON.stringify(ids))) as QueryWire[]
      ).map((row) => ({
        id: row.id,
        get<V extends object>(definition: ComponentDefinition<V>): V {
          const value = row.components[definition.id];
          if (!value || typeof value !== "object")
            throw new Error(`query row ${row.id} lacks ${definition.id}`);
          return value as V;
        },
      }));
    },
    workMaterialFacts(): WorkMaterialFacts {
      const value: unknown = JSON.parse(binding.work_material_snapshot());
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("invalid work material facts");
      const result = value as Record<string, unknown>;
      if (
        result.version !== 1 ||
        !Array.isArray(result.containers) ||
        !Array.isArray(result.lots) ||
        result.containers.length > 4096 ||
        result.lots.length > 4096
      )
        throw new Error("invalid work material facts");
      const id = (entry: unknown): EntityId => {
        if (
          typeof entry !== "string" ||
          entry.length === 0 ||
          entry.length > 128 ||
          !/^[A-Za-z0-9._:-]+$/.test(entry)
        )
          throw new Error("invalid work material entity");
        return entry as EntityId;
      };
      const containers = result.containers.map(
        (entry): WorkMaterialFacts["containers"][number] => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new Error("invalid work material container");
          const row = entry as Record<string, unknown>;
          if (
            !Number.isSafeInteger(row.capacity) ||
            (row.capacity as number) < 0 ||
            (row.capacity as number) > 0xffffffff ||
            typeof row.sealed !== "boolean"
          )
            throw new Error("invalid work material container");
          return {
            id: id(row.id),
            capacity: row.capacity as number,
            sealed: row.sealed as boolean,
          };
        },
      );
      const lots = result.lots.map(
        (entry): WorkMaterialFacts["lots"][number] => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new Error("invalid work material lot");
          const row = entry as Record<string, unknown>;
          if (
            typeof row.kind !== "string" ||
            row.kind.length === 0 ||
            row.kind.length > 128 ||
            !Number.isSafeInteger(row.quantity) ||
            (row.quantity as number) < 0 ||
            (row.quantity as number) > 0xffffffff
          )
            throw new Error("invalid work material lot");
          return {
            id: id(row.id),
            kind: row.kind as string,
            quantity: row.quantity as number,
            container: id(row.container),
          };
        },
      );
      return { version: 1, containers, lots };
    },
    entityMembership(ids) {
      if (ids.length === 0 || ids.length > 128)
        throw new Error(
          "entity membership query must contain between 1 and 128 entities",
        );
      const result = JSON.parse(
        binding.entity_membership(JSON.stringify(ids)),
      ) as unknown;
      if (
        !Array.isArray(result) ||
        result.length !== ids.length ||
        !result.every((value) => typeof value === "boolean")
      )
        throw new Error("invalid entity membership result");
      return result;
    },
    advance(
      delta: number,
      writes: readonly WriteIntent[],
      actions: readonly ActionRequest[],
      options?: {
        readonly creates?: readonly EntityRecord[];
        readonly removes?: readonly EntityId[];
      },
    ): AdvanceResult {
      const result = JSON.parse(
        binding.advance(
          JSON.stringify({
            delta,
            writes,
            actions,
            creates: options?.creates ?? [],
            removes: options?.removes ?? [],
          }),
        ),
      ) as AdvanceResult;
      if (
        !Number.isSafeInteger(result.revision) ||
        result.revision < 0 ||
        !Array.isArray(result.results) ||
        !Array.isArray(result.impacts)
      )
        throw new Error("invalid kernel advance result");
      return result;
    },
    snapshot() {
      return captureKernelRecords(binding);
    },
    restore(snapshot) {
      restoreKernelRecords(binding, () => new WasmKernelRecords(), snapshot);
    },
    renderFacts(limit = 512) {
      return (JSON.parse(binding.render_facts()) as RenderFact[]).slice(
        0,
        limit,
      );
    },
    worldPoses(entities) {
      if (entities.length === 0 || entities.length > 128)
        throw new Error(
          "world pose query must contain between 1 and 128 entities",
        );
      return JSON.parse(
        binding.world_pose(JSON.stringify(entities)),
      ) as WorldPose[];
    },
    assign(
      candidates: readonly AssignmentCandidate[],
      maxEdges = ASSIGNMENT_MAX_EDGES,
    ): readonly AssignmentPair[] {
      const checked = checkedAssignments(candidates, maxEdges);
      const result = JSON.parse(
        binding.assign(
          JSON.stringify({ candidates: checked, max_edges: maxEdges }),
        ),
      ) as { assignments: AssignmentPair[] };
      return result.assignments;
    },
  };
}
