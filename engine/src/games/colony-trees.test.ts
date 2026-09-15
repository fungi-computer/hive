import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { ColonyTreePolicy } from "./colony-work";
import { colonyPack, treeJob } from "./colony";
import { FiniteResource, JobTaskWork, MaterialLot, query } from "../sdk/index";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

const quantity = (session: GameSession, kind: string) =>
  session.query(query(MaterialLot)).reduce(
    (sum, row) => sum + (row.get(MaterialLot).kind === kind ? row.get(MaterialLot).quantity : 0),
    0,
  );

test("tree job preserves physical stages across cancellation and reload, then completes once", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  try {
    session.start();
    const tree = "colony.tree.oak";
    const job = treeJob(tree);
    const fell = `${job}:task:fell`;
    const chop = `${job}:task:chop`;
    const initialWood = quantity(session, "wood");

    const initialTargets = session.whistleObservation({ query: spec => session.query(spec) }).targets;
    assert.deepEqual(
      initialTargets.find(target => target.commandId === "colony:designateTrees")?.subjects,
      [tree, "colony.tree.pine", "colony.tree.willow"],
    );
    session.command("designateTrees", { entities: [tree] });
    session.step(0);
    assert.equal(session.query(query(ColonyTreePolicy)).find(row => row.id === tree)?.get(ColonyTreePolicy).job, job);
    assert.throws(
      () => session.command("cancelTrees", { entities: [tree] }, { kind: "player", player: "other", party: "other.party" }),
      /another party/,
      "another party cannot cancel the retained job",
    );

    let sawRoute = false;
    let sawEarnedWork = false;
    let reloadedDuringWork = false;
    for (let tick = 0; tick < 160 && quantity(session, "wood-felled") === 0; tick++) {
      session.step(0.25);
      const attempt = session.workAttempts([fell])[0];
      sawRoute ||= attempt?.phase.kind === "executing" && attempt.phase.activity.kind === "route";
      sawEarnedWork ||= (session.query(query(JobTaskWork)).find(row => row.id === fell)?.get(JobTaskWork).seconds ?? 0) > 0;
      if (sawEarnedWork && !reloadedDuringWork) {
        const saved = session.save();
        session.restore(saved);
        assert.deepEqual(session.save(), saved, "earned work and its attempt survive exact reload");
        reloadedDuringWork = true;
      }
    }
    assert.equal(sawRoute, true, "a worker must travel to a legal tree contact before working");
    assert.equal(sawEarnedWork, true, "the native job task must retain earned work");
    assert.equal(session.query(query(FiniteResource)).find(row => row.id === tree)?.get(FiniteResource).quantity, 0);
    assert.equal(quantity(session, "wood-felled"), 6, "felling creates one physical movable trunk");
    assert.equal(quantity(session, "wood"), initialWood, "felling does not skip directly to logs");

    session.command("cancelTrees", { entities: [tree] });
    session.step(0);
    const cancelled = session.save();
    session.restore(cancelled);
    assert.deepEqual(session.save(), cancelled);
    for (let tick = 0; tick < 24; tick++) session.step(0.25);
    assert.equal(quantity(session, "wood-felled"), 6, "cancellation preserves the committed trunk");
    assert.equal(quantity(session, "wood"), initialWood, "cancelled work cannot finish in the background");
    assert.equal(session.workAttempts([fell, chop]).length, 0, "cancellation releases the worker after settlement");

    const available = session.whistleObservation({ query: spec => session.query(spec) }).targets
      .find(target => target.commandId === "colony:designateTrees")?.subjects;
    assert(available?.includes(tree), "a felled but unfinished tree remains available for re-designation");
    session.command("designateTrees", { entities: [tree] });
    session.step(0);
    for (let tick = 0; tick < 160 && quantity(session, "wood-felled") > 0; tick++) session.step(0.25);

    assert.equal(quantity(session, "wood-felled"), 0, "chopping consumes the exact retained trunk");
    assert.equal(quantity(session, "wood"), initialWood + 6, "chopping publishes one conserved log output");
    assert.equal(session.workAttempts([fell, chop]).length, 0, "completion releases all job attempts");
    const completed = session.save();
    session.restore(completed);
    for (let tick = 0; tick < 20; tick++) session.step(0.25);
    assert.equal(quantity(session, "wood"), initialWood + 6, "reload and later ticks cannot duplicate output");
    assert.equal(quantity(session, "wood-felled"), 0);
  } finally {
    port.dispose();
  }
});
