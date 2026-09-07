// Player orders persist; the next activity is derived from actual materials and
// reachability. libcolony chooses a pawn/activity pair within the first ready order.
import { blockedCells, sameCell } from "./world.js";
import {
  approach,
  route,
  beginWalk,
  walk,
  face,
  WALK_TICKS,
} from "./movement.js";
import { BUILDINGS, roofSupported, shelteredBeds } from "./construction.js";
import { dropWood, dropCarried } from "./resources.js";
export const CHOP_TICKS = 80;
const WOOD_PER_TREE = 6;

function activity(job, kind, target, path, duration, extra = {}) {
  return {
    id: `${job.id}:${kind}:${target.id}`,
    job: job.id,
    kind,
    target: target.id,
    path,
    duration,
    ...extra,
  };
}
function buildActivities(state, job, blocked) {
  const site = state.sites.find((s) => s.id === job.target);
  if (site.type === "roof" && !roofSupported(state, site))
    return {
      reason: "Waiting for enclosing walls and a doorway",
      candidates: [],
    };
  const path = approach(state.pawn, site, blocked);
  if (path === null) return { reason: "No route to this site", candidates: [] };
  const recipe = BUILDINGS[site.type];
  if (site.delivered === recipe.wood)
    return {
      reason: "Ready to build",
      candidates: [
        activity(job, "build", site, path, recipe.ticks - site.work),
      ],
    };
  const candidates = [];
  for (const pile of state.piles) {
    if (!pile.amount) continue;
    const pickup = route(state.pawn, pile, blocked),
      delivery = approach(pile, site, blocked);
    if (pickup === null || delivery === null) continue;
    candidates.push(
      activity(job, "pickup", pile, pickup, 8, {
        site: site.id,
        deliveryDistance: delivery.length,
      }),
    );
  }
  return {
    reason: candidates.length
      ? "Ready to haul wood"
      : "Waiting for reachable wood",
    candidates,
  };
}
function jobOptions(state, job, blocked = blockedCells(state)) {
  if (job.kind === "build") return buildActivities(state, job, blocked);
  if (job.kind === "chop") {
    const tree = state.trees.find((t) => t.id === job.target);
    const path = approach(state.pawn, tree, blocked);
    return {
      reason: path === null ? "No route to this tree" : "Ready to chop",
      candidates:
        path === null
          ? []
          : [activity(job, "chop", tree, path, CHOP_TICKS - tree.work)],
    };
  }
  const candidates = shelteredBeds(state).flatMap((bed) => {
    const path = route(state.pawn, bed, blocked);
    return path === null ? [] : [activity(job, "sleep", bed, path, 80)];
  });
  return {
    reason: candidates.length
      ? "Ready to rest"
      : "Needs a reachable bedroll under an enclosed roof",
    candidates,
  };
}
export function finishActivity(state) {
  Object.assign(state.pawn, {
    mode: "idle",
    task: null,
    path: [],
    leg: 0,
    work: 0,
  });
  state.assignment = null;
}
function finishJob(state, id) {
  state.jobs = state.jobs.filter((j) => j.id !== id);
  state.finishedJobs++;
  finishActivity(state);
}
function carryingOptions(state, blocked) {
  const pawn = state.pawn,
    site = state.sites.find((s) => s.id === pawn.carryTo);
  const job = state.jobs.find((j) => j.target === pawn.carryTo);
  const path = site && job ? approach(pawn, site, blocked) : null;
  if (path === null) {
    dropCarried(state);
    state.notice =
      "The way closed. Wood set down safely; the order is still waiting.";
    return [];
  }
  return [activity(job, "deliver", site, path, 8)];
}
export function assignWork(state, colony) {
  if (state.pawn.mode !== "idle") return;
  const blocked = blockedCells(state);
  let candidates = state.pawn.carry ? carryingOptions(state, blocked) : [];
  if (!candidates.length)
    for (const job of state.jobs) {
      const options = jobOptions(state, job, blocked);
      job.reason = options.reason;
      if (!candidates.length && options.candidates.length)
        candidates = options.candidates;
    }
  if (!candidates.length) return;
  const offered = candidates.map((c) => ({
    character: "rowan",
    task: c.id,
    cost: colony.compute_cost({
      travel_time: (c.path.length + (c.deliveryDistance ?? 0)) * WALK_TICKS,
      work_time: c.duration,
      priority: 1,
    }),
  }));
  const chosen = colony.optimize(offered).find((a) => a.character === "rowan");
  const task = chosen && candidates.find((c) => c.id === chosen.task);
  if (!task) return;
  state.assignment = { ...chosen };
  state.pawn.task = { ...task, path: undefined };
  beginWalk(state.pawn, task.path);
}
function transferWood(state, task) {
  const pawn = state.pawn;
  if (task.kind === "pickup") {
    const pile = state.piles.find((p) => p.id === task.target);
    const site = state.sites.find((s) => s.id === task.site);
    const amount = Math.min(
      2,
      pile.amount,
      BUILDINGS[site.type].wood - site.delivered,
    );
    pile.amount -= amount;
    pawn.carry = amount;
    pawn.carryTo = site.id;
    state.notice = `${amount} wood in hand. Taking it to the ${BUILDINGS[site.type].label.toLowerCase()}.`;
  } else {
    const site = state.sites.find((s) => s.id === task.target);
    site.delivered += pawn.carry;
    pawn.carry = 0;
    pawn.carryTo = null;
    state.notice = "Wood delivered. Now the building can take shape.";
  }
  finishActivity(state);
}
function workOnTree(state, task) {
  const tree = state.trees.find((t) => t.id === task.target);
  state.pawn.work = ++tree.work;
  if (tree.work < CHOP_TICKS) return;
  tree.felledAt = state.tick;
  dropWood(state, tree, WOOD_PER_TREE);
  state.felled++;
  state.notice = "Oak felled. Six wood on the ground, ready to carry.";
  finishJob(state, task.job);
}
function workOnBuilding(state, task) {
  const site = state.sites.find((s) => s.id === task.target);
  state.pawn.work = ++site.work;
  if (site.work < BUILDINGS[site.type].ticks) return;
  site.finishedAt = state.tick;
  state.notice = `${BUILDINGS[site.type].label} finished. A little less wilderness.`;
  finishJob(state, task.job);
}
function rest(state, task) {
  state.pawn.work++;
  state.pawn.rest = Math.min(100, state.pawn.rest + 0.3);
  if (state.pawn.rest < 95) return;
  const job = state.jobs.find((j) => j.id === task.job);
  if (job.routine && isNight(state)) return;
  state.rested++;
  state.notice = "Rested. Rowan is ready to pick up the next order.";
  finishJob(state, task.job);
}
function targetFor(state, task) {
  if (task.kind === "chop")
    return state.trees.find((t) => t.id === task.target);
  if (task.kind === "pickup")
    return state.piles.find((p) => p.id === task.target);
  return state.sites.find((s) => s.id === task.target);
}
export function advanceWork(state) {
  const pawn = state.pawn,
    task = pawn.task;
  if (!task) return;
  if (pawn.mode === "walk") {
    const result = walk(pawn, blockedCells(state));
    if (result === "blocked") {
      dropCarried(state);
      finishActivity(state);
      return;
    }
    if (result !== "arrived") return;
    pawn.mode = task.kind;
    face(pawn, targetFor(state, task));
    if (task.kind === "sleep") pawn.dir = targetFor(state, task).direction;
    return;
  }
  // Target adjacency is an outcome precondition, even after a route changes.
  const target = targetFor(state, task);
  const onTarget = task.kind === "pickup" || task.kind === "sleep";
  const reachable = onTarget
    ? sameCell(pawn, target)
    : Math.abs(pawn.x - target.x) + Math.abs(pawn.z - target.z) === 1;
  if (!reachable) {
    dropCarried(state);
    finishActivity(state);
    return;
  }
  if (task.kind === "chop") workOnTree(state, task);
  else if (task.kind === "build") workOnBuilding(state, task);
  else if (task.kind === "sleep") rest(state, task);
  else if (++pawn.work >= task.duration) transferWood(state, task);
}
// Eight minutes at 1× leaves time to lay out and build a first home.
export const DAY_TICKS = 9600;
export function hour(state) {
  return (8 + state.tick / (DAY_TICKS / 24)) % 24;
}
export function isNight(state) {
  const h = hour(state);
  return h >= 20 || h < 6;
}
export function updateRoutine(state) {
  if (!isNight(state)) {
    const nightOrders = state.jobs.filter((job) => job.routine);
    for (const job of nightOrders) {
      if (state.pawn.task?.job === job.id) {
        if (state.pawn.mode === "sleep" && state.pawn.work > 0) state.rested++;
        finishActivity(state);
        state.notice = "Morning. Time to pick up the next order.";
      }
    }
    state.jobs = state.jobs.filter((job) => !job.routine);
    return;
  }
  if (
    !state.routine ||
    state.jobs.some((j) => j.kind === "rest") ||
    state.pawn.mode !== "idle" ||
    state.pawn.carry ||
    !shelteredBeds(state).length
  )
    return;
  state.jobs.unshift({
    id: `job-${state.nextId++}`,
    kind: "rest",
    target: "rowan",
    routine: true,
  });
}
