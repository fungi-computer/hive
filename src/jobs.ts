// Player scope/priority limits eligible edges. The selected libcolony optimizer
// matches the joint batch; this module then claims resources before anyone moves.
import type {
  Activity,
  Actor,
  Assignment,
  Cell,
  Clearing,
  Colony,
  BuildJob,
  DeconstructJob,
  HarvestJob,
  StoreHerbJob,
  Job,
  Site,
  SowJob,
  WorkType,
} from "./model.ts";
import { inScope } from "./actors.ts";
import { optimizeEligible } from "./matching.ts";
import { blockedCells } from "./world.js";
import { approach, pathTicks, route, beginWalk } from "./movement.js";
import {
  BUILDINGS,
  removalProblem,
  roofSupported,
  shelteredBeds,
  workApproach,
} from "./construction.js";
import { availableWood, neededWood, reserveWood } from "./resources.ts";
import { CHOP_TICKS, interruptWork } from "./activity.ts";
import { HARVEST_TICKS, SOW_TICKS } from "./herbs.ts";

type Candidate = {
  activity: Activity;
  path: Cell[];
  travel: number;
  site?: string;
};
type Options = { reason: string; candidate: Candidate | null };
const unavailable = (reason: string): Options => ({ reason, candidate: null });
function candidate(
  job: Job,
  kind: Activity["kind"],
  target: string,
  path: Cell[],
  duration: number,
  travel: number,
): Candidate {
  return {
    activity: { job: job.id, kind, target, duration },
    path,
    travel,
  };
}
function buildOption(
  state: Clearing,
  person: Actor,
  job: BuildJob,
  blocked: Set<string>,
): Options {
  const site = state.sites.find((s) => s.id === job.target)!;
  if (site.type === "roof" && !roofSupported(state, site))
    return unavailable("Waiting for enclosing walls and a doorway");
  const path = workApproach(state, person, site, blocked);
  if (path === null) return unavailable("No route to this site");
  const recipe = BUILDINGS[site.type];
  if (site.delivered === recipe.wood)
    return {
      reason: "Ready to build",
      candidate: candidate(
        job,
        "build",
        site.id,
        path,
        recipe.ticks - site.work,
        pathTicks(person, path),
      ),
    };
  if (neededWood(state, site) <= 0) return unavailable("Wood is on its way");
  let best: Candidate | null = null;
  for (const pile of state.piles) {
    if (availableWood(state, pile) <= 0) continue;
    const pickup = route(person, pile, blocked, state),
      delivery = workApproach(state, pile, site, blocked);
    if (pickup === null || delivery === null) continue;
    const next = {
      ...candidate(
        job,
        "pickup",
        pile.id,
        pickup,
        8,
        pathTicks(person, pickup),
      ),
      site: site.id,
      travel: pathTicks(person, pickup) + pathTicks(pile, delivery),
    };
    if (!best || next.travel < best.travel) best = next;
  }
  return {
    reason: best ? "Ready to haul wood" : "Waiting for reachable wood",
    candidate: best,
  };
}
function deconstructOption(
  state: Clearing,
  person: Actor,
  job: DeconstructJob,
  blocked: Set<string>,
): Options {
  const site = state.sites.find((candidate) => candidate.id === job.target);
  if (!site || site.finishedAt === null)
    return unavailable("Waiting for a finished structure");
  const problem = removalProblem(state, site, person);
  if (problem) return unavailable(problem);
  const path = workApproach(state, person, site, blocked, "deconstruct");
  return path === null
    ? unavailable("No route to this structure")
    : {
        reason: "Ready to deconstruct",
        candidate: candidate(
          job,
          "deconstruct",
          site.id,
          path,
          BUILDINGS[site.type].deconstructTicks,
          pathTicks(person, path),
        ),
      };
}
function sowOption(
  state: Clearing,
  person: Actor,
  job: SowJob,
  blocked: Set<string>,
): Options {
  const herb = state.herbs.find((candidate) => candidate.id === job.target);
  if (!herb || herb.stage !== "ordered")
    return unavailable("Waiting for a mugwort planting target");
  const path = approach(person, herb, blocked, state);
  return path === null
    ? unavailable("No route to this mugwort")
    : {
        reason: "Ready to sow mugwort",
        candidate: candidate(
          job,
          "sow",
          herb.id,
          path,
          SOW_TICKS - herb.work,
          pathTicks(person, path),
        ),
      };
}
function harvestOption(
  state: Clearing,
  person: Actor,
  job: HarvestJob,
  blocked: Set<string>,
): Options {
  const herb = state.herbs.find((candidate) => candidate.id === job.target);
  if (!herb || herb.stage !== "ready")
    return unavailable("Waiting for ready mugwort");
  const path = approach(person, herb, blocked, state);
  return path === null
    ? unavailable("No route to this mugwort")
    : {
        reason: "Ready to harvest mugwort",
        candidate: candidate(
          job,
          "harvest",
          herb.id,
          path,
          HARVEST_TICKS - herb.work,
          pathTicks(person, path),
        ),
      };
}
function storedBundleAt(state: Clearing, shelf: string): boolean {
  return state.herbBundles.some(
    (bundle) =>
      bundle.location.kind === "stored" && bundle.location.site === shelf,
  );
}
function shelfClaimed(state: Clearing, shelf: string): boolean {
  return Object.values(state.herbStorageClaims).some(
    (claim) => claim.shelf === shelf,
  );
}
function storeHerbOption(
  state: Clearing,
  person: Actor,
  job: StoreHerbJob,
  blocked: Set<string>,
): Options {
  const bundle = state.herbBundles.find(
    (candidate) => candidate.id === job.bundle,
  );
  const shelf = state.sites.find((site) => site.id === job.shelf);
  if (!bundle || bundle.location.kind !== "ground")
    return unavailable("Waiting for a ground mugwort bundle");
  if (!shelf || shelf.finishedAt === null || shelf.type !== "shelf")
    return unavailable("Waiting for a finished mugwort shelf");
  if (storedBundleAt(state, shelf.id) || shelfClaimed(state, shelf.id))
    return unavailable("Waiting for shelf space");
  const pickup = route(person, bundle.location, blocked, state);
  if (pickup === null) return unavailable("No route to this mugwort bundle");
  const delivery = workApproach(state, bundle.location, shelf, blocked);
  if (delivery === null) return unavailable("No route to this shelf");
  return {
    reason: "Ready to store mugwort",
    candidate: {
      activity: {
        job: job.id,
        kind: "pickup-herb",
        target: bundle.id,
        duration: 8,
      },
      path: pickup,
      travel: pathTicks(person, pickup) + pathTicks(bundle.location, delivery),
      site: shelf.id,
    },
  };
}
function bedFree(state: Clearing, bed: Site): boolean {
  return !Object.values(state.actors).some(
    (person) => person.task?.kind === "sleep" && person.task.target === bed.id,
  );
}
function jobOption(
  state: Clearing,
  person: Actor,
  job: Job,
  blocked: Set<string>,
): Options {
  switch (job.kind) {
    case "build":
      return buildOption(state, person, job, blocked);
    case "deconstruct":
      return deconstructOption(state, person, job, blocked);
    case "sow":
      return sowOption(state, person, job, blocked);
    case "harvest":
      return harvestOption(state, person, job, blocked);
    case "store-herb":
      return storeHerbOption(state, person, job, blocked);
    case "chop": {
      const tree = state.trees.find((t) => t.id === job.target)!;
      const path = approach(person, tree, blocked, state);
      return path === null
        ? unavailable("No route to this tree")
        : {
            reason: "Ready to chop",
            candidate: candidate(
              job,
              "chop",
              tree.id,
              path,
              CHOP_TICKS - tree.work,
              pathTicks(person, path),
            ),
          };
    }
    case "rest": {
      let best: Candidate | null = null;
      for (const bed of shelteredBeds(state) as Site[]) {
        if (!bedFree(state, bed)) continue;
        const path = route(person, bed, blocked, state);
        if (path !== null && (!best || pathTicks(person, path) < best.travel))
          best = candidate(
            job,
            "sleep",
            bed.id,
            path,
            80,
            pathTicks(person, path),
          );
      }
      return {
        reason: best
          ? "Ready to rest"
          : "Needs an available bedroll under an enclosed roof",
        candidate: best,
      };
    }
    default:
      return assertNever(job);
  }
}

function automaticWork(activity: Activity): WorkType | null {
  switch (activity.kind) {
    case "chop":
      return "chop";
    case "pickup":
      return "haul";
    case "pickup-herb":
    case "store-herb":
      return "haul";
    case "build":
      return "build";
    case "deconstruct":
      return "build";
    case "sow":
    case "harvest":
      return "garden";
    case "deliver":
    case "sleep":
      return null;
    default:
      return assertNever(activity);
  }
}

function allowsAutomaticWork(person: Actor, activity: Activity): boolean {
  const work = automaticWork(activity);
  return work === null || person.allowedWork[work];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled job kind: ${JSON.stringify(value)}`);
}
function deliveryOption(
  state: Clearing,
  person: Actor,
  blocked: Set<string>,
): Candidate | null {
  const cargo = person.cargo!;
  const site = state.sites.find((s) => s.id === cargo.site);
  const job = state.jobs.find((j) => j.id === cargo.job);
  const path = site && job ? workApproach(state, person, site, blocked) : null;
  if (path !== null)
    return candidate(
      job!,
      "deliver",
      site!.id,
      path,
      8,
      pathTicks(person, path),
    );
  interruptWork(state, person);
  state.notice = `${person.name} set the wood down safely. The way to its site closed.`;
  return null;
}
function herbDeliveryOption(
  state: Clearing,
  person: Actor,
  blocked: Set<string>,
): Candidate | null {
  const bundle = state.herbBundles.find(
    (candidate) =>
      candidate.location.kind === "carried" &&
      candidate.location.actor === person.id,
  );
  if (!bundle) return null;
  const claim = state.herbStorageClaims[person.id];
  const job = state.jobs.find(
    (candidate): candidate is StoreHerbJob =>
      candidate.kind === "store-herb" && candidate.id === claim?.job,
  );
  const shelf = state.sites.find((candidate) => candidate.id === claim?.shelf);
  const path = shelf ? workApproach(state, person, shelf, blocked) : null;
  if (path !== null && job && shelf)
    return candidate(
      job,
      "store-herb",
      shelf.id,
      path,
      8,
      pathTicks(person, path),
    );
  interruptWork(state, person);
  state.notice = `${person.name} set the mugwort bundle down safely. The way to its shelf closed.`;
  return null;
}
function claimCandidate(
  state: Clearing,
  person: Actor,
  next: Candidate,
): boolean {
  const task = next.activity;
  switch (task.kind) {
    case "pickup": {
      const job = state.jobs.find(
        (candidate): candidate is BuildJob =>
          candidate.id === task.job && candidate.kind === "build",
      );
      const pile = state.piles.find((p) => p.id === task.target);
      const site = state.sites.find((s) => s.id === next.site);
      return (
        !!job && !!pile && !!site && reserveWood(state, person, job, pile, site)
      );
    }
    case "pickup-herb": {
      const job = state.jobs.find(
        (candidate): candidate is StoreHerbJob =>
          candidate.id === task.job && candidate.kind === "store-herb",
      );
      const bundle = state.herbBundles.find(
        (candidate) => candidate.id === task.target,
      );
      const shelf = state.sites.find((site) => site.id === next.site);
      if (
        !job ||
        !bundle ||
        bundle.location.kind !== "ground" ||
        !shelf ||
        shelf.type !== "shelf" ||
        shelf.finishedAt === null ||
        storedBundleAt(state, shelf.id) ||
        shelfClaimed(state, shelf.id) ||
        state.herbStorageClaims[person.id] ||
        state.claims[person.id] ||
        person.cargo
      )
        return false;
      state.herbStorageClaims[person.id] = {
        job: job.id,
        bundle: bundle.id,
        shelf: shelf.id,
      };
      return true;
    }
    case "store-herb": {
      const claim = state.herbStorageClaims[person.id];
      return !!claim && claim.job === task.job && claim.shelf === task.target;
    }
    case "sleep": {
      const bed = state.sites.find((s) => s.id === task.target);
      return !!bed && bedFree(state, bed);
    }
    case "chop":
    case "build":
    case "deconstruct":
    case "sow":
    case "harvest":
    case "deliver":
      return true;
    default:
      return assertNever(task);
  }
}
export function assignWork(state: Clearing, colony: Colony): void {
  if (!state.workDirty) return;
  state.workDirty = false;
  const people = Object.values(state.actors);
  const memberIds = new Set(
    Object.values(state.parties).flatMap((party) => party.members),
  );
  const idle = people.filter(
    (person) =>
      person.mode === "idle" && !person.drafted && memberIds.has(person.id),
  );
  if (!idle.length) return;
  const blocked = blockedCells(state);
  const payloads = new Map<string, Candidate>();
  const offered: Assignment[] = [];
  function offer(person: Actor, next: Candidate) {
    const job = next.activity.job;
    payloads.set(`${person.id}/${job}`, next);
    offered.push({
      character: person.id,
      task: job,
      cost: colony.compute_cost({
        travel_time: next.travel,
        work_time: next.activity.duration,
        priority: 1,
      }),
    });
  }
  for (const person of idle) {
    if (person.cargo) {
      const next = deliveryOption(state, person, blocked);
      if (next) offer(person, next);
      continue;
    }
    const next = herbDeliveryOption(state, person, blocked);
    if (next) offer(person, next);
  }
  const busyJobs = new Set(
    people.flatMap((person) =>
      person.task ? [person.task.job] : person.cargo ? [person.cargo.job] : [],
    ),
  );
  for (const claim of Object.values(state.herbStorageClaims))
    busyJobs.add(claim.job);
  // Personal orders are a person's explicit queue, ahead of shared designations.
  // Offer only its first ready activity, so cost can never undo a direct order.
  const personal = new Set<string>();
  for (const person of idle) {
    if (person.cargo || state.herbStorageClaims[person.id]) continue;
    for (const job of state.jobs) {
      if (
        job.scope.actors === null ||
        busyJobs.has(job.id) ||
        !inScope(state, person, job.scope)
      )
        continue;
      const options = jobOption(state, person, job, blocked);
      job.reason = options.reason;
      if (!options.candidate) continue;
      offer(person, options.candidate);
      personal.add(person.id);
      break;
    }
  }
  // Automatic work draws from the earliest ready party jobs. A waiting personal
  // blueprint can still let its person chop shared wood needed to make progress.
  for (const party of Object.values(state.parties)) {
    const workers = idle.filter(
      (person) =>
        !person.cargo &&
        !state.herbStorageClaims[person.id] &&
        !personal.has(person.id) &&
        party.members.includes(person.id),
    );
    const shared = new Set<string>();
    for (const job of state.jobs) {
      if (
        job.scope.party !== party.id ||
        job.scope.actors !== null ||
        busyJobs.has(job.id)
      )
        continue;
      let ready = false;
      let disallowed: WorkType | null = null;
      let waitingReason = "";
      for (const person of workers) {
        const options = jobOption(state, person, job, blocked);
        if (!waitingReason) waitingReason = options.reason;
        if (
          options.candidate &&
          !allowsAutomaticWork(person, options.candidate.activity)
        ) {
          disallowed = automaticWork(options.candidate.activity);
          continue;
        }
        if (
          !options.candidate ||
          (shared.size >= workers.length && !shared.has(job.id))
        )
          continue;
        offer(person, options.candidate);
        shared.add(job.id);
        ready = true;
      }
      if (!ready)
        job.reason = disallowed
          ? `Waiting for a home member allowed to ${disallowed}`
          : waitingReason;
    }
  }
  if (!offered.length) return;
  const chosen = optimizeEligible(colony, offered).sort(
    (a, b) =>
      state.jobs.findIndex((j) => j.id === a.task) -
        state.jobs.findIndex((j) => j.id === b.task) ||
      a.character.localeCompare(b.character),
  );
  let committed = 0;
  for (const match of chosen) {
    const person = state.actors[match.character];
    const next = payloads.get(`${match.character}/${match.task}`);
    if (!next || !claimCandidate(state, person, next)) continue;
    person.assignment = { ...match };
    person.task = next.activity;
    beginWalk(person, next.path);
    committed++;
  }
  if (committed && idle.some((person) => person.mode === "idle"))
    state.workDirty = true;
}
