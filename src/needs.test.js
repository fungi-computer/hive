import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createClearing, step } from "./clearing.ts";
import { snapshotFor, restoreSnapshot } from "./persistence.ts";
import { materialQuantity } from "./materials.ts";
import { careFacts } from "./needs.ts";

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
    window: {}, console, TextDecoder, TextEncoder, WebAssembly, setTimeout, clearTimeout,
  };
  vm.runInNewContext(
    readFileSync(new URL("../public/vendor/libcolony/colony.js", import.meta.url), "utf8"),
    context,
  );
});
function tick(state, commands = []) {
  return step(state, wasmColony, commands.map((command) =>
    command.kind === "draft" || command.kind === "undraft" || command.kind === "recruit"
      ? { party: "home", ...command }
      : { party: "home", actors: null, level: 0, ...command },
  ));
}
function run(state, ticks) {
  for (let i = 0; i < ticks; i++) tick(state);
}
function openCache(state) {
  tick(state, [{ kind: "chop", tree: state.trees[0].id }]);
  for (let i = 0; i < 600 && state.felled === 0; i++) tick(state);
  assert.equal(state.felled, 1, "actual chop supplies repair wood");
  tick(state, [{ kind: "repair-cache" }]);
  for (let i = 0; i < 600 && !state.sources.some((source) => source.kind === "reclaimed-timber-cache" && source.repaired); i++) tick(state);
  assert.equal(state.sources.find((source) => source.kind === "reclaimed-timber-cache")?.repaired, true, "actual repair opens the finite cache");
}
function waitFor(state, predicate, limit = 900) {
  for (let i = 0; i < limit && !predicate(); i++) tick(state);
  assert.ok(predicate(), "care outcome completed through actual WASM assignment");
}

test("needs decay on elapsed active ticks and pause freezes elapsed time", () => {
  const state = createClearing();
  run(state, 7200);
  assert.ok(Math.abs(state.actors.rowan.needs.hydration - 35) < 0.02);
  assert.ok(Math.abs(state.actors.rowan.needs.nourishment - 61) < 0.02);
  const before = structuredClone(state.actors.sedge.needs);
  state.paused = true;
  run(state, 20);
  assert.equal(state.tick, 7200);
  assert.deepEqual(state.actors.sedge.needs, before);
});

test("unjoined Sedge receives actual food and water care without party membership", () => {
  const state = createClearing();
  openCache(state);
  assert.equal(state.parties.home.members.includes("sedge"), false);
  state.actors.sedge.needs.hydration = 35;
  waitFor(state, () => state.careOutcomes.some((outcome) => outcome.actor === "sedge" && outcome.need === "hydration"));
  state.actors.sedge.needs.hydration = 100;
  state.actors.sedge.needs.nourishment = 35;
  waitFor(state, () => state.careOutcomes.some((outcome) => outcome.actor === "sedge" && outcome.need === "nourishment"));
  assert.ok(state.actors.sedge.needs.nourishment > 90);
});

test("blocked rest reconsiders a later viable thirst without unrelated work", () => {
  const state = createClearing();
  openCache(state);
  const finishedBefore = state.finishedJobs;
  state.actors.rowan.needs.rest = 35;
  tick(state);
  const care = state.jobs.find((job) => job.kind === "care" && job.target === "rowan");
  assert.equal(care?.need, "rest", "the first automatic need is queued");
  assert.equal(state.actors.rowan.task, null, "no bed leaves rest queued");
  state.actors.rowan.needs.hydration = 35;
  waitFor(state, () => state.careOutcomes.some((outcome) => outcome.actor === "rowan" && outcome.need === "hydration"));
  assert.equal(state.finishedJobs, finishedBefore + 1, "only the care job completed");
});

test("rest commands require selected home members and pin one care job per selection", () => {
  const state = createClearing();
  let results = tick(state, [{ kind: "rest", actors: ["sedge"] }]);
  assert.equal(results[0]?.status, "rejected");
  results = tick(state, [{ kind: "rest", actors: null }]);
  assert.equal(results[0]?.status, "rejected");
  results = tick(state, [{ kind: "recruit", actor: "sedge" }]);
  assert.equal(results[0]?.status, "applied");
  results = tick(state, [{ kind: "rest", actors: ["rowan", "sedge"] }]);
  assert.equal(results[0]?.status, "applied");
  assert.deepEqual(
    state.jobs.filter((job) => job.kind === "care" && job.policy === "manual-rest").map((job) => job.target).sort(),
    ["rowan", "sedge"],
  );
  results = tick(state, [{ kind: "rest", actors: ["rowan", "sedge"] }]);
  assert.equal(results[0]?.status, "applied");
  assert.equal(state.jobs.filter((job) => job.kind === "care" && job.policy === "manual-rest").length, 2);
});

test("drafted ration attendance drops custody and retries once after undraft", () => {
  const state = createClearing();
  openCache(state);
  state.actors.rowan.needs.nourishment = 35;
  waitFor(state, () => state.actors.rowan.task?.kind === "consume" && state.actors.rowan.work > 0, 900);
  const before = materialQuantity(state.materials, "ration").live;
  tick(state, [{ kind: "draft", actor: "rowan" }]);
  assert.equal(state.careOutcomes.filter((outcome) => outcome.need === "nourishment").length, 0);
  assert.equal(materialQuantity(state.materials, "ration").live, before);
  tick(state, [{ kind: "undraft", actor: "rowan" }]);
  waitFor(state, () => state.careOutcomes.filter((outcome) => outcome.actor === "rowan" && outcome.need === "nourishment").length === 1);
  assert.equal(state.careOutcomes.filter((outcome) => outcome.actor === "rowan" && outcome.need === "nourishment").length, 1);
});

test("paused reload during consume preserves one pending portion and one eventual outcome", () => {
  const state = createClearing();
  openCache(state);
  state.actors.rowan.needs.nourishment = 35;
  waitFor(state, () => state.actors.rowan.task?.kind === "consume" && state.actors.rowan.work > 0, 900);
  state.paused = true;
  const restored = restoreSnapshot(snapshotFor(state)).state;
  assert.equal(restored.paused, true);
  assert.equal(restored.careOutcomes.length, 0);
  restored.paused = false;
  waitFor(restored, () => restored.careOutcomes.filter((outcome) => outcome.actor === "rowan" && outcome.need === "nourishment").length === 1);
  assert.equal(restored.careOutcomes.length, 1);
});

test("manual rest and automatic care survive paused restore in either admission order", () => {
  for (const automaticFirst of [false, true]) {
    const state = createClearing();
    state.actors.rowan.needs.hydration = 35;
    if (automaticFirst) tick(state);
    state.paused = true;
    assert.equal(tick(state, [{ kind: "rest", actors: ["rowan"] }])[0].status, "applied");
    state.paused = false;
    tick(state);
    const care = state.jobs.filter((job) => job.kind === "care" && job.target === "rowan");
    assert.equal(care.length, 2);
    const saved = snapshotFor(state);
    const restored = restoreSnapshot(saved).state;
    assert.deepEqual(restored.jobs, state.jobs);
    for (const policy of ["automatic", "manual-rest", "routine-rest"]) {
      const bad = structuredClone(saved);
      bad.savedState.jobs.push({ ...care.find((job) => job.policy === (policy === "routine-rest" ? "manual-rest" : policy)), id: "duplicate-care", policy, routine: policy === "routine-rest" });
      assert.throws(() => restoreSnapshot(bad), /care job/);
    }
    restored.paused = false;
    tick(restored);
    assert.doesNotThrow(() => snapshotFor(restored));
  }
});

test("actual partial Store pickup restores its split custody and rejects corrupt joins", () => {
  const state = createClearing();
  tick(state, [{ kind: "chop", tree: state.trees[0].id }]);
  waitFor(state, () => state.felled === 1);
  assert.equal(tick(state, [{ kind: "build", type: "shelf", direction: 0, x: 5, z: 6 }])[0].status, "applied");
  waitFor(state, () => state.sites.some((site) => site.type === "shelf" && site.finishedAt !== null));
  const shelf = state.sites.find((site) => site.type === "shelf");
  const source = state.materials.lots.find((lot) => lot.material === "wood" && lot.location.kind === "ground" && lot.quantity > 2);
  const before = source.quantity;
  assert.equal(tick(state, [{ kind: "store", lot: source.id, shelf: shelf.id }])[0].status, "applied");
  waitFor(state, () => state.materials.transfers.some((transfer) => transfer.phase.kind === "carrying"));
  const transfer = state.materials.transfers.find((entry) => entry.phase.kind === "carrying");
  const held = state.materials.lots.find((lot) => lot.id === transfer.phase.lot);
  assert.notEqual(held.id, source.id);
  assert.equal(source.quantity + held.quantity, before);
  const saved = snapshotFor(state);
  const restored = restoreSnapshot(saved).state;
  assert.deepEqual(restored.materials, state.materials);
  for (const corrupt of [
    (s, t) => { t.request.quantityPolicy = "whole-lot"; },
    (s, t) => { t.request.source.lot = "unrelated-source"; },
    (s, t) => { t.request.quantity++; },
    (s, t) => { t.intent.destination = "missing-container"; },
    (s, t) => { t.owner.job = "missing-job"; },
    (s, t) => { s.materials.lots.find((lot) => lot.id === t.phase.lot).location.actor = "sedge"; },
  ]) {
    const bad = structuredClone(saved);
    corrupt(bad.savedState, bad.savedState.materials.transfers.find((entry) => entry.id === transfer.id));
    assert.throws(() => restoreSnapshot(bad));
  }
  const wrongMaterial = structuredClone(saved);
  const materialLots = wrongMaterial.savedState.materials.lots;
  materialLots.find((lot) => lot.id === source.id).material = "ration";
  assert.throws(() => restoreSnapshot(wrongMaterial), /carrying transfer .* invalid material/);
  restored.paused = false;
  waitFor(restored, () => !restored.jobs.some((job) => job.id === transfer.owner.job));
  assert.doesNotThrow(() => snapshotFor(restored));
});


test("care facts follow active custody despite queued intent order", () => {
  const state = createClearing();
  openCache(state);
  state.actors.rowan.needs.hydration = 35;
  tick(state);
  tick(state, [{ kind: "rest", actors: ["rowan"] }]);
  waitFor(state, () => state.actors.rowan.task?.kind === "water-delivery");
  const active = state.jobs.find((job) => job.id === state.actors.rowan.task.job);
  assert.ok(active);
  const rest = state.jobs.find((job) => job.kind === "care" && job.policy === "manual-rest");
  assert.ok(rest);
  state.jobs = [rest, ...state.jobs.filter((job) => job !== rest)];
  const facts = careFacts(state, "rowan");
  assert.equal(facts.queued, "hydration");
  assert.equal(facts.active, "water-delivery");
  assert.equal(facts.reason, active.reason);
  assert.doesNotThrow(() => snapshotFor(state));
});
