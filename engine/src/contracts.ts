/** Public boundary between authored TypeScript and the authoritative kernel. */
export type EntityId = string & { readonly __entityId: unique symbol };
export type ComponentId = `${string}.${string}`;
export type GameId = "colony" | "survival" | "formations";

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export interface Pose { readonly position: Vec3; readonly facing: number }

export interface ComponentDefinition<T extends object> {
  readonly id: ComponentId;
  readonly version: number;
  readonly fields: Readonly<Record<keyof T & string, FieldType>>;
  readonly validate: (value: unknown) => value is T;
}
export type FieldType = "number" | "boolean" | "string" | "entity" | "nullable-entity";
export type ComponentValue<T> = { readonly id: EntityId; readonly value: T };

export interface EntityRecord {
  readonly id: EntityId;
  readonly components: Readonly<Record<ComponentId, unknown>>;
}
export interface QuerySpec<T extends object = object> {
  readonly components: readonly ComponentDefinition<any>[];
  readonly where?: (entity: EntityRecord) => boolean;
  readonly select?: readonly string[];
  readonly __value?: T;
}
export interface QueryRow<T extends object> { readonly id: EntityId; readonly value: T }

export type WriteIntent = { readonly component: ComponentId; readonly entity: EntityId; readonly value: unknown };
export type ActionRequest =
  | { readonly kind: "move"; readonly entity: EntityId; readonly destination: Vec3; readonly facing?: number }
  | { readonly kind: "transfer"; readonly lot: EntityId; readonly from: EntityId; readonly to: EntityId; readonly quantity: number }
  | { readonly kind: "consume"; readonly entity: EntityId; readonly lot: EntityId; readonly quantity: number }
  | { readonly kind: "select"; readonly entities: readonly EntityId[] }
  | { readonly kind: "group-order"; readonly group: EntityId; readonly destination: Vec3; readonly facing: number };
export interface ActionResult { readonly accepted: boolean; readonly reason?: string; readonly revision: number }

export interface SimulationClock { readonly now: number; readonly delta: number; readonly tick: number }
export interface RandomSource { next(): number }
export interface ReadContext {
  readonly clock: SimulationClock;
  readonly random: RandomSource;
  query<T extends object>(spec: QuerySpec<T>): readonly QueryRow<T>[];
}
export interface WriteContext extends ReadContext {
  write<T extends object>(definition: ComponentDefinition<T>, entity: EntityId, value: T): void;
  action(request: ActionRequest): void;
}
export interface SystemDefinition {
  readonly id: ComponentId;
  readonly version: number;
  readonly reads: readonly ComponentDefinition<any>[];
  readonly writes: readonly ComponentDefinition<any>[];
  readonly every?: number;
  readonly run: (context: WriteContext) => void;
}

export interface RenderFact { readonly id: EntityId; readonly pose?: Pose; readonly visual?: string; readonly label?: string; readonly selected?: boolean }
export interface KernelSnapshot { readonly format: "hive-kernel"; readonly version: 1; readonly revision: number; readonly time: number; readonly bytes: Uint8Array }
export interface KernelPort {
  readonly load: (definition: Uint8Array) => void;
  readonly query: <T extends object>(spec: QuerySpec<T>) => readonly QueryRow<T>[];
  readonly advance: (delta: number, writes: readonly WriteIntent[], actions: readonly ActionRequest[]) => ActionResult[];
  readonly snapshot: () => KernelSnapshot;
  readonly restore: (snapshot: KernelSnapshot) => void;
  readonly renderFacts: (limit?: number) => readonly RenderFact[];
  readonly reset: () => void;
}
export interface GamePack {
  readonly id: GameId;
  readonly version: number;
  readonly definition: Uint8Array;
  readonly components: readonly ComponentDefinition<any>[];
  readonly systems: readonly SystemDefinition[];
  readonly initialActions?: readonly ActionRequest[];
}
export interface GamePackTransport { readonly id: GameId; readonly version: number; readonly definition: Uint8Array }
