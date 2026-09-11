import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { query } from "../sdk/authoring";
import { colonyPack, ColonyDigOrder } from "./colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("actual WASM accepts a compact area and saves one stable order per cell", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("dig", { area: { start: [1, 13, 0], end: [2, 13, 0] } });
    session.step(0);
    const orders = session.query(query(ColonyDigOrder));
    assert.deepEqual(orders.map((row) => row.id), [
      "colony.dig.1.13.0",
      "colony.dig.2.13.0",
    ]);
    assert.equal(orders.length, 2);
    assert.ok(orders.every((row) => ["queued", "approaching", "excavating", "blocked", "carrying"].includes(row.get(ColonyDigOrder).phase)));
    const saved = session.save();
    const restoredPort = wasmKernelPort(new WasmKernel());
    try {
      const restored = new GameSession({ port: restoredPort, pack: colonyPack });
      restored.restore(saved);
      assert.deepEqual(restored.save(), saved);
    } finally {
      restoredPort.dispose();
    }
  } finally {
    port.dispose();
  }
});

test("actual WASM rejects an area above the bounded designation size", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    assert.throws(
      () => session.command("dig", { area: { start: [0, 13, 0], end: [16, 13, 15] } }),
      /256 cells/,
    );
    assert.equal(session.query(query(ColonyDigOrder)).length, 0);
  } finally {
    port.dispose();
  }
});
