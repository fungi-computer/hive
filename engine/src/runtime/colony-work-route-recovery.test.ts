import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { query } from "../sdk/authoring";
import { DeliveryTask } from "../sdk/delivery";
import { MaterialLot } from "../sdk/common";
import { ConstructionSite } from "../sdk/construction";
import { colonyPack, ColonyDigOrder } from "../games/colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("Colony digging then supplied building does not strand an existing delivery", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("dig", { area: { start: [1, 13, 0], end: [2, 13, 0] } });
    const rejected: string[] = [];
    const step = () => {
      for (const result of session.step(0.1)) if (!result.accepted) rejected.push(result.reason ?? "rejected");
    };
    for (let tick = 0; tick < 240 && (tick === 0 || session.query(query(ColonyDigOrder)).length); tick++) step();
    assert.equal(session.query(query(ColonyDigOrder)).length, 0, "both designated cuts must complete");
    assert.deepEqual(port.terrainMaterials([[1,13,0],[2,13,0]]), [0,0]);
    session.command("build", { catalog: "timber-wall", orientation: "north", target: { cell: [2,13,2], material: 1 } });
    for (let tick = 0; tick < 700; tick++) step();
    assert.deepEqual(rejected, [], "ordinary joined work must not repeatedly submit impossible actions");
    const sites = session.query(query(ConstructionSite));
    assert.equal(sites.length, 1);
    assert.equal(sites[0].get(ConstructionSite).phase, "finished", "supplied wall must finish");
    for (const id of ["colony.delivery.1", "colony.delivery.2"]) {
      const task = session.query(query(DeliveryTask)).find(row => row.id === id)?.get(DeliveryTask);
      assert(task, `existing delivery ${id} must remain observable`);
      assert.equal(task.phase, "complete", `${id} must finish after terrain changes`);
      assert.equal(task.actor, null, `${id} must release its worker`);
    }
    const lots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
    assert.equal(lots.filter(lot => lot.kind === "soil-spoil").reduce((sum, lot) => sum + lot.quantity, 0), 6);
    assert(!lots.some(lot => lot.kind === "bread" && lot.quantity > 0 && lot.container.startsWith("colony.worker.")), "no worker remains trapped carrying a ration");
  } finally { port.dispose(); }
});
