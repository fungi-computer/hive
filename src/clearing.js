// Commands authorize work. Fixed steps own its outcomes; the view reads state.
import { createFeed, nextEvent } from "./feed.js";
import {
  TREE_CELLS,
  ROCKS,
  WATCHER,
  blockedCells,
  neighbors,
} from "./world.js";
import { placementProblem, shelteredBeds } from "./construction.js";
import { dropWood, dropCarried } from "./resources.js";
import {
  assignWork,
  advanceWork,
  finishActivity,
  updateRoutine,
} from "./jobs.js";
import { route, beginWalk, walk } from "./movement.js";

function pawn(x, z) {
  return {
    x,
    z,
    level: 0,
    dir: 0,
    mode: "idle",
    path: [],
    leg: 0,
    work: 0,
    task: null,
  };
}
export function createClearing(seed = 42) {
  return {
    seed,
    tick: 0,
    paused: false,
    nextId: 1,
    pawn: { ...pawn(7, 10), carry: 0, carryTo: null, rest: 80 },
    cat: { ...pawn(8, 10), nextMove: 100 },
    trees: TREE_CELLS.map(([x, z], i) => ({
      id: `oak-${i + 1}`,
      x,
      z,
      level: 0,
      work: 0,
      felledAt: null,
    })),
    rocks: structuredClone(ROCKS),
    watcher: { ...WATCHER },
    piles: [],
    sites: [],
    jobs: [],
    felled: 0,
    finishedJobs: 0,
    rested: 0,
    routine: false,
    assignment: null,
    commands: [],
    feed: createFeed(seed),
    demand: null,
    notice: "A borrowed axe. No home. Bramble seems optimistic.",
  };
}
export function commandProblem(state, command) {
  if (state.paused) return "Resume to give work.";
  if (command.kind === "build") return placementProblem(state, command);
  if (command.kind === "chop") {
    const tree = state.trees.find((t) => t.id === command.tree);
    if (!tree) return "Select an oak tree first.";
    if (tree.felledAt !== null) return "That tree is already a stump.";
    if (state.jobs.some((j) => j.kind === "chop" && j.target === tree.id))
      return "That tree is already ordered.";
    return "";
  }
  if (command.kind === "rest" && state.jobs.some((j) => j.kind === "rest"))
    return "Rest is already ordered.";
  if (["rest", "cancel", "next", "routine"].includes(command.kind)) return "";
  return "Choose a tree or a building.";
}
function cancelJob(state, id) {
  const job = state.jobs.find((j) => j.id === id);
  if (!job) return;
  if (job.routine) state.routine = false;
  if (state.pawn.task?.job === id) {
    dropCarried(state);
    finishActivity(state);
  }
  if (job.kind === "build") {
    const site = state.sites.find((s) => s.id === job.target);
    dropWood(state, site, site.delivered);
    state.sites = state.sites.filter((s) => s.id !== site.id);
  }
  state.jobs = state.jobs.filter((j) => j.id !== id);
  state.notice =
    "Order canceled. All wood kept; completed work stays completed.";
}
function acceptCommand(state, command) {
  const problem = commandProblem(state, command);
  if (problem) {
    state.notice = problem;
    return;
  }
  if (command.kind === "cancel") {
    cancelJob(state, command.job);
    return;
  }
  if (command.kind === "routine") {
    state.routine = command.enabled;
    if (!command.enabled)
      for (const job of state.jobs.filter((j) => j.routine))
        cancelJob(state, job.id);
    return;
  }
  if (command.kind === "next") {
    const job = state.jobs.find((j) => j.id === command.job);
    if (job) state.jobs = [job, ...state.jobs.filter((j) => j.id !== job.id)];
    state.notice =
      "Moved to the front. Rowan will finish the current activity first.";
    return;
  }
  let target = command.tree ?? "rowan";
  if (command.kind === "build") {
    target = `site-${state.nextId++}`;
    state.sites.push({
      id: target,
      type: command.type,
      x: command.x,
      z: command.z,
      level: 0,
      direction: command.direction === 1 ? 1 : 0,
      delivered: 0,
      work: 0,
      finishedAt: null,
    });
  }
  const job = {
    id: `job-${state.nextId++}`,
    kind: command.kind,
    target,
    reason: "Ordered",
  };
  if (command.kind === "rest") state.jobs.unshift(job);
  else state.jobs.push(job);
  state.notice =
    command.kind === "build"
      ? "Blueprint placed. Rowan will bring wood when it is available."
      : "Work added to Rowan's orders.";
}
function advanceCat(state) {
  const cat = state.cat,
    blocked = blockedCells(state);
  if (cat.mode === "walk") {
    if (walk(cat, blocked) !== "moving") cat.mode = "idle";
    return;
  }
  if (state.tick < cat.nextMove) return;
  cat.nextMove = state.tick + 100;
  if (state.pawn.mode === "sleep") {
    if (Math.abs(cat.x - state.pawn.x) + Math.abs(cat.z - state.pawn.z) <= 1) {
      cat.mode = "sleep";
      return;
    }
  } else cat.mode = "idle";
  const choices = neighbors(state.pawn);
  const offset = Math.floor(state.tick / 100) % choices.length;
  for (let i = 0; i < choices.length; i++) {
    const path = route(cat, choices[(i + offset) % choices.length], blocked);
    if (path !== null) {
      beginWalk(cat, path);
      return;
    }
  }
}
export function step(state, colony, commands = []) {
  if (state.paused) return;
  state.tick++;
  for (const command of commands) {
    state.commands.push({ ...command, tick: state.tick });
    acceptCommand(state, command);
  }
  if (state.pawn.mode !== "sleep")
    state.pawn.rest = Math.max(0, state.pawn.rest - 0.012);
  updateRoutine(state);
  advanceWork(state);
  assignWork(state, colony);
  advanceCat(state);
  const event = nextEvent(state.feed, state.tick, shelteredBeds(state).length);
  if (event) state.demand = event;
}
