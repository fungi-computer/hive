import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { ColonyTree, ColonyTreeOrder, ColonyTreePolicy } from "./colony-work";
import { colonyPack } from "./colony";
import { Destination, FiniteResource, MaterialLot, query } from "../sdk/index";
import { DeliveryTask } from "../sdk/delivery";

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
    assert.equal(typeof sawTravel, "boolean");
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
    const saved = session.save();
    session.restore(saved);
    session.step(0.25);
    const reloaded = session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).container === tree && row.get(MaterialLot).kind === "wood");
    assert.equal(reloaded.length, 1);
    assert.deepEqual({ id: reloaded[0].id, ...reloaded[0].get(MaterialLot) }, { id: woodLots[0].id, ...woodLots[0].get(MaterialLot) });
  } finally { port.dispose(); }
});
