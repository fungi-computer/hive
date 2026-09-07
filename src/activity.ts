import type {
  Activity,
  Actor,
  BuildActivity,
  ChopActivity,
  Clearing,
  DeconstructActivity,
  DeliverActivity,
  PickupActivity,
  SleepActivity,
  Site,
} from "./model.ts";
import { blockedCells, sameCell } from "./world.js";
import { walk, face } from "./movement.js";
import { BUILDINGS, shelteredBeds } from "./construction.js";
import { dropWood, dropCarried } from "./resources.ts";
import { isNight } from "./routine.ts";

export const CHOP_TICKS = 80;

export function finishActivity(state: Clearing, person: Actor): void {
  delete state.claims[person.id];
  Object.assign(person, {
    mode: "idle",
    task: null,
    assignment: null,
    path: [],
    leg: 0,
    work: 0,
  });
  state.workDirty = true;
}
export function interruptWork(state: Clearing, person: Actor): void {
  dropCarried(state, person);
  finishActivity(state, person);
}
function finishJob(state: Clearing, person: Actor, job: string): void {
  state.jobs = state.jobs.filter((j) => j.id !== job);
  state.finishedJobs++;
  finishActivity(state, person);
}
function transferWood(
  state: Clearing,
  person: Actor,
  task: PickupActivity | DeliverActivity,
): void {
  if (task.kind === "pickup") {
    const claim = state.claims[person.id];
    const pile = state.piles.find((p) => p.id === claim?.pile);
    const site = state.sites.find((s) => s.id === claim?.site);
    if (
      !claim ||
      !pile ||
      !site ||
      claim.job !== task.job ||
      pile.amount < claim.amount
    ) {
      interruptWork(state, person);
      return;
    }
    pile.amount -= claim.amount;
    person.cargo = { job: claim.job, site: claim.site, amount: claim.amount };
    state.notice = `${person.name} has ${claim.amount} wood in hand. Taking it to the ${BUILDINGS[site.type].label.toLowerCase()}.`;
  } else {
    const cargo = person.cargo;
    const site = state.sites.find((s) => s.id === cargo?.site);
    if (
      !cargo ||
      !site ||
      site.delivered + cargo.amount > BUILDINGS[site.type].wood
    ) {
      interruptWork(state, person);
      return;
    }
    site.delivered += cargo.amount;
    person.cargo = null;
    state.notice = `${person.name} delivered the wood. Now the building can take shape.`;
  }
  finishActivity(state, person);
}
function workOnTree(state: Clearing, person: Actor, task: ChopActivity): void {
  const tree = state.trees.find((t) => t.id === task.target)!;
  person.work = ++tree.work;
  if (tree.work < CHOP_TICKS) return;
  tree.felledAt = state.tick;
  dropWood(state, tree, 6);
  state.felled++;
  state.notice = `${person.name} felled an oak. Six wood on the ground, ready to carry.`;
  finishJob(state, person, task.job);
}
function workOnBuilding(
  state: Clearing,
  person: Actor,
  task: BuildActivity,
): void {
  const site = state.sites.find((s) => s.id === task.target)!;
  person.work = ++site.work;
  if (site.work < BUILDINGS[site.type].ticks) return;
  site.finishedAt = state.tick;
  state.notice = `${BUILDINGS[site.type].label} finished. A little less wilderness.`;
  finishJob(state, person, task.job);
}
function workOnDeconstruction(
  state: Clearing,
  person: Actor,
  task: DeconstructActivity,
): void {
  const site = state.sites.find((candidate) => candidate.id === task.target);
  if (!site || site.finishedAt === null) {
    interruptWork(state, person);
    return;
  }
  person.work++;
  if (person.work < BUILDINGS[site.type].deconstructTicks) return;

  const prospectiveSites = state.sites.filter(
    (candidate) => candidate.id !== site.id,
  );
  const prospectiveState = { ...state, sites: prospectiveSites };
  const beds = new Set(
    shelteredBeds(prospectiveState).map((bed: Site) => bed.id),
  );
  for (const sleeper of Object.values(state.actors)) {
    if (sleeper.task?.kind !== "sleep") continue;
    if (sleeper.task.target === site.id || !beds.has(sleeper.task.target))
      interruptWork(state, sleeper);
  }

  const recipe = BUILDINGS[site.type];
  state.sites = prospectiveSites;
  finishJob(state, person, task.job);
  dropWood(state, site, recipe.salvageWood);
  state.consumedWood += recipe.wood - recipe.salvageWood;
  state.notice = `${recipe.label} deconstructed. ${recipe.salvageWood} wood recovered.`;
}
function rest(state: Clearing, person: Actor, task: SleepActivity): void {
  person.work++;
  person.rest = Math.min(100, person.rest + 0.3);
  if (person.rest < 95) return;
  if (state.jobs.find((j) => j.id === task.job)?.routine && isNight(state))
    return;
  state.rested++;
  state.notice = `${person.name} is rested and ready for the next order.`;
  finishJob(state, person, task.job);
}
function targetFor(state: Clearing, task: Activity) {
  switch (task.kind) {
    case "chop":
      return state.trees.find((tree) => tree.id === task.target);
    case "pickup":
      return state.piles.find((pile) => pile.id === task.target);
    case "build":
    case "deliver":
    case "sleep":
    case "deconstruct":
      return state.sites.find((site) => site.id === task.target);
    default:
      return assertNever(task);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled activity kind: ${JSON.stringify(value)}`);
}
export function advanceWork(state: Clearing, person: Actor): void {
  const task = person.task;
  if (!task) return;
  const target = targetFor(state, task);
  if (!target || !state.jobs.some((job) => job.id === task.job)) {
    interruptWork(state, person);
    return;
  }
  if (person.mode === "walk") {
    const result = walk(person, blockedCells(state));
    if (result === "blocked") interruptWork(state, person);
    if (result !== "arrived") return;
    person.mode = task.kind;
    face(person, target);
    if (task.kind === "sleep" && "direction" in target)
      person.dir = target.direction;
    return;
  }
  const onTarget = task.kind === "pickup" || task.kind === "sleep";
  const reachable = onTarget
    ? sameCell(person, target)
    : person.level === target.level &&
      Math.abs(person.x - target.x) + Math.abs(person.z - target.z) === 1;
  if (!reachable) {
    interruptWork(state, person);
    return;
  }
  switch (task.kind) {
    case "chop":
      workOnTree(state, person, task);
      break;
    case "build":
      workOnBuilding(state, person, task);
      break;
    case "deconstruct":
      workOnDeconstruction(state, person, task);
      break;
    case "sleep":
      rest(state, person, task);
      break;
    case "pickup":
    case "deliver":
      if (++person.work >= task.duration) transferWood(state, person, task);
      break;
    default:
      assertNever(task);
  }
}
