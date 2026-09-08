import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { advanceWork, CHOP_TICKS, interruptWork } from "./activity.ts";
import { createClearing, step as advance } from "./clearing.ts";
import {
  BUILDINGS,
  brewKettle,
  constructionBuffer,
  shelfContainer,
} from "./construction.js";
import { cacheRepairBuffer } from "./finite-sources.ts";
import { assignWork } from "./jobs.ts";
import {
  containerQuantity,
  embeddedQuantity,
  materialQuantity,
} from "./materials.ts";
import { restoreSnapshot, snapshotFor } from "./persistence.ts";
import { HARVEST_TICKS, SOW_TICKS } from "./herbs.ts";

const cell = (x, z, level = 0) => ({ x, z, level });
const shared = { party: "home", actors: null };
const personal = (actor) => ({ party: "home", actors: [actor] });
const wasmColony = await new Promise((resolve, reject) => {
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
function actualStep(state, commands = []) {
  return advance(
    state,
    wasmColony,
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
function actualRun(state, ticks, commands = new Map()) {
  for (let tick = 0; tick < ticks; tick++)
    actualStep(state, commands.get(state.tick) ?? []);
  return state;
}
const colony = {
  compute_cost: ({ travel_time, work_time }) => travel_time + work_time,
  optimize(edges) {
    const usedActors = new Set();
    const usedTasks = new Set();
    return [...edges]
      .sort((a, b) => a.cost - b.cost)
      .filter((edge) => {
        if (usedActors.has(edge.character) || usedTasks.has(edge.task))
          return false;
        usedActors.add(edge.character);
        usedTasks.add(edge.task);
        return true;
      });
  },
};
function site(id, type, finishedAt = null) {
  return { id, type, ...cell(7, 9), direction: 0, work: 0, finishedAt };
}
function conserve(state) {
  const wood = materialQuantity(state.materials, "wood");
  const mugwort = materialQuantity(state.materials, "mugwort");
  const cacheWood = state.sources.some(
    (source) => source.kind === "reclaimed-timber-cache",
  )
    ? 10
    : 0;
  assert.equal(
    wood.live + wood.embedded + wood.consumed,
    state.felled * 6 + cacheWood,
  );
  assert.equal(mugwort.live + mugwort.embedded, state.harvestedHerbs);
}

test("optimizer commits its already-resolved one-unit source, request, destination, and owner", () => {
  const state = createClearing();
  const door = site("site-door", "door");
  state.sites.push(door);
  state.jobs.push({
    id: "job-door",
    kind: "build",
    target: door.id,
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  state.materials.lots.push({
    id: "wood-one",
    material: "wood",
    quantity: 1,
    location: { kind: "ground", ...cell(6, 10) },
  });
  state.workDirty = true;
  assignWork(state, colony);
  const transfer = state.materials.transfers[0];
  assert.deepEqual(transfer.owner, {
    kind: "job",
    job: "job-door",
    step: "construction-materials",
  });
  assert.deepEqual(transfer.request, {
    source: { kind: "eligible-ground", material: "wood" },
    quantityPolicy: "portion",
    quantity: 1,
  });
  assert.deepEqual(transfer.intent, {
    kind: "deliver",
    destination: constructionBuffer(door).id,
  });
  assert.deepEqual(transfer.phase, {
    kind: "reserved",
    sourceLot: "wood-one",
    quantity: 1,
    origin: { kind: "ground", cell: cell(6, 10) },
  });
  assert.equal(state.actors.rowan.task?.target, transfer.id);
});

test("a personal-first edge and a shared edge keep two workers distinct", () => {
  const state = createClearing();
  state.parties.home.members.push("sedge");
  const left = site("site-left", "wall");
  const right = { ...site("site-right", "wall"), x: 11, z: 10 };
  state.sites.push(left, right);
  state.jobs.push(
    {
      id: "job-rowan",
      kind: "build",
      target: left.id,
      scope: personal("rowan"),
      reason: "Ordered",
      routine: false,
    },
    {
      id: "job-sedge",
      kind: "build",
      target: right.id,
      scope: shared,
      reason: "Ordered",
      routine: false,
    },
  );
  state.materials.lots.push(
    {
      id: "wood-left",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell(6, 10) },
    },
    {
      id: "wood-right",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell(10, 10) },
    },
  );
  state.workDirty = true;
  assignWork(state, colony);
  assert.equal(state.materials.transfers.length, 2);
  assert.deepEqual(
    new Set(state.materials.transfers.map((transfer) => transfer.actor)),
    new Set(["rowan", "sedge"]),
  );
  assert.equal(state.actors.rowan.assignment?.task, "job-rowan");
  assert.equal(state.actors.sedge.assignment?.task, "job-sedge");
});

test("personal work bypasses preferences while shared work still honors them", () => {
  const state = createClearing();
  state.parties.home.members.push("sedge");
  state.actors.rowan.allowedWork.chop = false;
  state.actors.sedge.allowedWork.chop = false;
  state.jobs.push(
    {
      id: "personal-chop",
      kind: "chop",
      target: "oak-1",
      scope: personal("rowan"),
      reason: "Ordered",
      routine: false,
    },
    {
      id: "shared-chop",
      kind: "chop",
      target: "oak-2",
      scope: shared,
      reason: "Ordered",
      routine: false,
    },
  );
  assignWork(state, colony);
  assert.equal(state.actors.rowan.task?.job, "personal-chop");
  assert.equal(state.actors.sedge.task, null);
  assert.ok(state.jobs.some((job) => job.id === "shared-chop"));
});

test("queue order wins scarce-source revalidation before actor ID", () => {
  const state = createClearing();
  state.parties.home.members.push("sedge");
  const early = site("site-early", "wall");
  const late = { ...site("site-late", "wall"), x: 10, z: 10 };
  state.sites.push(early, late);
  state.jobs.push(
    {
      id: "early-sedge",
      kind: "build",
      target: early.id,
      scope: personal("sedge"),
      reason: "Ordered",
      routine: false,
    },
    {
      id: "late-rowan",
      kind: "build",
      target: late.id,
      scope: personal("rowan"),
      reason: "Ordered",
      routine: false,
    },
  );
  state.materials.lots.push({
    id: "one-wood",
    material: "wood",
    quantity: 1,
    location: { kind: "ground", ...cell(6, 10) },
  });
  assignWork(state, colony);
  assert.equal(state.materials.transfers.length, 1);
  assert.equal(state.materials.transfers[0].owner.job, "early-sedge");
  assert.equal(state.materials.transfers[0].actor, "sedge");
  assert.equal(state.actors.rowan.task, null);
});

test("a carrying transfer is continued by the same actor and interruption marks work dirty for retry", () => {
  const state = createClearing();
  const wall = site("site-wall", "wall");
  state.sites.push(wall);
  state.jobs.push({
    id: "job-wall",
    kind: "build",
    target: wall.id,
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  state.materials.lots.push({
    id: "hand-wood",
    material: "wood",
    quantity: 1,
    location: { kind: "hand", actor: "rowan" },
  });
  state.materials.transfers.push({
    id: "transfer-wall",
    actor: "rowan",
    owner: { kind: "job", job: "job-wall", step: "construction-materials" },
    request: {
      source: { kind: "eligible-ground", material: "wood" },
      quantityPolicy: "portion",
      quantity: 1,
    },
    intent: { kind: "deliver", destination: constructionBuffer(wall).id },
    phase: { kind: "carrying", lot: "hand-wood" },
  });
  state.workDirty = true;
  assignWork(state, colony);
  assert.equal(state.actors.rowan.task?.kind, "transfer");
  assert.equal(state.actors.rowan.task?.target, "transfer-wall");
  assert.equal(state.workDirty, false);
  interruptWork(state, state.actors.rowan);
  assert.equal(state.workDirty, true);
  assert.equal(state.materials.transfers.length, 0);
  assert.equal(
    state.materials.lots.find((lot) => lot.id === "hand-wood").location.kind,
    "ground",
  );
});

test("unfinished shelves accept wood through their construction buffer, not shelf storage", () => {
  const state = createClearing();
  const shelf = site("site-shelf", "shelf");
  state.sites.push(shelf);
  state.jobs.push({
    id: "job-build-shelf",
    kind: "build",
    target: shelf.id,
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  state.materials.lots.push(
    {
      id: "hand-wood",
      material: "wood",
      quantity: 1,
      location: { kind: "hand", actor: "rowan" },
    },
    {
      id: "wood-rest",
      material: "wood",
      quantity: 5,
      location: { kind: "ground", ...cell(4, 4) },
    },
  );
  state.materials.transfers.push({
    id: "transfer-shelf-wood",
    actor: "rowan",
    owner: {
      kind: "job",
      job: "job-build-shelf",
      step: "construction-materials",
    },
    request: {
      source: { kind: "eligible-ground", material: "wood" },
      quantityPolicy: "portion",
      quantity: 1,
    },
    intent: { kind: "deliver", destination: constructionBuffer(shelf).id },
    phase: { kind: "carrying", lot: "hand-wood" },
  });
  state.felled = 1;
  Object.assign(state.actors.rowan, {
    ...cell(7, 8),
    mode: "transfer",
    work: 7,
    task: {
      kind: "transfer",
      job: "job-build-shelf",
      target: "transfer-shelf-wood",
      duration: 8,
    },
    assignment: { character: "rowan", task: "job-build-shelf", cost: 0 },
  });
  advanceWork(state, state.actors.rowan);
  assert.equal(state.materials.transfers.length, 0);
  assert.equal(
    state.materials.lots.find((lot) => lot.id === "hand-wood").location
      .container,
    constructionBuffer(shelf).id,
  );
  assert.equal(
    containerQuantity(state.materials, constructionBuffer(shelf).id, "wood"),
    1,
  );
  assert.equal(
    embeddedQuantity(state.materials, constructionBuffer(shelf).id, "wood"),
    0,
  );
  assert.equal(state.actors.rowan.task, null);
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
});

test("a normal wall withdraws stored wood through the common transfer lifecycle", () => {
  const state = createClearing();
  const shelf = { ...site("shelf-a", "shelf", 1), x: 7, z: 9 };
  const wall = { ...site("wall-a", "wall"), x: 9, z: 9 };
  state.sites.push(shelf, wall);
  state.jobs.push({
    id: "build-wall",
    kind: "build",
    target: wall.id,
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  state.materials.embedded.push({
    container: constructionBuffer(shelf).id,
    material: "wood",
    quantity: 1,
  });
  state.materials.lots.push({
    id: "shelf-wood",
    material: "wood",
    quantity: 1,
    location: { kind: "container", container: shelfContainer(shelf.id).id },
  });
  assignWork(state, colony);
  const transfer = state.materials.transfers[0];
  assert.deepEqual(transfer.phase.origin, {
    kind: "container",
    container: shelfContainer(shelf.id).id,
  });
  Object.assign(state.actors.rowan, {
    ...cell(7, 8),
    mode: "transfer",
    work: 7,
    task: {
      kind: "transfer",
      job: "build-wall",
      target: transfer.id,
      duration: 8,
    },
    assignment: { character: "rowan", task: "build-wall", cost: 0 },
  });
  advanceWork(state, state.actors.rowan);
  assignWork(state, colony);
  wall.work = BUILDINGS.wall.ticks - 1;
  Object.assign(state.actors.rowan, {
    ...cell(9, 8),
    mode: "transfer",
    work: 7,
  });
  advanceWork(state, state.actors.rowan);
  assert.equal(
    state.materials.lots.find(
      (lot) =>
        lot.location.kind === "container" &&
        lot.location.container === constructionBuffer(wall).id,
    )?.material,
    "wood",
  );
  assignWork(state, colony);
  Object.assign(state.actors.rowan, {
    ...cell(9, 8),
    mode: "build",
    work: BUILDINGS.wall.ticks - 1,
  });
  advanceWork(state, state.actors.rowan);
  assert.equal(wall.finishedAt, state.tick);
});

test("wall and shelf deconstruction salvage construction buffers and eject only shelf contents", () => {
  const state = createClearing();
  const wall = site("site-wall", "wall", 1);
  state.sites.push(wall);
  state.materials.lots.push({
    id: "wood-rest",
    material: "wood",
    quantity: 5,
    location: { kind: "ground", ...cell(4, 4) },
  });
  state.materials.embedded.push({
    container: constructionBuffer(wall).id,
    material: "wood",
    quantity: 1,
  });
  state.felled = 1;
  state.jobs.push({
    id: "job-wall",
    kind: "deconstruct",
    target: wall.id,
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  Object.assign(state.actors.rowan, {
    ...cell(7, 8),
    mode: "deconstruct",
    work: BUILDINGS.wall.deconstructTicks - 1,
    task: {
      kind: "deconstruct",
      job: "job-wall",
      target: wall.id,
      duration: BUILDINGS.wall.deconstructTicks,
    },
    assignment: { character: "rowan", task: "job-wall", cost: 0 },
  });
  advanceWork(state, state.actors.rowan);
  assert.equal(
    state.sites.some((candidate) => candidate.id === wall.id),
    false,
  );
  assert.equal(state.materials.embedded.length, 0);
  assert.equal(
    state.materials.lots.some(
      (lot) => lot.material === "wood" && lot.quantity === 1,
    ),
    true,
  );
  conserve(state);

  const shelf = { ...site("site-shelf", "shelf", 2), x: 9, z: 9 };
  state.sites.push(shelf);
  state.materials.lots = state.materials.lots.filter(
    (lot) => lot.id !== "lot-1",
  );
  state.materials.embedded.push({
    container: constructionBuffer(shelf).id,
    material: "wood",
    quantity: 1,
  });
  state.materials.lots.push({
    id: "mugwort-shelf",
    material: "mugwort",
    quantity: 1,
    location: { kind: "container", container: shelfContainer(shelf.id).id },
  });
  state.harvestedHerbs = 1;
  state.jobs.push({
    id: "job-shelf",
    kind: "deconstruct",
    target: shelf.id,
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  Object.assign(state.actors.rowan, {
    ...cell(9, 8),
    mode: "deconstruct",
    work: BUILDINGS.shelf.deconstructTicks - 1,
    task: {
      kind: "deconstruct",
      job: "job-shelf",
      target: shelf.id,
      duration: BUILDINGS.shelf.deconstructTicks,
    },
    assignment: { character: "rowan", task: "job-shelf", cost: 0 },
  });
  advanceWork(state, state.actors.rowan);
  const ejected = state.materials.lots.find(
    (lot) => lot.id === "mugwort-shelf",
  );
  assert.equal(ejected.location.kind, "ground");
  assert.equal(ejected.location.x, 9);
  assert.equal(ejected.location.z, 9);
  assert.equal(ejected.location.level, 0);
  assert.equal(state.materials.embedded.length, 0);
  conserve(state);
});

test("shelf teardown settles another actor's released transfer before the next snapshot", () => {
  const state = createClearing();
  state.parties.home.members.push("sedge");
  const shelf = { ...site("site-shelf", "shelf", 1), x: 9, z: 9 };
  state.sites.push(shelf);
  state.felled = 1;
  state.harvestedHerbs = 2;
  state.materials.lots.push(
    {
      id: "wood-rest",
      material: "wood",
      quantity: 5,
      location: { kind: "ground", ...cell(4, 4) },
    },
    {
      id: "mugwort-stored",
      material: "mugwort",
      quantity: 1,
      location: { kind: "container", container: shelfContainer(shelf.id).id },
    },
    {
      id: "mugwort-carry",
      material: "mugwort",
      quantity: 1,
      location: { kind: "hand", actor: "sedge" },
    },
  );
  state.materials.embedded.push({
    container: constructionBuffer(shelf).id,
    material: "wood",
    quantity: 1,
  });
  state.jobs.push(
    {
      id: "job-store",
      kind: "store",
      source: "mugwort-carry",
      destination: shelfContainer(shelf.id).id,
      scope: shared,
      reason: "Ordered",
      routine: false,
    },
    {
      id: "job-deconstruct",
      kind: "deconstruct",
      target: shelf.id,
      scope: shared,
      reason: "Ordered",
      routine: false,
    },
  );
  state.materials.transfers.push({
    id: "transfer-store",
    actor: "sedge",
    owner: { kind: "job", job: "job-store", step: "shelf-store" },
    request: {
      source: { kind: "exact-lot", lot: "mugwort-carry" },
      quantityPolicy: "whole-lot",
      quantity: 1,
    },
    intent: { kind: "deliver", destination: shelfContainer(shelf.id).id },
    phase: { kind: "carrying", lot: "mugwort-carry" },
  });
  Object.assign(state.actors.sedge, {
    mode: "transfer",
    task: {
      kind: "transfer",
      job: "job-store",
      target: "transfer-store",
      duration: 8,
    },
    assignment: { character: "sedge", task: "job-store", cost: 0 },
  });
  Object.assign(state.actors.rowan, {
    ...cell(9, 8),
    mode: "deconstruct",
    work: BUILDINGS.shelf.deconstructTicks - 1,
    task: {
      kind: "deconstruct",
      job: "job-deconstruct",
      target: shelf.id,
      duration: BUILDINGS.shelf.deconstructTicks,
    },
    assignment: { character: "rowan", task: "job-deconstruct", cost: 0 },
  });
  advanceWork(state, state.actors.rowan);
  assert.equal(state.materials.transfers.length, 0);
  assert.equal(state.actors.sedge.task, null);
  assert.equal(state.actors.sedge.assignment, null);
  assert.equal(
    state.jobs.some((job) => job.id === "job-store"),
    false,
  );
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
  conserve(state);
});

test("chop, sow, harvest, and rest retain their non-transfer outcomes", () => {
  const state = createClearing();
  state.trees = [
    { id: "oak-a", ...cell(5, 5), work: CHOP_TICKS - 1, felledAt: null },
  ];
  state.jobs.push({
    id: "job-chop",
    kind: "chop",
    target: "oak-a",
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  Object.assign(state.actors.rowan, {
    ...cell(5, 4),
    mode: "chop",
    task: { kind: "chop", job: "job-chop", target: "oak-a", duration: 1 },
    assignment: { character: "rowan", task: "job-chop", cost: 0 },
  });
  advanceWork(state, state.actors.rowan);
  assert.equal(state.felled, 1);
  assert.equal(
    state.materials.lots.find(
      (lot) =>
        lot.material === "wood" &&
        lot.location.kind === "ground" &&
        lot.location.x === 5 &&
        lot.location.z === 5,
    ).quantity,
    6,
  );

  state.herbs.push({
    id: "herb-a",
    kind: "mugwort",
    ...cell(6, 5),
    stage: "ordered",
    work: SOW_TICKS - 1,
    plantedAt: null,
  });
  state.jobs.push({
    id: "job-sow",
    kind: "sow",
    target: "herb-a",
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  Object.assign(state.actors.rowan, {
    ...cell(6, 4),
    mode: "sow",
    task: { kind: "sow", job: "job-sow", target: "herb-a", duration: 1 },
    assignment: { character: "rowan", task: "job-sow", cost: 0 },
  });
  advanceWork(state, state.actors.rowan);
  assert.equal(state.herbs[0].stage, "planted");

  state.herbs[0].stage = "ready";
  state.herbs[0].work = HARVEST_TICKS - 1;
  state.jobs.push({
    id: "job-harvest",
    kind: "harvest",
    target: "herb-a",
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  Object.assign(state.actors.rowan, {
    mode: "harvest",
    task: {
      kind: "harvest",
      job: "job-harvest",
      target: "herb-a",
      duration: 1,
    },
    assignment: { character: "rowan", task: "job-harvest", cost: 0 },
  });
  advanceWork(state, state.actors.rowan);
  assert.equal(state.harvestedHerbs, 1);
  assert.equal(
    state.materials.lots.find((lot) => lot.material === "mugwort").quantity,
    1,
  );

  const bed = site("bed-a", "bed", 1);
  state.sites.push(bed);
  const wood = state.materials.lots.find((lot) => lot.material === "wood");
  wood.quantity -= BUILDINGS[bed.type].wood;
  state.materials.embedded.push({
    container: constructionBuffer(bed).id,
    material: "wood",
    quantity: BUILDINGS[bed.type].wood,
  });
  state.jobs.push({
    id: "job-rest",
    kind: "rest",
    target: "rowan",
    scope: personal("rowan"),
    reason: "Ordered",
    routine: false,
  });
  Object.assign(state.actors.rowan, {
    ...cell(7, 9),
    mode: "sleep",
    rest: 94.8,
    task: { kind: "sleep", job: "job-rest", target: bed.id, duration: 1 },
    assignment: { character: "rowan", task: "job-rest", cost: 0 },
  });
  advanceWork(state, state.actors.rowan);
  assert.ok(state.actors.rowan.rest >= 95);
  assert.equal(
    state.jobs.some((job) => job.id === "job-rest"),
    false,
  );
  conserve(state);
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
});

test("actual libcolony admits paused Work, Draft, and Go without advancing time", () => {
  const state = createClearing(77);
  state.paused = true;
  const tick = state.tick;
  const results = actualStep(state, [
    { kind: "work", work: "chop", enabled: false },
    { kind: "draft", actor: "rowan" },
    { kind: "go", actor: "rowan", target: cell(7, 9) },
  ]);
  assert.deepEqual(results, [
    { status: "applied" },
    { status: "applied" },
    { status: "applied" },
  ]);
  assert.equal(state.tick, tick);
  assert.equal(state.actors.rowan.drafted, true);
  assert.equal(state.actors.rowan.allowedWork.chop, false);
  const frozen = structuredClone(state.actors.rowan);
  actualStep(state);
  assert.equal(state.tick, tick);
  assert.deepEqual(state.actors.rowan, frozen);
});

test("actual libcolony assigns two idle home members distinct reachable shared chops", () => {
  const state = createClearing(76);
  state.paused = true;
  assert.deepEqual(
    actualStep(state, [
      { kind: "recruit", actor: "sedge" },
      { kind: "chop", tree: "oak-1" },
      { kind: "chop", tree: "oak-2" },
    ]),
    [{ status: "applied" }, { status: "applied" }, { status: "applied" }],
  );
  state.paused = false;
  actualStep(state);
  assert.deepEqual(
    new Set([
      state.actors.rowan.assignment?.task,
      state.actors.sedge.assignment?.task,
    ]),
    new Set(state.jobs.map((job) => job.id)),
  );
  assert.equal(state.actors.rowan.task?.kind, "chop");
  assert.equal(state.actors.sedge.task?.kind, "chop");
  assert.equal(state.workDirty, false);
});

test("actual libcolony admits legal stairs and rejects unsupported topology", () => {
  const state = createClearing(78);
  state.paused = true;
  const [stair, floor] = actualStep(state, [
    { kind: "build", type: "stair", x: 5, z: 5, direction: 0 },
    { kind: "build", type: "floor", x: 5, z: 5, level: 0, direction: 0 },
  ]);
  assert.deepEqual(stair, { status: "applied" });
  assert.equal(floor.status, "rejected");
  assert.match(floor.reason, /Upper floors belong/);
  assert.equal(state.sites[0].type, "stair");
});

test("actual libcolony cancellation returns buffered wood and preserves v7 conservation", () => {
  const state = createClearing(79);
  state.paused = true;
  assert.deepEqual(
    actualStep(state, [
      { kind: "build", type: "wall", x: 5, z: 5, direction: 0 },
    ]),
    [{ status: "applied" }],
  );
  const [site] = state.sites;
  state.felled = 1;
  state.materials.lots.push(
    {
      id: "wood-buffer",
      material: "wood",
      quantity: 1,
      location: { kind: "container", container: constructionBuffer(site).id },
    },
    {
      id: "wood-rest",
      material: "wood",
      quantity: 5,
      location: { kind: "ground", ...cell(4, 4) },
    },
  );
  assert.deepEqual(
    actualStep(state, [{ kind: "cancel", job: state.jobs[0].id }]),
    [{ status: "applied" }],
  );
  assert.equal(state.sites.length, 0);
  assert.equal(state.jobs.length, 0);
  conserve(state);
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
});

test("actual libcolony grows one sown mugwort at its 20/80/240 thresholds", () => {
  const state = createClearing(80);
  actualStep(state, [{ kind: "sow", x: 6, z: 8 }]);
  for (let i = 0; i < 400 && state.herbs[0]?.stage === "ordered"; i++)
    actualStep(state);
  const herb = state.herbs[0];
  assert.equal(herb.stage, "planted");
  const plantedAt = herb.plantedAt;
  while (state.tick < plantedAt + 80) actualStep(state);
  assert.equal(herb.stage, "growing");
  while (state.tick < plantedAt + 240) actualStep(state);
  assert.equal(herb.stage, "ready");
});

test("actual libcolony replay stays deterministic through feed and cat movement", () => {
  const left = actualRun(createClearing(81), 120);
  const right = actualRun(createClearing(81), 120);
  assert.deepEqual(left, right);
  assert.equal(left.feed.sequence, 1);
  assert.equal(left.demand?.kind, "demand");
  assert.ok(left.cat.nextMove >= 200);
});

test("actual libcolony preserves recruit/scope admission and one scarce source", () => {
  const state = createClearing(82);
  state.paused = true;
  const results = actualStep(state, [
    { kind: "recruit", actor: "sedge" },
    { kind: "recruit", actor: "sedge" },
    { kind: "chop", tree: "oak-1", actors: ["sedge"] },
    { kind: "chop", tree: "oak-2", actors: ["missing"] },
    { kind: "build", type: "wall", x: 5, z: 5, direction: 0 },
    { kind: "build", type: "wall", x: 6, z: 5, direction: 0 },
  ]);
  assert.equal(results[0].status, "applied");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[2].status, "applied");
  assert.equal(results[3].status, "rejected");
  assert.deepEqual(state.parties.home.members, ["rowan", "sedge"]);
  assert.deepEqual(state.jobs[0].scope.actors, ["sedge"]);
  const queued = state.jobs.filter((job) => job.kind === "build");
  assert.deepEqual(actualStep(state, [{ kind: "next", job: queued[1].id }]), [
    { status: "applied" },
  ]);
  assert.equal(state.jobs[0].id, queued[1].id);

  state.materials.lots.push({
    id: "wood-only",
    material: "wood",
    quantity: 1,
    location: { kind: "ground", ...cell(4, 5) },
  });
  state.paused = false;
  state.workDirty = true;
  actualStep(state);
  assert.equal(state.materials.transfers.length, 1);
  assert.equal(state.materials.transfers[0].phase.kind, "reserved");
  assert.equal(state.materials.transfers[0].phase.sourceLot, "wood-only");
  const carrier = state.materials.transfers[0].actor;
  state.paused = true;
  assert.deepEqual(actualStep(state, [{ kind: "draft", actor: carrier }]), [
    { status: "applied" },
  ]);
  assert.equal(state.materials.transfers.length, 0);
  assert.equal(state.actors[carrier].task, null);
  assert.equal(state.actors[carrier].drafted, true);
});

test("actual libcolony creates a night routine in a sheltered room and clears it at dawn", () => {
  const state = createClearing(83);
  const finished = (id, type, x, z, direction = 0) =>
    state.sites.push({
      id,
      type,
      ...cell(x, z),
      direction,
      work: BUILDINGS[type].ticks,
      finishedAt: 1,
    });
  for (let x = 5; x <= 9; x++)
    for (let z = 5; z <= 9; z++)
      if ((x === 5 || x === 9 || z === 5 || z === 9) && !(x === 7 && z === 9))
        finished(`wall-${x}-${z}`, "wall", x, z);
  finished("door", "door", 7, 9);
  finished("bed", "bed", 7, 7);
  finished("roof", "roof", 7, 7);
  finished("roof-next", "roof", 7, 8);
  state.tick = 4_800;
  state.actors.rowan.routine = true;
  actualStep(state);
  const routine = state.jobs.find((job) => job.kind === "rest" && job.routine);
  assert.ok(routine);
  Object.assign(state.actors.rowan, {
    ...cell(7, 7),
    mode: "sleep",
    work: 1,
    task: { kind: "sleep", job: routine.id, target: "bed", duration: 80 },
    assignment: { character: "rowan", task: routine.id, cost: 0 },
  });
  state.tick = 9_599;
  actualStep(state);
  assert.equal(
    state.jobs.some((job) => job.id === routine.id),
    false,
  );
  assert.equal(state.actors.rowan.task, null);
  assert.equal(state.rested, 1);
});

test("actual libcolony supplies shared cache repair through its buffer and cancellation returns staged wood", () => {
  const state = createClearing(91);
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  const buffer = cacheRepairBuffer(cache);
  state.felled = 1;
  state.materials.lots.push({
    id: "repair-wood",
    material: "wood",
    quantity: 6,
    location: { kind: "ground", ...cell(7, 10) },
  });
  assert.deepEqual(actualStep(state, [{ kind: "repair-cache" }]), [
    { status: "applied" },
  ]);
  for (
    let tick = 0;
    tick < 400 && containerQuantity(state.materials, buffer.id, "wood") !== 2;
    tick++
  )
    actualStep(state);
  assert.equal(containerQuantity(state.materials, buffer.id, "wood"), 2);
  const repair = state.jobs.find((job) => job.kind === "repair-cache");
  assert.ok(repair);
  assert.deepEqual(actualStep(state, [{ kind: "cancel", job: repair.id }]), [
    { status: "applied" },
  ]);
  assert.equal(cache.repaired, false);
  assert.equal(containerQuantity(state.materials, buffer.id, "wood"), 0);
  assert.equal(state.materials.consumedWood, 0);
  assert.equal(
    state.jobs.some((job) => job.id === repair.id),
    false,
  );
  conserve(state);
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
});

test("actual libcolony builds a normal brew station from repaired finite cache wood", () => {
  const state = createClearing(95);
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  state.felled = 1;
  state.materials.consumedWood = 4;
  state.materials.lots.push({
    id: "repair-only-wood",
    material: "wood",
    quantity: 2,
    location: { kind: "ground", ...cell(7, 10) },
  });
  state.paused = true;
  assert.deepEqual(
    actualStep(state, [
      { kind: "repair-cache" },
      { kind: "build", type: "brew-station", x: 7, z: 5, direction: 0 },
    ]),
    [{ status: "applied" }, { status: "applied" }],
  );
  state.paused = false;
  for (
    let tick = 0;
    tick < 1_200 &&
    !state.sites.some(
      (site) => site.type === "brew-station" && site.finishedAt !== null,
    );
    tick++
  )
    actualStep(state);
  const station = state.sites.find((site) => site.type === "brew-station");
  assert.ok(station?.finishedAt !== null);
  assert.equal(
    embeddedQuantity(state.materials, constructionBuffer(station).id, "wood"),
    6,
  );
  assert.equal(
    containerQuantity(state.materials, `source:${cache.id}`, "wood"),
    4,
  );
  conserve(state);
});

test("actual libcolony repairs once, pauses a filled pail, and resumes one fill operation without redrawing", () => {
  const state = createClearing(92);
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  const spring = state.sources.find((source) => source.kind === "spring");
  const station = {
    id: "station-a",
    type: "brew-station",
    ...cell(7, 5),
    direction: 0,
    work: BUILDINGS["brew-station"].ticks,
    finishedAt: 0,
  };
  state.sites.push(station);
  state.materials.embedded.push({
    container: constructionBuffer(station).id,
    material: "wood",
    quantity: BUILDINGS["brew-station"].wood,
  });
  state.felled = 2;
  state.materials.lots.push({
    id: "repair-wood",
    material: "wood",
    quantity: 6,
    location: { kind: "ground", ...cell(7, 10) },
  });
  actualStep(state, [{ kind: "repair-cache" }]);
  for (let tick = 0; tick < 500 && !cache.repaired; tick++) actualStep(state);
  assert.equal(cache.repaired, true);
  assert.equal(state.materials.consumedWood, 2);
  state.actors.sedge.drafted = true;
  Object.assign(state.actors.rowan, cell(14, 1));
  assert.deepEqual(
    actualStep(state, [{ kind: "fill-kettle", station: station.id }]),
    [{ status: "applied" }],
  );
  assert.equal(state.operations[0]?.phase, "acquire");
  assert.equal(state.materials.transfers[0]?.phase.kind, "reserved");
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
  for (
    let tick = 0;
    tick < 700 && state.operations[0]?.phase !== "pour";
    tick++
  )
    actualStep(state);
  const operation = state.operations[0];
  assert.equal(operation.phase, "pour");
  assert.equal(
    containerQuantity(state.materials, `source:${spring.id}`, "water"),
    6,
  );
  // Simulate a lost path before the later Draft command: the operation keeps
  // only its pail binding, not Rowan's executor transfer.
  interruptWork(state, state.actors.rowan);
  assert.equal(state.materials.transfers.length, 0);
  assert.equal(state.materials.bindings.length, 1);
  assert.deepEqual(actualStep(state, [{ kind: "draft", actor: "rowan" }]), [
    { status: "applied" },
  ]);
  assert.deepEqual(actualStep(state, [{ kind: "draft", actor: "rowan" }]), [
    { status: "applied" },
  ]);
  assert.equal(state.materials.bindings.length, 1);
  assert.equal(state.materials.transfers.length, 0);
  const paused = restoreSnapshot(snapshotFor(state)).state;
  assert.equal(paused.paused, true);
  assert.equal(paused.operations[0].id, operation.id);
  assert.equal(paused.operations[0].phase, "pour");
  assert.equal(paused.actors.rowan.task, null);
  paused.jobs.unshift({
    id: "personal-chop-after-pour",
    kind: "chop",
    target: paused.trees[0].id,
    scope: personal("rowan"),
    reason: "Ordered",
    routine: false,
  });
  paused.workDirty = true;
  actualStep(paused, [
    { kind: "work", work: "haul", enabled: false },
    { kind: "undraft", actor: "rowan" },
  ]);
  paused.paused = false;
  actualStep(paused);
  assert.equal(paused.actors.rowan.task?.job, "personal-chop-after-pour");
  assert.equal(paused.materials.transfers.length, 0);
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(paused)));
  interruptWork(paused, paused.actors.rowan);
  paused.jobs = paused.jobs.filter(
    (job) => job.id !== "personal-chop-after-pour",
  );
  paused.workDirty = true;
  actualStep(paused, [{ kind: "work", work: "haul", enabled: true }]);
  const pourWithoutSpring = restoreSnapshot(snapshotFor(paused)).state;
  pourWithoutSpring.materials.lots.find(
    (lot) => lot.id === `source-lot:${spring.id}`,
  ).quantity = 0;
  actualStep(pourWithoutSpring, [{ kind: "undraft", actor: "rowan" }]);
  pourWithoutSpring.paused = false;
  for (
    let tick = 0;
    tick < 700 && pourWithoutSpring.operations.length !== 0;
    tick++
  )
    actualStep(pourWithoutSpring);
  assert.equal(pourWithoutSpring.operations.length, 0);
  assert.equal(
    containerQuantity(
      pourWithoutSpring.materials,
      brewKettle(station).id,
      "water",
    ),
    2,
  );
  actualStep(paused, [{ kind: "undraft", actor: "rowan" }]);
  paused.paused = false;
  for (let tick = 0; tick < 700 && paused.operations.length !== 0; tick++)
    actualStep(paused);
  assert.equal(paused.operations.length, 0);
  assert.equal(
    containerQuantity(paused.materials, brewKettle(station).id, "water"),
    2,
  );
  assert.equal(
    containerQuantity(paused.materials, `source:${spring.id}`, "water"),
    6,
  );
  assert.equal(paused.materials.bindings.length, 0);
  assert.equal(paused.materials.transfers.length, 0);
  assert.equal(
    paused.materials.lots.find((lot) => lot.id === operation.pail).location
      .kind,
    "ground",
  );
  conserve(paused);
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(paused)));
});

test("one cache pail admits only the earlier shared fill job", () => {
  const state = createClearing(94);
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  cache.repaired = true;
  for (const [id, x] of [
    ["station-first", 6],
    ["station-second", 10],
  ]) {
    const station = {
      id,
      type: "brew-station",
      ...cell(x, 5),
      direction: 0,
      work: BUILDINGS["brew-station"].ticks,
      finishedAt: 0,
    };
    state.sites.push(station);
    state.materials.embedded.push({
      container: constructionBuffer(station).id,
      material: "wood",
      quantity: BUILDINGS["brew-station"].wood,
    });
  }
  state.felled = 2;
  actualStep(state, [
    { kind: "fill-kettle", station: "station-first" },
    { kind: "fill-kettle", station: "station-second" },
  ]);
  assert.equal(state.operations.length, 1);
  assert.equal(state.operations[0].station, "station-first");
  assert.equal(state.materials.bindings.length, 1);
  assert.equal(state.materials.transfers.length, 1);
  assert.equal(state.materials.transfers[0].phase.kind, "reserved");
});

test("canceling an incomplete fill drops its same filled pail and retires the live operation", () => {
  const state = createClearing(93);
  const spring = state.sources.find((source) => source.kind === "spring");
  const station = {
    id: "station-cancel",
    type: "brew-station",
    ...cell(7, 5),
    direction: 0,
    work: BUILDINGS["brew-station"].ticks,
    finishedAt: 0,
  };
  state.sites.push(station);
  state.materials.embedded.push({
    container: constructionBuffer(station).id,
    material: "wood",
    quantity: 6,
  });
  state.felled = 1;
  state.materials.lots.find(
    (lot) => lot.id === `source-lot:${spring.id}`,
  ).quantity = 6;
  state.materials.lots.push(
    {
      id: "cancel-pail",
      material: "pail",
      quantity: 1,
      location: { kind: "hand", actor: "rowan" },
    },
    {
      id: "cancel-water",
      material: "water",
      quantity: 2,
      location: { kind: "container", container: "vessel:cancel-pail" },
    },
  );
  state.jobs.push({
    id: "job-fill-cancel",
    kind: "fill-kettle",
    target: station.id,
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  state.operations.push({
    id: "fill-cancel",
    job: "job-fill-cancel",
    actor: "rowan",
    spring: spring.id,
    station: station.id,
    pail: "cancel-pail",
    water: "cancel-water",
    phase: "pour",
  });
  state.materials.bindings.push({
    kind: "vessel-use",
    id: "fill-cancel",
    vessel: "cancel-pail",
  });
  state.materials.transfers.push({
    id: "fill-cancel-use",
    actor: "rowan",
    owner: { kind: "operation", operation: "fill-cancel" },
    request: {
      source: { kind: "exact-lot", lot: "cancel-pail" },
      quantityPolicy: "whole-lot",
      quantity: 1,
    },
    intent: { kind: "use", operation: "fill-cancel" },
    phase: { kind: "carrying", lot: "cancel-pail" },
  });
  state.actors.rowan.task = {
    kind: "brew-water",
    job: "job-fill-cancel",
    target: "fill-cancel",
    duration: 1,
  };
  state.actors.rowan.assignment = {
    character: "rowan",
    task: "job-fill-cancel",
    cost: 0,
  };
  assert.deepEqual(
    actualStep(state, [{ kind: "cancel", job: "job-fill-cancel" }]),
    [{ status: "applied" }],
  );
  assert.equal(state.operations.length, 0);
  assert.equal(state.materials.transfers.length, 0);
  assert.equal(state.materials.bindings.length, 0);
  assert.equal(
    state.materials.lots.find((lot) => lot.id === "cancel-pail").location.kind,
    "ground",
  );
  assert.equal(
    state.materials.lots.find((lot) => lot.id === "cancel-water").location
      .container,
    "vessel:cancel-pail",
  );
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
});
