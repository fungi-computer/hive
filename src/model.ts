// Domain values produced by our command UI and fixed-step simulation. Transport
// decoding belongs at a future persistence/network boundary, not in this model.
export type ActorId = string;
export type PartyId = string;
export type JobId = string;
declare const positiveIntBrand: unique symbol;
export type PositiveInt = number & { readonly [positiveIntBrand]: true };
export type LotId = string;
export type TransferId = string;
export type ContainerId = string;
export type OperationId = string;
/** Pails are ordinary indivisible lots; water is always contained. */
export type Material =
  | "wood"
  | "mugwort"
  | "water"
  | "pail"
  | "malt"
  | "barm"
  | "keg"
  | "ale"
  | "spent-grain";
export type ItemLotLocation =
  | ({ kind: "ground" } & Cell)
  | { kind: "hand"; actor: ActorId }
  | { kind: "container"; container: ContainerId };
export type ItemLot = {
  id: LotId;
  material: Material;
  quantity: PositiveInt;
  location: ItemLotLocation;
};
export type SourcePolicy =
  | { readonly kind: "eligible-ground"; readonly material: Material }
  | {
      readonly kind: "eligible-container";
      readonly material: Material;
      readonly container: ContainerId;
    }
  | { readonly kind: "exact-lot"; readonly lot: LotId };
export type TransferOrigin =
  | { readonly kind: "ground"; readonly cell: Cell }
  | { readonly kind: "container"; readonly container: ContainerId };
export type TransferRequest = {
  readonly source: SourcePolicy;
  /** A whole request preserves one source lot; a portion may split it. */
  readonly quantityPolicy: "whole-lot" | "portion";
  readonly quantity: PositiveInt;
};
/** A held item is either promised to a container or retained for one operation. */
export type CarryIntent =
  | { readonly kind: "deliver"; readonly destination: ContainerId }
  | { readonly kind: "use"; readonly operation: OperationId };
export type JobTransferOwner = {
  readonly kind: "job";
  readonly job: JobId;
  readonly step: string;
};
export type OperationTransferOwner = {
  readonly kind: "operation";
  readonly operation: OperationId;
};
export type TransferOwner = JobTransferOwner | OperationTransferOwner;
/** Durable material promises outlive the worker currently moving a lot. */
export type MaterialBinding =
  | {
      readonly kind: "vessel-use";
      readonly id: OperationId;
      readonly vessel: LotId;
    }
  | {
      readonly kind: "brew";
      readonly id: OperationId;
      readonly recipe: "herbal-ale-v1";
      readonly station: ContainerId;
      readonly portions: readonly {
        readonly lot: LotId;
        readonly material: "malt" | "water" | "mugwort" | "wood";
        readonly quantity: PositiveInt;
      }[];
      readonly barm: LotId;
      readonly keg: LotId;
      readonly output: ContainerId;
      readonly tray: ContainerId;
    };
export type Transfer = {
  readonly id: TransferId;
  readonly actor: ActorId;
  /** Consumer-defined opaque identity; the material kernel never branches on it. */
  readonly owner: TransferOwner;
  readonly request: TransferRequest;
  readonly intent: CarryIntent;
  phase:
    | {
        kind: "reserved";
        sourceLot: LotId;
        quantity: PositiveInt;
        origin: TransferOrigin;
      }
    | { kind: "carrying"; lot: LotId };
};
export type EmbeddedMaterial = {
  container: ContainerId;
  material: Material;
  quantity: PositiveInt;
};
/** Immutable provenance written by the one atomic PREPARE transformation. */
export type BrewTransformation = {
  readonly id: OperationId;
  readonly recipe: "herbal-ale-v1";
  readonly inputs: readonly {
    readonly lot: LotId;
    readonly material: "malt" | "water" | "mugwort" | "wood";
    readonly quantity: PositiveInt;
  }[];
};
export type MaterialsState = {
  lots: ItemLot[];
  transfers: Transfer[];
  bindings: MaterialBinding[];
  transformations: BrewTransformation[];
  embedded: EmbeddedMaterial[];
  nextLotId: number;
  consumedWood: number;
};
export type FeatureId = string;
export type SourceFeatureKind = "spring" | "reclaimed-timber-cache";
type SourceFeatureBase = Cell & {
  id: FeatureId;
  /** Access is metadata. Its finite quantity is a lot in sourceContainer(id). */
};
export type SourceFeature =
  | (SourceFeatureBase & { kind: "spring"; access: "open" })
  | (SourceFeatureBase & {
      kind: "reclaimed-timber-cache";
      access: "sealed";
      /** The once-only repair gate belongs only to the cache capability. */
      repaired: boolean;
    });
export type PendingFeatureIntroduction = {
  id: FeatureId;
  kind: SourceFeatureKind;
  preferred: Cell;
};
export type HerbId = string;
export type Cell = { x: number; z: number; level: number };
export type BuildingKind =
  | "wall"
  | "door"
  | "roof"
  | "bed"
  | "shelf"
  | "floor"
  | "stair"
  | "brew-station";
export type WorkType = "chop" | "haul" | "build" | "garden" | "craft";
export type AllowedWork = Record<WorkType, boolean>;
export type Scope = { party: PartyId; actors: ActorId[] | null };

export type WorkCommand = Scope & { direct?: boolean } & (
    | { kind: "chop"; tree: string }
    | ({ kind: "build"; type: BuildingKind; direction: number } & Cell)
    | { kind: "deconstruct"; site: string }
    | ({ kind: "sow" } & Cell)
    | { kind: "harvest"; herb: HerbId }
    | { kind: "rest" }
  );
export type StoreCommand = {
  kind: "store";
  party: PartyId;
  actors: null;
  lot: LotId;
  shelf: string;
};
export type RepairCacheCommand = Scope & {
  kind: "repair-cache";
  direct?: boolean;
};
export type FillKettleCommand = Scope & {
  kind: "fill-kettle";
  direct?: boolean;
  station: string;
};
/** Recipe selection stays pinned in the process owner; the command names only its station. */
export type BrewCommand = Scope & {
  kind: "brew";
  direct?: boolean;
  station: string;
};
export type Command =
  | WorkCommand
  | StoreCommand
  | RepairCacheCommand
  | FillKettleCommand
  | BrewCommand
  | (Scope & { kind: "cancel" | "next"; job: JobId })
  | (Scope & { kind: "routine"; enabled: boolean })
  | (Scope & { kind: "work"; work: WorkType; enabled: boolean })
  | { kind: "draft"; party: PartyId; actor: ActorId }
  | { kind: "undraft"; party: PartyId; actor: ActorId }
  | { kind: "go"; party: PartyId; actor: ActorId; target: Cell }
  | { kind: "recruit"; party: PartyId; actor: ActorId };

type JobBase = {
  id: JobId;
  scope: Scope;
  reason: string;
  routine: boolean;
};
export type ChopJob = JobBase & { kind: "chop"; target: string };
export type BuildJob = JobBase & { kind: "build"; target: string };
export type DeconstructJob = JobBase & { kind: "deconstruct"; target: string };
export type SowJob = JobBase & { kind: "sow"; target: HerbId };
export type HarvestJob = JobBase & { kind: "harvest"; target: HerbId };
export type StoreJob = JobBase & {
  kind: "store";
  source: LotId;
  destination: ContainerId;
};
export type RestJob = JobBase & { kind: "rest"; target: ActorId };
export type RepairCacheJob = JobBase & {
  kind: "repair-cache";
  target: FeatureId;
};
export type FillKettleJob = JobBase & {
  kind: "fill-kettle";
  target: string;
};
export type BrewJob = JobBase & { kind: "brew"; target: string };
export type Job =
  | ChopJob
  | BuildJob
  | DeconstructJob
  | SowJob
  | HarvestJob
  | StoreJob
  | RestJob
  | RepairCacheJob
  | FillKettleJob
  | BrewJob;
export type Assignment = { character: ActorId; task: JobId; cost: number };
type ActivityBase = {
  job: JobId;
  target: string;
  duration: number;
};
export type ChopActivity = ActivityBase & { kind: "chop" };
export type BuildActivity = ActivityBase & { kind: "build" };
export type DeconstructActivity = ActivityBase & { kind: "deconstruct" };
export type SowActivity = ActivityBase & { kind: "sow" };
export type HarvestActivity = ActivityBase & { kind: "harvest" };
export type TransferActivity = ActivityBase & { kind: "transfer" };
export type SleepActivity = ActivityBase & { kind: "sleep" };
export type BrewWaterActivity = ActivityBase & { kind: "brew-water" };
export type RepairCacheActivity = ActivityBase & { kind: "repair-cache" };
export type BrewActivity = ActivityBase & { kind: "brew" };
export type Activity =
  | ChopActivity
  | BuildActivity
  | DeconstructActivity
  | SowActivity
  | HarvestActivity
  | TransferActivity
  | SleepActivity
  | BrewWaterActivity
  | RepairCacheActivity
  | BrewActivity;
export type Body = Cell & {
  dir: number;
  mode: "idle" | "walk" | Activity["kind"];
  path: Cell[];
  leg: number;
  work: number;
};
export type Actor = Body & {
  id: ActorId;
  name: string;
  figure: string;
  drafted: boolean;
  rest: number;
  routine: boolean;
  allowedWork: AllowedWork;
  task: Activity | null;
  assignment: Assignment | null;
};
export type Tree = Cell & { id: string; work: number; felledAt: number | null };
export type HerbStage = "ordered" | "planted" | "growing" | "ready";
export type Herb = Cell & {
  id: HerbId;
  kind: "mugwort";
  stage: HerbStage;
  work: number;
  plantedAt: number | null;
};
export type Site = Cell & {
  id: string;
  type: BuildingKind;
  direction: number;
  work: number;
  finishedAt: number | null;
};
export type StoryEvent = {
  kind: string;
  name: string;
  tick: number;
  text: string;
};
/** The one saved identity for cache repair, pail custody, draw and pour. */
export type BrewWaterOperation = {
  id: OperationId;
  job: JobId;
  actor: ActorId;
  spring: FeatureId;
  station: string;
  pail: LotId;
  water: LotId | null;
  /** Incomplete effect phase; successful pour retires this operation. */
  phase: "acquire" | "draw" | "pour";
};
/** The process owner advances this one saved process; workers only attend PREPARE. */
export type BrewProcess = {
  id: OperationId;
  job: JobId;
  station: string;
  binding: OperationId;
  phase: "prepare" | "ferment";
  progress: number;
  enteredAt: number;
};
export type Clearing = {
  seed: number;
  tick: number;
  paused: boolean;
  nextId: number;
  actors: Record<ActorId, Actor>;
  parties: Record<PartyId, { id: PartyId; members: ActorId[] }>;
  cat: Body & { nextMove: number };
  trees: Tree[];
  herbs: Herb[];
  materials: MaterialsState;
  sources: SourceFeature[];
  pendingSources: PendingFeatureIntroduction[];
  operations: BrewWaterOperation[];
  processes: BrewProcess[];
  rocks: Cell[];
  watcher: Cell;
  sites: Site[];
  // This ordered array remains the sole job store. Priority is its order; an
  // additional mutable status/index store would add no needed behavior here.
  jobs: Job[];
  workDirty: boolean;
  felled: number;
  finishedJobs: number;
  rested: number;
  harvestedHerbs: number;
  commands: (Command & { tick: number })[];
  feed: {
    seed: number;
    sequence: number;
    nextAt: number;
    last: StoryEvent | null;
  };
  demand: StoryEvent | null;
  notice: string;
};
export type Colony = {
  compute_cost(input: {
    travel_time: number;
    work_time: number;
    priority: number;
  }): number;
  optimize(assignments: Assignment[]): Assignment[];
};
