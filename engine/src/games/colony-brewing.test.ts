import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { query } from "../sdk/authoring";
import { ConstructionSite } from "../sdk/construction";
import { Destination, MaterialLot, Position } from "../sdk/common";
import { StagedProcess } from "../sdk/process-supply";
import { DeliveryTask } from "../sdk/delivery";
import { colonyPack } from "./colony";
import { WaterSupplyOrder, WaterSupplyWork } from "./colony-water-work";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

// This process-focused law supplies its own input fixture. The playable Colony
// must grow mugwort through the tended-resource owner.
const brewingDefinition = JSON.parse(new TextDecoder().decode(colonyPack.definition));
brewingDefinition.initial.push({ id: "test.brew.mugwort", components: { "hive.lot": { quantity: 1, kind: "mugwort", container: "colony.pantry" } } });
const brewingPack = { ...colonyPack, definition: new TextEncoder().encode(JSON.stringify(brewingDefinition)) };

function finishedStation(session: GameSession) {
  return session.query(query(ConstructionSite)).find(row => {
    const site = row.get(ConstructionSite);
    return site.catalog === "brew-station" && site.phase === "finished";
  });
}

/** Full native journey: player intent has no worker, supply uses ordinary hauling,
 * attended stages release around elapsed fermentation, and outputs settle once. */
test("one brew request travels, ferments unattended, reassigns, and settles exact outputs", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: brewingPack });
    session.start();
    session.command("build", { catalog: "brew-station", orientation: "north", target: { cell: [1, 13, -1] } });
    for (let tick = 0; tick < 400 && !finishedStation(session); tick++) session.step(0.25);
    const station = finishedStation(session);
    assert(station, JSON.stringify({
      sites: session.query(query(ConstructionSite)).map(row => row.get(ConstructionSite)),
      deliveries: session.query(query(DeliveryTask)).map(row => row.get(DeliveryTask)),
    }));
    assert.equal(session.renderFacts().find(fact => fact.id === station.id)?.visual, "colony.brew-station.profile.empty");

    // The real clearing starts with groundwater below solid terrain. Expose a
    // finite source through the public area-dig command before asking the
    // brewing work owner to fetch it.
    for (const [depth, columnX] of [9, 9, 10, 9].entries()) {
      const surface = port.terrainSurfaces([[columnX, 0]])[0];
      assert(surface, "generated column must have another diggable surface");
      session.command("dig", { area: { start: surface.cell, end: surface.cell } });
      for (let tick = 0; tick < 240 && port.terrainMaterials([surface.cell])[0] !== 0; tick++) session.step(0.25);
      assert.equal(port.terrainMaterials([surface.cell])[0], 0, `groundwater cut ${depth + 1} must finish`);
    }

    session.command("requestBrew", { station: station.id });
    session.step(0);
    const process = session.query(query(StagedProcess))[0];
    assert(process, "request must create a workerless process");
    assert.equal(process.get(StagedProcess).worker, null);
    assert.throws(() => session.command("requestBrew", { station: station.id }), /active brew process/);

    let sawAttendance = false;
    let sawProcessWaterDemand = false;
    let sawElapsedWithoutAttendance = false;
    let sawLaterAttendance = false;
    const stationVisuals = new Set<string>();
    for (let tick = 0; tick < 2_000; tick++) {
      session.step(0.25);
      const stationVisual = session.renderFacts().find(fact => fact.id === station.id)?.visual;
      if (stationVisual) stationVisuals.add(stationVisual);
      const state = session.query(query(StagedProcess))[0]?.get(StagedProcess);
      const processWaterDemands = session.query(query(WaterSupplyOrder)).filter(row => row.get(WaterSupplyOrder).process === process.id);
      const activeProcessWaterDemands = processWaterDemands.filter(order => session.query(query(WaterSupplyWork)).some(work => work.id === order.id && ["approaching", "submitting"].includes(work.get(WaterSupplyWork).phase)));
      assert(processWaterDemands.length <= 1, "one active process must have at most one water demand");
      const kettleWater = session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).container === `${station.id}:kettle` && row.get(MaterialLot).kind === "water").reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0);
      const waterDelivery = session.query(query(DeliveryTask)).filter(row => { const task = row.get(DeliveryTask); return task.custody !== "delivered" && task.destination === `${station.id}:kettle` && task.material === "water"; }).reduce((sum, row) => sum + row.get(DeliveryTask).quantity, 0);
      assert(kettleWater + waterDelivery < 2 || activeProcessWaterDemands.length === 0, "sufficient staged and in-flight water must prevent another fetch from starting");
      if (processWaterDemands.length) sawProcessWaterDemand = true;
      const attending = state?.worker !== null;
      if (attending) sawAttendance = true;
      if (state?.stageIndex === 1 && state.phase === "waiting" && !attending)
        sawElapsedWithoutAttendance = true;
      if (state?.stageIndex === 2 && attending) sawLaterAttendance = true;
      if (state?.phase === "complete") break;
    }
    const final = session.query(query(StagedProcess))[0]?.get(StagedProcess);
    assert.equal(final?.phase, "complete", JSON.stringify({
      process: final,
      deliveries: session.query(query(DeliveryTask)).map(row => row.get(DeliveryTask)),
      lots: session.query(query(MaterialLot)).map(row => row.get(MaterialLot)),
      positions: session.query(query(Position)).filter(row => row.id.startsWith("colony.worker")).map(row => [row.id, row.get(Position)]),
      destinations: session.query(query(Destination)).map(row => [row.id, row.get(Destination)]),
      outcomes: session.save().outcomes.slice(-12),
    }));
    assert(sawAttendance, "an attended stage must acquire saved work");
    assert(sawProcessWaterDemand, "a short kettle must create one process water demand");
    assert(sawElapsedWithoutAttendance, "fermentation must release attendance");
    assert(sawLaterAttendance, "kegging must acquire attendance after consumed inputs are gone");
    session.step(0);
    const lots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
    assert.equal(lots.filter(lot => lot.kind === "ale" && lot.container === "colony.brew.keg").reduce((sum, lot) => sum + lot.quantity, 0), 4);
    assert.equal(lots.filter(lot => lot.kind === "spent-grain" && lot.container === `${station.id}:tray`).reduce((sum, lot) => sum + lot.quantity, 0), 1);
    assert(stationVisuals.has("colony.brew-station.profile.prepare-attended"));
    assert([...stationVisuals].some(visual => visual === "colony.brew-station.profile.ferment" || visual === "colony.brew-station.profile.ferment-burning"));
    assert(stationVisuals.has("colony.brew-station.profile.keg"));
    assert.equal(session.renderFacts().find(fact => fact.id === station.id)?.visual, "colony.brew-station.profile.settled");
  } finally {
    port.dispose();
  }
});
