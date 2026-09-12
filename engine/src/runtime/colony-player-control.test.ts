import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { entity, query } from "../sdk/authoring";
import { ExcavationWork, MaterialLot, Destination } from "../sdk/common";
import { DeliveryTask } from "../sdk/delivery";
import { WorkParticipation } from "../sdk/work-control";
import { colonyPack, ColonyDigOrder } from "../games/colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("Colony Go takes carrying work manual and Resume work restores automatic participation", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  const worker = entity("colony.worker.1");
  const other = entity("colony.worker.2");
  try {
    session.start();
    session.command("deliver", { entities: [worker, other], quantity: 1 });
    let taskId: string | undefined;
    let otherTaskId: string | undefined;
    for (let tick = 0; tick < 120; tick++) {
      session.step(0.1);
      const carrying = session.query(query(DeliveryTask)).find((row) => {
        const task = row.get(DeliveryTask);
        return task.actor === worker && task.phase === "to-destination";
      });
      if (carrying && session.query(query(MaterialLot)).some((row) => row.get(MaterialLot).container === worker)) {
        taskId = carrying.id;
        otherTaskId = session.query(query(DeliveryTask)).find((row) => row.get(DeliveryTask).actor === other)?.id;
        break;
      }
    }
    assert(taskId, "Go must be exercised while the selected worker carries a lot");
    assert(otherTaskId, "another worker must receive an independent delivery claim");

    const destination = port.terrainSurfaces([[2, 0]])[0];
    assert(destination, "native terrain must provide a reachable Go destination");
    session.command("go", {
      entities: [worker],
      destination: { x: 2, y: (destination.cell[1] + 0.5) * 0.54, z: 0, frame: null },
    });
    session.step(0.1);
    assert.equal(session.query(query(WorkParticipation)).find((row) => row.id === worker)?.get(WorkParticipation).automatic, false);
    assert(session.query(query(Destination)).some((row) => row.id === worker), "Go must submit native movement");
    assert(session.query(query(MaterialLot)).some((row) => row.get(MaterialLot).container === worker), "manual movement must retain cargo custody");
    const manualCargo = session.query(query(MaterialLot)).filter((row) => row.get(MaterialLot).container === worker).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0);
    for (let tick = 0; tick < 60; tick++) {
      if (tick === 30) session.restore(session.save());
      session.step(0.1);
    }
    assert.equal(session.query(query(Destination)).some((row) => row.id === worker), false, "manual worker must reach the requested position");
    const pose = port.worldPoses([worker])[0];
    assert(pose && Math.abs(pose.world.x - 2) < 1e-6 && Math.abs(pose.world.z) < 1e-6, "manual worker must remain at the requested position");
    assert.equal(session.query(query(MaterialLot)).filter((row) => row.get(MaterialLot).container === worker).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), manualCargo, "manual cargo quantity is conserved");
    assert.equal(session.query(query(DeliveryTask)).find((row) => row.id === taskId)?.get(DeliveryTask).actor, worker, "manual delivery claim remains owned");
    assert.equal(session.query(query(DeliveryTask)).find((row) => row.id === otherTaskId)?.get(DeliveryTask).phase, "complete", "other worker completes independent work");

    const saved = session.save();
    session.restore(saved);
    assert.equal(session.query(query(WorkParticipation)).find((row) => row.id === worker)?.get(WorkParticipation).automatic, false, "manual intent must survive restore");

    session.command("resumeWork", { entities: [worker] });
    for (let tick = 0; tick < 160; tick++) {
      session.step(0.1);
      if (session.query(query(DeliveryTask)).find((row) => row.id === taskId)?.get(DeliveryTask).phase === "complete") break;
    }
    assert.equal(session.query(query(WorkParticipation)).find((row) => row.id === worker)?.get(WorkParticipation).automatic, true);
    assert.equal(session.query(query(DeliveryTask)).find((row) => row.id === taskId)?.get(DeliveryTask).phase, "complete", "resume returns the claimed delivery to automatic completion");
  } finally {
    port.dispose();
  }
});

test("Colony Go cancels active digging without losing the order or terrain", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  const worker = entity("colony.worker.1");
  const other = entity("colony.worker.2");
  try {
    session.start();
    session.command("go", { entities: [other], destination: { x: 0, y: 0, z: 2, frame: null } });
    session.step(0);
    session.command("dig", { area: { start: [1, 13, 0], end: [1, 13, 0] } });
    let active = false;
    let orderId: string | undefined;
    for (let tick = 0; tick < 160; tick++) {
      session.step(0.1);
      active = session.query(query(ExcavationWork)).some((row) => row.id === worker);
      orderId = session.query(query(ColonyDigOrder)).find((row) => row.get(ColonyDigOrder).actor === worker)?.id;
      if (active) break;
    }
    assert.equal(active, true, "worker must reach native digging work");
    const before = port.terrainMaterials([[1, 13, 0]])[0];
    const surface = port.terrainSurfaces([[2, 0]])[0];
    assert(surface);
    session.command("go", { entities: [worker], destination: { x: 2, y: (surface.cell[1] + 0.5) * 0.54, z: 0, frame: null } });
    session.step(0.1);
    assert.equal(session.query(query(WorkParticipation)).find((row) => row.id === worker)?.get(WorkParticipation).automatic, false);
    assert.equal(session.query(query(ExcavationWork)).some((row) => row.id === worker), false, "Go cancels native digging attendance");
    assert.equal(port.terrainMaterials([[1, 13, 0]])[0], before, "canceled digging does not award a terrain edit");
    assert(orderId && session.query(query(ColonyDigOrder)).some(row => row.id === orderId), "manual digging keeps its authored order");
    for (let tick = 0; tick < 30; tick++) {
      session.step(0.1);
      assert.equal(session.query(query(ExcavationWork)).some(row => row.id === worker), false, "manual interval does not resume excavation");
    }
    session.command("resumeWork", { entities: [worker] });
    for (let tick = 0; tick < 160 && session.query(query(ColonyDigOrder)).some(row => row.id === orderId); tick++) session.step(0.1);
    assert.equal(session.query(query(ColonyDigOrder)).some(row => row.id === orderId), false, "resume returns the dig order to automatic completion");
  } finally {
    port.dispose();
  }
});
