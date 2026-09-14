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
import { GroundStock } from "../sdk/ground-stock";
import { Worker } from "./colony-components";
import { PartyMember } from "../sdk/party";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("tree work reaches chop, extracts one native wood lot, and survives reload", () => {
  const port = wasmKernelPort(new WasmKernel()), session = new GameSession({ port, pack: colonyPack });
  try {
    session.start();
    const tree = "colony.tree.oak";
    const workers = session.query(query(Worker, PartyMember)).map(row => row.id);
    const initialWoodLots = new Set(session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood").map(row => row.id));
    const standingProjection = session.whistleObservation({ query: spec => session.query(spec) });
    const designateTargets = standingProjection.targets.find(target => target.commandId === "colony:designateTrees");
    assert.deepEqual(designateTargets?.subjects, [tree, "colony.tree.pine", "colony.tree.willow"]);
    session.command("pauseDelivery", { entities: workers });
    session.command("designateTrees", { entities: [tree] });
    session.step(0);
    const designatedProjection = session.whistleObservation({ query: spec => session.query(spec) });
    const cancelTargets = designatedProjection.targets.find(target => target.commandId === "colony:cancelTrees");
    assert.deepEqual(cancelTargets?.subjects, [tree]);
    assert.equal(session.query(query(ColonyTreePolicy)).find(row => row.id === tree)?.get(ColonyTreePolicy).designated, true);
    let sawTravel = false;
    for (let i = 0; i < 80; i++) {
      session.step(0.25);
      const orderRow = session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === tree);
      const order = orderRow?.get(ColonyTreeOrder);
      if (!order || !orderRow) throw new Error("tree order missing");
      const attempts = session.workAttempts([orderRow.id]);
      if (attempts.some(attempt => workers.includes(attempt.worker))) {
        sawTravel = true;
        if (attempts.some(attempt => attempt.phase.kind === "executing" && attempt.phase.activity.kind === "route"))
          assert.equal(order.seconds, 0, "travel does not earn work");
      }
      if (order.stage === "chop" && order.phase === "queued") break;
    }
    assert.equal(sawTravel, true, `tree work must observe travel before earning work: ${JSON.stringify({
      workers,
      order: session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === tree)?.get(ColonyTreeOrder),
      policy: session.query(query(ColonyTreePolicy)).find(row => row.id === tree)?.get(ColonyTreePolicy),
      attempts: session.workAttempts(session.query(query(ColonyTreeOrder)).map(row => row.id)),
    })}`);
    const stage = session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === tree)!.get(ColonyTreeOrder);
    assert.equal(stage.phase, "queued");
    assert.equal(stage.stage, "chop");
    const stageRow = session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === tree);
    assert.equal(stageRow && session.workAttempts([stageRow.id]).length, 0, "fell completion releases worker");
    session.step(0.25);
    const afterClaim = session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === tree)!.get(ColonyTreeOrder);
    assert.equal(afterClaim.stage, "chop");
    for (let i = 0; i < 240; i++) {
      session.step(0.25);
      if (session.query(query(ColonyTree)).find(row => row.id === tree)?.get(ColonyTree).phase === "chopped") break;
    }
    const treeState = session.query(query(ColonyTree)).find(row => row.id === tree)!.get(ColonyTree);
    assert.equal(treeState.phase, "chopped", JSON.stringify({
      order: session.query(query(ColonyTreeOrder)).find(row => row.get(ColonyTreeOrder).tree === tree)?.get(ColonyTreeOrder),
      destinations: session.query(query(Destination)).map(row => [row.id, row.get(Destination)]),
    }));
    const resource = session.query(query(FiniteResource)).find(row => row.id === tree)!.get(FiniteResource);
    assert.deepEqual(resource, { kind: "wood", quantity: 0 });
    const groundStocks = new Set(session.query(query(GroundStock)).map(row => row.id));
    const woodLots = session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood" && groundStocks.has(row.get(MaterialLot).container) && !initialWoodLots.has(row.id));
    assert.equal(woodLots.length, 1, JSON.stringify(woodLots.map(row => ({ id: row.id, lot: row.get(MaterialLot) }))));
    assert.equal(woodLots[0].get(MaterialLot).quantity, 6);
    assert.equal(session.query(query(DeliveryTask)).some(row => row.get(DeliveryTask).source === tree), false);
    const surface = session.terrainSurfaces([[2, 2]])[0];
    assert.ok(surface);
    session.command("designateStockpile", { area: { start: [...surface.cell], end: [...surface.cell] }, filterProfile: "wood", priority: 9 });
    session.step(0);
    const stockpile = session.query(query(StockpileCell, Container, Position)).find(row => row.get(StockpileCell).zone.startsWith("colony.stockpile."));
    assert.ok(stockpile, "Colony stockpile command was not accepted by native admission");
    session.command("resumeDelivery", { entities: workers });
    for (let i = 0; i < 160 && session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood" && row.get(MaterialLot).container === stockpile!.id).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0) < 6; i++) session.step(0.25);
    const delivered = session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood" && row.get(MaterialLot).container === stockpile!.id);
    assert.equal(delivered.reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 6, JSON.stringify({
      tasks: session.query(query(DeliveryTask)).map(row => ({ id: row.id, ...row.get(DeliveryTask) })),
      attempts: session.workAttempts(session.query(query(DeliveryTask)).map(row => row.id)),
    }));
    assert.equal(session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood").reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 54);
    const saved = session.save();
    session.restore(saved);
    session.step(0.25);
    const restored = session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood");
    assert.equal(restored.filter(row => row.get(MaterialLot).container === stockpile!.id).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 6);
    assert.equal(restored.reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 54);
  } finally { port.dispose(); }
});
