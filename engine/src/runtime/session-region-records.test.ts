import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { openRegion } from "../../../src/engine/region/index.ts";
import { sqliteTestOwner } from "../../../src/engine/region/sqlite-test-owner.mjs";
import { createSessionRegionProgram } from "./region-program";
import { hydrateSession } from "./session-record-store";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { colonyPack } from "../games/colony";
import { environmentFixture } from "./fixtures/environment";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("actual Colony water records commit with session and recover after failed SQL", () => {
  const db = new DatabaseSync(":memory:");
  let failRecord = false;
  const owner = sqliteTestOwner(db, (statement: string) => {
    if (failRecord && statement.startsWith("INSERT OR REPLACE INTO hive_region_records")) throw new Error("injected record failure");
  });
  const pack = { ...colonyPack, environmentDefinition: new TextEncoder().encode(JSON.stringify(environmentFixture)) };
  const open = () => openRegion({ owner, region: "wet-colony", program: createSessionRegionProgram({
    pack, createKernel: () => wasmKernelPort(new WasmKernel()), implementationHash: "a".repeat(64),
    ownerPrincipal: "player", hostPrincipal: "clock", seed: 17,
  }) });
  const records = (region: ReturnType<typeof open>) => {
    const { revision } = region.readCommitted();
    return region.readRecords(revision).records;
  };
  try {
    let region = open();
    const command = { id: "step-1", command: { kind: "step", delta: 0.1 } };
    const receipt = region.dispatch("clock", command);
    assert.equal(receipt.status, "applied");
    assert.equal(region.readCommitted().state.session.tick, 1);
    const saved = records(region);
    assert.ok(saved.some(record => record.key === "kernel/environment/water"));
    assert.equal(Object.hasOwn(region.readCommitted().state.session.kernel, "records"), false);
    region = open();
    assert.deepEqual(region.dispatch("clock", command), receipt);
    assert.deepEqual(records(region), saved);
    const header = region.readCommitted();
    failRecord = true;
    const next = { id: "step-2", command: { kind: "step", delta: 0.1 } };
    assert.throws(() => region.dispatch("clock", next), /injected record failure/);
    assert.deepEqual(region.readCommitted(), header);
    assert.deepEqual(records(region), saved);
    failRecord = false;
    region = open();
    assert.equal(region.dispatch("clock", next).status, "applied");
    const current = region.readCommitted();
    const bytes = new Map(records(region).map(record => [record.key, record.bytes]));
    const port = wasmKernelPort(new WasmKernel());
    try {
      const session = new GameSession({ port, pack, seed: 17 });
      session.restore(hydrateSession(current.state.session, { read: key => bytes.get(key) }));
      assert.equal(session.simulationTime, 0.2);
      assert.ok((port.environmentFacts() as { totalKg: number }).totalKg > 0);
    } finally { port.dispose(); }
  } finally { db.close(); }
});
