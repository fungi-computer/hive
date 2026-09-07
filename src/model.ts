// Domain values produced by our command UI and fixed-step simulation. Transport
// decoding belongs at a future persistence/network boundary, not in this model.
export type ActorId = string;
export type PartyId = string;
export type JobId = string;
export type HerbId = string;
export type HerbBundleId = string;
export type Cell = { x: number; z: number; level: number };
export type BuildingKind = "wall" | "door" | "roof" | "bed" | "shelf";
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
export type StoreHerbCommand = {
  kind: "store-herb";
  party: PartyId;
  actors: null;
  bundle: HerbBundleId;
  shelf: string;
};
export type Command =
  | WorkCommand
  | StoreHerbCommand
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
export type StoreHerbJob = JobBase & {
  kind: "store-herb";
  bundle: HerbBundleId;
  shelf: string;
};
export type RestJob = JobBase & { kind: "rest"; target: ActorId };
export type Job =
  | ChopJob
  | BuildJob
  | DeconstructJob
  | SowJob
  | HarvestJob
  | StoreHerbJob
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
export type PickupActivity = ActivityBase & { kind: "pickup" };
export type DeliverActivity = ActivityBase & { kind: "deliver" };
export type PickupHerbActivity = ActivityBase & { kind: "pickup-herb" };
export type StoreHerbActivity = ActivityBase & { kind: "store-herb" };
export type SleepActivity = ActivityBase & { kind: "sleep" };
export type Activity =
  | ChopActivity
  | BuildActivity
  | DeconstructActivity
  | SowActivity
  | HarvestActivity
  | PickupActivity
  | DeliverActivity
  | PickupHerbActivity
  | StoreHerbActivity
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
  cargo: { job: JobId; site: string; amount: number } | null;
};
// A claim promises stock; it is never included in physical material totals.
// After pickup, actor cargo alone owns both wood and its delivery obligation.
export type WoodClaim = {
  job: JobId;
  pile: string;
  site: string;
  amount: number;
};
export type HerbStorageClaim = {
  job: JobId;
  bundle: HerbBundleId;
  shelf: string;
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
export type HerbBundleLocation =
  | ({ kind: "ground" } & Cell)
  | { kind: "carried"; actor: ActorId }
  | { kind: "stored"; site: string };
export type HerbBundle = {
  id: HerbBundleId;
  kind: "mugwort";
  amount: 1;
  location: HerbBundleLocation;
};
export type Site = Cell & {
  id: string;
  type: BuildingKind;
  direction: number;
  delivered: number;
  work: number;
  finishedAt: number | null;
};
export type Pile = Cell & { id: string; amount: number };
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
  herbBundles: HerbBundle[];
  rocks: Cell[];
  watcher: Cell;
  piles: Pile[];
  sites: Site[];
  // This ordered array remains the sole job store. Priority is its order; an
  // additional mutable status/index store would add no needed behavior here.
  jobs: Job[];
  claims: Record<ActorId, WoodClaim>;
  herbStorageClaims: Record<ActorId, HerbStorageClaim>;
  workDirty: boolean;
  felled: number;
  finishedJobs: number;
  rested: number;
  consumedWood: number;
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
