import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { colonyPack, ColonyDigOrder } from "../games/colony";
import { entity, query } from "../sdk/authoring";
import { ExcavationWork } from "../sdk/common";
import { buildObservation } from "./observation";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { ColonyTreeOrder } from "../games/colony-work";
import { decorateWorkActivity } from "./work-activity";
import type { ReadContext } from "../contracts";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
test("actual Colony attendance projects work poses only while native work exists", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ pack: colonyPack, port });
    session.start();
    session.command("dig", { area: { start: [1,13,0], end: [1,13,0] } });
    const observe = () => buildObservation(session, { epoch: 0, sequence: 0 });
    assert(!observe().facts.some(fact => fact.activity), "queued intent does not animate earned work");
    let sawWork = false;
    for (let tick = 0; tick < 240; tick++) {
      session.step(0.1);
      const work = session.query(query(ExcavationWork));
      if (work.length) {
        const before = session.save();
        const view = observe();
        assert.deepEqual(session.save(), before, "animation projection must not mutate work or custody");
        for (const row of work) assert.deepEqual(view.facts.find(fact => fact.id === row.id)?.activity,
          { kind: "dig", target: [row.get(ExcavationWork).x, row.get(ExcavationWork).z] });
        sawWork = true;
      }
      if (sawWork && !session.query(query(ColonyDigOrder)).length) break;
    }
    assert(sawWork, "fixture must perform actual native excavation");
    assert.equal(session.query(query(ColonyDigOrder)).length, 0);
    assert(!observe().facts.some(fact => fact.activity), "completed work returns to locomotion/carry poses");
  } finally { port.dispose(); }
});

test("actual Colony tree attendance projects chop only while its order is working and stays read-only across reload", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ pack: colonyPack, port }); session.start();
    session.command("pauseDelivery", { entities: ["colony.worker.1", "colony.worker.2"] });
    session.command("designateTrees", { entities: ["colony.tree.oak"] });
    const observe = () => buildObservation(session, { epoch: 0, sequence: 0 });
    assert(!observe().facts.some(f => f.activity?.kind === "chop"));
    let working = false;
    for (let i = 0; i < 80; i++) {
      session.step(0.25);
      const order = session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === "colony.tree.oak")?.get(ColonyTreeOrder);
      if (order?.phase === "working" && order.actor) {
        const before = session.save(), view = observe();
        assert.deepEqual(session.save(), before);
        assert.deepEqual(view.facts.find(f => f.id === order.actor)?.activity, { kind: "chop", target: [2, 2] });
        working = true; break;
      }
    }
    assert.equal(working, true);
    const saved = session.save();
    const beforeRestore = observe().facts;
    session.restore(saved);
    assert.deepEqual(observe().facts, beforeRestore, "activity projection is stable across restore");
    for (let i = 0; i < 80; i++) {
      session.step(0.25);
      const order = session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === "colony.tree.oak")?.get(ColonyTreeOrder);
      if (order?.phase === "complete") break;
    }
    assert.equal(session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === "colony.tree.oak")?.get(ColonyTreeOrder).phase, "complete");
    assert(!observe().facts.some(f => f.activity?.kind === "chop"));
  } finally { port.dispose(); }
});

test("activity projection rejects competing native and game attendance", () => {
  const actor = entity("worker.activity");
  const row = { id: actor as never, get: () => ({ x: 1, y: 0, z: 2, expected: 1, replacement: 0, seconds: 1 }) };
  const context = { query: (() => [row]) as unknown as ReadContext["query"] };
  assert.throws(() => decorateWorkActivity([], context, [{ actor, kind: "chop", target: [3, 4] }]), /competing work attendance/);
});
