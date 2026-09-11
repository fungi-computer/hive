import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { colonyPack } from "./colony";
import { entity, MaterialLot, Destination, query } from "../sdk/index";
import { DeliveryTask } from "../sdk/delivery";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("colony delivery retains cargo and completes with restore between every host step", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  const worker = entity("colony.worker.1");
  const selection = { entities: [worker] };
  const held = (id: string) => session.query(query(MaterialLot))
    .reduce((sum, row) => sum + (row.get(MaterialLot).container === id ? row.get(MaterialLot).quantity : 0), 0);
  try {
    session.start();
    session.command("deliver", { ...selection, quantity: 1 });
    let interruptedAt: number | undefined;
    let complete = false;
    let taskId: string | undefined;
    for (let tick = 0; tick < 100; tick++) {
      session.restore(session.save());
      session.step(0.25);
      assert.equal(session.query(query(MaterialLot)).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 6);
      if (interruptedAt === undefined && held(worker) === 1) {
        interruptedAt = tick;
        session.command("pauseDelivery", selection);
      } else if (interruptedAt !== undefined && tick <= interruptedAt + 4) {
        assert.equal(held(worker), 1, "paused work preserves physical cargo");
        if (tick === interruptedAt + 4) session.command("resumeDelivery", selection);
      }
      const taskRows = session.query(query(DeliveryTask));
      taskId ??= taskRows.find(row => row.get(DeliveryTask).actor === worker)?.id;
      if (taskRows.some(row => row.id === taskId && row.get(DeliveryTask).phase === "complete" && row.get(DeliveryTask).actor === null)) {
        complete = true;
        break;
      }
    }
    assert.notEqual(interruptedAt, undefined);
    assert.equal(complete, true, "delivery completes within25 simulated seconds");
    assert.equal(held("colony.guest.1"), 1);
    assert.equal(held(worker), 0);
    const saved = session.save();
    session.restore(saved);
    assert.deepEqual(session.save(), saved);
  } finally { port.dispose(); }
});


test("colony delivery keeps its native route instead of admitting it every tick", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  const worker = entity("colony.worker.1");
  try {
    session.start();
    session.command("deliver", { entities: [worker], quantity: 1 });
    let checked = false;
    for (let tick = 0; tick < 100; tick++) {
      const before = session.query(query(Destination)).find(row => row.id === worker)?.get(Destination);
      session.step(0.05);
      const after = session.query(query(Destination)).find(row => row.id === worker)?.get(Destination);
      if (before && after && before.x === after.x && before.y === after.y && before.z === after.z && before.frame === after.frame) {
        assert.equal(session.save().outcomes.filter(outcome => outcome.action.kind === "move" && outcome.action.entity === worker).length, 0);
        checked = true;
        break;
      }
    }
    assert.equal(checked, true, "observed a continuing native route");
  } finally { port.dispose(); }
});
