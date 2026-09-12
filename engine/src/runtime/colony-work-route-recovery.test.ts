import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { entity, query } from "../sdk/authoring";
import { DeliveryTask } from "../sdk/delivery";
import { Destination, excavate } from "../sdk/common";
import { colonyPack } from "../games/colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("Colony delivery repairs a native route after a topology change", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  const worker = entity("colony.worker.1");
  const secondWorker = entity("colony.worker.2");
  try {
    session.start();
    session.command("pauseDelivery", { entities: [secondWorker] });
    session.command("deliver", { entities: [worker], quantity: 1 });

    let deliveryTaskId: string | undefined;
    for (let tick = 0; tick < 80; tick++) {
      session.step(0.1);
      const deliveryTask = session.query(query(DeliveryTask)).find((row) => {
        const task = row.get(DeliveryTask);
        return task.actor === worker && task.phase === "to-destination";
      });
      if (deliveryTask && session.query(query(Destination)).some((row) => row.id === worker)) {
        deliveryTaskId = deliveryTask.id;
        break;
      }
    }
    assert(deliveryTaskId, "worker must have an active carrying delivery route");

    const surface = port.terrainSurfaces([[1, 2]])[0];
    assert(surface, "native terrain must expose a nearby diggable surface");
    assert.notEqual(surface.material, 0, "route repair target must still be solid");
    session.request(excavate(secondWorker, { x: surface.cell[0], y: surface.cell[1], z: surface.cell[2] }, surface.material, 0));
    const excavationAdmission = session.step(0).find(({ action }) => action.kind === "excavate");
    assert.equal(excavationAdmission?.accepted, true, "native terrain edit must be accepted");
    for (let tick = 0; tick < 40; tick++) session.step(0.1);
    assert.equal(port.terrainMaterials([[surface.cell[0], surface.cell[1], surface.cell[2]]])[0], 0, "native terrain edit must commit");

    let completed = false;
    for (let tick = 0; tick < 180; tick++) {
      session.step(0.1);
      completed ||= session.query(query(DeliveryTask)).some((row) => {
        if (row.id !== deliveryTaskId) return false;
        const task = row.get(DeliveryTask);
        return task.actor === null && task.phase === "complete";
      });
      if (completed) break;
    }
    assert.equal(completed, true, "delivery must resume after terrain invalidates its route");
  } finally {
    port.dispose();
  }
});
