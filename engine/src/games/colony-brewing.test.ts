import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import type { GamePack } from "../contracts";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { query } from "../sdk/authoring";
import { ConstructionSite } from "../sdk/construction";
import { Destination, MaterialLot, Position } from "../sdk/common";
import { ProcessAttendanceWork } from "../sdk/process-attendance";
import { StagedProcess } from "../sdk/process-supply";
import { DeliveryTask } from "../sdk/delivery";
import { colonyPack } from "./colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

function suppliedPack(): GamePack {
  const definition = JSON.parse(new TextDecoder().decode(colonyPack.definition)) as {
    initial: { id: string; components: Record<string, unknown> }[];
  };
  definition.initial.push(
    { id: "brew.malt", components: { "hive.lot": { kind: "malt", quantity: 2, container: "colony.pantry" } } },
    // Water begins inside an actual held pail. Process supply must join its
    // interior lot to ordinary delivery custody before staging the kettle.
    { id: "brew.water", components: { "hive.lot": { kind: "water", quantity: 2, container: "colony.pail.1" } } },
    { id: "brew.mugwort", components: { "hive.lot": { kind: "mugwort", quantity: 1, container: "colony.pantry" } } },
    { id: "brew.barm", components: { "hive.lot": { kind: "barm", quantity: 1, container: "colony.pantry" }, "hive.container": { capacity: 1 } } },
    { id: "brew.keg", components: { "hive.lot": { kind: "keg", quantity: 1, container: "colony.pantry" }, "hive.container": { capacity: 4 } } },
  );
  return { ...colonyPack, definition: new TextEncoder().encode(JSON.stringify(definition)) };
}

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
    const session = new GameSession({ port, pack: suppliedPack() });
    session.start();
    session.command("build", { catalog: "brew-station", orientation: "north", target: { cell: [1, 13, -1] } });
    for (let tick = 0; tick < 400 && !finishedStation(session); tick++) session.step(0.25);
    const station = finishedStation(session);
    assert(station, JSON.stringify({
      sites: session.query(query(ConstructionSite)).map(row => row.get(ConstructionSite)),
      deliveries: session.query(query(DeliveryTask)).map(row => row.get(DeliveryTask)),
    }));

    session.command("requestBrew", { station: station.id });
    session.step(0);
    const process = session.query(query(StagedProcess))[0];
    assert(process, "request must create a workerless process");
    assert.equal(process.get(StagedProcess).worker, null);
    assert.throws(() => session.command("requestBrew", { station: station.id }), /active brew process/);

    let sawAttendance = false;
    let sawElapsedWithoutAttendance = false;
    let sawLaterAttendance = false;
    for (let tick = 0; tick < 2_000; tick++) {
      session.step(0.25);
      const state = session.query(query(StagedProcess))[0]?.get(StagedProcess);
      const attendance = session.query(query(ProcessAttendanceWork));
      if (attendance.length) sawAttendance = true;
      if (state?.stageIndex === 1 && state.phase === "waiting" && attendance.length === 0)
        sawElapsedWithoutAttendance = true;
      if (state?.stageIndex === 2 && attendance.length) sawLaterAttendance = true;
      if (state?.phase === "complete") break;
    }
    const final = session.query(query(StagedProcess))[0]?.get(StagedProcess);
    assert.equal(final?.phase, "complete", JSON.stringify({
      process: final,
      attendance: session.query(query(ProcessAttendanceWork)).map(row => row.get(ProcessAttendanceWork)),
      deliveries: session.query(query(DeliveryTask)).map(row => row.get(DeliveryTask)),
      lots: session.query(query(MaterialLot)).map(row => row.get(MaterialLot)),
      positions: session.query(query(Position)).filter(row => row.id.startsWith("colony.worker")).map(row => [row.id, row.get(Position)]),
      destinations: session.query(query(Destination)).map(row => [row.id, row.get(Destination)]),
      outcomes: session.save().outcomes.slice(-12),
    }));
    assert(sawAttendance, "an attended stage must acquire saved work");
    assert(sawElapsedWithoutAttendance, "fermentation must release attendance");
    assert(sawLaterAttendance, "kegging must acquire attendance after consumed inputs are gone");
    session.step(0);
    assert.equal(session.query(query(ProcessAttendanceWork)).length, 0);
    const lots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
    assert.equal(lots.filter(lot => lot.kind === "ale" && lot.container === "brew.keg").reduce((sum, lot) => sum + lot.quantity, 0), 4);
    assert.equal(lots.filter(lot => lot.kind === "spent-grain" && lot.container === `${station.id}:tray`).reduce((sum, lot) => sum + lot.quantity, 0), 1);
  } finally {
    port.dispose();
  }
});
