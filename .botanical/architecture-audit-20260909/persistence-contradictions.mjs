import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClearing, step } from "../../src/clearing.ts";
import { snapshotFor, restoreSnapshot } from "../../src/persistence.ts";

const root = new URL("../../", import.meta.url);
const files = ["src/clearing.ts", "src/orders.ts", "src/needs.ts", "src/jobs.ts", "src/materials.ts", "src/persistence.ts"];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sourceHashes = () => Object.fromEntries(files.map(file => [file, hash(readFileSync(new URL(file, root)))]));
const report = {
  scope: "Read-only runtime diagnostic; only ignored diagnostic/evidence files written. No browser or production mutations.",
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceBefore: sourceHashes(),
  shippedPartialRule: execFileSync("git", ["show", "449e9b8:src/persistence.ts"], { cwd: root, encoding: "utf8" }).includes('transfer.request.source.lot !== lot.id'),
  cases: [],
};
const colony = await new Promise((resolve, reject) => {
  const context = {
    Module: {
      wasmBinary: readFileSync(new URL("public/vendor/libcolony/colony.wasm", root)),
      onRuntimeInitialized() { resolve(context.Module); },
      onAbort: reject,
    },
    window: {}, console, TextDecoder, TextEncoder, WebAssembly, setTimeout, clearTimeout,
  };
  vm.runInNewContext(readFileSync(new URL("public/vendor/libcolony/colony.js", root), "utf8"), context);
});
function tick(state, commands = []) { return step(state, colony, commands); }
function valid(state) { restoreSnapshot(snapshotFor(state)); return true; }
function snapshotError(state) {
  try { valid(state); return null; }
  catch (error) { return String(error.message); }
}
function until(state, condition, max = 1000) {
  for (let ticks = 0; ticks < max && !condition(); ticks++) tick(state);
  assert.ok(condition(), `actual work did not reach requested checkpoint in ${max} ticks`);
}
try {
  {
    const record = { name: "manual rest plus automatic thirst", setup: "createClearing; explicitly set Rowan hydration to 35 as a mature-needs fixture, no other world edits", beforeValid: false };
    report.cases.push(record);
    const state = createClearing();
    state.actors.rowan.needs.hydration = 35;
    state.paused = true;
    record.beforeValid = valid(state);
    record.command = { kind: "rest", party: "home", actors: ["rowan"] };
    record.receipts = tick(state, [record.command]);
    assert.equal(record.receipts[0].status, "applied");
    record.manualOnlyValid = valid(state);
    state.paused = false;
    tick(state);
    record.tick = state.tick;
    record.jobs = structuredClone(state.jobs.filter(job => job.kind === "care" && job.target === "rowan"));
    assert.equal(record.jobs.length, 2);
    record.error = snapshotError(state);
    record.reproduced = record.error?.includes("care job") === true;
    assert.ok(record.reproduced, "care snapshot contradiction not reproduced");
  }
  {
    const record = { name: "partial exact-lot storage pickup", setup: "fresh createClearing; actual paused Chop -> resume/fell -> actual Build shelf -> completion -> actual Store; no inventory, site, transfer or actor fixture edits", beforeValid: false };
    report.cases.push(record);
    const state = createClearing();
    state.paused = true;
    record.beforeValid = valid(state);
    const chop = { kind: "chop", party: "home", actors: null, tree: state.trees[0].id };
    record.chopReceipt = tick(state, [chop]);
    assert.equal(record.chopReceipt[0].status, "applied");
    state.paused = false;
    until(state, () => state.felled === 1);
    state.paused = true;
    record.felledValid = valid(state);
    const build = { kind: "build", party: "home", actors: null, type: "shelf", direction: 0, x: 5, z: 6, level: 0 };
    record.buildReceipt = tick(state, [build]);
    assert.equal(record.buildReceipt[0].status, "applied");
    state.paused = false;
    until(state, () => state.sites.some(site => site.type === "shelf" && site.finishedAt !== null));
    state.paused = true;
    record.finishedShelfValid = valid(state);
    const shelf = state.sites.find(site => site.type === "shelf");
    const lot = state.materials.lots.find(lot => lot.material === "wood" && lot.location.kind === "ground" && lot.quantity > 2);
    assert.ok(lot, "actual fell/build must leave a splittable loose wood lot");
    record.sourceBefore = structuredClone(lot);
    const store = { kind: "store", party: "home", actors: null, lot: lot.id, shelf: shelf.id };
    record.storeCommand = store;
    record.storeReceipt = tick(state, [store]);
    assert.equal(record.storeReceipt[0].status, "applied");
    record.admittedStoreValid = valid(state);
    state.paused = false;
    until(state, () => state.materials.transfers.some(transfer => transfer.phase.kind === "carrying"));
    state.paused = true;
    record.tick = state.tick;
    record.transfer = structuredClone(state.materials.transfers.find(transfer => transfer.phase.kind === "carrying"));
    record.sourceAfter = structuredClone(state.materials.lots.find(entry => entry.id === lot.id));
    record.carried = structuredClone(state.materials.lots.find(entry => entry.id === record.transfer.phase.lot));
    assert.equal(record.transfer.request.source.kind, "exact-lot");
    assert.notEqual(record.transfer.request.source.lot, record.transfer.phase.lot);
    assert.equal(record.sourceBefore.quantity, record.sourceAfter.quantity + record.carried.quantity);
    record.error = snapshotError(state);
    record.reproduced = record.error?.includes("carrying transfer") === true;
    assert.ok(record.reproduced, "partial storage snapshot contradiction not reproduced");
  }
} catch (error) {
  report.unexpectedError = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  report.sourceAfter = sourceHashes();
  report.sourceUnchanged = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  writeFileSync(new URL("persistence-contradictions.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ cases: report.cases.map(({ name, error, reproduced }) => ({ name, error, reproduced })), sourceUnchanged: report.sourceUnchanged, unexpectedError: report.unexpectedError ?? null }));
}
