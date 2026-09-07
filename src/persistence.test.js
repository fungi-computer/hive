import test from "node:test";
import assert from "node:assert/strict";
import { createClearing } from "./clearing.ts";
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

test("schema 3 persists drafted state and typed draft/Go replay history", () => {
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
  assert.equal(envelope.schema, 3);
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

test("strict schema 1 and 2 saves normalize drafted false and write schema 3", () => {
  const v3 = snapshotFor(createClearing());
  const v2 = structuredClone(v3);
  v2.schema = 2;
  for (const actor of Object.values(v2.savedState.actors)) delete actor.drafted;
  const v1 = structuredClone(v2);
  v1.schema = 1;
  delete v1.savedState.consumedWood;

  const restoredV1 = restoreSnapshot(v1);
  assert.equal(restoredV1.state.consumedWood, 0);
  assert.equal(restoredV1.state.actors.rowan.drafted, false);
  assert.equal(restoredV1.state.paused, true);
  const restoredV2 = restoreSnapshot(v2);
  assert.equal(restoredV2.state.actors.rowan.drafted, false);
  const rewritten = snapshotFor(restoredV1.state);
  assert.equal(rewritten.schema, 3);
  assert.equal(rewritten.savedState.consumedWood, 0);
  assert.equal(rewritten.savedState.actors.rowan.drafted, false);
  assert.equal(validateSaveEnvelope(v1).schema, 1);
  assert.equal(validateSaveEnvelope(v2).schema, 2);
});

test("schema 3 accepts a finished target and deconstruction job", () => {
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
  assert.equal(envelope.schema, 3);
  assert.equal(restoreSnapshot(envelope).state.jobs[0].kind, "deconstruct");

  const draftedWorker = structuredClone(envelope);
  draftedWorker.savedState.actors.rowan.drafted = true;
  assert.throws(
    () => restoreSnapshot(draftedWorker),
    /drafted actor rowan retains ordinary work/,
  );

  const v2 = structuredClone(envelope);
  v2.schema = 2;
  for (const actor of Object.values(v2.savedState.actors)) delete actor.drafted;
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
