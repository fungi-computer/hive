import { placementFooting } from "./game-space.ts";
import { interruptWork } from "./activity-lifecycle.ts";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { advanceWork, CHOP_TICKS } from "./activity.ts";
import { createClearing, step as advance } from "./clearing.ts";
import {
  BUILDINGS,
  brewKettle,
  constructionBuffer,
  removalProblem,
  shelfContainer,
} from "./construction.js";
import { cacheRepairBuffer } from "./finite-sources.ts";
import { assignWork } from "./jobs.ts";
import { brewPrepareRemaining, recipeOutputReadiness } from "./brewing.ts";
import { recipeDefinition } from "./recipes.ts";
import {
  containerQuantity,
  createGroundLot,
  embeddedQuantity,
  materialQuantity,
} from "./materials.ts";
import { restoreSnapshot, snapshotFor } from "./persistence.ts";
import { HARVEST_TICKS, SOW_TICKS } from "./herbs.ts";

const placement = (x, z, level = 0) => ({ x, z, level });
const cell = (x, z, level = 0) => placementFooting(placement(x, z, level));
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
  return { id, type, ...placement(7, 9), direction: 0, work: 0, finishedAt };
}
function conserve(state) {
  const wood = materialQuantity(state.materials, "wood");
  const mugwort = materialQuantity(state.materials, "mugwort");
  const transformed = (material) =>
    state.materials.transformations.reduce(
      (sum, transformation) =>
        sum +
        transformation.inputs.reduce(
          (inputs, input) =>
            inputs + (input.material === material ? input.quantity : 0),
          0,
        ),
      0,
    );
  const cacheWood = state.sources.some(
    (source) => source.kind === "reclaimed-timber-cache",
  )
    ? 10
    : 0;
  assert.equal(
    wood.live + wood.embedded + wood.consumed + transformed("wood"),
    state.felled * 6 + cacheWood,
  );
  assert.equal(
    mugwort.live + mugwort.embedded + transformed("mugwort"),
    state.harvestedHerbs,
  );
}

test("optimizer commits its already-resolved one-unit source, request, destination, and owner", () => {
  const state = createClearing();
  const door = site("site-door", "door");
  state.sites.push(door);
  state.jobs.push({
    id: "job-door",
    kind: "build",
    target: door.id,
    lifecycle: "active",
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
      lifecycle: "active",
      scope: personal("rowan"),
      reason: "Ordered",
      routine: false,
    },
    {
      id: "job-sedge",
      kind: "build",
      target: right.id,
      lifecycle: "active",
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
      lifecycle: "active",
      scope: personal("rowan"),
      reason: "Ordered",
      routine: false,
    },
    {
      id: "shared-chop",
      kind: "chop",
      target: "oak-2",
      lifecycle: "active",
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
      lifecycle: "active",
      scope: personal("sedge"),
      reason: "Ordered",
      routine: false,
    },
    {
      id: "late-rowan",
      kind: "build",
      target: late.id,
      lifecycle: "active",
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
    lifecycle: "active",
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
    resolvedMaterial: "wood",
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
    lifecycle: "active",
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
    resolvedMaterial: "wood",
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
    lifecycle: "active",
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
    lifecycle: "active",
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
    lifecycle: "active",
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
  assert.equal(ejected.location.x, cell(9, 9).x);
  assert.equal(ejected.location.z, cell(9, 9).z);
  assert.equal(ejected.location.y, cell(9, 9).y);
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
      lifecycle: "active",
      scope: shared,
      reason: "Ordered",
      routine: false,
    },
    {
      id: "job-deconstruct",
      kind: "deconstruct",
      target: shelf.id,
      lifecycle: "active",
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
    resolvedMaterial: "mugwort",
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
    lifecycle: "active",
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
    establishment: null,
    plantedAt: null,
  });
  state.jobs.push({
    id: "job-sow",
    kind: "sow",
    target: "herb-a",
    lifecycle: "active",
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
    lifecycle: "active",
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
    lifecycle: "active",
    kind: "care",
    target: "rowan",
    need: "rest",
    policy: "manual-rest",
    reason: "Ordered",
    routine: false,
  });
  Object.assign(state.actors.rowan, {
    ...cell(7, 9),
    mode: "sleep",
    needs: { ...state.actors.rowan.needs, rest: 89.8 },
    task: { kind: "sleep", job: "job-rest", target: bed.id, duration: 1 },
    assignment: { character: "rowan", task: "job-rest", cost: 0 },
  });
  advanceWork(state, state.actors.rowan);
  assert.ok(state.actors.rowan.needs.rest >= 90);
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

test("established mugwort grows at its 20/80/240 thresholds", () => {
  const state = createClearing(80);
  actualStep(state, [{ kind: "sow", x: 6, z: 8 }]);
  for (let i = 0; i < 400 && state.herbs[0]?.stage === "ordered"; i++)
    actualStep(state);
  const herb = state.herbs[0];
  assert.equal(herb.stage, "planted");
  herb.establishment = { kind: "legacy", at: state.tick };
  while (state.tick < herb.establishment.at + 80) actualStep(state);
  assert.equal(herb.stage, "growing");
  while (state.tick < herb.establishment.at + 240) actualStep(state);
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
      ...placement(x, z),
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
  const routine = state.jobs.find(
    (job) =>
      job.kind === "care" && job.policy === "routine-rest" && job.routine,
  );
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
  assert.ok(state.actors.rowan.needs.rest >= 0);
});

test("actual libcolony supplies shared cache repair through its buffer and cancellation returns staged wood", () => {
  const state = createClearing(91);
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  assert.ok(cache);
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
    ...placement(7, 5),
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
  assert.equal(state.operations[0]?.execution.phase, "acquire");
  assert.equal(state.materials.transfers[0]?.phase.kind, "reserved");
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
  for (
    let tick = 0;
    tick < 700 && state.operations[0]?.execution.phase !== "deliver";
    tick++
  )
    actualStep(state);
  const operation = state.operations[0];
  assert.equal(operation.execution.phase, "deliver");
  assert.equal(
    containerQuantity(state.materials, `source:${spring.id}`, "water"),
    14,
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
  assert.equal(paused.operations[0].execution.phase, "deliver");
  assert.equal(paused.actors.rowan.task, null);
  paused.jobs.unshift({
    id: "personal-chop-after-pour",
    kind: "chop",
    target: paused.trees[0].id,
    lifecycle: "active",
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
    14,
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

test("actual libcolony establishes one newly sown mugwort with one recoverable pail draw", () => {
  let state = createClearing(93);
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  const spring = state.sources.find((source) => source.kind === "spring");
  cache.repaired = true;
  state.actors.sedge.drafted = true;
  assert.deepEqual(actualStep(state, [{ kind: "sow", x: 7, z: 7 }]), [
    { status: "applied" },
  ]);
  for (let tick = 0; tick < 400 && state.herbs[0]?.stage !== "planted"; tick++)
    actualStep(state);
  const herb = state.herbs[0];
  assert.equal(herb.stage, "planted");
  assert.equal(herb.establishment, null);

  assert.deepEqual(
    actualStep(state, [{ kind: "water-mugwort", herb: herb.id }]),
    [{ status: "applied" }],
  );
  assert.equal(state.operations.length, 1);
  assert.deepEqual(state.operations[0].target, {
    kind: "mugwort",
    herb: herb.id,
  });
  assert.equal(state.operations[0].quantity, 2);
  const operationId = state.operations[0].id;
  state.paused = true;
  state = restoreSnapshot(snapshotFor(state)).state;
  assert.equal(state.operations.length, 1);
  assert.equal(state.materials.transfers.length, 1);
  state.paused = false;
  for (let tick = 0; tick < 1_000 && state.operations.length !== 0; tick++)
    actualStep(state);

  const established = state.herbs.find((candidate) => candidate.id === herb.id);
  assert.equal(established.establishment?.kind, "water");
  assert.equal(established.establishment?.receipt, state.materials.sinks[0].id);
  assert.equal(state.materials.sinks.length, 1);
  assert.deepEqual(state.materials.sinks[0], {
    id: `water-delivery-sink:${operationId}`,
    material: "water",
    quantity: 2,
  });
  assert.equal(
    containerQuantity(state.materials, `source:${spring.id}`, "water"),
    14,
  );
  assert.equal(
    state.jobs.some((job) => job.kind === "water-mugwort"),
    false,
  );
  assert.equal(
    actualStep(state, [{ kind: "water-mugwort", herb: herb.id }])[0].status,
    "rejected",
  );
  actualRun(state, 240);
  assert.equal(established.stage, "ready");
  const water = materialQuantity(state.materials, "water");
  assert.equal(water.live + water.consumed, 16);
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
});

test("canceling mugwort water delivery releases the pail and never establishes the plant", () => {
  const state = createClearing(94);
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  cache.repaired = true;
  state.actors.sedge.drafted = true;
  state.herbs.push({
    id: "herb-cancel",
    kind: "mugwort",
    ...cell(7, 7),
    stage: "planted",
    work: 0,
    plantedAt: state.tick,
    establishment: null,
  });
  actualStep(state, [{ kind: "water-mugwort", herb: "herb-cancel" }]);
  for (
    let tick = 0;
    tick < 700 && state.operations[0]?.execution.phase !== "deliver";
    tick++
  )
    actualStep(state);
  const operation = state.operations[0];
  assert.equal(operation.execution.phase, "deliver");
  assert.deepEqual(
    actualStep(state, [{ kind: "cancel", job: operation.job }]),
    [{ status: "applied" }],
  );
  assert.equal(state.operations.length, 0);
  assert.equal(state.materials.transfers.length, 0);
  assert.equal(state.materials.bindings.length, 0);
  assert.equal(state.herbs[0].establishment, null);
  assert.equal(state.materials.sinks.length, 0);
  assert.equal(
    state.materials.lots.find((lot) => lot.id === operation.pail).location.kind,
    "ground",
  );
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
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
      ...placement(x, 5),
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
  assert.deepEqual(state.operations[0].target, {
    kind: "kettle",
    station: "station-first",
  });
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
    ...placement(7, 5),
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
    lifecycle: "active",
    scope: shared,
    reason: "Ordered",
    routine: false,
  });
  state.operations.push({
    kind: "water-delivery",
    id: "fill-cancel",
    job: "job-fill-cancel",
    supply: { kind: "container", container: `source:${spring.id}` },
    target: { kind: "kettle", station: station.id },
    quantity: 2,
    pail: "cancel-pail",
    execution: {
      phase: "deliver",
      contents: [{ lot: "cancel-water", quantity: 2 }],
    },
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
    resolvedMaterial: "pail",
    phase: { kind: "carrying", lot: "cancel-pail" },
  });
  state.actors.rowan.task = {
    kind: "water-delivery",
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

function readyHerbalAleState() {
  const state = createClearing(111);
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  const spring = state.sources.find((source) => source.kind === "spring");
  cache.repaired = true;
  const station = {
    id: "station-herbal-ale",
    type: "brew-station",
    ...placement(7, 5),
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
  state.herbs.push({
    id: "herbal-ale-herb",
    kind: "mugwort",
    stage: "ready",
    work: 0,
    establishment: { kind: "legacy", at: 0 },
    plantedAt: 0,
    ...cell(7, 9),
  });
  state.harvestedHerbs = 1;
  state.materials.lots.push(
    {
      id: "herbal-ale-mugwort",
      material: "mugwort",
      quantity: 1,
      location: { kind: "ground", ...cell(7, 9) },
    },
    {
      id: "herbal-ale-water",
      material: "water",
      quantity: 2,
      location: { kind: "container", container: brewKettle(station).id },
    },
  );
  state.materials.lots.find(
    (lot) => lot.id === `source-lot:${spring.id}`,
  ).quantity = 6;
  return { state, station };
}

test("actual libcolony leaves a shortage staged but never admits a partial herbal ale", () => {
  const { state, station } = readyHerbalAleState();
  state.herbs = [];
  state.harvestedHerbs = 0;
  state.materials.lots = state.materials.lots.filter(
    (lot) => lot.id !== "herbal-ale-mugwort",
  );
  assert.deepEqual(actualStep(state, [{ kind: "brew", station: station.id }]), [
    { status: "applied" },
  ]);
  for (let tick = 0; tick < 800; tick++) actualStep(state);
  const job = state.jobs.find((candidate) => candidate.kind === "brew");
  assert.equal(job?.reason, "Waiting for reachable mugwort");
  assert.equal(state.processes.length, 0);
  assert.equal(state.materials.transformations.length, 0);
});

test("actual libcolony stages, interrupts, reloads, prepares, and ferments herbal ale", () => {
  const { state, station } = readyHerbalAleState();
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  state.parties.home.members.push("sedge");
  assert.deepEqual(actualStep(state, [{ kind: "brew", station: station.id }]), [
    { status: "applied" },
  ]);
  for (
    let tick = 0;
    tick < 2_000 &&
    !(
      state.processes[0]?.phase === "prepare" &&
      state.processes[0].progress >= 3
    );
    tick++
  )
    actualStep(state);
  const process = state.processes[0];
  assert.equal(
    process?.phase,
    "prepare",
    JSON.stringify({
      reason: state.jobs.find((job) => job.kind === "brew")?.reason,
      transfers: state.materials.transfers,
      lots: state.materials.lots,
    }),
  );
  assert.ok(process.progress >= 3);
  const binding = state.materials.bindings.find(
    (candidate) =>
      candidate.kind === "recipe" && candidate.id === process.binding,
  );
  assert.equal(
    brewPrepareRemaining(state, process),
    recipeDefinition(binding.definition).timings.prepare - process.progress,
    "the live process reads the timing pinned by its recipe binding",
  );
  const worker = Object.values(state.actors).find(
    (actor) => actor.task?.kind === "brew",
  );
  assert.ok(worker);
  assert.equal(
    state.jobs.find((job) => job.id === process.job)?.scope.actors,
    null,
  );
  assert.equal(state.materials.transformations.length, 0);
  assert.equal(
    containerQuantity(state.materials, brewKettle(station).id, "malt"),
    2,
  );
  assert.equal(
    containerQuantity(state.materials, brewKettle(station).id, "water"),
    2,
  );
  const prepared = process.progress;
  actualStep(state, [{ kind: "draft", actor: worker.id }]);
  assert.equal(state.processes[0].progress, prepared);
  assert.equal(state.materials.transformations.length, 0);
  const restored = restoreSnapshot(snapshotFor(state)).state;
  assert.equal(restored.paused, true);
  assert.equal(restored.processes[0].phase, "prepare");
  assert.equal(restored.processes[0].progress, prepared);
  actualStep(restored, [{ kind: "undraft", actor: worker.id }]);
  restored.paused = false;
  for (
    let tick = 0;
    tick < 100 && restored.processes[0].phase !== "ferment";
    tick++
  )
    actualStep(restored);
  assert.equal(restored.processes[0].phase, "ferment");
  assert.equal(restored.processes[0].progress, 0);
  assert.equal(restored.materials.transformations.length, 1);
  const transitionTick = restored.tick;
  restored.paused = true;
  actualStep(restored);
  assert.equal(restored.tick, transitionTick);
  assert.equal(restored.processes[0].progress, 0);
  restored.paused = false;
  actualStep(restored);
  assert.equal(restored.processes[0].progress, 1);
  assert.deepEqual(
    actualStep(restored, [
      { kind: "chop", tree: "oak-1", actors: [worker.id] },
    ]),
    [{ status: "applied" }],
  );
  for (let tick = 0; tick < 4; tick++) actualStep(restored);
  assert.equal(restored.actors[worker.id].task?.kind, "chop");
  assert.ok(restored.processes[0].progress > 1);
  for (
    let tick = 0;
    tick < 300 && restored.processes[0]?.phase !== "keg";
    tick++
  )
    actualStep(restored);
  assert.equal(restored.processes[0]?.phase, "keg");
  assert.equal(restored.processes[0]?.progress, 0);
  const kegJob = restored.jobs.find((job) => job.kind === "brew");
  assert.deepEqual(actualStep(restored, [{ kind: "cancel", job: kegJob.id }]), [
    { status: "rejected", reason: "A committed batch cannot be cancelled." },
  ]);
  for (
    let tick = 0;
    tick < 100 && !(restored.processes[0]?.progress >= 2);
    tick++
  )
    actualStep(restored);
  const kegWorker = Object.values(restored.actors).find(
    (actor) => actor.task?.kind === "brew",
  );
  assert.ok(kegWorker);
  const kegProgress = restored.processes[0].progress;
  actualStep(restored, [{ kind: "draft", actor: kegWorker.id }]);
  assert.equal(restored.processes[0].progress, kegProgress);
  const kegReloaded = restoreSnapshot(snapshotFor(restored)).state;
  assert.equal(kegReloaded.paused, true);
  assert.equal(kegReloaded.processes[0]?.phase, "keg");
  assert.equal(kegReloaded.processes[0]?.progress, kegProgress);
  actualStep(kegReloaded, [{ kind: "undraft", actor: kegWorker.id }]);
  kegReloaded.paused = false;
  for (
    let tick = 0;
    tick < 200 && kegReloaded.processes[0]?.progress !== 19;
    tick++
  )
    actualStep(kegReloaded);
  const reservedKeg = kegReloaded.materials.lots.find(
    (lot) => lot.material === "keg",
  );
  assert.ok(reservedKeg);
  kegReloaded.materials.lots.push({
    id: "blocked-ale",
    material: "ale",
    quantity: 1,
    location: { kind: "container", container: `vessel:${reservedKeg.id}` },
  });
  const blockedMaterials = structuredClone(kegReloaded.materials);
  const blockedProcess = structuredClone(kegReloaded.processes);
  actualStep(kegReloaded);
  assert.deepEqual(
    kegReloaded.materials,
    blockedMaterials,
    "blocked output capacity leaves recipe claims and provenance unchanged",
  );
  assert.deepEqual(kegReloaded.processes, blockedProcess);
  kegReloaded.materials.lots = kegReloaded.materials.lots.filter(
    (lot) => lot.id !== "blocked-ale",
  );
  kegReloaded.workDirty = true;
  for (let tick = 0; tick < 200 && kegReloaded.processes.length > 0; tick++)
    actualStep(kegReloaded);
  assert.equal(kegReloaded.processes.length, 0);
  assert.equal(
    kegReloaded.jobs.some((job) => job.id === kegJob.id),
    false,
  );
  const keg = kegReloaded.materials.lots.find((lot) => lot.material === "keg");
  const barm = kegReloaded.materials.lots.find(
    (lot) => lot.material === "barm",
  );
  assert.equal(keg?.id, `source-keg-lot:${cache.id}`);
  assert.equal(barm?.id, `source-barm-lot:${cache.id}`);
  assert.equal(
    containerQuantity(kegReloaded.materials, `vessel:${keg.id}`, "ale"),
    4,
  );
  assert.equal(
    containerQuantity(
      kegReloaded.materials,
      `brew-tray:${station.id}`,
      "spent-grain",
    ),
    1,
  );
  assert.equal(
    kegReloaded.materials.transformations[0]?.settlement?.outputs.length,
    2,
  );
  const settledAle = containerQuantity(
    kegReloaded.materials,
    `vessel:${keg.id}`,
    "ale",
  );
  actualStep(kegReloaded);
  actualStep(kegReloaded);
  assert.equal(
    containerQuantity(kegReloaded.materials, `vessel:${keg.id}`, "ale"),
    settledAle,
    "a retired process cannot settle a second output",
  );
  assert.equal(
    removalProblem(kegReloaded, station),
    "The brew station is occupied.",
    "the retained keg and tray continue to block station removal",
  );

  assert.deepEqual(
    actualStep(kegReloaded, [{ kind: "tap", station: station.id }]),
    [{ status: "applied" }],
  );
  assert.ok(
    kegReloaded.jobs.some((job) => job.kind === "tap"),
    "the admitted shared Tap job remains until its twelve attended ticks finish",
  );
  for (
    let tick = 0;
    tick < 160 &&
    (kegReloaded.jobs.find((job) => job.kind === "tap")?.progress ?? 0) < 2;
    tick++
  )
    actualStep(kegReloaded);
  const firstTap = kegReloaded.jobs.find((job) => job.kind === "tap");
  const tapWorker = Object.values(kegReloaded.actors).find(
    (actor) => actor.task?.kind === "tap",
  );
  assert.ok(firstTap);
  assert.equal(firstTap.scope.actors, null, "Tap is shared Craft work");
  assert.ok(tapWorker);
  assert.ok(firstTap.progress >= 2);
  actualStep(kegReloaded, [{ kind: "draft", actor: tapWorker.id }]);
  const tapReloaded = restoreSnapshot(snapshotFor(kegReloaded)).state;
  const pausedTap = tapReloaded.jobs.find((job) => job.kind === "tap");
  assert.equal(tapReloaded.paused, true);
  assert.equal(pausedTap?.progress, firstTap.progress);
  actualStep(tapReloaded, [{ kind: "undraft", actor: tapWorker.id }]);
  tapReloaded.paused = false;
  for (
    let tick = 0;
    tick < 160 &&
    (tapReloaded.jobs.find((job) => job.kind === "tap")?.progress ?? 0) < 11;
    tick++
  )
    actualStep(tapReloaded);
  const aleLot = tapReloaded.materials.lots.find(
    (lot) => lot.material === "ale",
  );
  assert.ok(aleLot);
  const originalAleLocation = structuredClone(aleLot.location);
  aleLot.location = { kind: "ground", ...cell(1, 1) };
  const blockedTapMaterials = structuredClone(tapReloaded.materials);
  actualStep(tapReloaded);
  assert.deepEqual(
    tapReloaded.materials,
    blockedTapMaterials,
    "a blocked final tap leaves the serving receipt and physical lot unchanged",
  );
  assert.equal(tapReloaded.materials.consumptions.length, 0);
  tapReloaded.materials.lots.find((lot) => lot.id === aleLot.id).location =
    originalAleLocation;
  tapReloaded.workDirty = true;
  for (
    let tick = 0;
    tick < 160 && tapReloaded.jobs.some((job) => job.kind === "tap");
    tick++
  )
    actualStep(tapReloaded);
  assert.equal(
    containerQuantity(tapReloaded.materials, `vessel:${keg.id}`, "ale"),
    3,
  );
  assert.equal(tapReloaded.materials.consumptions.length, 1);
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(tapReloaded)));
  assert.deepEqual(
    actualStep(tapReloaded, [
      { kind: "clear-spent-grain", station: station.id },
    ]),
    [{ status: "rejected", reason: "Serve the remaining ale first" }],
  );
  assert.deepEqual(
    actualStep(tapReloaded, [{ kind: "brew", station: station.id }]),
    [{ status: "rejected", reason: "Finish the settled batch first." }],
  );
  for (let serving = 2; serving <= 4; serving++) {
    assert.deepEqual(
      actualStep(tapReloaded, [{ kind: "tap", station: station.id }]),
      [{ status: "applied" }],
    );
    for (
      let tick = 0;
      tick < 160 && tapReloaded.jobs.some((job) => job.kind === "tap");
      tick++
    )
      actualStep(tapReloaded);
    assert.equal(
      containerQuantity(tapReloaded.materials, `vessel:${keg.id}`, "ale"),
      4 - serving,
    );
  }
  assert.equal(tapReloaded.materials.consumptions.length, 4);
  const laterBatch = structuredClone(tapReloaded);
  const exhausted = laterBatch.materials.transformations[0];
  assert.ok(exhausted?.settlement);
  laterBatch.materials.transformations.push({
    ...exhausted,
    id: "settled-batch-after-exhaustion",
    settlement: {
      ...exhausted.settlement,
      retained: exhausted.settlement.retained.map((entry) => ({ ...entry })),
      outputs: exhausted.settlement.outputs.map((entry) => ({ ...entry })),
    },
  });
  laterBatch.materials.lots.push({
    id: "ale-from-later-batch",
    material: "ale",
    quantity: 4,
    location: { kind: "container", container: `vessel:${keg.id}` },
  });
  assert.deepEqual(
    recipeOutputReadiness(laterBatch, station, "tap"),
    { kind: "ready", transformation: "settled-batch-after-exhaustion" },
    "an exhausted older receipt cannot shadow a later serving at the same station",
  );
  assert.deepEqual(
    actualStep(tapReloaded, [{ kind: "tap", station: station.id }]),
    [{ status: "rejected", reason: "Waiting for a settled ale serving" }],
  );
  actualStep(tapReloaded);
  assert.equal(
    tapReloaded.materials.consumptions.length,
    4,
    "a fifth or repeated tick cannot duplicate a serving",
  );
  assert.deepEqual(
    actualStep(tapReloaded, [
      { kind: "clear-spent-grain", station: station.id },
    ]),
    [{ status: "applied" }],
  );
  for (
    let tick = 0;
    tick < 160 &&
    tapReloaded.jobs.some((job) => job.kind === "clear-spent-grain");
    tick++
  )
    actualStep(tapReloaded);
  assert.equal(
    containerQuantity(
      tapReloaded.materials,
      `brew-tray:${station.id}`,
      "spent-grain",
    ),
    0,
    "clearing consumes the physical tray lot without a ground drop",
  );
  assert.equal(tapReloaded.materials.consumptions.length, 5);
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(tapReloaded)));
  tapReloaded.herbs.push({
    id: "second-batch-herb",
    kind: "mugwort",
    stage: "ready",
    work: 0,
    establishment: { kind: "legacy", at: 0 },
    plantedAt: 0,
    ...cell(7, 9),
  });
  tapReloaded.harvestedHerbs++;
  tapReloaded.materials.lots.push({
    id: "second-batch-mugwort",
    material: "mugwort",
    quantity: 1,
    location: { kind: "ground", ...cell(7, 9) },
  });
  assert.deepEqual(
    actualStep(tapReloaded, [{ kind: "fill-kettle", station: station.id }]),
    [{ status: "applied" }],
  );
  for (
    let tick = 0;
    tick < 1_200 && tapReloaded.jobs.some((job) => job.kind === "fill-kettle");
    tick++
  )
    actualStep(tapReloaded);
  assert.equal(
    containerQuantity(tapReloaded.materials, brewKettle(station).id, "water"),
    2,
  );
  assert.deepEqual(
    actualStep(tapReloaded, [{ kind: "brew", station: station.id }]),
    [{ status: "applied" }],
  );
  for (
    let tick = 0;
    tick < 3_000 &&
    (tapReloaded.processes.length > 0 ||
      containerQuantity(tapReloaded.materials, `vessel:${keg.id}`, "ale") < 4);
    tick++
  )
    actualStep(tapReloaded);
  assert.equal(
    tapReloaded.materials.transformations.length,
    2,
    "the emptied original keg and tray admit a second real batch",
  );
  assert.equal(
    containerQuantity(tapReloaded.materials, `vessel:${keg.id}`, "ale"),
    4,
  );
  assert.equal(
    containerQuantity(
      tapReloaded.materials,
      `brew-tray:${station.id}`,
      "spent-grain",
    ),
    1,
  );
  assert.equal(
    removalProblem(tapReloaded, station),
    "The brew station is occupied.",
    "spent grain retains the removal block after the keg is empty",
  );
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(tapReloaded)));
  conserve(kegReloaded);
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(kegReloaded)));
});

test("canceling PREPARE retires only its process promise and leaves staged brew lots", () => {
  const { state, station } = readyHerbalAleState();
  actualStep(state, [{ kind: "brew", station: station.id }]);
  for (
    let tick = 0;
    tick < 2_000 &&
    !(
      state.processes[0]?.phase === "prepare" &&
      state.processes[0].progress >= 1
    );
    tick++
  )
    actualStep(state);
  const job = state.jobs.find((candidate) => candidate.kind === "brew");
  assert.ok(job);
  const stagedMalt = containerQuantity(
    state.materials,
    brewKettle(station).id,
    "malt",
  );
  assert.deepEqual(actualStep(state, [{ kind: "cancel", job: job.id }]), [
    { status: "applied" },
  ]);
  assert.equal(state.processes.length, 0);
  assert.equal(
    state.materials.bindings.some((binding) => binding.kind === "brew"),
    false,
  );
  assert.equal(state.materials.transformations.length, 0);
  assert.equal(
    containerQuantity(state.materials, brewKettle(station).id, "malt"),
    stagedMalt,
  );
  assert.doesNotThrow(() => restoreSnapshot(snapshotFor(state)));
});

test("brew-station removal stays blocked for staged, Fill, and fermenting ownership", () => {
  const { state, station } = readyHerbalAleState();
  state.materials.lots = state.materials.lots.filter(
    (lot) => lot.id !== "herbal-ale-water",
  );
  state.materials.lots.find(
    (lot) => lot.material === "water" && lot.location.kind === "container",
  ).quantity = 8;
  assert.equal(removalProblem(state, station), null);
  state.materials.lots.push({
    id: "staged-malt",
    material: "malt",
    quantity: 1,
    location: { kind: "container", container: brewKettle(station).id },
  });
  assert.equal(removalProblem(state, station), "The brew station is occupied.");
  state.materials.lots = state.materials.lots.filter(
    (lot) => lot.id !== "staged-malt",
  );
  state.operations.push({
    kind: "water-delivery",
    id: "fill-active",
    job: "fill-job",
    supply: {
      kind: "container",
      container: `source:${state.sources.find((source) => source.kind === "spring").id}`,
    },
    target: { kind: "kettle", station: station.id },
    quantity: 2,
    pail: "unused-pail",
    execution: { phase: "acquire" },
  });
  assert.equal(removalProblem(state, station), "The brew station is occupied.");
  state.operations[0].target = { kind: "mugwort", herb: "herb-unrelated" };
  assert.equal(
    removalProblem(state, station),
    null,
    "a plant delivery does not claim an unrelated brew station",
  );
  state.operations = [];
  state.jobs.push({
    id: "brew-job",
    kind: "brew",
    target: station.id,
    lifecycle: "active",
    scope: shared,
    reason: "Fermenting",
    routine: false,
  });
  state.materials.bindings.push({
    kind: "recipe",
    id: "brew-process",
    definition: "herbal-ale-v1",
    station: brewKettle(station).id,
    consumed: [],
    retained: [],
    promises: [],
  });
  state.materials.transformations.push({
    id: "brew-process",
    definition: "herbal-ale-v1",
    inputs: [],
  });
  state.processes.push({
    id: "brew-process",
    job: "brew-job",
    station: station.id,
    binding: "brew-process",
    phase: "ferment",
    progress: 0,
    enteredAt: 0,
  });
  assert.equal(removalProblem(state, station), "The brew station is occupied.");
});

test("actual libcolony finishes an adjacent two-cell trench across a paused reload without spoiling either target", () => {
  const state = createClearing();
  state.parties.home.members.push("sedge");
  const left = { x: 7, z: 9, level: 0 };
  const right = { x: 8, z: 9, level: 0 };
  assert.deepEqual(
    actualStep(state, [
      { kind: "dig", voxel: [0, 14, 128] },
      { kind: "dig", voxel: [1, 14, 128] },
    ]),
    [{ status: "applied" }, { status: "applied" }],
  );
  actualRun(state, 16);
  const restored = restoreSnapshot(snapshotFor(state)).state;
  assert.equal(restored.paused, true);
  restored.paused = false;
  actualRun(restored, 125);
  assert.deepEqual(
    new Set(restored.terrain.exports.map((entry) => entry.nodeId)),
    new Set(["cell:0,14,128", "cell:1,14,128"]),
  );
  const soil = restored.materials.lots.filter((lot) => lot.material === "soil");
  assert.equal(
    soil.reduce((sum, lot) => sum + lot.quantity, 0),
    2,
  );
  assert.ok(
    soil.every(
      (lot) =>
        lot.location.kind === "ground" &&
        ![cell(7, 9), cell(8, 9)].some(
          (at) =>
            at.x === lot.location.x &&
            at.y === lot.location.y &&
            at.z === lot.location.z,
        ),
    ),
  );
});

test("a new loose occupant interrupts a dig before settlement without minting soil", () => {
  const state = createClearing();
  const target = cell(7, 9);
  actualStep(state, [{ kind: "dig", voxel: [0, 14, 128] }]);
  actualRun(state, 12);
  assert.equal(createGroundLot(state.materials, "pail", 1, target).ok, true);
  actualRun(state, 55);
  assert.deepEqual(state.terrain.exports, []);
  assert.equal(
    state.materials.lots.some((lot) => lot.material === "soil"),
    false,
  );
  assert.ok(state.jobs.some((job) => job.kind === "dig"));
});
