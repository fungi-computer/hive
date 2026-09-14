import type { z } from "zod";
import type { terrainSurfaceSchema } from "./runtime/terrain-surface";
import type { KernelRecordSnapshot } from "./runtime/kernel-records";
import type { WorkActivity } from "./runtime/work-activity";
import type { GamePresentation } from "./presentation";
/** Public boundary between authored TypeScript and the authoritative kernel. */
export type EntityId = string & { readonly __entityId: unique symbol };
export type ComponentId = `${string}.${string}`;
export type GameId = string;
export const RESERVED_COMPONENTS = [
  "hive.party",
  "hive.party-member",
  "hive.owned-by-party",
  "hive.party-receipt",
  "hive.stockpile-cell",
  "hive.position",
  "hive.body",
  "hive.traversal",
  "hive.container",
  "hive.sealed-container",
  "hive.ground-stock",
  "hive.construction-site",
  "hive.floor-replacement",
  "hive.lot",
  "hive.lot-water",
  "hive.process-binding",
  "hive.finite-resource",
  "hive.resource-site",
  "hive.excavation-work",
  "hive.destination",
  "hive.support",
  "hive.surface",
  "hive.obstacle",
  "hive.visual",
  "hive.collider",
  "hive.launcher",
  "hive.emitter",
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
export interface RouteCostRequest {
  readonly actor: EntityId;
  readonly target: MoveDestination;
  /** Native excavation contact must be possible from the proposed approach. */
  readonly excavationTarget?: readonly [number, number, number];
}
export type RouteCostResult =
  | {
      readonly actor: EntityId;
      readonly status: "reachable";
      readonly cost: number;
    }
  | {
      readonly actor: EntityId;
      readonly status: "unavailable";
      readonly reason: string;
    };
export interface RouteToAnyRequest {
  readonly actor: EntityId;
  readonly targets: readonly MoveDestination[];
  /** Native excavation contact must be possible from the selected approach. */
  readonly excavationTarget?: readonly [number, number, number];
}
export type RouteToAnyResult =
  | {
      readonly actor: EntityId;
      readonly status: "reachable";
      readonly targetIndex: number;
      readonly cost: number;
    }
  | {
      readonly actor: EntityId;
      readonly status: "unavailable";
      readonly reason: string;
    };
export interface WorkMaterialFacts {
  readonly version: 1;
  readonly containers: readonly {
    readonly id: EntityId;
    readonly capacity: number;
    readonly sealed: boolean;
  }[];
  readonly lots: readonly {
    readonly id: EntityId;
    readonly kind: string;
    readonly quantity: number;
    readonly container: EntityId;
  }[];
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
export type CardinalOrientation = "north" | "east" | "south" | "west";
export type ActionRequest =
  | { readonly kind: "establish-party"; readonly bindingId: string; readonly player: string; readonly party: EntityId; readonly records: readonly EntityRecord[] }
  | { readonly kind: "begin-work-attempt"; readonly task: EntityId; readonly worker: EntityId; readonly party: EntityId; readonly operation: WorkActivityRef }
  | { readonly kind: "interrupt-work-attempt"; readonly task: EntityId; readonly generation: number; readonly sequence: number; readonly cause: WorkInterruptCause }
  | { readonly kind: "acknowledge-work-attempt"; readonly task: EntityId; readonly generation: number; readonly sequence: number }
  | { readonly kind: "continue-work-attempt"; readonly task: EntityId; readonly generation: number; readonly sequence: number; readonly nextActivity: WorkActivityRef }
  | { readonly kind: "establish-resource-site"; readonly operation: string; readonly worker: EntityId; readonly site: EntityId; readonly definition: string; readonly x: number; readonly y: number; readonly z: number }
  | { readonly kind: "tend-resource-site"; readonly operation: string; readonly worker: EntityId; readonly site: EntityId; readonly vessel: EntityId }
  | { readonly kind: "request-process"; readonly definition: string; readonly station: EntityId }
  | { readonly kind: "admit-process"; readonly process: EntityId; readonly definition: string; readonly station: EntityId }
  | { readonly kind: "attend-process"; readonly worker: EntityId; readonly process: EntityId }
  | {
      readonly kind: "designate-stockpile";
      readonly zone: EntityId;
      readonly cells: readonly {
        readonly x: number;
        readonly y: number;
        readonly z: number;
        readonly priority: number;
        readonly filterProfile: string;
        readonly capacity: number;
      }[];
    }
  | { readonly kind: "update-stockpile"; readonly zone: EntityId; readonly filterProfile: string; readonly priority: number }
  | {
      readonly kind: "set-structure-open";
      readonly worker: EntityId;
      readonly site: EntityId;
      readonly open: boolean;
    }
  | { readonly kind: "deconstruct"; readonly worker: EntityId; readonly site: EntityId }
  | {
      readonly kind: "plan-construction";
      readonly catalog: string;
      readonly site: EntityId;
      readonly party: EntityId;
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly orientation: CardinalOrientation;
    }
  | { readonly kind: "replace-floor"; readonly orderId: EntityId; readonly existingFloorId: EntityId; readonly desiredCatalog: string }
  | { readonly kind: "bind-construction-stage"; readonly site: EntityId; readonly contact: Vec3 & { readonly frame: null } }
  | {
      readonly kind: "excavate";
      readonly entity: EntityId;
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly expected: number;
      readonly replacement: number;
    }
  | { readonly kind: "cancel-work"; readonly entity: EntityId }
  | {
      readonly kind: "begin-direct";
      readonly entity: EntityId;
      readonly stream: string;
    }
  | {
      readonly kind: "begin-emission";
      readonly worker: EntityId;
      readonly station: EntityId;
    }
  | {
      readonly kind: "exchange-field-water";
      readonly operation: string;
      readonly worker: EntityId;
      readonly vessel: EntityId;
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly direction: "withdraw" | "deposit";
      readonly portions: number;
    }
  | {
      readonly kind: "direct-input";
      readonly entity: EntityId;
      readonly stream: string;
      readonly inputs: readonly {
        readonly sequence: number;
        readonly x: number;
        readonly z: number;
      }[];
    }
  | {
      readonly kind: "launch";
      readonly launcher: EntityId;
      readonly ammunition: EntityId;
      readonly velocity: Vec3;
    }
  | {
      readonly kind: "displace";
      readonly entity: EntityId;
      readonly delta: Vec3;
    }
  | {
      readonly kind: "move";
      readonly entity: EntityId;
      readonly destination: MoveDestination;
      readonly facing?: number;
    }
  | {
      readonly kind: "drop-lot";
      readonly entity: EntityId;
      readonly lot: EntityId;
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
    }
  | {
      readonly kind: "extract-resource";
      readonly operation: string;
      readonly worker: EntityId;
      readonly source: EntityId;
    };
export interface ActionResult {
  readonly accepted: boolean;
  readonly reason?: string | null;
  readonly projectileId?: EntityId;
  readonly launchPoint?: Vec3;
  readonly entityId?: EntityId;
  readonly revision: number;
  readonly attempt?: WorkAttemptKey;
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
export type WorkActivityRef = { readonly kind: "route"; readonly destination: MoveDestination } | { readonly kind: "construction"; readonly site: EntityId; readonly contact: ConstructionAccessContact; readonly mode: "bind" | "work" } | { readonly kind: "delivery-transfer"; readonly lot: EntityId; readonly from: EntityId; readonly to: EntityId; readonly quantity: number };
export type WorkInterruptCause = "drafted" | "cancelled" | "workerUnavailable" | "accessLost";
export type WorkBlockReason = "accessLost" | "missingInputs" | "capacityUnavailable" | "unsupportedStructure" | "workerUnavailable";
export interface WorkAttemptKey { readonly task: EntityId; readonly generation: number }
export type WorkOutcome = { readonly kind: "completed" } | { readonly kind: "blocked"; readonly reason: WorkBlockReason } | { readonly kind: "interrupted"; readonly cause: WorkInterruptCause };
export type WorkAttemptPhase = { readonly kind: "ready" } | { readonly kind: "executing"; readonly operation: { readonly attempt: WorkAttemptKey; readonly sequence: number }; readonly activity: WorkActivityRef } | { readonly kind: "outcome"; readonly operation: { readonly attempt: WorkAttemptKey; readonly sequence: number }; readonly activity: WorkActivityRef; readonly result: WorkOutcome } | { readonly kind: "settling"; readonly operation: { readonly attempt: WorkAttemptKey; readonly sequence: number }; readonly cause: WorkInterruptCause };
export interface WorkAttempt { readonly key: WorkAttemptKey; readonly worker: EntityId; readonly party: EntityId; readonly phase: WorkAttemptPhase }
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
export type ProcessInputPolicy = "portion" | "whole-lot";
export type ProcessInputDisposition = "consume" | "retain" | "emission-source";
export interface ProcessRequirements {
  readonly definition: string;
  readonly version: number;
  readonly stationCatalog: string;
  readonly inputs: readonly {
    readonly role: string; readonly port: string; readonly material: string;
    readonly quantity: number; readonly policy: ProcessInputPolicy;
    readonly disposition: ProcessInputDisposition;
  }[];
  readonly stages: readonly { readonly id: string; readonly mode: "attended" | "elapsed"; readonly durationSeconds: number }[];
  readonly phase: "waiting" | "working" | "complete" | "blocked";
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
  /** One committed physical projection shared by all work phases in a step. */
  workMaterialFacts(): WorkMaterialFacts;
  readonly workAttempts?: (taskIds: readonly EntityId[]) => readonly WorkAttempt[];
  readonly processRequirements: (definition: string, station: EntityId) => ProcessRequirements;
  worldPoses(entities: readonly EntityId[]): readonly WorldPose[];
  routeCosts(requests: readonly RouteCostRequest[]): readonly RouteCostResult[];
  routeToAny(request: RouteToAnyRequest): RouteToAnyResult;
  transferContacts(request: { readonly worker: EntityId; readonly container: EntityId }):
    | { readonly kind: "ready"; readonly targets: readonly MoveDestination[] }
    | { readonly kind: "blocked"; readonly reason: "sealed" | "unavailable-frame" | "no-contact" };
  physicalContacts(
    cells: readonly [number, number, number][],
  ): readonly PhysicalContact[];
  environmentFacts(): unknown;
  /** Returns modeled atmosphere at each cell; null means the receiver is unmodeled, not clean air. */
  atmosphereSamples(
    cells: readonly [number, number, number][],
  ): AtmosphereSamples;
  constructionReadiness(
    sites: readonly EntityId[],
  ): readonly ConstructionReadiness[];
  /** Ordered structural, material, and work-contact facts for construction allocation. */
  constructionAccess(
    sites: readonly EntityId[],
  ): readonly ConstructionAccess[];
  deconstructionAccess(
    sites: readonly EntityId[],
  ): readonly DeconstructionAccess[];
  terrainMaterials(
    cells: readonly [number, number, number][],
  ): readonly number[];
  terrainSurfaces(
    columns: readonly [number, number][],
  ): readonly (TerrainSurface | null)[];
  waterContacts(centers: readonly [number, number, number][]): readonly { readonly at: readonly [number, number, number]; readonly approaches: readonly MoveDestination[] }[];
  assign(
    candidates: readonly AssignmentCandidate[],
    maxEdges?: number,
  ): readonly AssignmentPair[];
}
export type CommandScope =
  | { readonly kind: "host" }
  | { readonly kind: "player"; readonly player: string; readonly party: EntityId };
export type GameCommandContext = Pick<ReadContext, "query" | "physicalContacts" | "terrainMaterials" | "terrainSurfaces"> & {
  readonly scope: CommandScope;
  readonly floorOperations: (requests: readonly FloorOperationRequest[]) => readonly FloorOperation[];
};
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
  readonly material: {
    readonly response: "stop" | "pierce" | "ground";
    readonly resistance: number;
    readonly restitution: number;
    readonly friction: number;
    readonly embedSpeed: number;
  };
}
export interface RenderFact {
  readonly activity?: WorkActivity;
  readonly view?: { readonly pickable?: boolean; readonly cutawayTop?: number };
  readonly aim?: ProjectileAim | null;
  readonly collision?: CollisionFact | null;
  readonly projectile?: {
    readonly velocity: Vec3;
    readonly gravity: number;
    readonly state: "flying" | "rolling" | "resting" | "embedded";
    readonly embedDepth: number;
    readonly rollNormal: Vec3;
    readonly penetration: number;
  } | null;
  readonly id: EntityId;
  readonly pose?: Pose;
  readonly local?: Pose;
  readonly support?: EntityId | null;
  readonly surface?: SupportSurface | null;
  readonly visual?: string | null;
  readonly label?: string | null;
  readonly selected?: boolean;
  readonly inventory?: {
    readonly items: readonly {
      readonly kind: string;
      readonly quantity: number;
      readonly id?: EntityId;
      /** A bounded observation of this exact portable container lot. */
      readonly container?: {
        readonly capacity: number;
        readonly contents: {
          readonly items: readonly {
            readonly kind: string;
            readonly quantity: number;
          }[];
          readonly overflow?: boolean;
        };
      };
    }[];
    readonly overflow?: boolean;
  };
  readonly direct?: {
    readonly stream: string;
    readonly lastQueued: number;
    readonly lastProcessed: number;
    readonly speed: number;
    readonly blocked: readonly [number, number, number][];
    readonly bounds: null | {
      readonly min_x: number;
      readonly max_x: number;
      readonly min_z: number;
      readonly max_z: number;
    };
  } | null;
}
export type DeliveryActivityPhase =
  | "pickup"
  | "carrying"
  | "to-destination"
  | "putting-down";
export type ActivityKind = "dig" | "build" | "chop" | "delivery";
export interface DeliveryActivity {
  readonly kind: "delivery";
  readonly phase: DeliveryActivityPhase;
  readonly material: string;
  readonly target: readonly [number, number];
}
export interface ActivityBinding {
  readonly actor: EntityId;
  readonly kind: Exclude<ActivityKind, "delivery">;
  readonly target: readonly [number, number];
  readonly progress?: number;
}
export type KernelSnapshot = KernelRecordSnapshot;
export interface AtmosphereSample {
  readonly volumeId: string;
  readonly temperatureC: number;
  readonly smokeKgM3: number;
}
export interface AtmosphereSamples {
  readonly revision: number;
  readonly geometryRevision: number;
  readonly samples: readonly (AtmosphereSample | null)[];
}
export type ConstructionReadinessStatus = "ready" | "waitingForSupport" | "unknown";
export interface ConstructionReadiness {
  readonly site: EntityId;
  readonly status: ConstructionReadinessStatus;
  readonly reason?: "missingStructuralSupport";
}
export type ConstructionAccessContact = Vec3 & { readonly frame: null; readonly kind: "origin" | "landing" };
export interface ConstructionAccess {
  readonly site: EntityId;
  readonly support: ConstructionReadinessStatus;
  readonly materialsReady: boolean;
  readonly contacts: readonly ConstructionAccessContact[];
}
export type DeconstructionAccess = { readonly site: EntityId; readonly status: "ready" | "occupiedPort" | "structuralDependency" | "invalidGeometry"; readonly contacts: readonly ConstructionAccessContact[]; readonly salvageQuantity: number; readonly workSeconds: number };
export type PhysicalContact = {
  readonly solid: boolean;
  readonly sealedTop: boolean;
  readonly outside: boolean;
};

export type TerrainSurface = z.infer<typeof terrainSurfaceSchema>;
export type StructureSurface = {
  readonly cell: readonly [number, number, number];
};
export type FloorOperation =
  | { readonly kind: "build" }
  | { readonly kind: "unchanged"; readonly floor: EntityId }
  | { readonly kind: "replace"; readonly floor: EntityId }
  | { readonly kind: "conflict"; readonly floor: EntityId }
  | { readonly kind: "waiting-for-support" }
  | { readonly kind: "invalid"; readonly reason: string };
export type FloorOperationRequest = { readonly cell: readonly [number, number, number]; readonly desiredCatalog: string };
export type TerrainChangeSet =
  | {
      readonly kind: "changed-columns";
      readonly revision: number;
      readonly columns: readonly (readonly [number, number])[];
    }
  | {
      readonly kind: "full-reset";
      readonly revision: number;
      readonly reason: "history" | "restored" | "stale";
    };
export interface KernelPort {
  readonly floorOperations: (requests: readonly FloorOperationRequest[]) => readonly FloorOperation[];
  readonly transferContacts: (request: { readonly worker: EntityId; readonly container: EntityId }) =>
    | { readonly kind: "ready"; readonly targets: readonly MoveDestination[] }
    | { readonly kind: "blocked"; readonly reason: "sealed" | "unavailable-frame" | "no-contact" };
  readonly physicalContacts: (
    cells: readonly [number, number, number][],
  ) => readonly PhysicalContact[];
  readonly routeCosts: (
    requests: readonly RouteCostRequest[],
  ) => readonly RouteCostResult[];
  readonly routeToAny: (request: RouteToAnyRequest) => RouteToAnyResult;
  readonly dispose: () => void;
  readonly load: (definition: Uint8Array) => void;
  readonly loadEnvironment: (definition: Uint8Array) => void;
  readonly environmentFacts: () => unknown;
  readonly atmosphereSamples: (
    cells: readonly [number, number, number][],
  ) => AtmosphereSamples;
  /** Read-only support projection for pending construction, resolved in one native batch. */
  readonly constructionReadiness: (
    sites: readonly EntityId[],
  ) => readonly ConstructionReadiness[];
  readonly constructionAccess: (sites: readonly EntityId[]) => readonly ConstructionAccess[];
  readonly deconstructionAccess: (sites: readonly EntityId[]) => readonly DeconstructionAccess[];
  readonly terrainMaterials: (
    cells: readonly [number, number, number][],
  ) => readonly number[];
  readonly terrainSurfaces: (
    columns: readonly [number, number][],
  ) => readonly (TerrainSurface | null)[];
  readonly waterContacts: (centers: readonly [number, number, number][]) => readonly { readonly at: readonly [number, number, number]; readonly approaches: readonly MoveDestination[] }[];
  readonly terrainChanges: (sinceRevision: number) => TerrainChangeSet;
  readonly structureSurfaces: (
    columns: readonly [number, number][],
  ) => readonly (readonly StructureSurface[])[];
  readonly query: <T extends object>(
    spec: QuerySpec<T>,
  ) => readonly QueryRow<T>[];
  /** Compact native owner projection for shared work/material planning. */
  readonly workMaterialFacts: () => WorkMaterialFacts;
  readonly processRequirements: (definition: string, station: EntityId) => ProcessRequirements;
  readonly entityMembership: (ids: readonly EntityId[]) => readonly boolean[];
  readonly advance: (
    delta: number,
    writes: readonly WriteIntent[],
    actions: readonly ActionRequest[],
    options?: {
      readonly creates?: readonly EntityRecord[];
      readonly removes?: readonly EntityId[];
    },
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
  readonly presentationWindow?: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  readonly components: readonly ComponentDefinition<any>[];
  readonly systems: readonly SystemDefinition[];
  readonly presentation?: GamePresentation;
  readonly initialActions?: readonly ActionRequest[];
  /** Heterogeneous command inputs are erased at the pack registry boundary. */
  readonly commands?: Readonly<Record<string, GameCommandDefinition>>;
}
export interface GameCommandResult {
  readonly actions: readonly ActionRequest[];
  readonly writes: readonly WriteIntent[];
  readonly creates?: readonly EntityRecord[];
  readonly removes?: readonly EntityId[];
}
export interface GameCommandDefinition {
  /** The sole parser for input entering this command. */
  readonly input: z.ZodType;
  /** Semantic metadata shared by human and agent projections. */
  readonly title: string;
  readonly category: string;
  readonly description: string;
  /** Client-local acquisition metadata for the existing Hive gestures. */
  readonly localPresentation?: {
    readonly bindings: readonly GameLocalBinding[];
  };
  /** Host-owned discoverability state, evaluated against the committed world. */
  readonly availability?: (
    context: Pick<ReadContext, "query">,
  ) => GameCommandAvailability;
  /** Stable subjects for contextual UI projection, evaluated from authoritative state. */
  readonly subjects?: (
    context: Pick<ReadContext, "query">,
  ) => readonly EntityId[];
  /** Authored record creation/removal only; does not grant progress writes. */
  readonly lifecycle?: readonly ComponentDefinition<any>[];
  readonly reads?: readonly ComponentDefinition<any>[];
  readonly writes: readonly ComponentDefinition<any>[];
  /** Erased invocation closes over the parsed handler input in the authoring factory. */
  readonly invoke: (
    context: GameCommandContext,
    input: unknown,
  ) => GameCommandResult;
}
export type GameLocalBinding = Readonly<{
  readonly id: string;
  readonly label: string;
  /** Optional game-owned compact display detail; never used for admission. */
  readonly detail?: string;
  readonly selection?: "entities" | Readonly<{ readonly field: string; readonly cardinality: "one" }>;
  readonly target?: "terrain-cell" | "terrain-area" | "world-surface";
  readonly designation?: readonly ("point" | "line" | "rectangle" | "entities")[];
  readonly preset?: JsonValue;
}>;
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type GameCommandAvailability =
  | { readonly status: "available" }
  | { readonly status: "unavailable"; readonly reason: string };
export interface GamePackTransport {
  readonly id: GameId;
  readonly version: number;
  readonly definition: Uint8Array;
}
