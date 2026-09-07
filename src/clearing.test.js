import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createClearing, step as advance } from "./clearing.ts";
import { cellKey, blockedCells, sameCell } from "./world.js";
import { route } from "./movement.js";
import { DAY_TICKS } from "./routine.ts";
import { looseWood } from "./resources.ts";
import { shelteredBeds } from "./construction.js";
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
    commands.map((command) => ({
      party: "home",
      actors: null,
      level: 0,
      ...command,
    })),
  );
}

function conserved(state) {
  assert.equal(
    looseWood(state) +
      Object.values(state.actors).reduce(
        (n, person) => n + (person.cargo?.amount ?? 0),
        0,
      ) +
      state.sites.reduce((n, s) => n + s.delivered, 0),
    state.felled * 6,
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
const build = (type, x, z, direction = 0) => ({
  kind: "build",
  type,
  x,
  z,
  direction,
});
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
