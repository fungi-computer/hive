// Commands authorize work. Fixed steps own outcomes; the view reads state.
import type { Clearing, Colony, Command } from "./model.ts";
import { createFeed, nextEvent } from "./feed.js";
import {
  TREE_CELLS,
  ROCKS,
  WATCHER,
  blockedCells,
  neighbors,
} from "./world.js";
import { introduceFiniteSources } from "./finite-sources.ts";
import { shelteredBeds } from "./construction.js";
import { actor, body, members } from "./actors.ts";
import { assignWork } from "./jobs.ts";
import { advanceWork } from "./activity.ts";
import { updateRoutine } from "./routine.ts";
import { admitCommands, type CommandResult } from "./orders.ts";
import { route, beginWalk, walk } from "./movement.js";
import { mugwortStage } from "./herbs.ts";

export function createClearing(seed = 42): Clearing {
  const state: Clearing = {
    seed,
    tick: 0,
    paused: false,
    nextId: 1,
    actors: {
      rowan: actor("rowan", "Rowan", "rowan", 7, 10),
      sedge: actor("sedge", "Sedge", "witch-runner", 10, 12),
    },
    parties: { home: { id: "home", members: ["rowan"] } },
    cat: { ...body(8, 10), nextMove: 100 },
    trees: TREE_CELLS.map(([x, z], i) => ({
      id: `oak-${i + 1}`,
      x,
      z,
      level: 0,
      work: 0,
      felledAt: null,
    })),
    herbs: [],
    materials: {
      lots: [],
      transfers: [],
      vesselUses: [],
      embedded: [],
      nextLotId: 1,
      consumedWood: 0,
    },
    sources: [],
    pendingSources: [],
    rocks: structuredClone(ROCKS),
    watcher: { ...WATCHER },
    sites: [],
    jobs: [],
    workDirty: true,
    felled: 0,
    finishedJobs: 0,
    rested: 0,
    harvestedHerbs: 0,
    commands: [],
    feed: createFeed(seed),
    demand: null,
    notice: "A borrowed axe. No home. Bramble seems optimistic.",
  };
  introduceFiniteSources(state);
  return state;
}
function advanceCat(state: Clearing): void {
  const cat = state.cat,
    rowan = state.actors.rowan,
    blocked = blockedCells(state);
  if (cat.mode === "walk") {
    if (walk(cat, blocked, state) !== "moving") cat.mode = "idle";
    return;
  }
  if (state.tick < cat.nextMove) return;
  cat.nextMove = state.tick + 100;
  if (
    rowan.mode === "sleep" &&
    Math.abs(cat.x - rowan.x) + Math.abs(cat.z - rowan.z) <= 1
  ) {
    cat.mode = "sleep";
    return;
  }
  cat.mode = "idle";
  const choices = neighbors(rowan),
    offset = Math.floor(state.tick / 100) % choices.length;
  for (let i = 0; i < choices.length; i++) {
    const path = route(cat, choices[(i + offset) % choices.length], blocked);
    if (path !== null) {
      beginWalk(cat, path);
      return;
    }
  }
}
function advanceDrafted(
  state: Clearing,
  person: Clearing["actors"][string],
): void {
  if (!person.drafted || person.mode !== "walk") return;
  const result = walk(person, blockedCells(state), state);
  if (result === "blocked") {
    person.mode = "idle";
    person.path = [];
    person.leg = 0;
    state.notice = `${person.name} is holding position; the route became blocked.`;
  } else if (result === "arrived") {
    person.mode = "idle";
    person.path = [];
    person.leg = 0;
    person.work = 0;
    state.notice = `${person.name} reached the clear ground and is holding position.`;
  }
}
function advanceHerbGrowth(state: Clearing): void {
  for (const herb of state.herbs) {
    if (herb.plantedAt === null || herb.stage === "ready") continue;
    const stage = mugwortStage(state.tick - herb.plantedAt);
    if (stage === herb.stage) continue;
    herb.stage = stage;
    herb.work = 0;
    state.workDirty = true;
  }
}
export function step(
  state: Clearing,
  colony: Colony,
  commands: Command[] = [],
): CommandResult[] {
  const results = admitCommands(state, commands);
  if (state.paused) return results;
  state.tick++;
  for (const person of members(state))
    if (person.mode !== "sleep") person.rest = Math.max(0, person.rest - 0.012);
  updateRoutine(state);
  for (const person of Object.values(state.actors)) {
    advanceWork(state, person);
    advanceDrafted(state, person);
  }
  advanceHerbGrowth(state);
  assignWork(state, colony);
  advanceCat(state);
  const event = nextEvent(state.feed, state.tick, shelteredBeds(state).length);
  if (event) state.demand = event;
  return results;
}
