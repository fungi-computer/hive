/** Public boundary between authored TypeScript and the authoritative kernel. */
export type EntityId = string & { readonly __entityId: unique symbol };
export type ComponentId = `${string}.${string}`;
export type GameId = string;
export const RESERVED_COMPONENTS = [
  "hive.position",
  "hive.body",
  "hive.container",
  "hive.lot",
  "hive.destination",
  "hive.support",
  "hive.surface",
  "hive.obstacle",
  "hive.visual",
] as const;
export const isReservedComponent = (id: string): boolean =>
  (RESERVED_COMPONENTS as readonly string[]).includes(id);

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface MoveDestination extends Vec3 {
  readonly frame: EntityId | null;
}
export interface Pose {
  readonly position: Vec3;
  readonly facing: number;
}
export interface WorldPosition extends Vec3 {
  readonly facing: number;
}
export interface SupportSurface {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly height: number;
}
export interface WorldPose {
  readonly id: EntityId;
  readonly local: WorldPosition;
  readonly world: WorldPosition;
  readonly support: EntityId | null;
  readonly surface: SupportSurface | null;
}

export interface ComponentDefinition<T extends object> {
  readonly id: ComponentId;
  readonly version: number;
  readonly fields: Readonly<Record<keyof T & string, FieldType>>;
  readonly validate: (value: unknown) => value is T;
}
export type FieldType =
  "number" | "boolean" | "string" | "entity" | "nullable-entity";
export type ComponentValue<T> = { readonly id: EntityId; readonly value: T };

export interface EntityRecord {
  readonly id: EntityId;
  readonly components: Readonly<Record<ComponentId, unknown>>;
}
export interface QuerySpec<T extends object = object> {
  readonly components: readonly ComponentDefinition<any>[];
  readonly __value?: T;
}
export interface QueryRow<T extends object = object> {
  readonly id: EntityId;
  readonly get: <V extends object>(definition: ComponentDefinition<V>) => V;
}

export type WriteIntent = {
  readonly component: ComponentId;
  readonly entity: EntityId;
  readonly value: unknown;
};
export type ActionRequest =
  | {
      readonly kind: "move";
      readonly entity: EntityId;
      readonly destination: MoveDestination;
      readonly facing?: number;
    }
  | {
      readonly kind: "transfer";
      readonly lot: EntityId;
      readonly from: EntityId;
      readonly to: EntityId;
      readonly quantity: number;
    }
  | {
      readonly kind: "consume";
      readonly entity: EntityId;
      readonly lot: EntityId;
      readonly quantity: number;
    };
export interface ActionResult {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly revision: number;
}
export interface Impact {
  readonly id: string;
  readonly sequence: number;
  readonly projectileId?: EntityId;
  readonly sourceId: EntityId;
  readonly targetId: EntityId;
  readonly time: number;
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly velocity: Vec3;
}
export interface AdvanceResult {
  readonly revision: number;
  readonly results: readonly ActionResult[];
  readonly impacts: readonly Impact[];
}

export interface ActionOutcome {
  readonly action: ActionRequest;
  readonly result: ActionResult;
}
export interface AssignmentCandidate {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly cost: number;
}
export interface AssignmentPair extends AssignmentCandidate {}

export interface SimulationClock {
  readonly now: number;
  readonly delta: number;
  readonly tick: number;
}
export interface RandomSource {
  next(): number;
}
export interface ReadContext {
  readonly clock: SimulationClock;
  readonly outcomes: readonly ActionOutcome[];
  readonly random: RandomSource;
  readonly impacts: readonly Impact[];
  query<T extends object>(spec: QuerySpec<T>): readonly QueryRow<T>[];
  worldPoses(entities: readonly EntityId[]): readonly WorldPose[];
  assign(
    candidates: readonly AssignmentCandidate[],
    maxEdges?: number,
  ): readonly AssignmentPair[];
}
export interface WriteContext extends ReadContext {
  write<T extends object>(
    definition: ComponentDefinition<T>,
    entity: EntityId,
    value: T,
  ): void;
  action(request: ActionRequest): void;
}
export interface SystemDefinition {
  readonly id: ComponentId;
  readonly version: number;
  readonly reads: readonly ComponentDefinition<any>[];
  readonly writes: readonly ComponentDefinition<any>[];
  readonly every?: number;
  readonly consumesImpacts?: boolean;
  readonly run: (context: WriteContext) => void;
}

export interface RenderFact {
  readonly id: EntityId;
  readonly pose?: Pose;
  readonly local?: Pose;
  readonly support?: EntityId | null;
  readonly surface?: SupportSurface | null;
  readonly visual?: string | null;
  readonly label?: string | null;
  readonly selected?: boolean;
}
export interface KernelSnapshot {
  readonly format: "hive-kernel";
  readonly version: 3;
  readonly revision: number;
  readonly time: number;
  readonly json: string;
}
export interface KernelPort {
  readonly dispose: () => void;
  readonly load: (definition: Uint8Array) => void;
  readonly query: <T extends object>(
    spec: QuerySpec<T>,
  ) => readonly QueryRow<T>[];
  readonly advance: (
    delta: number,
    writes: readonly WriteIntent[],
    actions: readonly ActionRequest[],
  ) => AdvanceResult;
  readonly snapshot: () => KernelSnapshot;
  readonly restore: (snapshot: KernelSnapshot) => void;
  readonly renderFacts: (limit?: number) => readonly RenderFact[];
  readonly worldPoses: (entities: readonly EntityId[]) => readonly WorldPose[];
  readonly assign: (
    candidates: readonly AssignmentCandidate[],
    maxEdges?: number,
  ) => readonly AssignmentPair[];
}
export interface GamePack {
  readonly id: GameId;
  readonly version: number;
  readonly definition: Uint8Array;
  readonly components: readonly ComponentDefinition<any>[];
  readonly systems: readonly SystemDefinition[];
  readonly presentation?: import("./presentation").GamePresentation;
  readonly initialActions?: readonly ActionRequest[];
  readonly commands?: Readonly<Record<string, GameCommandDefinition>>;
}
export interface GameCommandResult {
  readonly actions: readonly ActionRequest[];
  readonly writes: readonly WriteIntent[];
}
export interface GameCommandDefinition {
  readonly reads?: readonly ComponentDefinition<any>[];
  readonly writes: readonly ComponentDefinition<any>[];
  readonly run: (
    context: Pick<ReadContext, "query">,
    input: unknown,
  ) => GameCommandResult;
}
export interface GamePackTransport {
  readonly id: GameId;
  readonly version: number;
  readonly definition: Uint8Array;
}
