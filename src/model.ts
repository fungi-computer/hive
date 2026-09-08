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
export type Material = "wood" | "mugwort";
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
  readonly destination: ContainerId;
};
export type Transfer = {
  readonly id: TransferId;
  readonly actor: ActorId;
  /** Consumer-defined opaque identity; the material kernel never branches on it. */
  readonly owner: { readonly job: JobId; readonly step: string };
  readonly request: TransferRequest;
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
export type MaterialsState = {
  lots: ItemLot[];
  transfers: Transfer[];
  embedded: EmbeddedMaterial[];
  nextLotId: number;
  consumedWood: number;
};
export type HerbId = string;
export type Cell = { x: number; z: number; level: number };
export type BuildingKind =
  "wall" | "door" | "roof" | "bed" | "shelf" | "floor" | "stair";
export type WorkType = "chop" | "haul" | "build" | "garden";
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
export type Command =
  | WorkCommand
  | StoreCommand
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
export type Job =
  | ChopJob
  | BuildJob
  | DeconstructJob
  | SowJob
  | HarvestJob
  | StoreJob
  | RestJob;
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
export type Activity =
  | ChopActivity
  | BuildActivity
  | DeconstructActivity
  | SowActivity
  | HarvestActivity
  | TransferActivity
  | SleepActivity;
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
