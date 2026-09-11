import type {
  AssignmentCandidate,
  AssignmentPair,
  ActionRequest,
  AdvanceResult,
  ComponentDefinition,
  EntityId,
  KernelPort,
  KernelSnapshot,
  QueryRow,
  QuerySpec,
  RenderFact,
  WorldPose,
  WriteIntent,
} from "../contracts";
import { checkedAssignments } from "../sdk/assignment";

export interface WasmKernelBinding {
  free(): void;
  load(json: string): void;
  query(json: string): string;
  advance(json: string): string;
  snapshot(): string;
  restore(json: string): void;
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
    advance(
      delta: number,
      writes: readonly WriteIntent[],
      actions: readonly ActionRequest[],
    ): AdvanceResult {
      const result = JSON.parse(
        binding.advance(JSON.stringify({ delta, writes, actions })),
      ) as AdvanceResult;
      if (!Number.isSafeInteger(result.revision) || result.revision < 0 ||
          !Array.isArray(result.results) || !Array.isArray(result.impacts))
        throw new Error("invalid kernel advance result");
      return result;
    },
    snapshot() {
      const json = binding.snapshot();
      const parsed = JSON.parse(json) as Omit<KernelSnapshot, "json">;
      if (parsed.format !== "hive-kernel" || parsed.version !== 5)
        throw new Error("unsupported kernel snapshot");
      return {
        format: parsed.format,
        version: parsed.version,
        revision: parsed.revision,
        time: parsed.time,
        json,
      };
    },
    restore(snapshot) {
      if (snapshot.format !== "hive-kernel" || snapshot.version !== 5)
        throw new Error("unsupported kernel snapshot");
      binding.restore(snapshot.json);
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
