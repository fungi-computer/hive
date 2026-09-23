import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { survivalPack } from "../games/survival";
import { GameSession } from "./session";
import { buildObservation, createObservationProjector } from "./observation";
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

test("Region projector carries exact dependency baselines across committed sessions", () => {
  const makeSession = () => {
    const port = wasmKernelPort(new WasmKernel());
    const session = new GameSession({ port, pack: survivalPack, seed: 17 });
    session.start();
    return { port, session };
  };
  const first = makeSession();
  const second = makeSession();
  const replacement = makeSession();
  const project = createObservationProjector();
  try {
    const baseline = project(first.session, { epoch: 0, sequence: 1 });
    const sameCommittedFacts = project(second.session, { epoch: 0, sequence: 2 });
    assert.equal(sameCommittedFacts.presentationFacts, baseline.presentationFacts,
      "same Region/pack dependencies reuse the committed projection across resident session replacement");
    assert.equal(sameCommittedFacts.whistleAgent, baseline.whistleAgent);

    second.session.step(0.1);
    const changed = project(second.session, { epoch: 0, sequence: 3 });
    assert.notEqual(changed.presentationFacts, baseline.presentationFacts,
      "a changed committed dependency rebuilds the projection");
    assert.notDeepEqual(changed.presentationFacts, baseline.presentationFacts);

    const reset = project(replacement.session, { epoch: 0, sequence: 3 });
    assert.notEqual(reset.presentationFacts, changed.presentationFacts,
      "a same-revision resident replacement clears the prior projection scope");

    const anotherWorld = createObservationProjector()(second.session, { epoch: 0, sequence: 3 });
    assert.notEqual(anotherWorld.presentationFacts, changed.presentationFacts,
      "another Region/world projector starts with an independent projection owner");
  } finally {
    first.port.dispose();
    second.port.dispose();
    replacement.port.dispose();
  }
});
