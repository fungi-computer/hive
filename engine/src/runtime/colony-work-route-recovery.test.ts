import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { query } from "../sdk/authoring";
import { MaterialLot } from "../sdk/common";
import { ConstructionSite } from "../sdk/construction";
import { colonyPack, ExcavationOrder } from "../games/colony";
import { Worker } from "../games/colony-components";
import { PartyMember } from "../sdk/party";

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
    for (let tick = 0; tick < 240 && (tick === 0 || session.query(query(ExcavationOrder)).length); tick++) step();
    assert.equal(session.query(query(ExcavationOrder)).length, 0, "both designated cuts must complete");
    assert.deepEqual(port.terrainMaterials([[1,13,0],[2,13,0]]), [0,0]);
    session.command("build", { catalog: "timber-wall", target: { edges: [{ cell: [2, 13, 2], axis: "z" }] } });
    for (let tick = 0; tick < 700; tick++) step();
    assert.deepEqual(rejected, [], "ordinary joined work must not repeatedly submit impossible actions");
    const sites = session.query(query(ConstructionSite));
    assert.equal(sites.length, 1);
    assert.equal(sites[0].get(ConstructionSite).phase, "finished", "supplied wall must finish");
    const lots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
    assert.equal(lots.filter(lot => lot.kind === "soil-spoil").reduce((sum, lot) => sum + lot.quantity, 0), 6);
    const workers = new Set(session.query(query(Worker, PartyMember)).map(row => row.id));
    assert(!lots.some(lot => lot.kind === "bread" && lot.quantity > 0 && workers.has(lot.container)), "no worker remains trapped carrying a ration");
  } finally { port.dispose(); }
});
