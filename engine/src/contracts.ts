import type { z } from "zod";
import type { terrainSurfaceSchema } from "./runtime/terrain-surface";
import type { KernelRecordSnapshot } from "./runtime/kernel-records";
import type { WorkActivity } from "./runtime/work-activity";
import type { GamePresentation } from "./presentation";
import type { ActorDefinition } from "./sdk/behavior";
/** Public boundary between authored TypeScript and the authoritative kernel. */
export type EntityId = string & { readonly __entityId: unique symbol };
export type ComponentId = `${string}.${string}`;
export type GameId = string;
export const RESERVED_COMPONENTS = [
  "hive.party",
  "hive.owned-by",
  "hive.party-member",
  "hive.owned-by-party",
  "hive.stockpile-cell",
  "hive.storage-provider",
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
  "hive.resource-order",
  "hive.excavation-work",
  "hive.excavation-order",
  "hive.deconstruction-work",
  "hive.supply-allocation",
  "hive.field-water-work",
  "hive.vessel-capability",
  "hive.work-policy",
  "hive.work-execution",
  "hive.work-schedule",
  "hive.job-task-work",
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
  "hive.owned-by-party",
  "hive.party-member",
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
  /** The single entity field targeted by this registered relation, when present. */
  readonly targetField?: keyof T & string;
  /** Capability IDs required on the source and target relation endpoints. */
  readonly sourceRequires?: readonly ComponentId[];
  readonly targetRequires?: readonly ComponentId[];
  readonly onTargetRemoved?: RelationRemovalPolicy;
  readonly allowSelf?: boolean;
  readonly validate: (value: unknown) => value is T;
}
export type FieldType =
  "number" | "boolean" | "string" | "nullable-string" | "entity" | "nullable-entity";
export type RelationRemovalPolicy = "detach" | "restrict";
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
export type JobEntityBinding =
  | { readonly kind: "exact"; readonly value: EntityId }
  | { readonly kind: "result"; readonly value: { readonly step: string; readonly slot: string } };
export type JobOperation =
  | {
      readonly kind: "finiteToItem";
      readonly source: JobEntityBinding;
      readonly inputKind: string;
      readonly inputQuantity: number;
      readonly outputKind: string;
      readonly outputQuantity: number;
      readonly workSeconds: number;
      readonly resultSlot: string;
    }
  | {
      readonly kind: "itemToItems";
      readonly source: JobEntityBinding;
      readonly inputKind: string;
      readonly inputQuantity: number;
      readonly outputKind: string;
      readonly outputQuantity: number;
      readonly workSeconds: number;
      readonly resultSlot: string;
    };
export type JobContinuation = "any-eligible" | "prefer-starter" | "bind-on-first-progress" | { readonly "assigned-actor": EntityId };
export interface JobStep {
  readonly key: string;
  readonly after: string | null;
  readonly operation: JobOperation;
  readonly continuation?: JobContinuation;
}
export interface JobPlan {
  readonly definition: string;
  readonly definitionVersion: number;
  readonly steps: readonly JobStep[];
}
export type CardinalOrientation = "north" | "east" | "south" | "west";
export type EdgeTarget = { readonly cell: readonly [number, number, number]; readonly axis: "x" | "z" };
export type ConstructionTarget =
  | { readonly kind: "cell"; readonly cell: Vec3; readonly orientation: CardinalOrientation }
  | { readonly kind: "edge"; readonly edge: { readonly cell: Vec3; readonly axis: "x" | "z" } };
export type ActionRequest =
  | { readonly kind: "instantiate-actors"; readonly bindingId: string; readonly expectedSequence: number; readonly plan: ActorInstantiationPlan }
  | { readonly kind: "set-relation"; readonly relation: ComponentId; readonly source: EntityId; readonly target: EntityId }
  | { readonly kind: "clear-relation"; readonly relation: ComponentId; readonly source: EntityId }
  | { readonly kind: "begin-work-attempt"; readonly task: EntityId; readonly worker: EntityId; readonly operation: WorkActivityRef }
  | { readonly kind: "retarget-work-attempt"; readonly task: EntityId; readonly generation: number; readonly sequence: number; readonly destination: MoveDestination }
  | { readonly kind: "interrupt-work-attempt"; readonly task: EntityId; readonly generation: number; readonly sequence: number; readonly cause: WorkInterruptCause }
  | { readonly kind: "acknowledge-work-attempt"; readonly task: EntityId; readonly generation: number; readonly sequence: number }
  | { readonly kind: "continue-work-attempt"; readonly task: EntityId; readonly generation: number; readonly sequence: number; readonly nextActivity: WorkActivityRef }
  | { readonly kind: "create-job"; readonly id: EntityId; readonly pool: EntityId; readonly plan: JobPlan }
  | { readonly kind: "resume-job"; readonly id: EntityId; readonly pool: EntityId; readonly plan: JobPlan }
  | { readonly kind: "cancel-job"; readonly id: EntityId }
  | { readonly kind: "establish-resource-site"; readonly operation: string; readonly worker: EntityId; readonly site: EntityId; readonly definition: string; readonly x: number; readonly y: number; readonly z: number }
  | { readonly kind: "tend-resource-site"; readonly operation: string; readonly worker: EntityId; readonly site: EntityId; readonly vessel: EntityId }
  | { readonly kind: "designate-resource"; readonly order: EntityId; readonly party: EntityId; readonly definition: string; readonly x: number; readonly y: number; readonly z: number }
  | { readonly kind: "request-field-water"; readonly party: EntityId; readonly material: string; readonly portions: number }
  | { readonly kind: "request-process"; readonly definition: string; readonly station: EntityId }
  | { readonly kind: "admit-process"; readonly process: EntityId; readonly definition: string; readonly station: EntityId }
  | {
      readonly kind: "designate-stockpile";
      readonly party: EntityId;
      readonly zone: EntityId;
      readonly cells: readonly {
        readonly x: number;
        readonly y: number;
        readonly z: number;
        readonly priority: number;
        readonly filterProfile: string;
      }[];
    }
  | { readonly kind: "update-stockpile"; readonly party: EntityId; readonly zone: EntityId; readonly filterProfile: string; readonly priority: number }
  | { readonly kind: "clear-stockpile"; readonly party: EntityId; readonly zone: EntityId; readonly cells: readonly { readonly x: number; readonly y: number; readonly z: number }[] }
  | {
      readonly kind: "set-structure-open";
      readonly worker: EntityId;
      readonly site: EntityId;
      readonly open: boolean;
    }
  | { readonly kind: "deconstruct"; readonly worker: EntityId; readonly site: EntityId }
  | { readonly kind: "plan-deconstruction"; readonly site: EntityId; readonly party: EntityId }
  | { readonly kind: "plan-constructions"; readonly party: EntityId; readonly plans: readonly PlacementCandidate[] }
  | { readonly kind: "plan-excavation"; readonly party: EntityId; readonly prefix: string; readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number] }
  | { readonly kind: "cancel-excavation"; readonly party: EntityId; readonly area: { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number] } | null; readonly workers: readonly EntityId[] }
  | { readonly kind: "replace-floor"; readonly orderId: EntityId; readonly existingFloorId: EntityId; readonly desiredCatalog: string }
  | { readonly kind: "bind-construction-stage"; readonly site: EntityId; readonly contact: Vec3 & { readonly frame: null } }
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
export type WorkActivityRef =
  | { readonly kind: "route"; readonly destination: MoveDestination }
  | { readonly kind: "construction"; readonly site: EntityId; readonly contact: Vec3 & { readonly frame: null }; readonly mode: "bind" | "work" }
  | { readonly kind: "excavation"; readonly cell: readonly [number, number, number]; readonly expectedMaterial: number; readonly replacementMaterial: number }
  | { readonly kind: "deconstruction"; readonly site: EntityId; readonly contact: Vec3 & { readonly frame: null } }
  | { readonly kind: "process-attendance"; readonly process: EntityId }
  | { readonly kind: "material-transfer"; readonly lot: EntityId; readonly from: EntityId; readonly to: EntityId; readonly quantity: number }
  | { readonly kind: "material-drop"; readonly lot: EntityId }
  | { readonly kind: "resource-establish"; readonly site: EntityId; readonly definition: string; readonly cell: readonly [number, number, number] }
  | { readonly kind: "resource-tend"; readonly site: EntityId; readonly vessel: EntityId }
  | { readonly kind: "resource-extract"; readonly source: EntityId }
  | { readonly kind: "field-water"; readonly vessel: EntityId; readonly cell: readonly [number, number, number]; readonly direction: "withdraw" | "deposit"; readonly portions: number }
  | { readonly kind: "job-transform"; readonly task: EntityId; readonly contact: MoveDestination };
export type WorkInterruptCause = "drafted" | "cancelled" | "workerUnavailable" | "accessLost";
export type WorkBlockReason = "accessLost" | "missingInputs" | "capacityUnavailable" | "unsupportedStructure" | "workerUnavailable";
export interface WorkAttemptKey { readonly task: EntityId; readonly generation: number }
export type WorkOutcome = { readonly kind: "completed" } | { readonly kind: "blocked"; readonly reason: WorkBlockReason } | { readonly kind: "interrupted"; readonly cause: WorkInterruptCause };
export type WorkAttemptPhase = { readonly kind: "ready" } | { readonly kind: "executing"; readonly operation: { readonly attempt: WorkAttemptKey; readonly sequence: number }; readonly activity: WorkActivityRef } | { readonly kind: "outcome"; readonly operation: { readonly attempt: WorkAttemptKey; readonly sequence: number }; readonly activity: WorkActivityRef; readonly result: WorkOutcome } | { readonly kind: "settling"; readonly operation: { readonly attempt: WorkAttemptKey; readonly sequence: number }; readonly cause: WorkInterruptCause };
export interface WorkExecution { readonly pool: EntityId; readonly initiatingPlayer: string | null; readonly policyId: string }
export interface WorkAttempt { readonly key: WorkAttemptKey; readonly worker: EntityId; readonly execution: WorkExecution; readonly phase: WorkAttemptPhase }
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
  readonly workAttemptForWorker: (worker: EntityId) => WorkAttempt | null;
  readonly processRequirements: (definition: string, station: EntityId) => ProcessRequirements;
  readonly floorOperations: (requests: readonly FloorOperationRequest[]) => readonly FloorOperation[];
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
  structureSurfaces(
    columns: readonly [number, number][],
  ): readonly (readonly StructureSurface[])[];
  waterContacts(centers: readonly [number, number, number][]): readonly { readonly at: readonly [number, number, number]; readonly approaches: readonly MoveDestination[] }[];
}
/** Native read doors available to authored decisions beyond ECS/query state. */
export type NativeFact = Exclude<
  keyof ReadContext,
  "clock" | "outcomes" | "random" | "impacts" | "query"
>;
export type CommandScope =
  | { readonly kind: "host" }
  | { readonly kind: "player"; readonly player: string };
export type PartyJoinIdentity = Readonly<{
  readonly status: "existing" | "available";
  readonly sequence: number;
  readonly player: string;
  readonly party: EntityId;
  readonly people: readonly EntityId[];
}>;
export type ActorArgument =
  | { readonly kind: "value"; readonly value: string | number | boolean | null }
  | { readonly kind: "spawned"; readonly slot: string }
  | { readonly kind: "existing"; readonly id: EntityId }
  | { readonly kind: "joining-player" };
export type ActorInstantiationPlan = Readonly<{
  readonly actors: readonly Readonly<{
    readonly slot: string;
    readonly definition: string;
    readonly arguments: Readonly<Record<string, ActorArgument>>;
    readonly surfaceColumn?: readonly [number, number];
  }>[];
  readonly initialMaterials: readonly Readonly<{
    readonly container: ActorArgument;
    readonly kind: string;
    readonly quantity: number;
    readonly actorDefinition?: string;
    readonly arguments?: Readonly<Record<string, ActorArgument>>;
  }>[];
  readonly partySlot: string;
  readonly peopleSlots: readonly string[];
}>;
export type PartyJoinCapability = Readonly<{
  readonly footprint: readonly (readonly [number, number])[];
  readonly prepare: (spawn: Vec3) => ActorInstantiationPlan;
}>;
export type ActionScope =
  | { readonly kind: "host" }
  | { readonly kind: "player"; readonly player: string };
export interface ScopedAction {
  readonly scope: ActionScope;
  readonly request: ActionRequest;
}
export interface ScopedCreate {
  readonly scope: ActionScope;
  readonly record: EntityRecord;
}
export interface ScopedRemove {
  readonly scope: ActionScope;
  readonly entity: EntityId;
}
export type GameCommandContext = Pick<ReadContext, "query" | "physicalContacts" | "terrainMaterials" | "terrainSurfaces" | "structureSurfaces" | "transferContacts"> & {
  readonly scope: CommandScope;
  readonly workAttempts: (taskIds: readonly EntityId[]) => readonly WorkAttempt[];
  readonly workAttemptForWorker: (worker: EntityId) => WorkAttempt | null;
  readonly floorOperations: (requests: readonly FloorOperationRequest[]) => readonly FloorOperation[];
};
export interface WriteContext extends ReadContext {
  write<T extends object>(
    definition: ComponentDefinition<T>,
    entity: EntityId,
    value: T,
  ): void;
  action(request: ActionRequest, scope?: ActionScope): void;
  createAuthoredEntity(record: EntityRecord, scope?: ActionScope): void;
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
export type VisualPlacement =
  | {
      readonly kind: "edge";
      readonly edge: EdgeTarget;
    }
  | {
      readonly kind: "footprint";
      readonly footprint: readonly (readonly [number, number])[];
      readonly orientation: CardinalOrientation;
    }
  | {
      readonly kind: "stair";
      readonly entrance: readonly [number, number, number];
      readonly landing: readonly [number, number, number];
      readonly orientation: CardinalOrientation;
    };
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
  readonly placement?: VisualPlacement;
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
    readonly closedFaces: readonly { readonly cell: Vec3; readonly axis: "x" | "z" }[];
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
export interface PlacementCandidate {
  readonly site: EntityId;
  readonly catalog: string;
  readonly target: ConstructionTarget;
}
export interface PlacementDecision {
  readonly site: EntityId;
  readonly status: "ready" | "rejected";
  readonly reason?: string;
}
export interface PlacementDecisionResponse {
  readonly revision: number;
  readonly placementRevision: number;
  readonly decisions: readonly PlacementDecision[];
}
export type ConstructionAccessContact = Vec3 & { readonly frame: null; readonly kind: "origin" | "landing" };
export interface ConstructionAccess {
  readonly site: EntityId;
  readonly support: ConstructionReadinessStatus;
  readonly materialsReady: boolean;
  readonly blockedActors: readonly EntityId[];
  readonly contacts: readonly ConstructionAccessContact[];
}
export type DeconstructionAccess = { readonly site: EntityId; readonly status: "ready" | "occupiedPort" | "structuralDependency" | "invalidGeometry"; readonly contacts: readonly ConstructionAccessContact[]; readonly salvageQuantity: number; readonly workSeconds: number };
export type PhysicalContact = {
  readonly solid: boolean;
  readonly sealedTop: boolean;
  readonly outside: boolean;
};

export type TerrainSurface = z.infer<typeof terrainSurfaceSchema>;
export type TerrainSurfaceCover = NonNullable<TerrainSurface["cover"]>;
export interface TerrainPresentationDefinition {
  /** Content-owned art family for each physical material slot. */
  readonly materials: readonly {
    readonly slot: number;
    readonly art: string;
  }[];
  /** Pure fresh-world cover projection. Later physical cover mutations override it. */
  readonly generatedCover?: (input: {
    readonly cell: readonly [number, number, number];
    readonly material: number;
    readonly generatedTop: number;
    readonly worldSeed: string;
    readonly worldIdentity: string;
  }) => TerrainSurfaceCover | null;
}
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
  readonly partyJoinIdentity: (bindingId: string) => PartyJoinIdentity;
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
  /** Advisory native geometry decision; command admission always rechecks. */
  readonly placementDecisions: (
    party: EntityId,
    candidates: readonly PlacementCandidate[],
  ) => PlacementDecisionResponse;
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
  readonly workAttempts: (taskIds: readonly EntityId[]) => readonly WorkAttempt[];
  readonly workAttemptForWorker: (worker: EntityId) => WorkAttempt | null;
  readonly processRequirements: (definition: string, station: EntityId) => ProcessRequirements;
  readonly entityMembership: (ids: readonly EntityId[]) => readonly boolean[];
  readonly advance: (
    delta: number,
    writes: readonly WriteIntent[],
    actions: readonly ScopedAction[],
    options?: {
      readonly creates?: readonly ScopedCreate[];
      readonly removes?: readonly ScopedRemove[];
    },
  ) => AdvanceResult;
  readonly snapshot: () => KernelSnapshot;
  readonly restore: (snapshot: KernelSnapshot) => void;
  readonly renderFacts: (limit?: number) => readonly RenderFact[];
  readonly worldPoses: (entities: readonly EntityId[]) => readonly WorldPose[];
}
export interface GamePack {
  readonly id: GameId;
  readonly version: number;
  readonly localScope?: CommandScope;
  readonly definition: Uint8Array;
  readonly environmentDefinition?: Uint8Array;
  readonly presentationWindow?: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  /** Game-authored terrain vocabulary. The engine owns no grass or biome IDs. */
  readonly terrainPresentation?: TerrainPresentationDefinition;
  readonly components: readonly ComponentDefinition<any>[];
  /** Prepared content templates; native lifecycle owns their instantiation. */
  readonly actors?: readonly ActorDefinition[];
  readonly systems: readonly SystemDefinition[];
  readonly presentation?: GamePresentation;
  /** Fresh-world setup that must commit before the first player command. */
  readonly bootstrapActions?: readonly ActionRequest[];
  readonly initialActions?: readonly ActionRequest[];
  readonly partyJoin?: PartyJoinCapability;
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
  readonly target?: "terrain-cell" | "terrain-area" | "world-surface" | "world-edge";
  readonly designation?: readonly ("point" | "line" | "rectangle" | "edge-line" | "entities")[];
  /** Definition-derived fixture cells for local preview only; native admission remains authoritative. */
  readonly footprint?: readonly (readonly [number, number])[];
  /** Local placement in the persistent bottom action dock. */
  readonly placement?: "action-bar";
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
