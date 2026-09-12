import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { colonyPack, ColonyDigOrder } from "../games/colony";
import { query } from "../sdk/authoring";
import { ExcavationWork } from "../sdk/common";
import { buildObservation } from "./observation";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";

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
