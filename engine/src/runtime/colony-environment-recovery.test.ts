import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { colonyPack, ColonyDigOrder } from "../games/colony";
import { query } from "../sdk/authoring";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("Colony soil flow then excavation restores the exact next water/gas step", () => {
  const port = wasmKernelPort(new WasmKernel());
  const recoveredPort = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    const initial = port.environmentFacts();
    for (let step = 0; step < 5; step++) session.step(0.1);
    assert.notDeepEqual(port.environmentFacts(), initial, "the field must actually change before digging");
    session.command("dig", { area: { start: [1, 13, 0], end: [2, 13, 0] } });
    // step(0) admits the same public intent before checking its completion.
    session.step(0);
    assert.equal(session.query(query(ColonyDigOrder)).length, 2);
    for (let step = 0; step < 240 && session.query(query(ColonyDigOrder)).length; step++) session.step(0.1);
    assert.equal(session.query(query(ColonyDigOrder)).length, 0, "both earned dig orders must complete");
    const saved = session.save();
    const recovered = new GameSession({ port: recoveredPort, pack: colonyPack });
    recovered.restore(saved);
    assert.deepEqual(recovered.save(), saved);
    session.step(0.1);
    recovered.step(0.1);
    assert.deepEqual(recovered.save(), session.save(), "water, gas, routes and work must continue identically");
  } finally {
    port.dispose();
    recoveredPort.dispose();
  }
});
