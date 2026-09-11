import type {
  AssignmentCandidate,
  AssignmentPair,
  ActionRequest,
  AdvanceResult,
  ComponentDefinition,
  EntityId,
  KernelPort,
  QueryRow,
  QuerySpec,
  RenderFact,
  TerrainSurface,
  WorldPose,
  WriteIntent,
  EntityRecord,
} from "../contracts";
import { checkedAssignments } from "../sdk/assignment";
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
  terrain_materials(json: string): string;
  terrain_surfaces(json: string): string;
  query(json: string): string;
  entity_membership(json: string): string;
  advance(json: string): string;
  render_facts(): string;
  world_pose(json: string): string;
  assign(json: string): string;
}
type QueryWire = { id: EntityId; components: Record<string, unknown> };
/** Adapts the generated wasm-bindgen class without exposing it to authored games. */
export function wasmKernelPort(binding: WasmKernelBinding): KernelPort {
  return {
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
      const result = JSON.parse(
        binding.terrain_surfaces(JSON.stringify(columns)),
      ) as unknown;
      if (
        !Array.isArray(result) ||
        result.length !== columns.length ||
        !result.every((surface, index) => {
          if (surface === null) return true;
          if (!surface || typeof surface !== "object" || Array.isArray(surface))
            return false;
          const value = surface as {
            readonly cell?: unknown;
            readonly material?: unknown;
          };
          const cell = value.cell;
          const column = columns[index];
          return (
            Array.isArray(cell) &&
            cell.length === 3 &&
            cell.every(
              (coordinate) =>
                Number.isInteger(coordinate) &&
                coordinate >= -2147483648 &&
                coordinate <= 2147483647,
            ) &&
            cell[0] === column[0] &&
            cell[2] === column[1] &&
            Number.isInteger(value.material) &&
            (value.material as number) >= 0 &&
            (value.material as number) <= 65535
          );
        })
      )
        throw new Error("invalid terrain surface query result");
      return result as (TerrainSurface | null)[];
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
    entityMembership(ids) {
      if (ids.length === 0 || ids.length > 128)
        throw new Error("entity membership query must contain between 1 and 128 entities");
      const result = JSON.parse(binding.entity_membership(JSON.stringify(ids))) as unknown;
      if (!Array.isArray(result) || result.length !== ids.length ||
          !result.every((value) => typeof value === "boolean"))
        throw new Error("invalid entity membership result");
      return result;
    },
    advance(
      delta: number,
      writes: readonly WriteIntent[],
    actions: readonly ActionRequest[],
    options?: { readonly creates?: readonly EntityRecord[]; readonly removes?: readonly EntityId[] },
    ): AdvanceResult {
      const result = JSON.parse(
        binding.advance(JSON.stringify({ delta, writes, actions, creates: options?.creates ?? [], removes: options?.removes ?? [] })),
      ) as AdvanceResult;
      if (!Number.isSafeInteger(result.revision) || result.revision < 0 ||
          !Array.isArray(result.results) || !Array.isArray(result.impacts))
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
      maxEdges = 128,
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
