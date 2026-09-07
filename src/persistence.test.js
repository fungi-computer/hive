import test from "node:test";
import assert from "node:assert/strict";
import { createClearing, step as advance } from "./clearing.ts";
import { CHOP_TICKS } from "./activity.ts";
import { BUILDINGS } from "./construction.js";
import {
  decideReplaceRevision,
  decideSaveRevision,
  restoreSnapshot,
  snapshotFor,
  validateClearing,
  validateSaveEnvelope,
} from "./persistence.ts";

test("save revision admission distinguishes a missing slot from malformed bytes", () => {
  assert.deepEqual(decideSaveRevision(undefined, 0), {
    kind: "write",
    revision: 1,
  });
  assert.deepEqual(decideSaveRevision(undefined, 3), {
    kind: "stale",
    currentRevision: 0,
  });
  assert.deepEqual(decideSaveRevision({ schema: "unknown" }, 0), {
    kind: "malformed",
  });
  assert.deepEqual(decideSaveRevision({ revision: 4 }, 3), {
    kind: "malformed",
  });
  const valid = snapshotFor(createClearing());
  valid.revision = 4;
  assert.deepEqual(decideSaveRevision(valid, 3), {
    kind: "stale",
    currentRevision: 4,
  });
  assert.deepEqual(decideReplaceRevision(undefined, 0), {
    kind: "write",
    revision: 1,
  });
  assert.deepEqual(decideReplaceRevision(undefined, 0, "discardMalformed"), {
    kind: "stale",
    currentRevision: 0,
  });
  assert.deepEqual(decideReplaceRevision({ revision: 4 }, 0), {
    kind: "malformed",
  });
  assert.deepEqual(
    decideReplaceRevision({ revision: 4 }, 0, "discardMalformed"),
    {
      kind: "write",
      revision: 1,
    },
  );
  assert.deepEqual(decideReplaceRevision(valid, 4), {
    kind: "write",
    revision: 5,
  });
  assert.deepEqual(decideReplaceRevision(valid, 3), {
    kind: "stale",
    currentRevision: 4,
  });
  assert.deepEqual(decideReplaceRevision(valid, 4, "discardMalformed"), {
    kind: "stale",
    currentRevision: 4,
  });
});

test("snapshot omits command history and restores a paused fresh trace", () => {
  const state = createClearing();
  state.commands.push({
    kind: "recruit",
    party: "home",
    actor: "sedge",
    tick: 0,
  });
  const envelope = snapshotFor(state);

  assert.equal("commands" in envelope.savedState, false);
  const restored = restoreSnapshot(envelope);
  assert.deepEqual(restored.state.commands, []);
  assert.equal(restored.state.paused, true);
  assert.deepEqual(state.commands, [
    { kind: "recruit", party: "home", actor: "sedge", tick: 0 },
  ]);
});

test("Garden work toggles validate in the v4 live command history", () => {
  const state = createClearing();
  state.paused = true;
  const [result] = advance(state, {}, [
    {
      kind: "work",
      party: "home",
      actors: null,
      work: "garden",
      enabled: false,
    },
  ]);
  assert.deepEqual(result, { status: "applied" });
  assert.equal(state.commands[0].work, "garden");
  assert.equal(validateClearing(state).commands[0].work, "garden");
});

test("schema 5 persists drafted state and typed draft/Go replay history", () => {
  const state = createClearing();
  state.actors.rowan.drafted = true;
  state.actors.rowan.mode = "walk";
  state.actors.rowan.path = [{ x: 8, z: 10, level: 0 }];
  state.commands.push(
    { kind: "draft", party: "home", actor: "rowan", tick: 0 },
    {
      kind: "go",
      party: "home",
      actor: "rowan",
      target: { x: 8, z: 10, level: 0 },
      tick: 0,
    },
  );
  validateClearing(state);
  const envelope = snapshotFor(state);
  assert.equal(envelope.schema, 5);
  assert.equal(envelope.savedState.actors.rowan.drafted, true);
  const restored = restoreSnapshot(envelope).state;
  assert.equal(restored.actors.rowan.drafted, true);
  assert.equal(restored.actors.rowan.mode, "walk");
  assert.deepEqual(restored.actors.rowan.path, [{ x: 8, z: 10, level: 0 }]);
  assert.deepEqual(restored.commands, []);
  assert.throws(() => {
    const missing = structuredClone(envelope);
    delete missing.savedState.actors.rowan.drafted;
    validateSaveEnvelope(missing);
  }, /Invalid input/);
});

test("strict schema 1 through 3 normalize garden, herbs, and drafted state", () => {
  const v4 = snapshotFor(createClearing());
  const v3 = structuredClone(v4);
  v3.schema = 3;
  delete v3.savedState.herbs;
  delete v3.savedState.herbBundles;
  delete v3.savedState.harvestedHerbs;
  delete v3.savedState.herbStorageClaims;
  for (const actor of Object.values(v3.savedState.actors))
    delete actor.allowedWork.garden;
  const v2 = structuredClone(v3);
  v2.schema = 2;
  for (const actor of Object.values(v2.savedState.actors)) delete actor.drafted;
  const v1 = structuredClone(v2);
  v1.schema = 1;
  delete v1.savedState.consumedWood;

  const restoredV1 = restoreSnapshot(v1);
  assert.equal(restoredV1.state.consumedWood, 0);
  assert.equal(restoredV1.state.actors.rowan.drafted, false);
  assert.equal(restoredV1.state.actors.rowan.allowedWork.garden, true);
  assert.deepEqual(restoredV1.state.herbs, []);
  assert.deepEqual(restoredV1.state.herbBundles, []);
  assert.equal(restoredV1.state.harvestedHerbs, 0);
  assert.equal(restoredV1.state.paused, true);
  const restoredV2 = restoreSnapshot(v2);
  assert.equal(restoredV2.state.actors.rowan.drafted, false);
  const restoredV3 = restoreSnapshot(v3);
  assert.equal(restoredV3.state.actors.rowan.allowedWork.garden, true);
  const rewritten = snapshotFor(restoredV1.state);
  assert.equal(rewritten.schema, 5);
  assert.equal(rewritten.savedState.consumedWood, 0);
  assert.equal(rewritten.savedState.actors.rowan.drafted, false);
  assert.equal(rewritten.savedState.actors.rowan.allowedWork.garden, true);
  assert.equal(validateSaveEnvelope(v1).schema, 1);
  assert.equal(validateSaveEnvelope(v2).schema, 2);
  assert.equal(validateSaveEnvelope(v3).schema, 3);
});

test("strict v4 ground bundles normalize to v5 locations without mutating the old envelope", () => {
  const state = structuredClone(createClearing());
  state.tick = 20;
  state.felled = 1;
  state.trees[0].work = CHOP_TICKS;
  state.trees[0].felledAt = 8;
  state.piles.push({ id: "wood-2", x: 8, z: 9, level: 0, amount: 6 });
  state.herbs.push({
    id: "herb-1",
    kind: "mugwort",
    x: 8,
    z: 9,
    level: 0,
    stage: "planted",
    work: 0,
    plantedAt: 20,
  });
  state.herbBundles.push({
    id: "herb-bundle-2",
    kind: "mugwort",
    amount: 1,
    location: { kind: "ground", x: 8, z: 9, level: 0 },
  });
  state.harvestedHerbs = 1;
  state.nextId = 3;
  const v5 = snapshotFor(state);
  const v4 = structuredClone(v5);
  v4.schema = 4;
  delete v4.savedState.herbStorageClaims;
  v4.savedState.herbBundles = v4.savedState.herbBundles.map((bundle) => ({
    id: bundle.id,
    kind: bundle.kind,
    amount: bundle.amount,
    x: bundle.location.x,
    z: bundle.location.z,
    level: bundle.location.level,
  }));
  const beforeLoad = structuredClone(v4);
  const restored = restoreSnapshot(v4).state;
  assert.deepEqual(v4, beforeLoad);
  assert.deepEqual(restored.herbBundles[0].location, {
    kind: "ground",
    x: 8,
    z: 9,
    level: 0,
  });
  assert.deepEqual(restored.herbStorageClaims, {});
});

test("Store command history is strictly shared-only in v5", () => {
  const base = createClearing();
  const valid = structuredClone(base);
  valid.commands.push({
    kind: "store-herb",
    party: "home",
    actors: null,
    bundle: "herb-bundle-1",
    shelf: "site-1",
    tick: 0,
  });
  validateClearing(valid);

  const personal = structuredClone(base);
  personal.commands.push({
    kind: "store-herb",
    party: "home",
    actors: ["rowan"],
    bundle: "herb-bundle-1",
    shelf: "site-1",
    tick: 0,
  });
  assert.throws(() => validateClearing(personal), /Invalid input/);

  const direct = structuredClone(base);
  direct.commands.push({
    kind: "store-herb",
    party: "home",
    actors: null,
    direct: true,
    bundle: "herb-bundle-1",
    shelf: "site-1",
    tick: 0,
  });
  assert.throws(() => validateClearing(direct), /direct/);
});

test("herb persistence accepts planted elapsed zero and rejects an orphaned order", () => {
  const planted = structuredClone(createClearing());
  planted.herbs.push({
    id: "herb-1",
    kind: "mugwort",
    x: 7,
    z: 9,
    level: 0,
    stage: "planted",
    work: 0,
    plantedAt: 0,
  });
  planted.nextId = 2;
  validateClearing(planted);

  const ordered = structuredClone(createClearing());
  ordered.herbs.push({
    id: "herb-1",
    kind: "mugwort",
    x: 7,
    z: 9,
    level: 0,
    stage: "ordered",
    work: 0,
    plantedAt: null,
  });
  ordered.jobs.push({
    id: "job-2",
    kind: "sow",
    target: "herb-1",
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  ordered.nextId = 3;
  validateClearing(ordered);
  ordered.jobs = [];
  assert.throws(() => validateClearing(ordered), /no sow job/);
});

test("schema 5 snapshot restores ordered, growing, ready, and bundled herb facts", () => {
  const ordered = structuredClone(createClearing());
  ordered.herbs.push({
    id: "herb-1",
    kind: "mugwort",
    x: 7,
    z: 9,
    level: 0,
    stage: "ordered",
    work: 7,
    plantedAt: null,
  });
  ordered.jobs.push({
    id: "job-2",
    kind: "sow",
    target: "herb-1",
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  ordered.nextId = 3;
  const orderedRestored = restoreSnapshot(snapshotFor(ordered)).state;
  assert.equal(orderedRestored.herbs[0].stage, "ordered");
  assert.equal(orderedRestored.herbs[0].work, 7);
  assert.equal(orderedRestored.jobs[0].target, "herb-1");

  const growing = structuredClone(createClearing());
  growing.tick = 100;
  growing.herbs.push({
    id: "herb-1",
    kind: "mugwort",
    x: 7,
    z: 9,
    level: 0,
    stage: "growing",
    work: 0,
    plantedAt: 0,
  });
  growing.nextId = 2;
  assert.equal(
    restoreSnapshot(snapshotFor(growing)).state.herbs[0].stage,
    "growing",
  );

  const ready = structuredClone(createClearing());
  ready.tick = 240;
  ready.herbs.push({
    id: "herb-1",
    kind: "mugwort",
    x: 7,
    z: 9,
    level: 0,
    stage: "ready",
    work: 4,
    plantedAt: 0,
  });
  ready.herbBundles.push({
    id: "herb-bundle-2",
    kind: "mugwort",
    amount: 1,
    location: { kind: "ground", x: 8, z: 9, level: 0 },
  });
  ready.harvestedHerbs = 1;
  ready.nextId = 4;
  ready.jobs.push({
    id: "job-3",
    kind: "harvest",
    target: "herb-1",
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  const readyRestored = restoreSnapshot(snapshotFor(ready)).state;
  assert.equal(readyRestored.herbs[0].stage, "ready");
  assert.equal(readyRestored.herbs[0].work, 4);
  assert.equal(readyRestored.herbBundles[0].amount, 1);
  assert.equal(readyRestored.harvestedHerbs, 1);
  assert.equal(readyRestored.jobs[0].kind, "harvest");
});

test("schema 5 accepts a finished target and deconstruction job", () => {
  const state = structuredClone(createClearing());
  state.tick = 10;
  state.felled = 1;
  state.trees[0].work = CHOP_TICKS;
  state.trees[0].felledAt = 8;
  state.nextId = 3;
  state.piles.push({ id: "wood-2", x: 4, z: 5, level: 0, amount: 5 });
  state.sites.push({
    id: "site-1",
    type: "wall",
    x: 5,
    z: 5,
    level: 0,
    direction: 0,
    delivered: 1,
    work: BUILDINGS.wall.ticks,
    finishedAt: 9,
  });
  state.jobs.push({
    id: "job-2",
    kind: "deconstruct",
    target: "site-1",
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  state.actors.rowan.task = {
    kind: "deconstruct",
    job: "job-2",
    target: "site-1",
    duration: BUILDINGS.wall.deconstructTicks,
  };
  state.actors.rowan.assignment = {
    character: "rowan",
    task: "job-2",
    cost: 4,
  };
  state.actors.rowan.mode = "walk";
  validateClearing(state);
  const envelope = snapshotFor(state);
  assert.equal(envelope.schema, 5);
  assert.equal(restoreSnapshot(envelope).state.jobs[0].kind, "deconstruct");

  const draftedWorker = structuredClone(envelope);
  draftedWorker.savedState.actors.rowan.drafted = true;
  assert.throws(
    () => restoreSnapshot(draftedWorker),
    /drafted actor rowan retains ordinary work/,
  );

  const v2 = structuredClone(envelope);
  v2.schema = 2;
  delete v2.savedState.herbs;
  delete v2.savedState.herbBundles;
  delete v2.savedState.harvestedHerbs;
  delete v2.savedState.herbStorageClaims;
  for (const actor of Object.values(v2.savedState.actors)) {
    delete actor.drafted;
    delete actor.allowedWork.garden;
  }
  assert.equal(restoreSnapshot(v2).state.jobs[0].kind, "deconstruct");

  const duplicate = structuredClone(envelope);
  duplicate.savedState.jobs.push({
    ...duplicate.savedState.jobs[0],
    id: "job-3",
  });
  assert.throws(
    () => restoreSnapshot(duplicate),
    /duplicate deconstruction jobs/,
  );

  const withCargo = structuredClone(state);
  withCargo.actors.rowan.cargo = {
    job: "job-2",
    site: "site-1",
    amount: 1,
  };
  assert.throws(() => validateClearing(withCargo), /deconstruct task/);
  const withClaim = structuredClone(state);
  withClaim.claims.rowan = {
    job: "job-2",
    pile: "wood-2",
    site: "site-1",
    amount: 1,
  };
  assert.throws(() => validateClearing(withClaim), /deconstruct task/);
});

test("schema rejects unknown versions and broken cross references", () => {
  const envelope = snapshotFor(createClearing());
  assert.throws(
    () => validateSaveEnvelope({ ...envelope, schema: 99 }),
    /Invalid input/,
  );

  const broken = structuredClone(createClearing());
  broken.jobs.push({
    id: "job-1",
    kind: "chop",
    target: "oak-missing",
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  assert.throws(() => validateClearing(broken), /missing tree/);

  const tasklessWalker = structuredClone(createClearing());
  tasklessWalker.actors.rowan.mode = "walk";
  tasklessWalker.actors.rowan.path = [{ x: 8, z: 10, level: 0 }];
  assert.throws(
    () => validateClearing(tasklessWalker),
    /actor rowan has a mode without a task/,
  );
});

test("schema preserves active cargo, claims, progress, path and ordered jobs", () => {
  const state = structuredClone(createClearing());
  state.tick = 10;
  state.felled = 1;
  state.trees[0].work = CHOP_TICKS;
  state.trees[0].felledAt = 8;
  state.nextId = 4;
  state.sites.push({
    id: "site-1",
    type: "door",
    x: 5,
    z: 5,
    level: 0,
    direction: 0,
    delivered: 0,
    work: 0,
    finishedAt: null,
  });
  state.jobs.push({
    id: "job-2",
    kind: "build",
    target: "site-1",
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  state.piles.push({ id: "wood-3", x: 4, z: 5, level: 0, amount: 6 });
  state.claims.rowan = {
    job: "job-2",
    pile: "wood-3",
    site: "site-1",
    amount: 2,
  };
  state.actors.rowan.task = {
    kind: "pickup",
    job: "job-2",
    target: "wood-3",
    duration: 8,
  };
  state.actors.rowan.assignment = {
    character: "rowan",
    task: "job-2",
    cost: 12,
  };
  state.actors.rowan.mode = "walk";
  state.actors.rowan.path = [{ x: 7, z: 9, level: 0 }];
  state.actors.rowan.leg = 3;
  state.actors.rowan.work = 2;
  state.jobs.push({
    id: "job-3",
    kind: "rest",
    target: "rowan",
    scope: { party: "home", actors: ["rowan"] },
    reason: "Later",
    routine: false,
  });
  state.feed.sequence = 1;
  state.feed.nextAt = 300;
  state.demand = { kind: "demand", name: "Bramble", tick: 50, text: "A roof." };

  const parsed = validateClearing(state);
  assert.deepEqual(
    parsed.jobs.map((job) => job.id),
    ["job-2", "job-3"],
  );
  const restored = restoreSnapshot(snapshotFor(state)).state;
  assert.deepEqual(restored.actors.rowan.path, [{ x: 7, z: 9, level: 0 }]);
  assert.deepEqual(restored.claims.rowan, state.claims.rowan);
  assert.equal(restored.sites[0].work, 0);
  assert.equal(restored.feed.nextAt, 300);
});

function activeBuildState() {
  const state = structuredClone(createClearing());
  state.tick = 10;
  state.felled = 1;
  state.trees[0].work = CHOP_TICKS;
  state.trees[0].felledAt = 8;
  state.nextId = 4;
  state.sites.push({
    id: "site-1",
    type: "door",
    x: 5,
    z: 5,
    level: 0,
    direction: 0,
    delivered: 0,
    work: 0,
    finishedAt: null,
  });
  state.jobs.push({
    id: "job-2",
    kind: "build",
    target: "site-1",
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  state.piles.push({ id: "wood-3", x: 4, z: 5, level: 0, amount: 6 });
  state.claims.rowan = {
    job: "job-2",
    pile: "wood-3",
    site: "site-1",
    amount: 2,
  };
  state.actors.rowan.task = {
    kind: "pickup",
    job: "job-2",
    target: "wood-3",
    duration: 8,
  };
  state.actors.rowan.assignment = {
    character: "rowan",
    task: "job-2",
    cost: 12,
  };
  state.actors.rowan.mode = "walk";
  return state;
}

function activeBuildWorkState() {
  const state = activeBuildState();
  state.claims = {};
  state.actors.rowan.task = null;
  state.actors.rowan.assignment = null;
  state.actors.rowan.mode = "idle";
  state.sites[0].delivered = 2;
  state.sites[0].work = 7;
  state.piles[0].amount = 4;
  return state;
}

test("actor continuation rejects sleep/build target and claim/cargo mismatches", () => {
  const sleepMismatch = activeBuildState();
  sleepMismatch.actors.rowan.task = {
    kind: "sleep",
    job: "job-2",
    target: "site-1",
    duration: 80,
  };
  sleepMismatch.actors.rowan.mode = "sleep";
  assert.throws(() => validateClearing(sleepMismatch), /sleep task disagrees/);

  const buildTargetMismatch = activeBuildState();
  buildTargetMismatch.claims = {};
  buildTargetMismatch.sites.push({
    id: "site-4",
    type: "wall",
    x: 6,
    z: 5,
    level: 0,
    direction: 0,
    delivered: 0,
    work: 0,
    finishedAt: null,
  });
  buildTargetMismatch.actors.rowan.task = {
    kind: "build",
    job: "job-2",
    target: "site-4",
    duration: 32,
  };
  buildTargetMismatch.actors.rowan.mode = "build";
  assert.throws(
    () => validateClearing(buildTargetMismatch),
    /build task disagrees/,
  );

  const claimCargoMismatch = activeBuildState();
  claimCargoMismatch.actors.rowan.cargo = {
    job: "job-2",
    site: "site-1",
    amount: 1,
  };
  assert.throws(
    () => validateClearing(claimCargoMismatch),
    /pickup task disagrees with claim/,
  );

  const personalScopeMismatch = activeBuildState();
  personalScopeMismatch.parties.home.members.push("sedge");
  personalScopeMismatch.jobs[0].scope.actors = ["sedge"];
  assert.throws(
    () => validateClearing(personalScopeMismatch),
    /not in actor scope/,
  );
});

function activeHerbStorageState(location = "ground") {
  const state = structuredClone(createClearing());
  state.tick = 30;
  state.felled = 1;
  state.trees[0].work = CHOP_TICKS;
  state.trees[0].felledAt = 8;
  state.nextId = 4;
  state.piles.push({ id: "wood-3", x: 4, z: 5, level: 0, amount: 5 });
  state.sites.push({
    id: "site-1",
    type: "shelf",
    x: 7,
    z: 10,
    level: 0,
    direction: 0,
    delivered: 1,
    work: BUILDINGS.shelf.ticks,
    finishedAt: 24,
  });
  state.jobs.push({
    id: "job-2",
    kind: "store-herb",
    bundle: "herb-bundle-3",
    shelf: "site-1",
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  state.herbBundles.push({
    id: "herb-bundle-3",
    kind: "mugwort",
    amount: 1,
    location:
      location === "ground"
        ? { kind: "ground", x: 8, z: 10, level: 0 }
        : { kind: "carried", actor: "rowan" },
  });
  state.harvestedHerbs = 1;
  state.herbStorageClaims.rowan = {
    job: "job-2",
    bundle: "herb-bundle-3",
    shelf: "site-1",
  };
  if (location === "ground") {
    state.actors.rowan.task = {
      kind: "pickup-herb",
      job: "job-2",
      target: "herb-bundle-3",
      duration: 8,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-2",
      cost: 4,
    };
    state.actors.rowan.mode = "walk";
  }
  return state;
}

test("v5 restores a herb with a loose bundle and wood pile on one cell", () => {
  const state = activeHerbStorageState();
  state.piles[0].amount = 4;
  state.piles.push({ id: "wood-4", x: 8, z: 10, level: 0, amount: 1 });
  state.herbs.push({
    id: "herb-2",
    kind: "mugwort",
    x: 8,
    z: 10,
    level: 0,
    stage: "planted",
    work: 0,
    plantedAt: state.tick,
  });
  state.nextId = 5;
  const restored = restoreSnapshot(snapshotFor(state)).state;
  assert.deepEqual(restored.herbs[0], state.herbs[0]);
  assert.deepEqual(restored.herbBundles[0].location, {
    kind: "ground",
    x: 8,
    z: 10,
    level: 0,
  });
  assert.equal(restored.piles[1].amount, 1);
});

test("v5 herb storage claims require the matching continuation boundary", () => {
  const ground = activeHerbStorageState();
  validateClearing(ground);
  const restoredGround = restoreSnapshot(snapshotFor(ground)).state;
  assert.equal(restoredGround.herbBundles[0].location.kind, "ground");

  const carried = activeHerbStorageState("carried");
  validateClearing(carried);
  const restoredCarried = restoreSnapshot(snapshotFor(carried)).state;
  assert.equal(restoredCarried.herbBundles[0].location.kind, "carried");
  assert.equal(restoredCarried.actors.rowan.task, null);

  const carriedActive = activeHerbStorageState("carried");
  carriedActive.actors.rowan.task = {
    kind: "store-herb",
    job: "job-2",
    target: "site-1",
    duration: 8,
  };
  carriedActive.actors.rowan.assignment = {
    character: "rowan",
    task: "job-2",
    cost: 4,
  };
  carriedActive.actors.rowan.mode = "store-herb";
  const activeRestored = restoreSnapshot(snapshotFor(carriedActive)).state;
  assert.equal(activeRestored.actors.rowan.task?.kind, "store-herb");

  const groundWithoutPickup = activeHerbStorageState();
  groundWithoutPickup.actors.rowan.task = null;
  groundWithoutPickup.actors.rowan.assignment = null;
  groundWithoutPickup.actors.rowan.mode = "idle";
  assert.throws(
    () => validateClearing(groundWithoutPickup),
    /ground herb claim.*pickup task/,
  );

  const carriedWithUnrelatedTask = activeHerbStorageState("carried");
  carriedWithUnrelatedTask.sites.push({
    id: "site-2",
    type: "wall",
    x: 6,
    z: 10,
    level: 0,
    direction: 0,
    delivered: 0,
    work: 0,
    finishedAt: null,
  });
  carriedWithUnrelatedTask.jobs.push({
    id: "job-3",
    kind: "build",
    target: "site-2",
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  carriedWithUnrelatedTask.actors.rowan.task = {
    kind: "build",
    job: "job-3",
    target: "site-2",
    duration: BUILDINGS.wall.ticks,
  };
  carriedWithUnrelatedTask.actors.rowan.assignment = {
    character: "rowan",
    task: "job-3",
    cost: 4,
  };
  carriedWithUnrelatedTask.actors.rowan.mode = "build";
  assert.throws(
    () => validateClearing(carriedWithUnrelatedTask),
    /carried herb claim.*unrelated task/,
  );

  const drafted = activeHerbStorageState();
  drafted.actors.rowan.drafted = true;
  assert.throws(
    () => validateClearing(drafted),
    /drafted actor rowan retains ordinary work/,
  );

  const fullShelfWithClaim = activeHerbStorageState();
  fullShelfWithClaim.herbBundles.push({
    id: "herb-bundle-4",
    kind: "mugwort",
    amount: 1,
    location: { kind: "stored", site: "site-1" },
  });
  fullShelfWithClaim.harvestedHerbs = 2;
  fullShelfWithClaim.nextId = 5;
  assert.throws(
    () => validateClearing(fullShelfWithClaim),
    /storage claim while full/,
  );
});

test("snapshot/restore preserves a real active build after delivery", () => {
  const state = activeBuildWorkState();
  validateClearing(state);
  const restored = restoreSnapshot(snapshotFor(state)).state;
  assert.equal(restored.sites[0].delivered, 2);
  assert.equal(restored.sites[0].work, 7);
  assert.deepEqual(restored.claims, {});
  assert.equal(restored.actors.rowan.task, null);
  assert.equal(restored.piles[0].amount, 4);
});

test("material and completion invariants reject impossible continuation", () => {
  const claimExceedsPile = activeBuildState();
  claimExceedsPile.piles[0].amount = 1;
  assert.throws(() => validateClearing(claimExceedsPile));

  const siteExceedsRecipe = activeBuildState();
  siteExceedsRecipe.sites[0].delivered = 1;
  assert.throws(() => validateClearing(siteExceedsRecipe));

  const conservationBreak = activeBuildState();
  conservationBreak.felled = 2;
  assert.throws(() => validateClearing(conservationBreak));

  const treeProgressBreak = activeBuildState();
  treeProgressBreak.trees[0].work = 0;
  assert.throws(() => validateClearing(treeProgressBreak));

  const finishedJob = activeBuildState();
  finishedJob.sites[0].work = BUILDINGS.door.ticks;
  finishedJob.sites[0].delivered = BUILDINGS.door.wood;
  finishedJob.sites[0].finishedAt = 10;
  assert.throws(() => validateClearing(finishedJob));

  const rockOutside = activeBuildState();
  rockOutside.rocks[0] = { x: 99, z: 99, level: 0 };
  assert.throws(() => validateClearing(rockOutside));

  const badRestScope = structuredClone(createClearing());
  badRestScope.jobs.push({
    id: "job-1",
    kind: "rest",
    target: "rowan",
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  assert.throws(() => validateClearing(badRestScope));

  const idleCargoOutsideParty = activeBuildWorkState();
  idleCargoOutsideParty.actors.rowan.cargo = {
    job: "job-2",
    site: "site-1",
    amount: 2,
  };
  idleCargoOutsideParty.parties.home.members = [];
  assert.throws(() => validateClearing(idleCargoOutsideParty));

  const badDirections = activeBuildState();
  badDirections.actors.rowan.dir = 4;
  assert.throws(() => validateClearing(badDirections));
});
