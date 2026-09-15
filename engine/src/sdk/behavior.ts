import type {
  ActionRequest,
  ComponentDefinition,
  QueryRow,
  SystemDefinition,
  WriteContext,
  WriteIntent,
} from "../contracts";

export interface BehaviorResult {
  readonly actions?: readonly ActionRequest[];
  readonly writes?: readonly WriteIntent[];
}

export interface BehaviorCondition<T extends object> {
  readonly id: string;
  readonly reads: readonly ComponentDefinition<any>[];
  readonly test: (row: QueryRow<T>) => boolean;
}

export interface BehaviorAction<T extends object> {
  readonly id: string;
  readonly reads?: readonly ComponentDefinition<any>[];
  readonly writes?: readonly ComponentDefinition<any>[];
  readonly run: (row: QueryRow<T>) => BehaviorResult;
}

const validId = (id: string): boolean => /^[A-Za-z0-9._:-]+$/.test(id);

function uniqueComponents(
  components: readonly ComponentDefinition<any>[],
): readonly ComponentDefinition<any>[] {
  const byId = new Map<string, ComponentDefinition<any>>();
  for (const component of components) byId.set(component.id, component);
  return Object.freeze([...byId.values()]);
}

export function condition<T extends object>(
  id: string,
  reads: readonly ComponentDefinition<any>[],
  test: (row: QueryRow<T>) => boolean,
): BehaviorCondition<T> {
  if (!validId(id) || new Set(reads.map((component) => component.id)).size !== reads.length)
    throw new Error(`Invalid behavior condition ${id}`);
  return Object.freeze({ id, reads: Object.freeze([...reads]), test });
}

class Builder {
  readonly branches: Branch[] = [];
  constructor(readonly id: string) {}
  add(branch: Branch): void {
    if (this.branches.some((existing) => existing.id === branch.id))
      throw new Error(`Duplicate behavior action ${branch.id}`);
    this.branches.push(Object.freeze(branch));
  }
}

interface Branch {
  readonly id: string;
  readonly components: readonly ComponentDefinition<any>[];
  readonly condition: BehaviorCondition<any>;
  readonly action: BehaviorAction<any>;
}

export class Selection<T extends object> {
  constructor(
    private readonly owner: Builder,
    private readonly base: readonly ComponentDefinition<any>[],
  ) {}
  where(test: BehaviorCondition<T>): BranchBuilder<T> {
    return new BranchBuilder(this.owner, this.base, test);
  }
}

export class BranchBuilder<T extends object> {
  constructor(
    private readonly owner: Builder,
    private readonly base: readonly ComponentDefinition<any>[],
    private readonly test: BehaviorCondition<T>,
  ) {}
  do(action: BehaviorAction<T>): Builder {
    if (!validId(action.id)) throw new Error(`Invalid behavior action ${action.id}`);
    this.owner.add({
      id: action.id,
      components: uniqueComponents([
        ...this.base,
        ...this.test.reads,
        ...(action.reads ?? []),
      ]),
      condition: this.test,
      action,
    });
    return this.owner;
  }
}

export interface BehaviorScene {
  find<T extends object>(
    ...components: readonly ComponentDefinition<any>[]
  ): Selection<T>;
}

export function behavior(
  id: string,
  define: (scene: BehaviorScene) => void,
): SystemDefinition {
  if (!validId(id)) throw new Error(`Invalid behavior ${id}`);
  const builder = new Builder(id);
  define(
    Object.freeze({
      find<T extends object>(
        ...components: readonly ComponentDefinition<any>[]
      ): Selection<T> {
        if (!components.length || new Set(components.map((component) => component.id)).size !== components.length)
          throw new Error(`Behavior ${id} has an invalid base query`);
        return new Selection<T>(builder, Object.freeze([...components]));
      },
    }),
  );
  const reads = uniqueComponents(
    builder.branches.flatMap((branch) => [...branch.components]),
  );
  const writes = uniqueComponents(
    builder.branches.flatMap((branch) => [...(branch.action.writes ?? [])]),
  );
  return Object.freeze({
    id: `behavior.${id}`,
    version: 1,
    reads,
    writes,
    run(context: WriteContext) {
      for (const branch of builder.branches) {
        for (const row of context.query({ components: branch.components })) {
          if (!branch.condition.test(row)) continue;
          const result = branch.action.run(row);
          for (const write of result.writes ?? []) {
            const definition = writes.find((candidate) => candidate.id === write.component);
            if (!definition)
              throw new Error(`Behavior ${id} returned undeclared write ${write.component}`);
            context.write(definition, write.entity, write.value);
          }
          for (const action of result.actions ?? []) context.action(action);
        }
      }
    },
  });
}
