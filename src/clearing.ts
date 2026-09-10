import { initialExploration, observeClearing } from "./exploration.ts";
import { fieldWaterSupplyKey } from "./field-water-source.ts";
import { createMaterialsState } from "./materials.ts";
// Commands authorize work. Fixed steps own outcomes; the view reads state.
import type { Clearing, Colony, Command } from "./model.ts";
import { createFeed, nextEvent } from "./feed.js";
import { TREE_CELLS, ROCKS, WATCHER, neighbors } from "./world.js";
import { introduceFiniteSources } from "./finite-sources.ts";
import { shelteredBeds } from "./construction.js";
import { actor, body } from "./actors.ts";
import { groundFooting } from "./game-space.ts";
import { assignWork } from "./jobs.ts";
import { advanceWork } from "./activity.ts";
import { advanceBrewing } from "./brewing.ts";
import { updateRoutine } from "./routine.ts";
import { admitCommands, type CommandResult } from "./orders.ts";
import { movement, stopWalking } from "./movement.ts";
import { interruptWork } from "./activity-lifecycle.ts";
import { advanceCancellations } from "./job-cancellation.ts";
import { mugwortStage } from "./herbs.ts";
import { initialTerrain, terrainEnvironment } from "./terrain.ts";
import { initialTerrainRemovals } from "./terrain-removals.ts";
import { initialWaterEnvironment } from "./world-presets/goblin-environment/water-state.ts";
import {
  initialAirEnvironment,
  airEnvironmentFacts,
} from "./world-presets/goblin-environment/air-state.ts";
import { initialPaidAtmosphereReleases } from "./world-presets/goblin-environment/paid-releases.ts";
import { advancePaidEnvironment } from "./world-presets/goblin-environment/environment-state.ts";
import { advanceNeeds, queueAutomaticCare } from "./needs.ts";

export function createClearing(seed = 42): Clearing {
  const terrain = initialTerrain();
  const environmentSource = { terrain: terrainEnvironment(terrain), sites: [] };
  const water = initialWaterEnvironment(environmentSource);
  const air = initialAirEnvironment(water, environmentSource);
  const materials = createMaterialsState();
  const state: Clearing = {
    seed,
    tick: 0,
    paused: false,
    nextId: 1,
    actors: {
      rowan: actor(
        "rowan",
        "Rowan",
        "rowan",
        groundFooting(terrain, { x: 7, z: 10 }),
      ),
      sedge: actor(
        "sedge",
        "Sedge",
        "witch-runner",
        groundFooting(terrain, { x: 10, z: 12 }),
      ),
    },
    parties: { home: { id: "home", members: ["rowan"] } },
    cat: {
      ...body(groundFooting(terrain, { x: 8, z: 10 }), "small"),
      nextMove: 100,
    },
    trees: TREE_CELLS.map(([x, z], i) => ({
      id: `oak-${i + 1}`,
      ...groundFooting(terrain, { x, z }),
      work: 0,
      felledAt: null,
    })),
    herbs: [],
    materials,
    sources: [],
    pendingSources: [],
    operations: [],
    careOutcomes: [],
    processes: [],
    terrain,
    water,
    air,
    atmosphereReleases: initialPaidAtmosphereReleases(
      materials,
      airEnvironmentFacts(air, water, environmentSource),
    ),
    terrainRemovals: initialTerrainRemovals(terrain),
    exploration: initialExploration(),
    rocks: ROCKS.map((at) => groundFooting(terrain, at)),
    watcher: groundFooting(terrain, WATCHER),
    sites: [],
    jobs: [],
    workDirty: true,
    felled: 0,
    finishedJobs: 0,
    harvestedHerbs: 0,
    commands: [],
    feed: createFeed(seed),
    demand: null,
    notice: "A borrowed axe. No home. Bramble seems optimistic.",
  };
  introduceFiniteSources(state);
  observeClearing(state);
  return state;
}
function advanceCat(state: Clearing): void {
  const cat = state.cat,
    rowan = state.actors.rowan;
  if (cat.mode === "walk") {
    const result = movement(state).advance(cat);
    if (result === "arrived" || result === "blocked" || result === "idle")
      cat.mode = "idle";
    return;
  }
  if (state.tick < cat.nextMove) return;
  cat.nextMove = state.tick + 100;
  if (
    rowan.mode === "sleep" &&
    cat.y === rowan.y &&
    Math.abs(cat.x - rowan.x) + Math.abs(cat.z - rowan.z) <= 1
  ) {
    cat.mode = "sleep";
    return;
  }
  cat.mode = "idle";
  const navigation = movement(state);
  const choices = neighbors(rowan),
    offset = Math.floor(state.tick / 100) % choices.length;
  for (let i = 0; i < choices.length; i++) {
    const path = navigation
      .forBody(cat)
      .route(cat, choices[(i + offset) % choices.length]);
    if (path !== null) {
      navigation.start(cat, path);
      return;
    }
  }
}
function advanceDrafted(
  state: Clearing,
  person: Clearing["actors"][string],
): void {
  if (!person.drafted || person.mode !== "walk") return;
  const result = movement(state).advance(person);
  if (result === "blocked") {
    person.mode = "idle";
    stopWalking(person);
    state.notice = `${person.name} is holding position; the route became blocked.`;
  } else if (result === "arrived" || result === "idle") {
    person.mode = "idle";
    stopWalking(person);
    person.work = 0;
    state.notice = `${person.name} reached the clear ground and is holding position.`;
  }
}
function advanceHerbGrowth(state: Clearing): void {
  for (const herb of state.herbs) {
    if (herb.establishment === null || herb.stage === "ready") continue;
    const stage = mugwortStage(state.tick - herb.establishment.at);
    if (stage === herb.stage) continue;
    herb.stage = stage;
    herb.work = 0;
    state.workDirty = true;
  }
}
function advanceCandidate(
  state: Clearing,
  colony: Colony,
  commands: Command[] = [],
): CommandResult[] {
  const results = admitCommands(state, commands);
  if (state.paused) return results;
  state.tick++;
  advanceNeeds(state);
  updateRoutine(state);
  queueAutomaticCare(state);
  for (const person of Object.values(state.actors)) {
    if (person.workDisposition === "interrupt-at-footing") {
      stopWalking(person);
      if (person.traversal) movement(state).advance(person);
      if (!person.traversal) interruptWork(state, person);
      continue;
    }
    advanceWork(state, person);
    advanceDrafted(state, person);
  }
  advanceCancellations(state);
  const waterSupplyBefore = fieldWaterSupplyKey(state);
  const environmental = advancePaidEnvironment(
    state,
    state.materials,
    {
      terrain: terrainEnvironment(state.terrain),
      sites: state.sites,
    },
    1,
  );
  state.water = environmental.water;
  state.air = environmental.air;
  state.atmosphereReleases = environmental.atmosphereReleases;
  if (fieldWaterSupplyKey(state) !== waterSupplyBefore) state.workDirty = true;
  advanceBrewing(state);
  advanceHerbGrowth(state);
  observeClearing(state);
  assignWork(state, colony);
  advanceCat(state);
  const event = nextEvent(state.feed, state.tick, shelteredBeds(state).length);
  if (event) state.demand = event;
  return results;
}

/** One publication boundary for browser ticks and disposable Region batches. */
function commitTicks(
  state: Clearing,
  colony: Colony,
  ticks: number,
  commands: Command[],
): CommandResult[] {
  const {
    terrain,
    water,
    air,
    atmosphereReleases,
    terrainRemovals,
    exploration,
    ...body
  } = state;
  const candidate: Clearing = {
    ...structuredClone(body),
    terrain,
    water,
    air,
    atmosphereReleases,
    terrainRemovals,
    exploration,
  };
  let results: CommandResult[] = [];
  for (let count = 0; count < ticks; count++) {
    const admitted = advanceCandidate(
      candidate,
      colony,
      count === 0 ? commands : [],
    );
    if (count === 0) results = admitted;
    if (candidate.paused) break;
  }
  Object.assign(state, candidate);
  return results;
}
export function step(
  state: Clearing,
  colony: Colony,
  commands: Command[] = [],
): CommandResult[] {
  if (state.paused && commands.length === 0) return [];
  return commitTicks(state, colony, 1, commands);
}
/** Host grants a bounded batch; intermediate states never escape this owner. */
export function advanceTicks(
  state: Clearing,
  colony: Colony,
  ticks: number,
): void {
  if (!Number.isSafeInteger(ticks) || ticks < 1 || ticks > 120)
    throw new Error("invalid-tick-batch");
  if (!state.paused) commitTicks(state, colony, ticks, []);
}
