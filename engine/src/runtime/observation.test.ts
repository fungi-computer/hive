import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { survivalPack } from "../games/survival";
import { GameSession } from "./session";
import { buildObservation } from "./observation";
import { wasmKernelPort } from "./wasm-kernel";
import { MAX_RENDER_FACTS } from "./visual-projection";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("observation matches the session and does not mutate committed state", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({
      port,
      pack: survivalPack,
      seed: 17,
    });
    session.start();
    const before = session.save();
    const observation = buildObservation(session, { epoch: 4, sequence: 9 });
    assert.equal(observation.time, session.simulationTime);
    assert.equal(observation.paused, session.isPaused);
    assert.equal(observation.epoch, 4);
    assert.equal(observation.sequence, 9);
    assert.deepEqual(observation.facts.map(({inventory,...fact})=>fact), session.renderFacts(MAX_RENDER_FACTS));
    assert.ok(observation.whistleAgent.length > 0);
    assert.deepEqual(observation.whistleTargets, []);
    assert.deepEqual(session.save(), before);
  } finally {
    port.dispose();
  }
});
