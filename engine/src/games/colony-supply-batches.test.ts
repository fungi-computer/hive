import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { query } from "../sdk/authoring";
import { ConstructionSite } from "../sdk/construction";
import { DeliveryTask } from "../sdk/delivery";
import { MaterialLot } from "../sdk/common";
import { colonyPack } from "./colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

const workers = ["colony.worker.1", "colony.worker.2"] as const;

function wood(session: GameSession) {
  return session.query(query(MaterialLot))
    .map(row => ({ id: row.id, ...row.get(MaterialLot) }))
    .filter(lot => lot.kind === "wood");
}

function carriedWood(session: GameSession) {
  return wood(session).filter(lot => workers.includes(lot.container as typeof workers[number]));
}

function runConstruction(session: GameSession, quantity?: 1 | 2) {
  session.start();
  if (quantity !== undefined) session.command("deliver", { quantity, entities: [...workers] });
  session.command("build", {
    catalog: "timber-stair",
    orientation: "north",
    target: { cell: [1, 13, 0] },
  });
  let largestCarry = 0;
  let sawConstructionTask = false;
  for (let tick = 0; tick < 480; tick++) {
    session.step(0.25);
    const site = session.query(query(ConstructionSite))[0];
    const task = site && session.query(query(DeliveryTask)).find(row => row.get(DeliveryTask).destination === site.id);
    sawConstructionTask ||= task !== undefined;
    largestCarry = Math.max(largestCarry, ...carriedWood(session).map(lot => lot.quantity), 0);
    assert.equal(wood(session).reduce((sum, lot) => sum + lot.quantity, 0), 48, "wood remains conserved");
    if (site?.get(ConstructionSite).phase === "finished") return { largestCarry, sawConstructionTask };
  }
  throw new Error("Colony stair did not finish within the focused proof budget");
}

test("Colony construction uses three-unit ordinary hauls while explicit delivery control caps them", () => {
  const ordinaryPort = wasmKernelPort(new WasmKernel());
  const cappedPort = wasmKernelPort(new WasmKernel());
  try {
    const ordinary = new GameSession({ port: ordinaryPort, pack: colonyPack });
    const ordinaryResult = runConstruction(ordinary);
    assert.equal(ordinaryResult.sawConstructionTask, true);
    assert.equal(ordinaryResult.largestCarry, 3, "authored workers carry their full ordinary capacity");

    const capped = new GameSession({ port: cappedPort, pack: colonyPack });
    const cappedResult = runConstruction(capped, 1);
    assert.equal(cappedResult.sawConstructionTask, true);
    assert.ok(cappedResult.largestCarry <= 1, "explicit Deliver 1 remains the actor-wide cap");
  } finally {
    ordinaryPort.dispose();
    cappedPort.dispose();
  }
});
