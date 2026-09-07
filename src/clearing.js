// Clearing-specific state and outcomes. libcolony assigns explicit player work;
// fixed steps own travel, trees, wood and shelter. Rendering never changes state.
import { createFeed, nextEvent } from "./feed.js";
import {
  cellKey,
  approach,
  beginWalk,
  walk,
  face,
  WALK_TICKS,
} from "./movement.js";
import {
  footprint,
  buildRoute,
  placementProblem,
  SHELTER_COST,
  BUILD_TICKS,
} from "./construction.js";
export const CHOP_TICKS = 80;
const WOOD_PER_TREE = 6;
export const WATCHER = { x: 6, z: 0 };
const ROCKS = ["0,0", "0,6", "6,6", "6,2"];
export function createClearing(seed = 42) {
  return {
    tick: 0,
    paused: false,
    pawn: {
      x: 3,
      z: 4,
      dir: 0,
      mode: "idle",
      path: [],
      leg: 0,
      work: 0,
      task: null,
    },
    trees: [
      { id: "oak-1", x: 1, z: 1 },
      { id: "oak-2", x: 5, z: 1 },
      { id: "oak-3", x: 1, z: 4 },
    ].map((t) => ({ ...t, felledAt: null })),
    wood: 0,
    felled: 0,
    shelters: [],
    completed: 0,
    assignment: null,
    commands: [],
    feed: createFeed(seed),
    demand: null,
    notice: "Stranded. No roof. And the locals are getting hungry.",
  };
}
export function blockedCells(state) {
  return new Set([
    ...ROCKS,
    cellKey(WATCHER),
    ...state.trees.map(cellKey),
    ...state.shelters.flatMap(footprint).map(cellKey),
  ]);
}
export function commandProblem(state, command) {
  if (state.paused) return "Resume before giving work.";
  if (state.pawn.mode !== "idle") return "Rowan is finishing the current task.";
  if (command.kind === "build")
    return placementProblem(state, command, blockedCells(state));
  if (command.kind !== "chop") return "Choose a tree to chop.";
  const tree = state.trees.find((t) => t.id === command.tree);
  if (!tree) return "Select an oak tree first.";
  if (tree.felledAt !== null) return "That tree is already a stump.";
  return "";
}
function assignCommand(state, colony, command) {
  const problem = commandProblem(state, command);
  if (problem) {
    state.notice = problem;
    return;
  }
  const building = command.kind === "build";
  const target = building
    ? command
    : state.trees.find((t) => t.id === command.tree);
  const blocked = blockedCells(state);
  const path = building
    ? buildRoute(state.pawn, target, blocked)
    : approach(state.pawn, target, blocked);
  if (!path) {
    state.notice = "Rowan cannot reach that work.";
    return;
  }
  const id = building ? `shelter-${state.shelters.length + 1}` : target.id;
  const task = `${command.kind}-${id}`;
  const cost = colony.compute_cost({
    travel_time: path.length * WALK_TICKS,
    work_time: building ? BUILD_TICKS : CHOP_TICKS,
    priority: 1,
  });
  // Explicit orders alone determine eligibility. No local substitute optimizer.
  const chosen = colony
    .optimize([{ character: "rowan", task, cost }])
    .find((a) => a.character === "rowan" && a.task === task);
  if (!chosen) return;
  // Spend only after a valid reachable site AND a real libcolony assignment.
  if (building) {
    state.wood -= SHELTER_COST;
    state.shelters.push({
      id,
      x: target.x,
      z: target.z,
      work: 0,
      finishedAt: null,
    });
  }
  state.assignment = { ...chosen };
  state.pawn.task = building ? { kind: "build", site: id } : { ...command };
  beginWalk(state.pawn, path);
  state.notice = building
    ? "Six wood committed. Rowan is heading to the marked site."
    : "Rowan is finding a way to the marked tree.";
}
function finishTask(state) {
  state.pawn.mode = "idle";
  state.pawn.task = null;
  state.assignment = null;
}
function chopTree(state) {
  const p = state.pawn;
  if (++p.work < CHOP_TICKS) return;
  const tree = state.trees.find((t) => t.id === p.task.tree);
  tree.felledAt = state.tick;
  state.wood += WOOD_PER_TREE;
  state.felled++;
  finishTask(state);
  state.notice = `Tree felled · +${WOOD_PER_TREE} wood. Enough for a small shelter.`;
}
function buildShelter(state) {
  const site = state.shelters.find((s) => s.id === state.pawn.task.site);
  site.work++;
  state.pawn.work = site.work;
  if (site.work < BUILD_TICKS) return;
  site.finishedAt = state.tick;
  state.completed++;
  finishTask(state);
  state.notice = "Shelter finished. A roof, a dry corner, another day alive.";
}
function advancePawn(state) {
  const p = state.pawn;
  if (p.mode === "chop") {
    chopTree(state);
    return;
  }
  if (p.mode === "build") {
    buildShelter(state);
    return;
  }
  if (p.mode !== "walk" || !walk(p)) return;
  const target =
    p.task.kind === "chop"
      ? state.trees.find((t) => t.id === p.task.tree)
      : state.shelters.find((s) => s.id === p.task.site);
  // Face the closest occupied tile, so the work pose meets the structure.
  const workTarget =
    p.task.kind === "chop"
      ? target
      : {
          x: Math.max(target.x, Math.min(target.x + 1, p.x)),
          z: Math.max(target.z, Math.min(target.z + 1, p.z)),
        };
  face(p, workTarget);
  p.mode = p.task.kind;
  state.notice =
    p.mode === "chop"
      ? "One swing at a time. Wood means a chance."
      : "Posts, braces, then a roof. Keep your hands steady.";
}
function applyStoryEvent(state, event) {
  if (event) state.demand = event;
}
export function step(state, colony, commands = []) {
  if (state.paused) return;
  state.tick++;
  for (const command of commands) {
    state.commands.push({ ...command, tick: state.tick });
    assignCommand(state, colony, command);
  }
  advancePawn(state);
  applyStoryEvent(state, nextEvent(state.feed, state.tick, state.completed));
}
