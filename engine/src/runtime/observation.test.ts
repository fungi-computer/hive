import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { projectPresentation } from "../presentation";
import { survivalPack } from "../games/survival";
import { GameSession } from "./session";
import { buildObservation } from "./observation";
import { wasmKernelPort } from "./wasm-kernel";

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
    const presentation = projectPresentation(survivalPack, {
      query: (spec) => session.query(spec),
      atmosphereSamples: cells => session.atmosphereSamples(cells),
    });

    assert.equal(observation.time, session.simulationTime);
    assert.equal(observation.paused, session.isPaused);
    assert.equal(observation.epoch, 4);
    assert.equal(observation.sequence, 9);
    assert.deepEqual(observation.facts.map(({inventory,...fact})=>fact), session.renderFacts(512));
    assert.deepEqual(observation.presentationFacts, presentation.facts);
    assert.deepEqual(observation.presentationControls, presentation.controls);
    assert.deepEqual(session.save(), before);
  } finally {
    port.dispose();
  }
});
