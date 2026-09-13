import type {
  ComponentDefinition,
  ComponentId,
  EntityId,
  QuerySpec,
  SystemDefinition,
  WriteContext,
  EntityRecord,
  GameCommandDefinition,
} from "../contracts";
import type { z } from "zod";

type Shape = Record<
  string,
  "number" | "boolean" | "string" | "entity" | "nullable-entity"
>;
const valid = (type: Shape[string], value: unknown): boolean =>
  (type === "nullable-entity" &&
    (value === null || typeof value === "string")) ||
  (type === "number" && typeof value === "number" && Number.isFinite(value)) ||
  (type === "boolean" && typeof value === "boolean") ||
  (type === "string" && typeof value === "string") ||
  (type === "entity" && typeof value === "string");

export function component<T extends object>(
  id: ComponentId,
  options: { version: number; fields: Shape },
): ComponentDefinition<T> {
  if (!id.includes(".") || options.version < 1)
    throw new Error(`Invalid component ${id}`);
  const fields = Object.freeze({ ...options.fields });
  return Object.freeze({
    id,
    version: options.version,
    fields: fields as ComponentDefinition<T>["fields"],
    validate(value: unknown): value is T {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
      return (
        Object.keys(value).length === Object.keys(fields).length &&
        Object.entries(fields).every(([name, type]) =>
          valid(type, (value as Record<string, unknown>)[name]),
        )
      );
    },
  });
}

export function query<T extends object>(
  ...components: readonly ComponentDefinition<any>[]
): QuerySpec<T> {
  if (!components.length)
    throw new Error("A query must request at least one component");
  return Object.freeze({ components });
}

export interface SystemOptions {
  id: ComponentId;
  version: number;
  reads?: readonly ComponentDefinition<any>[];
  writes?: readonly ComponentDefinition<any>[];
  every?: number;
  consumesImpacts?: boolean;
  run: (context: WriteContext) => void;
}
export function system(options: SystemOptions): SystemDefinition {
  const writes = Object.freeze([...(options.writes ?? [])]);
  const reads = Object.freeze([...(options.reads ?? [])]);
  const run = options.run;
  return Object.freeze({
    ...options,
    reads,
    writes,
    run(context: WriteContext) {
      const permitted = new Set(writes.map((c) => c.id));
      const readable = new Set(reads.map((c) => c.id));
      const checked: WriteContext = {
        ...context,
        query(spec) {
          for (const definition of spec.components)
            if (!readable.has(definition.id))
              throw new Error(
                `System ${options.id} cannot read ${definition.id}`,
              );
          return context.query(spec);
        },
        write(definition, entity, value) {
          if (!permitted.has(definition.id))
            throw new Error(
              `System ${options.id} cannot write ${definition.id}`,
            );
          if (!definition.validate(value))
            throw new Error(`Invalid ${definition.id} value`);
          context.write(definition, entity, value);
        },
        action(request) {
          context.action(request);
        },
        createAuthoredEntity(record: EntityRecord) {
          for (const component of Object.keys(record.components))
            if (!writes.some(definition => definition.id === component)) throw new Error(`System ${options.id} cannot create ${component}`);
          context.createAuthoredEntity(record);
        },
        removeAuthoredEntity(entity) {
          context.removeAuthoredEntity(entity);
        },
      };
      run(checked);
    },
  });
}

export function command<TInput>(
  options: Omit<GameCommandDefinition, "input" | "execute"> & {
    input: z.ZodType<TInput>;
    run: (
      context: Pick<import("../contracts").ReadContext, "query" | "physicalContacts">,
      input: TInput,
    ) => import("../contracts").GameCommandResult;
  },
): GameCommandDefinition {
  return Object.freeze({
    input: options.input,
    lifecycle: Object.freeze([...(options.lifecycle ?? [])]),
    reads: Object.freeze([...(options.reads ?? [])]),
    writes: Object.freeze([...options.writes]),
    execute(context: Pick<import("../contracts").ReadContext, "query" | "physicalContacts">, raw: unknown) {
      return options.run(context, options.input.parse(raw));
    },
  });
}

export function entity(id: string): EntityId {
  if (!id || !/^[A-Za-z0-9._:-]+$/.test(id))
    throw new Error(`Invalid entity id ${id}`);
  return id as EntityId;
}
