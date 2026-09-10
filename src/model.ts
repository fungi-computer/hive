// Domain values produced by our command UI and fixed-step simulation. Transport
// decoding belongs at a future persistence/network boundary, not in this model.
export type ActorId = string;
export type PartyId = string;
export type JobId = string;
export type PositiveInt = import("./engine/materials/types.ts").PositiveInt;
export type LotId = string;
export type TransferId = string;
export type ContainerId = string;
export type OperationId = string;
/** Checked by the recipe definition owner; generic state carries an opaque ID. */
export type RecipeId = string;
/** Checked by the building/content definition owner for the resolved station. */
export type BrewStationSlot = string;
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
  | "spent-grain"
  | "soil"
  | "ration";
import type * as PhysicalMaterials from "./engine/materials/types.ts";
export type ItemLot = PhysicalMaterials.ItemLot<Material>;
export type SourcePolicy = PhysicalMaterials.SourcePolicy<Material>;
export type TransferRequest = PhysicalMaterials.TransferRequest<Material>;
export type MaterialBinding = PhysicalMaterials.MaterialBinding<Material>;
export type Transfer = PhysicalMaterials.Transfer<Material>;
export type EmbeddedMaterial = PhysicalMaterials.EmbeddedMaterial<Material>;
export type RecipeTransformation =
  PhysicalMaterials.RecipeTransformation<Material>;
export type RecipeConsumption = PhysicalMaterials.RecipeConsumption<Material>;
export type MaterialSinkReceipt =
  PhysicalMaterials.MaterialSinkReceipt<Material>;
export type MaterialsState = PhysicalMaterials.MaterialsState<Material> & {
  consumedWood: number;
};
export type ItemLotLocation = PhysicalMaterials.ItemLotLocation;
export type TransferOrigin = PhysicalMaterials.TransferOrigin;
export type CarryIntent = PhysicalMaterials.CarryIntent;
export type JobTransferOwner = PhysicalMaterials.JobTransferOwner;
export type OperationTransferOwner = PhysicalMaterials.OperationTransferOwner;
export type TransferOwner = PhysicalMaterials.TransferOwner;
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
export type Cell = import("./engine/world/footing.ts").Footing;
export type Placement = import("./game-space.ts").Placement;
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
    | {
        kind: "dig";
        voxel: import("./world-presets/goblin-terrain.ts").TerrainVoxel;
      }
    | ({ kind: "build"; type: BuildingKind; direction: number } & Placement)
    | { kind: "deconstruct"; site: string }
    | ({ kind: "sow" } & Placement)
    | { kind: "harvest"; herb: HerbId }
    | { kind: "water-mugwort"; herb: HerbId }
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
/** Tap chooses only a finished station; recipe receipt and serving stay owned below UI. */
export type TapCommand = Scope & {
  kind: "tap";
  direct?: boolean;
  station: string;
};
/** Station-owned output disposal; the recipe resolves the actual tray portion. */
export type ClearSpentGrainCommand = Scope & {
  kind: "clear-spent-grain";
  direct?: boolean;
  station: string;
};
export type Command =
  | WorkCommand
  | StoreCommand
  | RepairCacheCommand
  | FillKettleCommand
  | BrewCommand
  | TapCommand
  | ClearSpentGrainCommand
  | (Scope & { kind: "cancel" | "next"; job: JobId })
  | (Scope & { kind: "routine"; enabled: boolean })
  | (Scope & { kind: "work"; work: WorkType; enabled: boolean })
  | { kind: "draft"; party: PartyId; actor: ActorId }
  | { kind: "undraft"; party: PartyId; actor: ActorId }
  | { kind: "go"; party: PartyId; actor: ActorId; target: Cell }
  | { kind: "recruit"; party: PartyId; actor: ActorId };

type JobBase = {
  id: JobId;
  lifecycle: "active" | "canceling";
  scope: Scope;
  reason: string;
  routine: boolean;
};
export type ChopJob = JobBase & { kind: "chop"; target: string };
export type BuildJob = JobBase & { kind: "build"; target: string };
export type DeconstructJob = JobBase & { kind: "deconstruct"; target: string };
export type SowJob = JobBase & { kind: "sow"; target: HerbId };
export type HarvestJob = JobBase & { kind: "harvest"; target: HerbId };
export type WaterMugwortJob = JobBase & {
  kind: "water-mugwort";
  target: HerbId;
};
export type StoreJob = JobBase & {
  kind: "store";
  source: LotId;
  destination: ContainerId;
};
/** Personal physical care is deliberately outside a work-party scope. */
export type CareNeed = "nourishment" | "hydration" | "rest";
export type CareJob = {
  id: JobId;
  lifecycle: "active" | "canceling";
  kind: "care";
  target: ActorId;
  need: CareNeed;
  policy: "automatic" | "manual-rest" | "routine-rest";
  reason: string;
  routine: boolean;
};
export type RepairCacheJob = JobBase & {
  kind: "repair-cache";
  target: FeatureId;
};
export type FillKettleJob = JobBase & {
  kind: "fill-kettle";
  target: string;
};
export type BrewJob = JobBase & { kind: "brew"; target: string };
export type TapJob = JobBase & {
  kind: "tap";
  target: string;
  transformation: OperationId;
  progress: number;
};
export type ClearSpentGrainJob = JobBase & {
  kind: "clear-spent-grain";
  target: string;
  transformation: OperationId;
  progress: number;
};
export type DigJob = JobBase & {
  kind: "dig";
  voxel: import("./world-presets/goblin-terrain.ts").TerrainVoxel;
};
export type TerrainJob = DigJob;
export type Job =
  | ChopJob
  | BuildJob
  | DeconstructJob
  | SowJob
  | HarvestJob
  | WaterMugwortJob
  | StoreJob
  | CareJob
  | RepairCacheJob
  | FillKettleJob
  | BrewJob
  | TapJob
  | ClearSpentGrainJob
  | TerrainJob;
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
export type ConsumeActivity = ActivityBase & { kind: "consume" };
export type WaterDeliveryActivity = ActivityBase & { kind: "water-delivery" };
export type RepairCacheActivity = ActivityBase & { kind: "repair-cache" };
export type BrewActivity = ActivityBase & { kind: "brew" };
export type TapActivity = ActivityBase & { kind: "tap" };
export type ClearSpentGrainActivity = ActivityBase & {
  kind: "clear-spent-grain";
};
export type TerrainActivity = ActivityBase & { kind: "dig" };
export type Activity =
  | ChopActivity
  | BuildActivity
  | DeconstructActivity
  | SowActivity
  | HarvestActivity
  | TransferActivity
  | SleepActivity
  | ConsumeActivity
  | WaterDeliveryActivity
  | RepairCacheActivity
  | BrewActivity
  | TapActivity
  | ClearSpentGrainActivity
  | TerrainActivity;
export type Body = Cell & {
  dir: number;
  mode: "idle" | "walk" | Activity["kind"];
  traversal: import("./engine/navigation/index.ts").Traversal | null;
  navigationProfile: "upright" | "small";
  work: number;
};
export type Actor = Body & {
  workDisposition: "continue" | "interrupt-at-footing";
  id: ActorId;
  name: string;
  figure: string;
  drafted: boolean;
  needs: Needs;
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
  /** The one establishment fact carries either verified water or legacy trajectory. */
  establishment:
    | null
    | { readonly kind: "legacy"; readonly at: number }
    | { readonly kind: "water"; readonly at: number; readonly receipt: string };
  plantedAt: number | null;
};
export type Site = Placement & {
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
/** Semantic completion belongs to the checked water-delivery target resolver. */
export type WaterDeliveryTarget =
  | { readonly kind: "kettle"; readonly station: string }
  | { readonly kind: "mugwort"; readonly herb: HerbId }
  | { readonly kind: "hydration"; readonly actor: ActorId };
/** One saved pail/water operation, independent of its current executor. */
export type WaterDeliveryOperation = {
  kind: "water-delivery";
  id: OperationId;
  job: JobId;
  supply: import("./water-supply.ts").WaterSupply;
  target: WaterDeliveryTarget;
  quantity: PositiveInt;
  pail: LotId;
  execution: import("./engine/work/index.ts").WorkProgress;
};
/** A ration is carried by the ordinary operation-owned use transfer. */
export type ConsumeOperation = {
  kind: "consume";
  id: OperationId;
  job: JobId;
  actor: ActorId;
  definition: string;
  execution: import("./engine/work/index.ts").WorkProgress;
};
export type CareOutcome = {
  id: string;
  receipt: string;
  actor: ActorId;
  need: "nourishment" | "hydration";
  definition: string;
  amount: number;
  tick: number;
};
export type Needs = {
  advancedAt: number;
  nourishment: number;
  hydration: number;
  rest: number;
};
/** The process owner advances this one saved process; workers attend PREPARE/KEG. */
export type BrewProcess = {
  id: OperationId;
  job: JobId;
  station: string;
  binding: OperationId;
  phase: "prepare" | "ferment" | "keg";
  progress: number;
  enteredAt: number;
};
export type TerrainState =
  import("./world-presets/goblin-terrain.ts").GeneratedTerrain;
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
  operations: (WaterDeliveryOperation | ConsumeOperation)[];
  careOutcomes: CareOutcome[];
  processes: BrewProcess[];
  terrain: TerrainState;
  rocks: Cell[];
  watcher: Cell;
  sites: Site[];
  // This ordered array remains the sole job store. Priority is its order; an
  // additional mutable status/index store would add no needed behavior here.
  jobs: Job[];
  workDirty: boolean;
  felled: number;
  finishedJobs: number;
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
