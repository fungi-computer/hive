import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createClearing, step as advance } from "./clearing.ts";
import { cellKey, blockedCells, sameCell } from "./world.js";
import { route } from "./movement.js";
import { DAY_TICKS } from "./routine.ts";
import { CHOP_TICKS } from "./activity.ts";
import { looseWood } from "./resources.ts";
import { BUILDINGS, shelteredBeds } from "./construction.js";
import { createTicker, push } from "./ticker.js";

// Run the exact shipped JS and WASM, without a substitute assignment function.
const colony = await new Promise((resolve, reject) => {
  const context = {
    Module: {
      wasmBinary: readFileSync(
        new URL("../public/vendor/libcolony/colony.wasm", import.meta.url),
      ),
      onRuntimeInitialized() {
        resolve(context.Module);
      },
      onAbort: reject,
    },
    window: {},
    console,
    TextDecoder,
    TextEncoder,
    WebAssembly,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(
    readFileSync(
      new URL("../public/vendor/libcolony/colony.js", import.meta.url),
      "utf8",
    ),
    context,
  );
});

function step(state, colony, commands = []) {
  return advance(
    state,
    colony,
    commands.map((command) =>
      command.kind === "draft" ||
      command.kind === "undraft" ||
      command.kind === "go" ||
      command.kind === "recruit"
        ? { party: "home", ...command }
        : { party: "home", actors: null, level: 0, ...command },
    ),
  );
}

function conserved(state) {
  assert.equal(
    looseWood(state) +
      Object.values(state.actors).reduce(
        (n, person) => n + (person.cargo?.amount ?? 0),
        0,
      ) +
      state.sites.reduce((n, s) => n + s.delivered, 0) +
      state.consumedWood,
    state.felled * 6,
  );
  assert.equal(
    state.herbBundles.reduce((total, bundle) => total + bundle.amount, 0),
    state.harvestedHerbs,
  );
}
function run(state, ticks, commands = new Map()) {
  for (let i = 0; i < ticks; i++) {
    step(state, colony, commands.get(state.tick) || []);
    conserved(state);
    for (const person of Object.values(state.actors))
      for (const cell of person.path)
        assert.equal(blockedCells(state).has(cellKey(cell)), false);
  }
  return state;
}
function until(state, predicate, limit = DAY_TICKS * 2) {
  for (let i = 0; i < limit && !predicate(state); i++) run(state, 1);
  assert.ok(
    predicate(state),
    JSON.stringify({ pawn: state.actors.rowan, jobs: state.jobs }),
  );
}
const chop = (tree) => ({ kind: "chop", tree });
const allow = (actors, work, enabled) => ({
  kind: "work",
  actors,
  work,
  enabled,
});
const build = (type, x, z, direction = 0) => ({
  kind: "build",
  type,
  x,
  z,
  direction,
});
const sow = (x, z) => ({ kind: "sow", x, z, level: 0 });
const harvest = (herb) => ({ kind: "harvest", herb });
function homeOrders() {
  const commands = [];
  for (let x = 6; x <= 9; x++)
    for (let z = 5; z <= 8; z++) {
      if (x !== 6 && x !== 9 && z !== 5 && z !== 8) continue;
      commands.push(
        build(
          x === 7 && z === 8 ? "door" : "wall",
          x,
          z,
          x === 6 || x === 9 ? 1 : 0,
        ),
      );
    }
  commands.push(build("bed", 7, 6));
  for (const x of [7, 8])
    for (const z of [6, 7]) commands.push(build("roof", x, z));
  return commands;
}
test("only authorized work runs; a waiting blueprint resumes through real colony hauling and building", () => {
  const state = run(createClearing(), 70);
  assert.equal(state.felled, 0);
  assert.equal(state.actors.rowan.assignment, null);
  step(state, colony, [build("wall", 7, 5)]);
  run(state, 40);
  assert.match(state.jobs[0].reason, /wood/);
  assert.equal(state.sites[0].work, 0);
  step(state, colony, [chop("oak-1"), chop("oak-1")]);
  assert.equal(state.jobs.length, 2);
  assert.equal(state.actors.rowan.assignment.character, "rowan");
  until(state, (s) => (s.actors.rowan.cargo?.amount ?? 0) > 0);
  assert.equal(state.felled, 1);
  assert.equal(state.sites[0].delivered, 0);
  until(state, (s) => s.sites[0].finishedAt !== null);
  assert.equal(state.sites[0].delivered, 1);
  assert.equal(state.jobs.length, 0);
  run(state, 100);
  assert.equal(state.felled, 1);
  assert.equal(looseWood(state), 5);
});
test("canceling queued, working and carrying orders keeps every wood and permits a fresh order", () => {
  const state = createClearing();
  step(state, colony, [build("door", 7, 5)]);
  step(state, colony, [{ kind: "cancel", job: state.jobs[0].id }]);
  assert.equal(state.sites.length, 0);
  step(state, colony, [chop("oak-1")]);
  until(state, (s) => s.actors.rowan.mode === "chop" && s.trees[0].work > 15);
  const work = state.trees[0].work;
  step(state, colony, [{ kind: "cancel", job: state.jobs[0].id }]);
  run(state, 100);
  assert.equal(state.trees[0].work, work);
  assert.equal(state.felled, 0);
  step(state, colony, [chop("oak-1"), build("door", 7, 5)]);
  until(state, (s) => (s.actors.rowan.cargo?.amount ?? 0) === 2);
  const id = state.jobs[0].id;
  step(state, colony, [
    { kind: "cancel", job: id },
    { kind: "cancel", job: id },
  ]);
  run(state, 120);
  assert.equal(state.actors.rowan.cargo?.amount ?? 0, 0);
  assert.equal(looseWood(state), 6);
  assert.equal(state.sites.length, 0);
  assert.equal(state.actors.rowan.assignment, null);
  step(state, colony, [build("door", 7, 5)]);
  until(state, (s) => s.actors.rowan.mode === "build" && s.sites[0].work > 8);
  step(state, colony, [{ kind: "cancel", job: state.jobs[0].id }]);
  assert.equal(looseWood(state), 6);
  conserved(state);
  step(state, colony, [build("door", 7, 5)]);
  until(state, (s) => s.jobs.length === 0);
  assert.equal(state.sites[0].delivered, 2);
  assert.equal(looseWood(state), 4);
});
test("reserved walls block work routes; opening a canceled blueprint makes the order eligible again", () => {
  const state = createClearing();
  step(state, colony, [
    build("wall", 2, 4),
    build("wall", 4, 4),
    build("wall", 3, 3),
    build("wall", 3, 5),
    chop("oak-1"),
  ]);
  run(state, 100);
  assert.equal(state.felled, 0);
  assert.equal(state.actors.rowan.assignment, null);
  assert.match(state.jobs.at(-1).reason, /route/);
  step(state, colony, [{ kind: "cancel", job: state.jobs[0].id }]);
  until(state, (s) => s.felled === 1);
  conserved(state);
});
test("a player-built room needs delivered wood, a doorway, covered bed cells and an actual sleep visit", () => {
  const state = createClearing();
  step(state, colony, [
    ...homeOrders(),
    chop("oak-1"),
    chop("oak-2"),
    chop("oak-3"),
    chop("oak-4"),
  ]);
  until(state, (s) => s.jobs.length === 0);
  assert.equal(state.sites.length, 17);
  assert.equal(shelteredBeds(state).length, 1);
  assert.equal(state.felled, 4);
  assert.equal(looseWood(state), 5);
  assert.equal(state.demand.kind, "approval");
  // The same covered room with a solid wall in place of its entrance is not a home.
  const sealed = structuredClone(state);
  sealed.sites.find((site) => site.type === "door").type = "wall";
  assert.equal(shelteredBeds(sealed).length, 0);
  step(state, colony, [{ kind: "rest" }, chop("oak-5")]);
  until(state, (s) => s.actors.rowan.mode === "sleep");
  assert.deepEqual([state.actors.rowan.x, state.actors.rowan.z], [7, 6]);
  const restJob = state.actors.rowan.task.job;
  state.paused = true;
  const sleepTick = state.tick;
  step(state, colony, [{ kind: "draft", actor: "rowan" }]);
  assert.equal(state.tick, sleepTick);
  assert.equal(state.actors.rowan.mode, "idle");
  assert.equal(state.actors.rowan.task, null);
  assert.ok(state.jobs.some((job) => job.id === restJob));
  step(state, colony, [{ kind: "undraft", actor: "rowan" }]);
  state.paused = false;
  until(state, (s) => s.actors.rowan.mode === "sleep");
  const rest = state.actors.rowan.rest;
  run(state, 20);
  assert.ok(state.actors.rowan.rest > rest);
  assert.equal(state.felled, 4);
  until(state, (s) => s.rested === 1);
  until(state, (s) => s.felled === 5);
  assert.equal(state.jobs.length, 0);
});
test("pause freezes active cargo and every subsystem; reset restores the seeded clearing", () => {
  const state = createClearing();
  step(state, colony, [build("bed", 7, 6), chop("oak-1")]);
  until(state, (s) => (s.actors.rowan.cargo?.amount ?? 0) > 0);
  state.paused = true;
  const frozen = structuredClone(state);
  run(state, 100);
  assert.deepEqual(state, frozen);
  state.paused = false;
  until(state, (s) => s.jobs.length === 0);
  const reset = createClearing();
  assert.equal(looseWood(reset), 0);
  assert.equal(reset.jobs.length, 0);
  assert.equal(reset.sites.length, 0);
  assert.equal(reset.feed.sequence, 0);
  assert.equal(reset.actors.rowan.routine, false);
});

test("draft admits while paused, interrupts work without losing wood, and blocks ordinary assignment", () => {
  const state = createClearing();
  step(state, colony, [build("bed", 7, 6), chop("oak-1")]);
  until(state, (s) => (s.actors.rowan.cargo?.amount ?? 0) > 0);
  const before = looseWood(state) + (state.actors.rowan.cargo?.amount ?? 0);
  const jobIds = state.jobs.map((job) => job.id);
  state.paused = true;
  const tick = state.tick;
  const [draftResult] = step(state, colony, [
    { kind: "draft", actor: "rowan" },
  ]);
  assert.deepEqual(draftResult, { status: "applied" });
  assert.equal(state.tick, tick);
  assert.equal(state.actors.rowan.drafted, true);
  assert.equal(state.actors.rowan.task, null);
  assert.equal(state.actors.rowan.assignment, null);
  assert.equal(state.actors.rowan.cargo, null);
  assert.deepEqual(
    state.jobs.map((job) => job.id),
    jobIds,
  );
  assert.equal(looseWood(state), before);

  state.paused = false;
  run(state, 1);
  assert.equal(state.actors.rowan.task, null);
  assert.equal(state.actors.rowan.assignment, null);
  state.paused = true;
  const [undraftResult] = step(state, colony, [
    { kind: "undraft", actor: "rowan" },
  ]);
  assert.deepEqual(undraftResult, { status: "applied" });
  assert.equal(state.tick, tick + 1);
  assert.equal(state.actors.rowan.drafted, false);
  state.paused = false;
  run(state, 1);
  assert.ok(state.actors.rowan.task || state.actors.rowan.assignment);
});

test("draft releases a reserved pile claim while preserving its unfinished build", () => {
  const state = createClearing();
  step(state, colony, [chop("oak-1")]);
  until(state, (candidate) => candidate.felled === 1);
  step(state, colony, [build("wall", 7, 5)]);
  const claim = structuredClone(state.claims.rowan);
  assert.ok(claim);
  const loose = looseWood(state);
  state.paused = true;
  step(state, colony, [{ kind: "draft", actor: "rowan" }]);
  assert.equal(state.claims.rowan, undefined);
  assert.equal(looseWood(state), loose);
  assert.ok(state.jobs.some((job) => job.id === claim.job));
  assert.ok(state.sites.some((site) => site.id === claim.site));
  conserved(state);
});

test("draft excludes a member from night routine while preserving the routine flag", () => {
  const state = createClearing();
  step(
    state,
    colony,
    homeOrders().concat([
      chop("oak-1"),
      chop("oak-2"),
      chop("oak-3"),
      chop("oak-4"),
    ]),
  );
  until(state, (s) => s.jobs.length === 0);
  state.actors.rowan.routine = true;
  state.paused = true;
  step(state, colony, [{ kind: "draft", actor: "rowan" }]);
  state.paused = false;
  state.tick = DAY_TICKS / 2;
  run(state, 1);
  assert.equal(state.actors.rowan.drafted, true);
  assert.equal(state.actors.rowan.routine, true);
  assert.equal(
    state.jobs.some((job) => job.kind === "rest" && job.target === "rowan"),
    false,
  );
});

test("drafted Go preflights reachability, walks, and holds without a job", () => {
  const state = createClearing();
  state.paused = true;
  step(state, colony, [{ kind: "draft", actor: "rowan" }]);
  const target = { x: 8, z: 10, level: 0 };
  const [goResult] = step(state, colony, [
    { kind: "go", actor: "rowan", target },
  ]);
  assert.deepEqual(goResult, { status: "applied" });
  assert.equal(state.tick, 0);
  assert.equal(state.actors.rowan.mode, "walk");
  assert.equal(state.jobs.length, 0);
  state.paused = false;
  until(state, (s) => s.actors.rowan.mode === "idle");
  assert.deepEqual(
    [state.actors.rowan.x, state.actors.rowan.z],
    [target.x, target.z],
  );
  assert.equal(state.actors.rowan.drafted, true);

  state.paused = true;
  const before = structuredClone(state.actors.rowan);
  const [unreachable] = step(state, colony, [
    { kind: "go", actor: "rowan", target: { x: 1, z: 1, level: 0 } },
  ]);
  assert.equal(unreachable.status, "rejected");
  assert.deepEqual(state.actors.rowan, before);
});

test("a later-blocked Go holds safely and Undraft cancels a pending route", () => {
  const state = createClearing();
  state.paused = true;
  step(state, colony, [{ kind: "draft", actor: "rowan" }]);
  const target = { x: 8, z: 10, level: 0 };
  step(state, colony, [{ kind: "go", actor: "rowan", target }]);
  assert.equal(state.actors.rowan.mode, "walk");
  state.rocks.push({ ...target });
  state.paused = false;
  run(state, 1);
  assert.equal(state.actors.rowan.mode, "idle");
  assert.deepEqual(state.actors.rowan.path, []);
  assert.match(state.notice, /route became blocked/);

  state.paused = true;
  step(state, colony, [
    { kind: "go", actor: "rowan", target: { x: 8, z: 9, level: 0 } },
  ]);
  assert.equal(state.actors.rowan.mode, "walk");
  step(state, colony, [{ kind: "undraft", actor: "rowan" }]);
  assert.equal(state.actors.rowan.drafted, false);
  assert.equal(state.actors.rowan.mode, "idle");
  assert.deepEqual(state.actors.rowan.path, []);
});

test("draft and Go commands replay at the same completed ticks", () => {
  const state = createClearing(91);
  state.paused = true;
  step(state, colony, [{ kind: "draft", actor: "rowan" }]);
  step(state, colony, [
    { kind: "go", actor: "rowan", target: { x: 8, z: 10, level: 0 } },
  ]);
  state.paused = false;
  run(state, 30);
  const recorded = new Map();
  for (const { tick, ...command } of state.commands) {
    if (!recorded.has(tick)) recorded.set(tick, []);
    recorded.get(tick).push(command);
  }
  const replay = createClearing(91);
  run(replay, 30, recorded);
  assert.deepEqual(replay, state);
});

function finishedStructure(type, id = "site-1") {
  return {
    id,
    type,
    x: 5,
    z: 5,
    level: 0,
    direction: 0,
    delivered: BUILDINGS[type].wood,
    work: BUILDINGS[type].ticks,
    finishedAt: 9,
  };
}

test("all building types deconstruct with their declared salvage and sink", () => {
  const expected = [
    ["wall", 1, 0],
    ["door", 1, 1],
    ["roof", 1, 0],
    ["bed", 1, 1],
  ];
  for (const [type, salvage, sink] of expected) {
    const state = createClearing();
    state.tick = 10;
    state.felled = 1;
    state.trees[0].work = CHOP_TICKS;
    state.trees[0].felledAt = 8;
    state.nextId = 3;
    state.sites.push(finishedStructure(type));
    state.piles.push({
      id: "wood-2",
      x: 4,
      z: 5,
      level: 0,
      amount: 6 - BUILDINGS[type].wood,
    });
    state.paused = false;
    const result = step(state, colony, [
      { kind: "deconstruct", site: "site-1" },
    ]);
    assert.deepEqual(result, [{ status: "applied" }]);
    assert.equal(state.sites.length, 1);
    assert.equal(state.consumedWood, 0);
    until(state, (s) => s.sites.length === 0);
    assert.equal(state.jobs.length, 0);
    assert.equal(looseWood(state), 6 - BUILDINGS[type].wood + salvage);
    assert.equal(state.consumedWood, sink);
    conserved(state);
  }
});

test("deconstructing an occupied bed wakes the sleeper but retains rest and routine", () => {
  const state = createClearing();
  step(state, colony, [
    ...homeOrders(),
    chop("oak-1"),
    chop("oak-2"),
    chop("oak-3"),
    chop("oak-4"),
  ]);
  until(state, (s) => s.jobs.length === 0);
  const bed = state.sites.find((site) => site.type === "bed");
  const otherSiteIds = new Set(
    state.sites.filter((site) => site.id !== bed.id).map((site) => site.id),
  );
  step(state, colony, [{ kind: "recruit", actor: "sedge" }]);
  state.actors.rowan.routine = true;
  step(state, colony, [{ kind: "rest", actors: ["rowan"] }]);
  until(state, (s) => s.actors.rowan.mode === "sleep");
  const restJob = state.jobs.find(
    (job) => job.kind === "rest" && job.target === "rowan",
  );
  assert.ok(restJob);
  step(state, colony, [{ kind: "deconstruct", site: bed.id }]);
  until(state, (s) => !s.sites.some((site) => site.id === bed.id));
  assert.equal(state.actors.rowan.mode, "idle");
  assert.equal(state.actors.rowan.task, null);
  assert.equal(state.actors.rowan.routine, true);
  assert.ok(
    state.jobs.some(
      (job) =>
        job.id === restJob.id && job.kind === "rest" && job.target === "rowan",
    ),
  );
  assert.deepEqual(new Set(state.sites.map((site) => site.id)), otherSiteIds);
  conserved(state);
});

test("an unreachable deconstruction stays queued and leaves its site intact", () => {
  const state = createClearing();
  state.tick = 10;
  state.felled = 1;
  state.trees[0].work = CHOP_TICKS;
  state.trees[0].felledAt = 8;
  state.nextId = 3;
  state.sites.push(finishedStructure("wall"));
  state.piles.push({ id: "wood-2", x: 4, z: 5, level: 0, amount: 5 });
  state.rocks.push(
    { x: 4, z: 5, level: 0 },
    { x: 6, z: 5, level: 0 },
    { x: 5, z: 4, level: 0 },
    { x: 5, z: 6, level: 0 },
  );
  state.paused = false;
  step(state, colony, [{ kind: "deconstruct", site: "site-1" }]);
  assert.equal(state.jobs.length, 1);
  assert.equal(state.sites.length, 1);
  assert.match(state.jobs[0].reason, /route/);
  run(state, 10);
  assert.equal(state.jobs.length, 1);
  assert.equal(state.sites.length, 1);
  assert.equal(state.consumedWood, 0);
  conserved(state);
});

test("canceling deconstruction keeps the finished structure and material unchanged", () => {
  const state = createClearing();
  state.tick = 10;
  state.felled = 1;
  state.trees[0].work = CHOP_TICKS;
  state.trees[0].felledAt = 8;
  state.nextId = 3;
  state.sites.push(finishedStructure("wall"));
  state.piles.push({ id: "wood-2", x: 4, z: 5, level: 0, amount: 5 });
  state.paused = true;
  step(state, colony, [{ kind: "deconstruct", site: "site-1" }]);
  step(state, colony, [{ kind: "cancel", job: state.jobs[0].id }]);
  assert.equal(state.sites.length, 1);
  assert.equal(state.piles[0].amount, 5);
  assert.equal(state.consumedWood, 0);
  assert.equal(state.jobs.length, 0);
  conserved(state);
});
test("paused commands admit shared work in order without advancing the world", () => {
  const state = createClearing(31);
  state.paused = true;
  const before = {
    tick: state.tick,
    actors: structuredClone(state.actors),
    cat: structuredClone(state.cat),
    trees: structuredClone(state.trees),
    feed: structuredClone(state.feed),
  };
  let optimizerCalls = 0;
  const observed = {
    compute_cost: colony.compute_cost.bind(colony),
    optimize(assignments) {
      optimizerCalls++;
      return colony.optimize(assignments);
    },
  };
  const commands = [chop("oak-1"), chop("oak-1"), build("wall", 7, 5)];
  const results = step(state, observed, commands);

  assert.deepEqual(
    results.map((result) => result.status),
    ["applied", "rejected", "applied"],
  );
  assert.match(results[1].reason, /already ordered/);
  assert.equal(optimizerCalls, 0);
  assert.equal(state.tick, before.tick);
  assert.deepEqual(state.actors, before.actors);
  assert.deepEqual(state.cat, before.cat);
  assert.deepEqual(state.trees, before.trees);
  assert.deepEqual(state.feed, before.feed);
  assert.equal(state.jobs.length, 2);
  assert.equal(state.sites.length, 1);
  assert.deepEqual(
    state.commands.map((command) => command.tick),
    [0, 0],
  );

  const admitted = structuredClone(state);
  const replay = createClearing(31);
  replay.paused = true;
  step(replay, colony, commands);
  assert.deepEqual(replay, admitted);

  state.paused = false;
  replay.paused = false;
  step(state, observed);
  step(replay, colony);
  assert.ok(optimizerCalls > 0);
  assert.equal(state.tick, 1);
  assert.ok(state.actors.rowan.assignment);
  assert.deepEqual(state, replay);
});

test("shared sow uses real garden work, fixed growth thresholds, and one harvest bundle", () => {
  const state = createClearing(73);
  state.paused = true;
  const [sowResult] = step(state, colony, [sow(7, 9)]);
  assert.deepEqual(sowResult, { status: "applied" });
  assert.equal(state.tick, 0);
  assert.equal(state.herbs[0].stage, "ordered");
  assert.equal(state.jobs[0].kind, "sow");

  state.paused = false;
  until(state, (candidate) => candidate.herbs[0]?.stage === "planted");
  const plantedAt = state.herbs[0].plantedAt;
  assert.equal(state.herbs[0].work, 0);
  run(state, 79);
  assert.equal(state.herbs[0].stage, "planted");
  run(state, 1);
  assert.equal(state.herbs[0].stage, "growing");
  run(state, 159);
  assert.equal(state.herbs[0].stage, "growing");
  run(state, 1);
  assert.equal(state.herbs[0].stage, "ready");
  assert.equal(state.tick - plantedAt, 240);

  state.paused = true;
  const [harvestResult] = step(state, colony, [harvest(state.herbs[0].id)]);
  assert.deepEqual(harvestResult, { status: "applied" });
  assert.equal(state.tick - plantedAt, 240);
  state.paused = false;
  until(state, (candidate) => candidate.herbBundles.length === 1);
  assert.equal(state.herbs.length, 0);
  assert.equal(state.harvestedHerbs, 1);
  assert.equal(state.herbBundles[0].amount, 1);
  assert.equal(state.jobs.length, 0);
});

test("sow cancellation removes only its ordered herb, while interruption retains work", () => {
  const state = createClearing(74);
  state.paused = true;
  step(state, colony, [sow(7, 9), sow(8, 9)]);
  const canceled = state.herbs[0].id;
  const canceledJob = state.jobs[0].id;
  step(state, colony, [{ kind: "cancel", job: canceledJob }]);
  assert.deepEqual(
    state.herbs.map((herb) => herb.id),
    ["herb-3"],
  );
  assert.deepEqual(
    state.jobs.map((job) => job.target),
    ["herb-3"],
  );
  assert.equal(
    state.herbs.some((herb) => herb.id === canceled),
    false,
  );
  assert.match(state.notice, /Order canceled/);
  assert.doesNotMatch(state.notice, /wood/);

  state.paused = false;
  until(
    state,
    (candidate) =>
      candidate.actors.rowan.task?.kind === "sow" &&
      candidate.herbs[0].work > 0,
  );
  const workingHerb = state.herbs[0];
  const work = workingHerb.work;
  assert.ok(work > 0);
  state.paused = true;
  step(state, colony, [{ kind: "draft", actor: "rowan" }]);
  assert.equal(state.actors.rowan.task, null);
  assert.equal(state.herbs[0].work, work);
  assert.equal(state.jobs[0].target, workingHerb.id);
});

test("herb occupancy is shared with construction and harvest cancellation preserves ready mugwort", () => {
  const state = createClearing(75);
  state.paused = true;
  const [treeSow, clearSow] = step(state, colony, [sow(3, 4), sow(7, 9)]);
  assert.equal(treeSow.status, "rejected");
  assert.equal(clearSow.status, "applied");
  const [overlapBuild] = step(state, colony, [build("wall", 7, 9)]);
  assert.equal(overlapBuild.status, "rejected");
  assert.equal(state.herbs.length, 1);

  state.paused = false;
  until(state, (candidate) => candidate.herbs[0]?.stage === "planted");
  run(state, 240);
  assert.equal(state.herbs[0].stage, "ready");
  state.paused = true;
  const [orderedHarvest] = step(state, colony, [harvest(state.herbs[0].id)]);
  assert.deepEqual(orderedHarvest, { status: "applied" });
  state.paused = false;
  until(
    state,
    (candidate) =>
      candidate.actors.rowan.task?.kind === "harvest" &&
      candidate.herbs[0].work > 0,
  );
  const harvestWork = state.herbs[0].work;
  state.paused = true;
  step(state, colony, [{ kind: "draft", actor: "rowan" }]);
  assert.equal(state.actors.rowan.task, null);
  assert.equal(state.herbs[0].stage, "ready");
  assert.equal(state.herbs[0].work, harvestWork);
  const harvestJob = state.jobs[0].id;
  step(state, colony, [{ kind: "cancel", job: harvestJob }]);
  assert.equal(state.herbs[0].stage, "ready");
  assert.equal(state.herbBundles.length, 0);
  assert.equal(state.harvestedHerbs, 0);
});
test("automatic work settings split hauling from building and personal orders override them", () => {
  const state = createClearing(37);
  step(state, colony, [{ kind: "recruit", party: "home", actor: "sedge" }]);
  step(state, colony, [chop("oak-1")]);
  until(state, (candidate) => candidate.jobs.length === 0);
  assert.equal(state.felled, 1);

  step(state, colony, [
    build("wall", 7, 5),
    allow(["rowan"], "build", false),
    allow(["sedge"], "haul", false),
  ]);
  const site = state.sites[0];
  const job = state.jobs.find((candidate) => candidate.kind === "build");
  assert.equal(state.actors.rowan.task?.kind, "pickup");
  assert.equal(state.actors.sedge.task, null);
  assert.equal(state.actors.rowan.task.job, job.id);

  state.paused = true;
  const frozen = {
    tick: state.tick,
    task: structuredClone(state.actors.rowan.task),
    assignment: structuredClone(state.actors.rowan.assignment),
    path: structuredClone(state.actors.rowan.path),
    leg: state.actors.rowan.leg,
    mode: state.actors.rowan.mode,
    claim: structuredClone(state.claims.rowan),
    cargo: structuredClone(state.actors.rowan.cargo),
    site: structuredClone(site),
  };
  step(state, colony, [allow(["rowan"], "haul", false)]);
  assert.equal(state.actors.rowan.allowedWork.haul, false);
  assert.deepEqual(
    {
      tick: state.tick,
      task: state.actors.rowan.task,
      assignment: state.actors.rowan.assignment,
      path: state.actors.rowan.path,
      leg: state.actors.rowan.leg,
      mode: state.actors.rowan.mode,
      claim: state.claims.rowan,
      cargo: state.actors.rowan.cargo,
      site,
    },
    frozen,
  );
  state.paused = false;

  for (let i = 0; i < 1_000 && state.actors.sedge.task?.kind !== "build"; i++)
    step(state, colony);
  assert.equal(site.delivered, 1);
  assert.equal(state.actors.sedge.task?.kind, "build");
  assert.equal(state.actors.sedge.task.job, job.id);
  for (let i = 0; i < 1_000 && site.finishedAt === null; i++)
    step(state, colony);
  assert.ok(site.finishedAt !== null);

  step(state, colony, [
    allow(["rowan"], "chop", false),
    allow(["sedge"], "chop", false),
    chop("oak-2"),
  ]);
  const waiting = state.jobs.find((candidate) => candidate.target === "oak-2");
  assert.match(waiting.reason, /allowed to chop/);
  assert.equal(state.actors.rowan.assignment, null);
  assert.equal(state.actors.sedge.assignment, null);

  step(state, colony, [{ ...chop("oak-3"), actors: ["rowan"], direct: false }]);
  const personal = state.jobs.find((candidate) => candidate.target === "oak-3");
  assert.deepEqual(personal.scope.actors, ["rowan"]);
  assert.equal(state.actors.rowan.task?.job, personal.id);

  const recorded = new Map();
  for (const { tick, ...command } of state.commands) {
    if (!recorded.has(tick)) recorded.set(tick, []);
    recorded.get(tick).push(command);
  }
  assert.deepEqual(run(createClearing(37), state.tick, recorded), state);
  conserved(state);
});
test("fixed-tick command replay preserves resources, cancellation and order priority across render cadences", () => {
  const commands = new Map([
    [2, [build("wall", 7, 5), chop("oak-1"), chop("oak-2")]],
    [40, [{ kind: "next", job: "job-4" }]],
    [60, [{ kind: "cancel", job: "job-2" }]],
    [80, [build("door", 8, 5)]],
  ]);
  function withFrames(frames) {
    const state = createClearing(17),
      clock = createTicker();
    let frame = 0;
    while (state.tick < 1100)
      for (
        let i = 0, n = push(clock, frames[frame++ % frames.length]);
        i < n && state.tick < 1100;
        i++
      )
        run(state, 1, commands);
    return state;
  }
  const first = withFrames([10, 15, 25]);
  assert.deepEqual(first, withFrames([80, 20]));
  const recorded = new Map();
  for (const { tick, ...command } of first.commands) {
    if (!recorded.has(tick)) recorded.set(tick, []);
    recorded.get(tick).push(command);
  }
  assert.deepEqual(first, run(createClearing(17), 1100, recorded));
});

test("the night schedule obeys dawn and disabling it releases its work order", () => {
  const state = createClearing();
  step(state, colony, [
    ...homeOrders(),
    chop("oak-1"),
    chop("oak-2"),
    chop("oak-3"),
    chop("oak-4"),
  ]);
  until(state, (s) => s.jobs.length === 0);
  // Use real elapsed ticks to reach 05:59, not a fabricated sleep/task record.
  until(state, (s) => s.tick % DAY_TICKS === (DAY_TICKS * 22) / 24 - 1);
  step(state, colony, [{ kind: "routine", enabled: true }, chop("oak-5")]);
  assert.equal(
    state.jobs.some((j) => j.routine),
    false,
  );
  until(state, (s) => s.felled === 5);
  until(state, (s) => s.actors.rowan.mode === "sleep");
  step(state, colony, [{ kind: "routine", enabled: false }, chop("oak-6")]);
  assert.equal(
    state.jobs.some((j) => j.routine),
    false,
  );
  assert.notEqual(state.actors.rowan.mode, "sleep");
  until(state, (s) => s.felled === 6);
  step(state, colony, [{ kind: "routine", enabled: true }]);
  until(state, (s) => s.actors.rowan.mode === "sleep");
  const bedtime = state.tick;
  until(state, (s) => s.tick > bedtime && !s.jobs.some((j) => j.routine));
  assert.ok(state.rested > 0);
  assert.notEqual(state.actors.rowan.mode, "sleep");
  conserved(state);
});

test("queued rest waits behind personal work and an explicit rest survives dawn without disabling its schedule", () => {
  const state = createClearing();
  step(state, colony, [
    ...homeOrders(),
    chop("oak-1"),
    chop("oak-2"),
    chop("oak-3"),
    chop("oak-4"),
  ]);
  until(state, (s) => s.jobs.length === 0);

  step(state, colony, [
    { ...chop("oak-5"), actors: ["rowan"] },
    { kind: "rest", actors: ["rowan"] },
  ]);
  const personal = state.jobs.filter((job) =>
    job.scope.actors?.includes("rowan"),
  );
  assert.deepEqual(
    personal.map((job) => job.kind),
    ["chop", "rest"],
  );
  assert.equal(state.actors.rowan.task?.job, personal[0].id);
  assert.equal(state.actors.rowan.task?.kind, "chop");
  step(state, colony, [{ kind: "cancel", job: personal[1].id }]);
  until(state, (s) => s.felled === 5);

  // Reach the final two night ticks through normal simulation time. Enabling the
  // routine here creates a real rest job without enough time to finish by dawn.
  until(state, (s) => s.tick % DAY_TICKS === (DAY_TICKS * 22) / 24 - 3);
  step(state, colony, [{ kind: "routine", enabled: true }]);
  const rest = state.jobs.find(
    (job) => job.kind === "rest" && job.target === "rowan",
  );
  assert.ok(rest?.routine);
  assert.equal(state.actors.rowan.task?.job, rest.id);

  step(state, colony, [{ kind: "rest", actors: ["rowan"] }]);
  assert.equal(rest.routine, false);
  assert.equal(state.actors.rowan.routine, true);
  assert.equal(state.actors.rowan.task?.job, rest.id);
  step(state, colony);
  assert.equal(state.tick % DAY_TICKS, (DAY_TICKS * 22) / 24);
  assert.ok(state.jobs.some((job) => job.id === rest.id));
  assert.equal(state.actors.rowan.task?.job, rest.id);
  assert.equal(state.actors.rowan.routine, true);
  until(state, (s) => !s.jobs.some((job) => job.id === rest.id));
  assert.equal(state.actors.rowan.routine, true);
  conserved(state);
});

test("recruitment is one-time and work scope rejects outsiders", () => {
  const state = createClearing();
  step(state, colony, [{ kind: "recruit", party: "home", actor: "sedge" }]);
  const duplicate = step(state, colony, [
    { kind: "recruit", party: "home", actor: "sedge" },
  ]);
  assert.deepEqual(state.parties.home.members, ["rowan", "sedge"]);
  assert.match(duplicate[0].reason, /already joined/);
  const outsiders = step(state, colony, [
    { kind: "chop", tree: "oak-1", party: "home", actors: ["witch"] },
    { kind: "chop", tree: "oak-2", party: "away", actors: null },
  ]);
  assert.equal(state.jobs.length, 0);
  assert.match(
    outsiders.map((result) => result.reason).join(" "),
    /party is not here|belong to this party/,
  );
});

test("one optimizer batch respects a pinned first job and assigns the shared next job", () => {
  const state = createClearing();
  step(state, colony, [{ kind: "recruit", party: "home", actor: "sedge" }]);
  const batches = [];
  const matches = [];
  const observed = {
    compute_cost: colony.compute_cost.bind(colony),
    optimize(assignments) {
      batches.push(
        assignments.map(({ character, task, cost }) => ({
          character,
          task,
          cost,
        })),
      );
      const chosen = colony.optimize(assignments);
      matches.push(chosen.map(({ character, task }) => ({ character, task })));
      return chosen;
    },
  };
  step(state, observed, [
    { ...chop("oak-2"), actors: ["rowan"] },
    chop("oak-7"),
  ]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 4);
  assert.equal(matches[0].length, 2);
  const first = state.jobs[0],
    second = state.jobs[1];
  const costs = new Map(
    batches[0].map((edge) => [`${edge.character}/${edge.task}`, edge.cost]),
  );
  const allowed = [
    costs.get(`rowan/${first.id}`),
    costs.get(`sedge/${second.id}`),
  ];
  const forbidden = [
    costs.get(`rowan/${second.id}`),
    costs.get(`sedge/${first.id}`),
  ];
  assert.ok(Math.min(...forbidden) > Math.max(...allowed));
  assert.equal(state.actors.rowan.assignment?.task, first.id);
  assert.equal(state.actors.sedge.assignment?.task, second.id);
  assert.equal(new Set(matches[0].map((a) => a.character)).size, 2);
  assert.equal(new Set(matches[0].map((a) => a.task)).size, 2);
});

test("one physical wood unit can be claimed by only one of two ready sites and is released before pickup", () => {
  const state = createClearing();
  step(state, colony, [chop("oak-1")]);
  until(state, (s) => s.felled === 1);
  step(state, colony, [
    build("wall", 5, 5),
    build("wall", 7, 5),
    build("wall", 9, 5),
    build("wall", 11, 5),
    build("wall", 13, 5),
  ]);
  until(state, (s) => s.jobs.length === 0);
  assert.equal(
    state.sites.filter((site) => site.finishedAt !== null).length,
    5,
  );
  assert.equal(
    state.sites.reduce((n, site) => n + site.delivered, 0),
    5,
  );
  assert.equal(looseWood(state), 1);

  step(state, colony, [{ kind: "recruit", party: "home", actor: "sedge" }]);
  step(state, colony, [build("roof", 5, 5), build("roof", 7, 5)]);
  const claims = Object.entries(state.claims);
  assert.equal(claims.length, 1);
  const [claimant, claim] = claims[0];
  assert.equal(claim.amount, 1);
  assert.equal(looseWood(state), 1);
  assert.equal(state.actors[claimant].task?.kind, "pickup");
  assert.equal(state.actors[claimant].cargo, null);
  const waiting = state.jobs.find((job) => job.id !== claim.job);
  assert.ok(waiting);

  step(state, colony, [{ kind: "cancel", job: claim.job }]);
  assert.equal(
    state.jobs.some((job) => job.id === claim.job),
    false,
  );
  assert.equal(
    state.sites.some((site) => site.id === claim.site),
    false,
  );
  assert.equal(looseWood(state), 1);
  const reassigned = Object.values(state.claims);
  assert.equal(reassigned.length, 1);
  assert.equal(reassigned[0].job, waiting.id);
  assert.equal(reassigned[0].amount, 1);
  conserved(state);
});

test("a direct selected-person order drops picked-up cargo and keeps the interrupted job", () => {
  const state = createClearing();
  step(state, colony, [chop("oak-1")]);
  until(state, (s) => s.felled === 1);
  step(state, colony, [{ kind: "recruit", party: "home", actor: "sedge" }]);
  step(state, colony, [{ ...build("wall", 7, 5), actors: ["rowan"] }]);
  until(state, (s) => s.actors.rowan.cargo !== null);
  const rowan = state.actors.rowan;
  const interrupted = rowan.cargo.job;
  const site = rowan.cargo.site;
  const amount = rowan.cargo.amount;
  const dropAt = { x: rowan.x, z: rowan.z, level: rowan.level };
  const before = new Map(state.piles.map((pile) => [pile.id, pile.amount]));

  step(state, colony, [{ ...chop("oak-2"), actors: ["rowan"], direct: true }]);
  assert.equal(rowan.cargo, null);
  assert.ok(state.jobs.some((job) => job.id === interrupted));
  assert.equal(
    state.sites.find((candidate) => candidate.id === site).delivered,
    0,
  );
  assert.equal(rowan.task?.kind, "chop");
  assert.notEqual(rowan.task?.job, interrupted);
  const dropped = state.piles.find(
    (pile) =>
      sameCell(pile, dropAt) &&
      pile.amount - (before.get(pile.id) ?? 0) === amount,
  );
  assert.ok(dropped);
  assert.notEqual(route(rowan, dropped, blockedCells(state)), null);
  conserved(state);

  until(state, (s) => s.jobs.length === 0);
  assert.equal(state.felled, 2);
  assert.notEqual(
    state.sites.find((candidate) => candidate.id === site).finishedAt,
    null,
  );
  assert.equal(looseWood(state), 11);
});

test("two rest orders share one sheltered bed without occupying it twice", () => {
  const state = createClearing();
  step(state, colony, [
    ...homeOrders(),
    chop("oak-1"),
    chop("oak-2"),
    chop("oak-3"),
    chop("oak-4"),
  ]);
  until(state, (s) => s.jobs.length === 0);
  step(state, colony, [{ kind: "recruit", party: "home", actor: "sedge" }]);
  step(state, colony, [{ kind: "rest", party: "home", actors: null }]);
  run(state, 1);
  const sleepers = Object.values(state.actors).filter(
    (person) => person.task?.kind === "sleep",
  );
  assert.equal(sleepers.length, 1);
  until(state, (s) => s.rested >= 1);
  until(state, (s) => s.rested >= 2);
  assert.equal(
    Object.values(state.actors).filter(
      (person) => person.task?.kind === "sleep",
    ).length,
    0,
  );
});

test("two-person pause, reset and equal-tick replay preserve the full roster state", () => {
  const seed = 29;
  const initial = createClearing(seed);
  const state = createClearing(seed);
  const commands = new Map([
    [
      0,
      [
        { kind: "recruit", party: "home", actor: "sedge" },
        chop("oak-1"),
        chop("oak-2"),
      ],
    ],
  ]);
  run(state, 1, commands);
  const active = Object.values(state.actors).map((person) => person.assignment);
  assert.equal(active.filter(Boolean).length, 2);
  assert.equal(
    new Set(active.map((assignment) => assignment?.character)).size,
    2,
  );
  assert.equal(new Set(active.map((assignment) => assignment?.task)).size, 2);
  run(state, 12);
  state.paused = true;
  const frozen = structuredClone(state);
  run(state, 50);
  assert.deepEqual(state, frozen);
  state.paused = false;
  until(state, (candidate) => candidate.jobs.length === 0);
  assert.equal(state.felled, 2);

  const recorded = new Map();
  for (const { tick, ...command } of state.commands) {
    if (!recorded.has(tick)) recorded.set(tick, []);
    recorded.get(tick).push(command);
  }
  assert.equal(recorded.get(0).length, 3);
  assert.deepEqual(run(createClearing(seed), state.tick, recorded), state);
  assert.deepEqual(createClearing(seed), initial);
  assert.deepEqual(createClearing(seed).parties.home.members, ["rowan"]);
});

test("canceling a roof over a finished wall refunds delivered wood to a reachable pile", () => {
  const state = createClearing();
  step(state, colony, [chop("oak-1")]);
  until(state, (s) => s.felled === 1);
  step(state, colony, [build("wall", 7, 5)]);
  until(state, (s) => s.sites[0]?.finishedAt !== null);
  step(state, colony, [build("roof", 7, 5)]);
  until(state, (s) => s.sites[1]?.delivered > 0);
  const wall = state.sites[0],
    roof = state.sites[1],
    delivered = roof.delivered;
  const before = new Map(state.piles.map((pile) => [pile.id, pile.amount]));
  step(state, colony, [
    {
      kind: "cancel",
      job: state.jobs.find((job) => job.target === roof.id).id,
    },
  ]);
  assert.equal(
    state.sites.some((site) => site.id === roof.id),
    false,
  );
  const refunds = state.piles.filter(
    (pile) => pile.amount > (before.get(pile.id) ?? 0),
  );
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].amount - (before.get(refunds[0].id) ?? 0), delivered);
  assert.equal(sameCell(refunds[0], wall), false);
  const refundRoute = route(
    state.actors.rowan,
    refunds[0],
    blockedCells(state),
  );
  assert.notEqual(refundRoute, null);
  for (const cell of refundRoute)
    assert.equal(blockedCells(state).has(cellKey(cell)), false);
  conserved(state);
});
