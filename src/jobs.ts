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
  Job,
  Site,
  WorkType,
} from "./model.ts";
import { inScope } from "./actors.ts";
import { optimizeEligible } from "./matching.ts";
import { blockedCells } from "./world.js";
import { approach, route, beginWalk, WALK_TICKS } from "./movement.js";
import { BUILDINGS, roofSupported, shelteredBeds } from "./construction.js";
import { availableWood, neededWood, reserveWood } from "./resources.ts";
import { CHOP_TICKS, interruptWork } from "./activity.ts";

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
): Candidate {
  return {
    activity: { job: job.id, kind, target, duration },
    path,
    travel: path.length,
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
  const path = approach(person, site, blocked);
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
      ),
    };
  if (neededWood(state, site) <= 0) return unavailable("Wood is on its way");
  let best: Candidate | null = null;
  for (const pile of state.piles) {
    if (availableWood(state, pile) <= 0) continue;
    const pickup = route(person, pile, blocked),
      delivery = approach(pile, site, blocked);
    if (pickup === null || delivery === null) continue;
    const next = {
      ...candidate(job, "pickup", pile.id, pickup, 8),
      site: site.id,
      travel: pickup.length + delivery.length,
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
  const path = approach(person, site, blocked);
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
        ),
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
    case "chop": {
      const tree = state.trees.find((t) => t.id === job.target)!;
      const path = approach(person, tree, blocked);
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
            ),
          };
    }
    case "rest": {
      let best: Candidate | null = null;
      for (const bed of shelteredBeds(state) as Site[]) {
        if (!bedFree(state, bed)) continue;
        const path = route(person, bed, blocked);
        if (path !== null && (!best || path.length < best.path.length))
          best = candidate(job, "sleep", bed.id, path, 80);
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
    case "build":
      return "build";
    case "deconstruct":
      return "build";
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
  const path = site && job ? approach(person, site, blocked) : null;
  if (path !== null) return candidate(job!, "deliver", site!.id, path, 8);
  interruptWork(state, person);
  state.notice = `${person.name} set the wood down safely. The way to its site closed.`;
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
    case "sleep": {
      const bed = state.sites.find((s) => s.id === task.target);
      return !!bed && bedFree(state, bed);
    }
    case "chop":
    case "build":
    case "deconstruct":
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
        travel_time: next.travel * WALK_TICKS,
        work_time: next.activity.duration,
        priority: 1,
      }),
    });
  }
  for (const person of idle) {
    if (!person.cargo) continue;
    const next = deliveryOption(state, person, blocked);
    if (next) offer(person, next);
  }
  const busyJobs = new Set(
    people.flatMap((person) =>
      person.task ? [person.task.job] : person.cargo ? [person.cargo.job] : [],
    ),
  );
  // Personal orders are a person's explicit queue, ahead of shared designations.
  // Offer only its first ready activity, so cost can never undo a direct order.
  const personal = new Set<string>();
  for (const person of idle) {
    if (person.cargo) continue;
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
