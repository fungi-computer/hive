import type { KernelRecordSnapshot } from "./runtime/kernel-records";
/** Public boundary between authored TypeScript and the authoritative kernel. */
export type EntityId = string & { readonly __entityId: unique symbol };
export type ComponentId = `${string}.${string}`;
export type GameId = string;
export const RESERVED_COMPONENTS = [
  "hive.position",
  "hive.body",
  "hive.traversal",
  "hive.container",
  "hive.sealed-container",
  "hive.construction-site",
  "hive.lot",
  "hive.lot-water",
  "hive.excavation-work",
  "hive.destination",
  "hive.support",
  "hive.surface",
  "hive.obstacle",
  "hive.visual",
  "hive.collider",
  "hive.launcher",
  "hive.projectile",
  "hive.impact-material",
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
export interface RouteCostRequest { readonly actor: EntityId; readonly target: MoveDestination; }
export type RouteCostResult =
  | { readonly actor: EntityId; readonly status: "reachable"; readonly cost: number }
  | { readonly actor: EntityId; readonly status: "unavailable"; readonly reason: string };

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
export type CardinalOrientation = "north" | "east" | "south" | "west";
export type ActionRequest =
  | { readonly kind: "plan-construction"; readonly catalog: string; readonly site: EntityId; readonly x: number; readonly y: number; readonly z: number; readonly orientation: CardinalOrientation; readonly contact: Vec3 & { readonly frame: null } }
  | { readonly kind: "attend-construction"; readonly worker: EntityId; readonly site: EntityId }
  | { readonly kind: "excavate"; readonly entity: EntityId; readonly x: number; readonly y: number; readonly z: number; readonly expected: number; readonly replacement: number }
  | { readonly kind: "cancel-work"; readonly entity: EntityId }
  | { readonly kind: "begin-direct"; readonly entity: EntityId; readonly stream: string }
  | {
      readonly kind: "direct-input";
      readonly entity: EntityId;
      readonly stream: string;
      readonly inputs: readonly { readonly sequence: number; readonly x: number; readonly z: number }[];
    }
  | { readonly kind: "launch"; readonly launcher: EntityId; readonly ammunition: EntityId; readonly velocity: Vec3 }
  | { readonly kind: "displace"; readonly entity: EntityId; readonly delta: Vec3 }
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
  readonly reason?: string | null;
  readonly projectileId?: EntityId;
  readonly launchPoint?: Vec3;
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
  routeCosts(requests: readonly RouteCostRequest[]): readonly RouteCostResult[];
  physicalContacts(cells: readonly [number, number, number][]): readonly PhysicalContact[];
  terrainMaterials(cells: readonly [number, number, number][]): readonly number[];
  terrainSurfaces(columns: readonly [number, number][]): readonly (TerrainSurface | null)[];
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
  createAuthoredEntity(record: EntityRecord): void;
  removeAuthoredEntity(id: EntityId): void;
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

export interface ProjectileAim {
  readonly origin: Vec3;
  readonly muzzle: Vec3;
  readonly inheritedVelocity: Vec3;
  readonly radius: number;
  readonly gravity: number;
  readonly penetration: number;
  readonly maxRange: number;
  readonly maxLifetime: number;
  readonly speed: number;
}
export interface CollisionFact {
  readonly id: EntityId;
  readonly origin: Vec3;
  readonly velocity: Vec3;
  readonly shape: "ball" | "cuboid";
  readonly radius: number;
  readonly halfX: number;
  readonly halfY: number;
  readonly halfZ: number;
  readonly yaw: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly offsetZ: number;
  readonly material: { readonly response: "stop" | "pierce" | "ground"; readonly resistance: number; readonly restitution: number; readonly friction: number; readonly embedSpeed: number };
}
export interface RenderFact {
  readonly aim?: ProjectileAim | null;
  readonly collision?: CollisionFact | null;
  readonly projectile?: { readonly velocity: Vec3; readonly gravity: number; readonly state: "flying" | "rolling" | "resting" | "embedded"; readonly embedDepth: number; readonly rollNormal: Vec3; readonly penetration: number } | null;
  readonly id: EntityId;
  readonly pose?: Pose;
  readonly local?: Pose;
  readonly support?: EntityId | null;
  readonly surface?: SupportSurface | null;
  readonly visual?: string | null;
  readonly label?: string | null;
  readonly selected?: boolean;
  readonly inventory?: {
    readonly items: readonly { readonly kind: string; readonly quantity: number }[];
    readonly overflow?: boolean;
  };
  readonly direct?: {
    readonly stream: string;
    readonly lastQueued: number;
    readonly lastProcessed: number;
    readonly speed: number;
    readonly blocked: readonly [number, number, number][];
    readonly bounds: null | { readonly min_x: number; readonly max_x: number; readonly min_z: number; readonly max_z: number };
  } | null;
}
export type KernelSnapshot = KernelRecordSnapshot;
export type PhysicalContact = {
  readonly solid: boolean;
  readonly sealedTop: boolean;
  readonly outside: boolean;
};

export type TerrainSurface = {
  readonly cell: readonly [number, number, number];
  readonly material: number;
};
export interface KernelPort {
  readonly physicalContacts: (cells: readonly [number, number, number][]) => readonly PhysicalContact[];
  readonly routeCosts: (requests: readonly RouteCostRequest[]) => readonly RouteCostResult[];
  readonly dispose: () => void;
  readonly load: (definition: Uint8Array) => void;
  readonly loadEnvironment: (definition: Uint8Array) => void;
  readonly environmentFacts: () => unknown;
  readonly terrainMaterials: (
    cells: readonly [number, number, number][],
  ) => readonly number[];
  readonly terrainSurfaces: (
    columns: readonly [number, number][],
  ) => readonly (TerrainSurface | null)[];
  readonly query: <T extends object>(
    spec: QuerySpec<T>,
  ) => readonly QueryRow<T>[];
  readonly entityMembership: (ids: readonly EntityId[]) => readonly boolean[];
  readonly advance: (
    delta: number,
    writes: readonly WriteIntent[],
    actions: readonly ActionRequest[],
    options?: { readonly creates?: readonly EntityRecord[]; readonly removes?: readonly EntityId[] },
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
  readonly environmentDefinition?: Uint8Array;
  readonly components: readonly ComponentDefinition<any>[];
  readonly systems: readonly SystemDefinition[];
  readonly presentation?: import("./presentation").GamePresentation;
  readonly initialActions?: readonly ActionRequest[];
  readonly commands?: Readonly<Record<string, GameCommandDefinition>>;
}
export interface GameCommandResult {
  readonly actions: readonly ActionRequest[];
  readonly writes: readonly WriteIntent[];
  readonly creates?: readonly EntityRecord[];
  readonly removes?: readonly EntityId[];
}
export interface GameCommandDefinition {
  /** Authored record creation/removal only; does not grant progress writes. */
  readonly lifecycle?: readonly ComponentDefinition<any>[];
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
