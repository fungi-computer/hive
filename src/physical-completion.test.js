import { placementFooting } from "./game-space.ts";
import { interruptWork } from "./activity-lifecycle.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { createClearing, advanceTicks } from "./clearing.ts";
import { readFileSync } from "node:fs";
import { loadOptimizer } from "./engine/colony/loader.ts";
import { advanceWork } from "./activity.ts";
import { admitCommand } from "./orders.ts";
import { snapshotFor, restoreSnapshot } from "./clearing-state.ts";
import {
  BUILDINGS,
  constructionBuffer,
  shelfContainer,
} from "./construction.js";
import {
  settlePhysicalEdit,
  TERRAIN_WORK_TICKS,
} from "./physical-completion.ts";
import { terrainRimCells } from "./world.js";
import { terrainColumn, terrainFacts } from "./terrain.ts";
import { STEP_SECONDS } from "./ticker.js";

const scope = { party: "home", actors: null };
const cell = (x, z) => placementFooting({ x, z, level: 0 });
function structure(state, type = "shelf", finished = true) {
  const site = {
    id: "test-site",
    type,
    x: 9,
    z: 9,
    level: 0,
    direction: 0,
    work: finished ? BUILDINGS[type].ticks : BUILDINGS[type].ticks - 1,
    finishedAt: finished ? 0 : null,
  };
  state.sites.push(site);
  state.felled = 1;
  state.materials.lots.push({
    id: "remaining-wood",
    material: "wood",
    quantity: 6 - BUILDINGS[type].wood,
    location: { kind: "ground", ...cell(4, 4) },
  });
  if (finished)
    state.materials.embedded.push({
      container: constructionBuffer(site).id,
      material: "wood",
      quantity: BUILDINGS[type].wood,
    });
  else
    state.materials.lots.push({
      id: "build-wood",
      material: "wood",
      quantity: BUILDINGS[type].wood,
      location: { kind: "container", container: constructionBuffer(site).id },
    });
  return site;
}
function worker(state, kind, target, duration, at = cell(9, 8)) {
  const job = {
    lifecycle: "active",
    id: "test-job",
    kind,
    target,
    scope,
    reason: "Ordered",
    routine: false,
  };
  state.jobs.push(job);
  const actor = state.actors.rowan;
  Object.assign(actor, at, {
    mode: kind,
    work: duration - 1,
    task: { kind, job: job.id, target, duration },
    assignment: { character: actor.id, task: job.id, cost: 0 },
  });
  return { actor, job };
}
function settle(state, job = "test-job") {
  return settlePhysicalEdit(state, { actorId: "rowan", jobId: job });
}
function currentSave(state) {
  return restoreSnapshot(snapshotFor(state)).state;
}

function shelfFixture() {
  const state = createClearing();
  state.parties.home.members.push("sedge");
  const site = structure(state);
  const { actor, job } = worker(
    state,
    "deconstruct",
    site.id,
    BUILDINGS.shelf.deconstructTicks,
  );
  state.harvestedHerbs = 2;
  state.materials.lots.push(
    {
      id: "stored-herb",
      material: "mugwort",
      quantity: 1,
      location: { kind: "container", container: shelfContainer(site.id).id },
    },
    {
      id: "carried-herb",
      material: "mugwort",
      quantity: 1,
      location: { kind: "hand", actor: "sedge" },
    },
  );
  state.jobs.push({
    lifecycle: "active",
    id: "store-job",
    kind: "store",
    source: "carried-herb",
    destination: shelfContainer(site.id).id,
    scope,
    reason: "Ordered",
    routine: false,
  });
  state.materials.transfers.push({
    id: "store-transfer",
    actor: "sedge",
    owner: { kind: "job", job: "store-job", step: "shelf-store" },
    request: {
      source: { kind: "exact-lot", lot: "carried-herb" },
      quantityPolicy: "whole-lot",
      quantity: 1,
    },
    intent: { kind: "deliver", destination: shelfContainer(site.id).id },
    resolvedMaterial: "mugwort",
    phase: { kind: "carrying", lot: "carried-herb" },
  });
  Object.assign(state.actors.sedge, {
    mode: "transfer",
    task: {
      kind: "transfer",
      job: "store-job",
      target: "store-transfer",
      duration: 8,
    },
    assignment: { character: "sedge", task: "store-job", cost: 0 },
  });
  return { state, site, actor, job };
}

test("one live finished deconstruction target at admission and current restore", () => {
  const state = createClearing(),
    site = structure(state);
  state.paused = true;
  const command = { kind: "deconstruct", site: site.id, ...scope };
  const admitted = admitCommand(state, command);
  assert.equal(admitted.status, "applied");
  const before = JSON.stringify(state);
  assert.equal(admitCommand(state, command).status, "rejected");
  assert.equal(JSON.stringify(state), before);
  currentSave(state);
  state.jobs.push({ ...state.jobs[0], id: "duplicate-job" });
  assert.throws(() => snapshotFor(state), /already marked for removal/);
  state.jobs.pop();
  state.jobs[0].target = "missing-site";
  assert.throws(() => snapshotFor(state), /live finished structure/);
  assert.equal(
    admitCommand(state, { ...command, site: "missing-site" }).status,
    "rejected",
  );
});

test("late shelf salvage allocator failure publishes neither ejection nor related cleanup; retry settles once", () => {
  const { state, site, actor } = shelfFixture();
  currentSave(state);
  const materials = state.materials,
    other = state.actors.sedge;
  const allocator = materials.nextLotId;
  materials.nextLotId = Number.MAX_SAFE_INTEGER;
  const before = JSON.stringify(state);
  assert.throws(() => settle(state), /invalid-allocator/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(state.materials, materials);
  assert.equal(state.actors.rowan, actor);
  assert.equal(state.actors.sedge, other);
  assert.equal(state.sites[0], site);
  materials.nextLotId = allocator;
  assert.equal(settle(state).status, "completed");
  assert.equal(state.materials, materials);
  for (const id of ["stored-herb", "carried-herb"])
    assert.equal(
      materials.lots.find((lot) => lot.id === id).location.kind,
      "ground",
    );
  assert.equal(materials.transfers.length, 0);
  assert.equal(other.task, null);
  assert.equal(other.assignment, null);
  assert.equal(state.jobs.length, 0);
  assert.equal(state.sites.length, 0);
  assert.equal(state.finishedJobs, 1);
  currentSave(state);
  const completed = JSON.stringify(state);
  assert.equal(settle(state).status, "invalid");
  assert.equal(JSON.stringify(state), completed);
});

test("incomplete construction waits at its last tick, survives interruption/reload, and retries once", () => {
  const state = createClearing(),
    site = structure(state, "wall", false);
  const { actor, job } = worker(state, "build", site.id, BUILDINGS.wall.ticks);
  const wood = state.materials.lots.find((lot) => lot.id === "build-wood");
  wood.location = { kind: "ground", ...cell(4, 4) };
  advanceWork(state, actor);
  assert.equal(site.work, BUILDINGS.wall.ticks - 1);
  assert.equal(actor.work, BUILDINGS.wall.ticks - 1);
  assert.equal(actor.task.job, job.id);
  assert.equal(state.materials.embedded.length, 0);
  currentSave(state);
  interruptWork(state, actor);
  assert.equal(site.work, BUILDINGS.wall.ticks - 1);
  assert.equal(BUILDINGS.wall.ticks - site.work, 1);
  const loaded = currentSave(state);
  loaded.paused = false;
  const resumed = loaded.actors.rowan;
  Object.assign(resumed, {
    mode: "build",
    work: 0,
    task: { kind: "build", job: job.id, target: site.id, duration: 1 },
    assignment: { character: "rowan", task: job.id, cost: 0 },
  });
  loaded.materials.lots.find((lot) => lot.id === "build-wood").location = {
    kind: "container",
    container: constructionBuffer(site).id,
  };
  assert.equal(settle(loaded).status, "completed");
  assert.equal(loaded.sites[0].finishedAt, loaded.tick);
  assert.equal(loaded.materials.embedded.length, 1);
  currentSave(loaded);
});

test("current saves reject already-complete unfinished work and misidentified workers cannot settle", () => {
  const state = createClearing(),
    site = structure(state, "wall", false);
  const { actor } = worker(state, "build", site.id, BUILDINGS.wall.ticks);
  site.work = BUILDINGS.wall.ticks;
  assert.throws(() => snapshotFor(state), /unfinished structure/);
  site.work--;
  actor.assignment.character = "sedge";
  const before = JSON.stringify(state);
  assert.equal(settle(state).status, "invalid");
  assert.equal(JSON.stringify(state), before);
  actor.assignment.character = actor.id;
  actor.mode = "idle";
  assert.equal(settle(state).status, "invalid");
});

test("excavation allocator failure preserves terrain and final progress, successful retry exports once", () => {
  const state = createClearing(),
    voxel = [0, 14, 128];
  const { actor, job } = worker(
    state,
    "dig",
    "unused",
    TERRAIN_WORK_TICKS,
    terrainRimCells(state, placementFooting(terrainColumn(voxel)))[0],
  );
  delete job.target;
  job.voxel = voxel;
  actor.task.target = job.id;
  const materials = state.materials,
    terrain = state.terrain,
    allocator = materials.nextLotId;
  materials.nextLotId = Number.MAX_SAFE_INTEGER;
  const before = JSON.stringify(state);
  assert.throws(() => settle(state), /invalid-allocator/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(state.terrain, terrain);
  assert.equal(state.materials, materials);
  materials.nextLotId = allocator;
  assert.equal(settle(state).status, "completed");
  assert.equal(state.terrain.exports.length, 1);
  assert.equal(
    materials.lots.filter((lot) => lot.material === "soil").length,
    1,
  );
  assert.equal(state.finishedJobs, 1);
  currentSave(state);
});

test("transient upstairs occupancy waits without resetting progress or invalidating admitted save", () => {
  const state = createClearing(),
    site = structure(state, "stair");
  const { actor } = worker(
    state,
    "deconstruct",
    site.id,
    BUILDINGS.stair.deconstructTicks,
  );
  Object.assign(
    state.actors.sedge,
    placementFooting({ x: 9, z: 11, level: 1 }),
  );
  const progress = actor.work;
  advanceWork(state, actor);
  assert.equal(actor.work, progress);
  assert.equal(actor.task.job, "test-job");
  assert.equal(state.sites[0], site);
  assert.match(state.jobs[0].reason, /upstairs/);
  currentSave(state);
  Object.assign(state.actors.sedge, cell(10, 12));
  assert.equal(settle(state).status, "completed");
  currentSave(state);
});

test("paused final work is inert and unfinished deconstruction targets are rejected", () => {
  const state = createClearing(),
    site = structure(state, "wall", false);
  assert.equal(
    admitCommand(state, { kind: "deconstruct", site: site.id, ...scope })
      .status,
    "rejected",
  );
  worker(state, "deconstruct", site.id, BUILDINGS.wall.deconstructTicks);
  assert.throws(() => snapshotFor(state), /live finished structure/);
  state.jobs = [];
  const actor = state.actors.rowan;
  actor.task = null;
  actor.assignment = null;
  worker(state, "build", site.id, BUILDINGS.wall.ticks);
  state.paused = true;
  const before = JSON.stringify(state);
  assert.equal(settle(state).status, "waiting");
  assert.equal(JSON.stringify(state), before);
});

test("one waiting final build preserves another actor and the actual clock/terrain tick", async () => {
  const optimizer = await loadOptimizer(
    await WebAssembly.compile(
      readFileSync(new URL("./engine/colony/colony.wasm", import.meta.url)),
    ),
  );
  // Authored valid work frontier, not a claim that these jobs were earned by
  // preceding simulation: Rowan is at the last build tick, Sedge is chopping.
  const state = createClearing(),
    site = structure(state, "wall", false);
  const { job } = worker(state, "build", site.id, BUILDINGS.wall.ticks);
  state.materials.lots.find((lot) => lot.id === "build-wood").location = {
    kind: "ground",
    ...cell(4, 4),
  };
  state.parties.home.members.push("sedge");
  const tree = state.trees[0];
  tree.work = 5;
  state.jobs.push({
    lifecycle: "active",
    id: "chop-job",
    kind: "chop",
    target: tree.id,
    scope,
    reason: "Ordered",
    routine: false,
  });
  Object.assign(
    state.actors.sedge,
    { x: tree.x, y: tree.y, z: tree.z + 1 },
    {
      mode: "chop",
      work: 5,
      task: { kind: "chop", job: "chop-job", target: tree.id, duration: 75 },
      assignment: { character: "sedge", task: "chop-job", cost: 0 },
    },
  );
  currentSave(state);
  const materials = structuredClone(state.materials);
  const initialTime = terrainFacts(state.terrain).timeS;
  advanceTicks(state, optimizer, 1);
  assert.equal(state.tick, 1);
  assert.equal(terrainFacts(state.terrain).timeS, initialTime + STEP_SECONDS);
  assert.equal(
    state.sites.find((candidate) => candidate.id === site.id).work,
    BUILDINGS.wall.ticks - 1,
  );
  assert.equal(
    state.sites.find((candidate) => candidate.id === site.id).finishedAt,
    null,
  );
  assert.equal(state.actors.rowan.work, BUILDINGS.wall.ticks - 1);
  assert.equal(state.actors.rowan.task.job, job.id);
  assert.equal(state.actors.rowan.assignment.task, job.id);
  assert.match(
    state.jobs.find((candidate) => candidate.id === job.id).reason,
    /Waiting for materials/,
  );
  assert.equal(
    state.trees.find((candidate) => candidate.id === tree.id).work,
    6,
  );
  // Chopping owns progress on the tree; actor.work is not a second chop clock.
  assert.equal(state.actors.sedge.work, 5);
  assert.equal(state.actors.sedge.task.job, "chop-job");
  assert.equal(state.actors.sedge.assignment.task, "chop-job");
  assert.equal(state.finishedJobs, 0);
  assert.deepEqual(state.materials, materials);
  currentSave(state);
});

test("prospective wall geometry waits for an existing loose pail without publishing materials", () => {
  const state = createClearing(),
    site = structure(state, "wall", false);
  worker(state, "build", site.id, BUILDINGS.wall.ticks);
  const pail = state.materials.lots.find((lot) => lot.material === "pail");
  const original = structuredClone(pail.location);
  pail.location = { kind: "ground", ...placementFooting(site) };
  currentSave(state);
  const before = JSON.stringify(state);
  assert.equal(settle(state).status, "waiting");
  assert.equal(JSON.stringify(state), before);
  pail.location = original;
  assert.equal(settle(state).status, "completed");
  assert.equal(
    state.materials.lots.find((lot) => lot.id === pail.id).quantity,
    1,
  );
  currentSave(state);
});
