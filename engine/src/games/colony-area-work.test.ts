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
    session.command("dig", { area: { start: [1, 0], end: [2, 0], fixedY: 0 } });
    const orders = session.query(query(ColonyDigOrder));
    assert.deepEqual(orders.map((row) => row.id), [
      "colony.dig.1.0.0",
      "colony.dig.2.0.0",
    ]);
    assert.deepEqual(orders.map((row) => row.get(ColonyDigOrder).phase), ["queued", "queued"]);
    assert.deepEqual(session.save(), session.save());
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
      () => session.command("dig", { area: { start: [0, 0], end: [16, 15], fixedY: 0 } }),
      /256 cells/,
    );
    assert.equal(session.query(query(ColonyDigOrder)).length, 0);
  } finally {
    port.dispose();
  }
});
