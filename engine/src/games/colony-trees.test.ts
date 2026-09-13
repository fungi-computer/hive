import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { ColonyTree, ColonyTreeOrder, ColonyTreePolicy } from "./colony-work";
import { colonyPack } from "./colony";
import { Container, Destination, FiniteResource, MaterialLot, Position, query } from "../sdk/index";
import { DeliveryTask } from "../sdk/delivery";
import { StockpileCell } from "../sdk/stockpile";
import { entity } from "../sdk/authoring";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("tree work reaches chop, extracts one native wood lot, and survives reload", () => {
  const port = wasmKernelPort(new WasmKernel()), session = new GameSession({ port, pack: colonyPack });
  try {
    session.start();
    const tree = "colony.tree.oak";
    session.command("pauseDelivery", { entities: ["colony.worker.1", "colony.worker.2"] });
    session.command("designateTrees", { entities: [tree] });
    session.step(0);
    assert.equal(session.query(query(ColonyTreePolicy)).find(row => row.id === tree)?.get(ColonyTreePolicy).designated, true);
    let sawTravel = false;
    for (let i = 0; i < 80; i++) {
      session.step(0.25);
      const order = session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === tree)?.get(ColonyTreeOrder);
      if (!order) throw new Error("tree order missing");
      if (session.query(query(Destination)).some(row => row.id === order.actor)) {
        sawTravel = true;
        assert.equal(order.seconds, 0, "travel does not earn work");
      }
      if (order.stage === "chop" && order.phase === "queued") break;
    }
    assert.equal(sawTravel, true, "tree work must observe travel before earning work");
    const stage = session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === tree)!.get(ColonyTreeOrder);
    assert.equal(stage.phase, "queued");
    assert.equal(stage.stage, "chop");
    assert.equal(stage.actor, null, "fell completion releases worker");
    session.step(0.25);
    const afterClaim = session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === tree)!.get(ColonyTreeOrder);
    assert.equal(afterClaim.stage, "chop");
    for (let i = 0; i < 40; i++) session.step(0.25);
    const treeState = session.query(query(ColonyTree)).find(row => row.id === tree)!.get(ColonyTree);
    assert.equal(treeState.phase, "chopped");
    const resource = session.query(query(FiniteResource)).find(row => row.id === tree)!.get(FiniteResource);
    assert.deepEqual(resource, { kind: "wood", quantity: 0 });
    const woodLots = session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood" && row.get(MaterialLot).container === tree);
    assert.equal(woodLots.length, 1);
    assert.equal(woodLots[0].get(MaterialLot).quantity, 6);
    assert.equal(session.query(query(DeliveryTask)).some(row => row.get(DeliveryTask).source === tree), false);
    const surface = session.terrainSurfaces([[2, 2]])[0];
    assert.ok(surface);
    session.request({ kind: "designate-stockpile", zone: entity("tree-output"), cells: [{ x: 2, y: surface.cell[1], z: 2, priority: 9, filterProfile: "wood", capacity: 6 }] });
    const designationResults = session.step(0);
    const stockpile = session.query(query(StockpileCell, Container, Position)).find(row => row.get(StockpileCell).zone === entity("tree-output"));
    assert.ok(stockpile, `native stockpile designation was not accepted: ${JSON.stringify(designationResults)}`);
    session.command("resumeDelivery", { entities: ["colony.worker.1", "colony.worker.2"] });
    for (let i = 0; i < 160 && session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood" && row.get(MaterialLot).container === stockpile!.id).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0) < 6; i++) session.step(0.25);
    const delivered = session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood" && row.get(MaterialLot).container === stockpile!.id);
    assert.equal(delivered.reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 6, JSON.stringify(session.query(query(DeliveryTask)).map(row => row.get(DeliveryTask))));
    assert.equal(session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood").reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 54);
    const saved = session.save();
    session.restore(saved);
    session.step(0.25);
    const restored = session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood");
    assert.equal(restored.filter(row => row.get(MaterialLot).container === stockpile!.id).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 6);
    assert.equal(restored.reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 54);
  } finally { port.dispose(); }
});
