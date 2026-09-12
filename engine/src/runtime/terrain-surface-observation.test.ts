import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { colonyPack } from "../games/colony";
import { GameSession } from "./session";
import { buildObservation } from "./observation";
import { wasmKernelPort } from "./wasm-kernel";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
test("excavated surface retains the Rust generated height through observation and restore", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ pack: colonyPack, port });
    session.start();
    const surface = () => buildObservation(session, { epoch: 0, sequence: 0 }).terrain?.surfaces.find(s => s.cell[0] === 1 && s.cell[2] === 0);
    const original = surface();
    assert(original);
    assert.equal(original.generatedTop, original.cell[1]);
    session.command("dig", { area: { start: [...original.cell], end: [...original.cell] } });
    let lowered = original;
    for (let tick = 0; tick < 240 && lowered.cell[1] === original.cell[1]; tick++) {
      session.step(0.1);
      lowered = surface()!;
    }
    assert.equal(lowered.cell[1], original.cell[1] - 1);
    assert.equal(lowered.generatedTop, original.generatedTop);
    session.restore(session.save());
    assert.deepEqual(surface(), lowered);
  } finally { port.dispose(); }
});
