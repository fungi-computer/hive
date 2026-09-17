import type {
  ComponentDefinition,
  ComponentId,
  FieldType,
  NativeFact,
  QueryRow,
  ReadContext,
  SystemDefinition,
  WriteContext,
} from "../contracts";
import { query, system } from "./authoring";

export interface ActorCapability {
  readonly component: ComponentDefinition<any>;
  readonly initial?: Readonly<Record<string, unknown>>;
}

/** Authoring-only capability compiled by an owning engine module. */
export interface ActorDefinitionCapability<T extends object> {
  readonly kind: "actor-definition-capability";
  readonly id: ComponentId;
  readonly validate: (value: unknown) => value is T;
  /** Another owner creates this actor; omit it from direct spawn templates. */
  readonly externalCreation?: boolean;
}

export interface ActorDefinitionCapabilityValue {
  readonly capability: ActorDefinitionCapability<any>;
  readonly value: Readonly<Record<string, unknown>>;
}

export function definitionCapability<T extends object>(
  id: ComponentId,
  options: {
    readonly validate: (value: unknown) => value is T;
    readonly externalCreation?: boolean;
  },
): ActorDefinitionCapability<T> {
  if (!id.includes(".")) throw new Error(`Invalid actor definition capability ${id}`);
  return Object.freeze({
    kind: "actor-definition-capability" as const,
    id,
    validate: options.validate,
    ...(options.externalCreation === undefined ? {} : { externalCreation: options.externalCreation }),
  });
}

export interface ActorInput {
  readonly kind: "actor-input";
  readonly name: string;
  readonly type: FieldType | "actor-reference";
}

const input = (name: string, type: ActorInput["type"]): ActorInput => {
  if (!name || !/^[A-Za-z][A-Za-z0-9._-]*$/.test(name))
    throw new Error(`Invalid actor input ${name}`);
  return Object.freeze({ kind: "actor-input", name, type });
};

/** Declared instance inputs; templates bind these to checked component fields. */
export const actorInput = Object.freeze({
  number: (name: string) => input(name, "number"),
  boolean: (name: string) => input(name, "boolean"),
  string: (name: string) => input(name, "string"),
  reference: (name: string) => input(name, "actor-reference"),
  optionalReference: (name: string) => input(name, "nullable-entity"),
});

const isActorInput = (value: unknown): value is ActorInput =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  (value as { readonly kind?: unknown }).kind === "actor-input";

const inputFits = (inputType: ActorInput["type"], fieldType: FieldType) =>
  inputType === fieldType ||
  (inputType === "actor-reference" && fieldType === "entity");

const fieldValueFits = (value: unknown, fieldType: FieldType) =>
  fieldType === "number" ? typeof value === "number" && Number.isFinite(value) :
  fieldType === "boolean" ? typeof value === "boolean" :
  fieldType === "string" || fieldType === "entity" ? typeof value === "string" :
  value === null || typeof value === "string";

type ActorInitial<T extends object> = {
  readonly [K in keyof T]: T[K] | ActorInput;
};

export interface ActorDefinition extends ActorBuilder {
  readonly id: string;
  readonly version: number;
  readonly capabilities: readonly ActorCapability[];
  readonly definitionCapabilities: readonly ActorDefinitionCapabilityValue[];
  readonly behaviors: readonly SystemDefinition[];
}

const nativeFactNames: Readonly<Record<NativeFact, true>> = Object.freeze({
  workMaterialFacts: true,
  workAttempts: true,
  workAttemptForWorker: true,
  processRequirements: true,
  floorOperations: true,
  worldPoses: true,
  routeCosts: true,
  routeToAny: true,
  transferContacts: true,
  physicalContacts: true,
  environmentFacts: true,
  atmosphereSamples: true,
  constructionReadiness: true,
  constructionAccess: true,
  deconstructionAccess: true,
  terrainMaterials: true,
  terrainSurfaces: true,
  structureSurfaces: true,
  waterContacts: true,
});

/** A named, deterministic question used by an authored behavior branch. */
export interface PredicateDefinition {
  readonly id: ComponentId;
  readonly reads: readonly ComponentDefinition<any>[];
  readonly facts: readonly NativeFact[];
  readonly test: (subject: QueryRow, context: ReadContext) => boolean;
}

/** A named proposal producer. The existing system/session owners commit its work. */
export interface BehaviorActionDefinition {
  readonly id: ComponentId;
  readonly reads: readonly ComponentDefinition<any>[];
  readonly writes: readonly ComponentDefinition<any>[];
  readonly facts: readonly NativeFact[];
  readonly exclusive?: string;
  readonly run: (subject: QueryRow, context: WriteContext) => void;
}

export function predicate(
  id: ComponentId,
  options: {
    readonly reads?: readonly ComponentDefinition<any>[];
    readonly facts?: readonly NativeFact[];
    readonly test: PredicateDefinition["test"];
  },
): PredicateDefinition {
  return Object.freeze({
    id,
    reads: Object.freeze([...(options.reads ?? [])]),
    facts: Object.freeze([...(options.facts ?? [])]),
    test: options.test,
  });
}

export function action(
  id: ComponentId,
  options: {
    readonly reads?: readonly ComponentDefinition<any>[];
    readonly writes?: readonly ComponentDefinition<any>[];
    readonly facts?: readonly NativeFact[];
    readonly exclusive?: string;
    readonly run: BehaviorActionDefinition["run"];
  },
): BehaviorActionDefinition {
  return Object.freeze({
    id,
    reads: Object.freeze([...(options.reads ?? [])]),
    writes: Object.freeze([...(options.writes ?? [])]),
    facts: Object.freeze([...(options.facts ?? [])]),
    ...(options.exclusive === undefined ? {} : { exclusive: options.exclusive }),
    run: options.run,
  });
}

interface BehaviorBranch {
  readonly subjects: readonly ComponentDefinition<any>[];
  readonly predicates: readonly PredicateDefinition[];
  readonly action: BehaviorActionDefinition;
}

const behaviorSubjects = new WeakMap<
  SystemDefinition,
  readonly ComponentDefinition<any>[]
>();

export interface BehaviorSelection {
  where(...predicates: readonly PredicateDefinition[]): BehaviorSelection;
  do(action: BehaviorActionDefinition): void;
}

export interface BehaviorScene {
  find(...subjects: readonly ComponentDefinition<any>[]): BehaviorSelection;
}

/**
 * Prepare friendly behavior syntax into the existing checked system runtime.
 * The callback records branches once; it never reads or mutates a live world.
 */
export function behavior(
  id: ComponentId,
  define: (scene: BehaviorScene) => void,
  options: { readonly version?: number; readonly every?: number } = {},
): SystemDefinition {
  const branches: BehaviorBranch[] = [];
  const scene: BehaviorScene = {
    find(...subjects) {
      if (subjects.length === 0)
        throw new Error(`Behavior ${id} must find at least one component`);
      const select = (
        predicates: readonly PredicateDefinition[],
      ): BehaviorSelection =>
        Object.freeze({
          where(...next) {
            if (next.length === 0)
              throw new Error(`Behavior ${id} where requires a predicate`);
            return select(Object.freeze([...predicates, ...next]));
          },
          do(nextAction) {
            branches.push(
              Object.freeze({
                subjects: Object.freeze([...subjects]),
                predicates: Object.freeze([...predicates]),
                action: nextAction,
              }),
            );
          },
        });
      return select(Object.freeze([]));
    },
  };
  define(Object.freeze(scene));
  if (branches.length === 0)
    throw new Error(`Behavior ${id} must define at least one branch`);
  const unique = <T extends { readonly id: ComponentId }>(values: readonly T[]) =>
    [...new Map(values.map((value) => [value.id, value])).values()];
  const reads = unique(
    branches.flatMap((branch) => [
      ...branch.subjects,
      ...branch.predicates.flatMap((item) => item.reads),
      ...branch.action.reads,
    ]),
  );
  const writes = unique(branches.flatMap((branch) => branch.action.writes));
  const seenBranches = new Set<string>();
  for (const branch of branches) {
    const key = `${branch.subjects.map(({ id: component }) => component).join("+")}|${branch.predicates.map(({ id: predicateId }) => predicateId).join("+")}|${branch.action.id}`;
    if (seenBranches.has(key)) throw new Error(`Behavior ${id} has a duplicate branch`);
    seenBranches.add(key);
  }
  const prepared = system({
    id,
    version: options.version ?? 1,
    ...(options.every === undefined ? {} : { every: options.every }),
    reads,
    writes,
    run(context) {
      const rows = new Map<string, readonly QueryRow[]>();
      const phaseContext: WriteContext = {
        ...context,
        query(spec) {
          const key = spec.components.map(({ id: component }) => component).join("+");
          let result = rows.get(key);
          if (!result) {
            result = context.query(spec);
            rows.set(key, result);
          }
          return result;
        },
      };
      const authoredContexts = new Map<string, WriteContext>();
      const authoredContext = (
        owner: { readonly id: ComponentId; readonly facts: readonly NativeFact[] },
      ) => {
        let prepared = authoredContexts.get(owner.id);
        if (prepared) return prepared;
        const facts = new Set(owner.facts);
        prepared = new Proxy(phaseContext, {
          get(target, property, receiver) {
            if (
              typeof property === "string" &&
              property in nativeFactNames &&
              !facts.has(property as NativeFact)
            )
              throw new Error(
                `${owner.id} used undeclared native fact ${property}`,
              );
            return Reflect.get(target, property, receiver);
          },
        });
        authoredContexts.set(owner.id, prepared);
        return prepared;
      };
      const exclusive = new Set<string>();
      for (const branch of branches) {
        const subjects = phaseContext.query(query(...branch.subjects));
        for (const subject of subjects)
          if (
            branch.predicates.every((item) =>
              item.test(subject, authoredContext(item)),
            )
          ) {
            if (branch.action.exclusive) {
              const conflict = `${subject.id}|${branch.action.exclusive}`;
              if (exclusive.has(conflict))
                throw new Error(
                  `Behavior ${id} produced competing ${branch.action.exclusive} actions for ${subject.id}`,
                );
              exclusive.add(conflict);
            }
            branch.action.run(subject, authoredContext(branch.action));
          }
      }
    },
  });
  behaviorSubjects.set(
    prepared,
    Object.freeze(unique(branches.flatMap((branch) => branch.subjects))),
  );
  return prepared;
}

export interface ActorBuilder {
  with<T extends object>(
    component: ComponentDefinition<T>,
    initial?: ActorInitial<T>,
  ): ActorDefinition;
  with<T extends object>(
    capability: ActorDefinitionCapability<T>,
    value: T,
  ): ActorDefinition;
  behaves(...behaviors: readonly SystemDefinition[]): ActorDefinition;
}

/** Compose an immutable actor definition; spawning remains an admitted world operation. */
export function actor(
  id: string,
  options: { readonly version?: number } = {},
): ActorDefinition {
  if (!id || !/^[A-Za-z0-9._:-]+$/.test(id))
    throw new Error(`Invalid actor id ${id}`);
  const build = (
    capabilities: readonly ActorCapability[],
    definitionCapabilities: readonly ActorDefinitionCapabilityValue[],
    behaviors: readonly SystemDefinition[],
  ): ActorDefinition => {
    const definition: ActorDefinition = {
      id,
      version: options.version ?? 1,
      capabilities,
      definitionCapabilities,
      behaviors,
      with<T extends object>(
        feature: ComponentDefinition<T> | ActorDefinitionCapability<T>,
        initial?: ActorInitial<T> | T,
      ) {
        if (feature.kind === "actor-definition-capability") {
          if (capabilities.some(({ component }) => component.id === feature.id)
            || definitionCapabilities.some(({ capability }) => capability.id === feature.id))
            throw new Error(`Actor ${id} already has ${feature.id}`);
          if (initial === undefined || !feature.validate(initial))
            throw new Error(`Actor ${id} has invalid ${feature.id}`);
          return build(capabilities, Object.freeze([
            ...definitionCapabilities,
            Object.freeze({ capability: feature, value: Object.freeze(structuredClone(initial)) }),
          ]), behaviors);
        }
        const component = feature;
        if (capabilities.some(({ component: existing }) => existing.id === component.id))
          throw new Error(`Actor ${id} already has ${component.id}`);
        if (initial !== undefined) {
          const fields = Object.entries(component.fields) as [string, FieldType][];
          if (
            Object.keys(initial).length !== fields.length ||
            fields.some(([field, fieldType]) => {
              const value = (initial as Record<string, unknown>)[field];
              return isActorInput(value)
                ? !inputFits(value.type, fieldType)
                : !fieldValueFits(value, fieldType);
            })
          )
            throw new Error(`Actor ${id} has invalid initial ${component.id}`);
        }
        return build(
          Object.freeze([
            ...capabilities,
            Object.freeze({
              component,
              ...(initial === undefined
                ? {}
                : { initial: Object.freeze(structuredClone(initial)) }),
            }),
          ]),
          definitionCapabilities,
          behaviors,
        );
      },
      behaves(...nextBehaviors) {
        if (nextBehaviors.length === 0)
          throw new Error(`Actor ${id} must attach at least one behavior`);
        const componentIds = new Set(
          capabilities.map(({ component }) => component.id),
        );
        const behaviorIds = new Set(behaviors.map(({ id: behaviorId }) => behaviorId));
        for (const authoredBehavior of nextBehaviors) {
          if (behaviorIds.has(authoredBehavior.id))
            throw new Error(`Actor ${id} attaches ${authoredBehavior.id} twice`);
          behaviorIds.add(authoredBehavior.id);
          const subjects = behaviorSubjects.get(authoredBehavior);
          if (!subjects)
            throw new Error(
              `Actor ${id} can only attach prepared behavior definitions`,
            );
          const missing = subjects.filter(
            ({ id: componentId }) => !componentIds.has(componentId),
          );
          if (missing.length > 0)
            throw new Error(
              `Actor ${id} behavior ${authoredBehavior.id} requires ${missing.map(({ id: componentId }) => componentId).join(", ")}`,
            );
        }
        return build(
          capabilities,
          definitionCapabilities,
          Object.freeze([...behaviors, ...nextBehaviors]),
        );
      },
    };
    return Object.freeze(definition);
  };
  return build(Object.freeze([]), Object.freeze([]), Object.freeze([]));
}
