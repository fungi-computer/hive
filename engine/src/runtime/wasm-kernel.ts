import type {
  ActionRequest,
  ActionResult,
  ComponentDefinition,
  EntityId,
  KernelPort,
  KernelSnapshot,
  QueryRow,
  QuerySpec,
  RenderFact,
  WriteIntent,
} from "../contracts";

export interface WasmKernelBinding {
  free(): void;
  load(json: string): void;
  query(json: string): string;
  advance(json: string): string;
  snapshot(): string;
  restore(json: string): void;
  render_facts(): string;
}
type QueryWire = { id: EntityId; components: Record<string, unknown> };
/** Adapts the generated wasm-bindgen class without exposing it to authored games. */
export function wasmKernelPort(binding: WasmKernelBinding): KernelPort {
  return {
    dispose() { binding.free(); },
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
    ): ActionResult[] {
      const result = JSON.parse(
        binding.advance(JSON.stringify({ delta, writes, actions })),
      ) as { results: ActionResult[] };
      return result.results;
    },
    snapshot() {
      const json = binding.snapshot();
      const parsed = JSON.parse(json) as Omit<KernelSnapshot, "json">;
      return {
        format: parsed.format,
        version: parsed.version,
        revision: parsed.revision,
        time: parsed.time,
        json,
      };
    },
    restore(snapshot) {
      binding.restore(snapshot.json);
    },
    renderFacts(limit = 512) {
      return (JSON.parse(binding.render_facts()) as RenderFact[]).slice(
        0,
        limit,
      );
    },
  };
}
