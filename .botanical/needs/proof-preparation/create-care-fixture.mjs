import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import { createClearing, step } from "../../../src/clearing.ts";
import { sourcePailContainer, sourceSuppliesContainer } from "../../../src/finite-sources.ts";
import { containerQuantity } from "../../../src/materials.ts";
import { restoreSnapshot, snapshotFor } from "../../../src/persistence.ts";

const [wasmBinary, wasmSource] = await Promise.all([
  readFile(new URL("../../../public/vendor/libcolony/colony.wasm", import.meta.url)),
  readFile(new URL("../../../public/vendor/libcolony/colony.js", import.meta.url), "utf8"),
]);

const wasm = await new Promise((resolve, reject) => {
  const context = {
    Module: {
      wasmBinary,
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
  vm.runInNewContext(wasmSource, context);
});

function actualStep(state, commands = []) {
  return step(
    state,
    wasm,
    commands.map((command) => ({
      party: "home",
      actors: null,
      level: 0,
      ...command,
    })),
  );
}

/**
 * A short, lawful fixture: the real optimizer cuts one oak, then repairs the
 * cache from that earned wood. Low needs are intentionally a prepared-state
 * precondition; the six/ten-minute natural pacing belongs to core unit laws.
 */
export function prepareCareFixture() {
  const state = createClearing(31415);
  const oak = state.trees.find((tree) => tree.felledAt === null);
  assert.ok(oak, "fixture needs a standing oak");
  assert.deepEqual(actualStep(state, [{ kind: "chop", tree: oak.id }]), [
    { status: "applied" },
  ]);
  for (let ticks = 0; ticks < 1_200 && state.felled < 1; ticks++) actualStep(state);
  assert.ok(state.felled >= 1, "real chop must produce a felled oak");

  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  assert.ok(cache, "fixture needs the reclaimed cache");
  assert.deepEqual(actualStep(state, [{ kind: "repair-cache" }]), [
    { status: "applied" },
  ]);
  for (let ticks = 0; ticks < 1_800 && !cache.repaired; ticks++) actualStep(state);
  assert.equal(cache.repaired, true, "real repair must open cache access");
  assert.ok(
    containerQuantity(state.materials, sourceSuppliesContainer(cache.id), "ration") >= 1,
    "opened cache must hold a ration",
  );
  assert.equal(
    containerQuantity(state.materials, sourcePailContainer(cache.id), "pail"),
    1,
    "opened cache must hold its pail",
  );

  // This is the only prepared-state mutation. It does not queue care or alter custody.
  state.actors.rowan.needs.nourishment = 30;
  state.actors.rowan.needs.hydration = 30;
  state.actors.rowan.needs.advancedAt = state.tick;
  state.actors.sedge.needs.nourishment = 100;
  state.actors.sedge.needs.hydration = 30;
  state.actors.sedge.needs.advancedAt = state.tick;
  const snapshot = snapshotFor(state);
  const restored = restoreSnapshot(snapshot).state;
  assert.equal(restored.paused, true, "loaded fixture begins paused");
  assert.equal(restored.actors.sedge.drafted, false, "Sedge remains an outsider");
  assert.equal(restored.parties.home.members.includes("sedge"), false);
  assert.equal(restored.jobs.some((job) => job.kind === "care"), false);
  assert.equal(restored.operations.some((operation) => operation.kind === "consume"), false);
  assert.equal(restored.careOutcomes.length, 0);
  // Validate the paused recovery form a second time before browser admission.
  return snapshotFor(restored);
}

export async function writePreparedFixture(path) {
  const snapshot = prepareCareFixture();
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
  await writePreparedFixture(
    process.argv[2] || ".botanical/needs/proof-preparation/care-fixture.json",
  );
