import type {
  ComponentDefinition,
  ComponentId,
  EntityId,
  RelationRemovalPolicy,
  QuerySpec,
  SystemDefinition,
  WriteContext,
  EntityRecord,
  GameCommandDefinition,
  GameCommandResult,
  ReadContext,
  GameCommandContext,
} from "../contracts";
import type { z } from "zod";

type Shape = Record<
  string,
  "number" | "boolean" | "string" | "entity" | "nullable-entity"
>;
type CapabilityReference = ComponentDefinition<any> | ComponentId;

const capabilityId = (value: CapabilityReference): ComponentId =>
  typeof value === "string" ? value : value.id;
const valid = (type: Shape[string], value: unknown): boolean =>
  (type === "nullable-entity" &&
    (value === null || typeof value === "string")) ||
  (type === "number" && typeof value === "number" && Number.isFinite(value)) ||
  (type === "boolean" && typeof value === "boolean") ||
  (type === "string" && typeof value === "string") ||
  (type === "entity" && typeof value === "string");

export function component<T extends object>(
  id: ComponentId,
  options: {
    version: number;
    fields: Shape;
    targetField?: string;
    sourceRequires?: readonly ComponentId[];
    targetRequires?: readonly ComponentId[];
    onTargetRemoved?: RelationRemovalPolicy;
    allowSelf?: boolean;
  },
): ComponentDefinition<T> {
  if (!id.includes(".") || options.version < 1)
    throw new Error(`Invalid component ${id}`);
  const fields = Object.freeze({ ...options.fields });
  if (options.targetField !== undefined) {
    const targetType = fields[options.targetField];
    if (targetType !== "entity" && targetType !== "nullable-entity")
      throw new Error(`Invalid relation target ${id}.${options.targetField}`);
  } else if (
    options.sourceRequires !== undefined ||
    options.targetRequires !== undefined ||
    options.onTargetRemoved !== undefined ||
    options.allowSelf !== undefined
  ) {
    throw new Error(`Relation metadata requires a target field: ${id}`);
  }
  return Object.freeze({
    id,
    version: options.version,
    fields: fields as ComponentDefinition<T>["fields"],
    ...(options.targetField === undefined ? {} : {
      targetField: options.targetField as keyof T & string,
      sourceRequires: Object.freeze([...(options.sourceRequires ?? [])]),
      targetRequires: Object.freeze([...(options.targetRequires ?? [])]),
      onTargetRemoved: options.onTargetRemoved ?? "detach",
      allowSelf: options.allowSelf ?? false,
    }),
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

/** Register a one-target relation through the same component definition path. */
export function relation<T extends object>(
  id: ComponentId,
  options: {
    version: number;
    fields: Shape;
    targetField: keyof T & string;
    sourceRequires?: readonly CapabilityReference[];
    targetRequires?: readonly CapabilityReference[];
    onTargetRemoved?: RelationRemovalPolicy;
    allowSelf?: boolean;
  },
): ComponentDefinition<T> {
  return component<T>(id, {
    version: options.version,
    fields: options.fields,
    targetField: options.targetField,
    sourceRequires: options.sourceRequires?.map(capabilityId),
    targetRequires: options.targetRequires?.map(capabilityId),
    onTargetRemoved: options.onTargetRemoved,
    allowSelf: options.allowSelf,
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
  options: Omit<GameCommandDefinition, "input" | "invoke" | "title" | "category" | "description" | "availability" | "subjects"> & {
    title: string;
    category: string;
    description: string;
    localPresentation?: GameCommandDefinition["localPresentation"];
    availability?: GameCommandDefinition["availability"];
    subjects?: GameCommandDefinition["subjects"];
    input: z.ZodType<TInput>;
    run: (
      context: GameCommandContext,
      input: TInput,
    ) => GameCommandResult;
  },
): GameCommandDefinition {
  return Object.freeze({
    input: options.input,
    title: options.title,
    category: options.category,
    description: options.description,
    ...(options.localPresentation === undefined ? {} : { localPresentation: Object.freeze({ bindings: Object.freeze(options.localPresentation.bindings.map(binding => Object.freeze({ ...binding }))) }) }),
    ...(options.availability === undefined ? {} : { availability: options.availability }),
    ...(options.subjects === undefined ? {} : { subjects: options.subjects }),
    lifecycle: Object.freeze([...(options.lifecycle ?? [])]),
    reads: Object.freeze([...(options.reads ?? [])]),
    writes: Object.freeze([...options.writes]),
    invoke(context: GameCommandContext, input: unknown) {
      return options.run(context, options.input.parse(input));
    },
  });
}

export function entity(id: string): EntityId {
  if (!id || !/^[A-Za-z0-9._:-]+$/.test(id))
    throw new Error(`Invalid entity id ${id}`);
  return id as EntityId;
}
