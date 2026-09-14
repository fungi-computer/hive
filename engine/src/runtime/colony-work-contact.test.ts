import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { query } from "../sdk/authoring";
import { ConstructionSite } from "../sdk/construction";
import { DeliveryTask } from "../sdk/delivery";
import { Position } from "../sdk/common";
import { colonyPack } from "../games/colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

function finishedBrewStation(session: GameSession) {
  return session.query(query(ConstructionSite)).find((row) => {
    const site = row.get(ConstructionSite);
    return site.catalog === "brew-station" && site.phase === "finished";
  });
}

function stateDump(session: GameSession) {
  return JSON.stringify({
    sites: session.query(query(ConstructionSite)).map((row) => ({ id: row.id, ...row.get(ConstructionSite) })),
    deliveries: session.query(query(DeliveryTask)).map((row) => ({ id: row.id, ...row.get(DeliveryTask) })),
  });
}

function startSession() {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  session.start();
  return { port, session };
}

function buildBrewer(session: GameSession) {
  session.command("build", { catalog: "brew-station", orientation: "north", target: { cell: [1, 13, -1] } });
  for (let tick = 0; tick < 500 && !finishedBrewStation(session); tick++) session.step(0.25);
  const brewer = finishedBrewStation(session);
  assert(brewer, stateDump(session));
  return brewer;
}

test("a floor below a finished brewer completes without moving the brewer", () => {
  const { port, session } = startSession();
  try {
    const brewer = buildBrewer(session);
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: [1, 13, -1] } });
    session.step(0);
    const floor = session.query(query(ConstructionSite)).find((row) => row.get(ConstructionSite).catalog === "timber-floor");
    assert(floor, stateDump(session));
    for (let tick = 0; tick < 600; tick++) {
      if (session.query(query(ConstructionSite)).find((row) => row.id === floor.id)?.get(ConstructionSite).phase === "finished") break;
      session.step(0.25);
    }
    assert.equal(session.query(query(ConstructionSite)).find((row) => row.id === floor.id)?.get(ConstructionSite).phase, "finished", stateDump(session));
    assert.equal(finishedBrewStation(session)?.id, brewer.id);
  } finally {
    port.dispose();
  }
});

test("an obstructed construction delivery chooses a lawful contact or releases its order", () => {
  const { port, session } = startSession();
  try {
    buildBrewer(session);
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: [5, 13, 0] } });
    session.step(0);
    const floor = session.query(query(ConstructionSite)).find((row) => row.get(ConstructionSite).catalog === "timber-floor");
    assert(floor, stateDump(session));

    let delivery: any;
    for (let tick = 0; tick < 300; tick++) {
      session.step(0.1);
      delivery = session.query(query(DeliveryTask)).find((row) => {
        const task = row.get(DeliveryTask);
        return task.destination === floor.id && task.custody !== "delivered";
      });
      if (delivery) break;
    }
    assert(delivery, `floor delivery was never assigned: ${stateDump(session)}`);
    const task = delivery.get(DeliveryTask);
    const spacing = [1, 0.54, 1];
    const obstructionCell: [number, number, number] = [Math.round(task.destinationContactX / spacing[0]), Math.round(task.destinationContactY / spacing[1] - 0.5), Math.round(task.destinationContactZ / spacing[2])];
    session.command("build", { catalog: "timber-bed", orientation: "north", target: { cell: obstructionCell } });
    session.step(0);
    const obstruction = session.query(query(ConstructionSite)).find((row) => row.get(ConstructionSite).catalog === "timber-bed");
    assert(obstruction, `obstruction command was not accepted: ${stateDump(session)}`);
    for (let tick = 0; tick < 600; tick++) {
      if (session.query(query(ConstructionSite)).find((row) => row.id === obstruction.id)?.get(ConstructionSite).phase === "finished") break;
      session.step(0.1);
    }
    assert.equal(session.query(query(ConstructionSite)).find((row) => row.id === obstruction.id)?.get(ConstructionSite).phase, "finished", `obstruction was not physically committed: ${stateDump(session)}`);
    for (let tick = 0; tick < 300; tick++) session.step(0.1);
    const floorAfter = session.query(query(ConstructionSite)).find((row) => row.id === floor.id);
    const deliveryAfter = session.query(query(DeliveryTask)).find((row) => row.id === delivery.id);
    assert(floorAfter, `floor intent disappeared after contact obstruction: ${stateDump(session)}`);
    if (deliveryAfter) {
      assert.equal(deliveryAfter.get(DeliveryTask).custody, "delivered", `delivery retained worker after contact obstruction: ${stateDump(session)}`);
    } else {
      assert.equal(floorAfter.get(ConstructionSite).phase, "finished", stateDump(session));
    }
  } finally {
    port.dispose();
  }
});
