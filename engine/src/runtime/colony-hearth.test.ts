import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { MaterialLot, Destination, Position, move } from "../sdk/common";
import { entity, query } from "../sdk/authoring";
import { DeliveryTask } from "../sdk/delivery";
import { colonyLumberId, colonyPack } from "../games/colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

const worker = entity("colony.worker.1");
const hearth = entity("colony.hearth");

function quantity(session: GameSession, container: string): number {
  return session.query(query(MaterialLot)).reduce((total, row) => {
    const lot = row.get(MaterialLot);
    return total + (lot.container === container ? lot.quantity : 0);
  }, 0);
}

test("actual Colony hearth consumes wood and emits into sampled air", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    const surface = port.terrainSurfaces([[1, -1]])[0];
    assert(surface, "hearth placement must have a generated support surface");
    const airCell: [number, number, number] = [1, surface.cell[1] + 1, -1];
    const beforeAir = port.atmosphereSamples([airCell]).samples[0];
    assert(beforeAir, "Colony hearth must begin in a modeled air receiver");

    // The supply system plans hearth fuel through the same finite delivery
    // tasks and delivery provider used by the Colony's other work.
    session.step(0);
    const hearthTask = session.query(query(DeliveryTask)).find(row => {
      const task = row.get(DeliveryTask);
      return task.destination === hearth && task.material === "wood";
    });
    assert(hearthTask, "Colony supply system must plan the hearth's wood task");
    let delivered = false;
    let deliveringWorker = worker;
    for (let tick = 0; tick < 160; tick++) {
      const current = session.query(query(DeliveryTask)).find(row => row.get(DeliveryTask).destination === hearth)?.get(DeliveryTask);
      if (current?.actor) deliveringWorker = current.actor;
      session.step(0.25);
      if (quantity(session, hearth) === 2) {
        delivered = true;
        break;
      }
    }
    assert.equal(delivered, true, "shared delivery must bring two wood to the hearth");
    assert.equal(quantity(session, colonyLumberId), 46);

    // Delivery can deposit within contact range before its final move ends.
    // Let that real work finish, then navigate to the station through the same
    // public movement operation available to the player.
    const busy = () => session.query(query(DeliveryTask)).some(row => row.get(DeliveryTask).actor === deliveringWorker)
      || session.query(query(Destination)).some(row => row.id === deliveringWorker);
    for (let tick = 0; tick < 160 && busy(); tick++) session.step(0.25);
    assert.equal(busy(), false, "ordinary delivery must release its worker");
    const contact = session.query(query(Position)).find(row => row.id === hearth)!.get(Position);
    session.request(move(deliveringWorker, { x: contact.x, y: contact.y, z: contact.z, frame: null }));
    session.step(0.25);
    for (let tick = 0; tick < 80 && busy(); tick++) session.step(0.25);
    assert.equal(busy(), false, "worker must reach the hearth through native movement");
    session.command("lightHearth", { entities: [deliveringWorker] });
    session.step(0);
    const admission = session.save().outcomes.find(
      outcome => outcome.action.kind === "begin-emission",
    );
    assert.equal(admission?.result.accepted, true, JSON.stringify(admission));
    assert.equal(quantity(session, hearth), 0, "admission debits fuel exactly once");

    session.step(1);
    const afterAir = port.atmosphereSamples([airCell]).samples[0];
    assert(afterAir, "the modeled hearth receiver must remain queryable");
    assert(afterAir.smokeKgM3 > beforeAir.smokeKgM3, "paid smoke must reach sampled air");
    const saved = session.save();
    const expected = port.atmosphereSamples([airCell]);
    session.step(0.25);
    const expectedNext = port.atmosphereSamples([airCell]);

    session.restore(saved);
    assert.deepEqual(port.atmosphereSamples([airCell]), expected);
    session.step(0.25);
    assert.deepEqual(port.atmosphereSamples([airCell]), expectedNext);
  } finally {
    port.dispose();
  }
});
