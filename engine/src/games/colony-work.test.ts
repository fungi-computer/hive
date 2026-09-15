// Focused real lifecycle law for native tended-resource work.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { FiniteResource, MaterialLot, ResourceSite, SupplyAllocation } from "../sdk/common";
import { GroundStock } from "../sdk/ground-stock";
import { query } from "../sdk/authoring";
import { colonyPack } from "./colony";
import { ResourceOrder } from "../sdk/resource-work";
import { ConstructionSite } from "../sdk/construction";
import { StagedProcess } from "../sdk/process-supply";

test("GameSession preserves a finite mugwort harvest through extraction and reload", async (t) => {
  if (!existsSync("engine/generated/hive_kernel_bg.wasm")) {
    t.skip("generated WASM is unavailable in this checkout");
    return;
  }
  const [{ initSync, WasmKernel }, { GameSession }, { wasmKernelPort }] = await Promise.all([
    import("../../generated/hive_kernel.js"), import("../runtime/session"), import("../runtime/wasm-kernel"),
  ]);
  initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  try {
    session.start();
    for (const columnX of [9, 9, 10, 9]) {
      const surface = port.terrainSurfaces([[columnX, 0]])[0];
      assert(surface, "generated column must have another diggable surface");
      session.command("dig", { area: { start: surface.cell, end: surface.cell } });
      for (let tick = 0; tick < 240 && port.terrainMaterials([surface.cell])[0] !== 0; tick++) session.step(0.25);
      assert.equal(port.terrainMaterials([surface.cell])[0], 0, "groundwater exposure must finish");
    }
    session.command("sowMugwort", { target: { cell: [0, 13, 0], material: 1 } });
    session.step(0);
    const intent = session.query(query(ResourceOrder))[0]?.get(ResourceOrder);
    assert(intent, "sow command must create a workerless resource intent");
    const savedBeforeWork = session.save();
    session.restore(savedBeforeWork);
    assert.deepEqual(session.save(), savedBeforeWork);
    let restoredNativeAttempt = false;
    for (let tick = 0; tick < 4000; tick++) {
      try { session.step(0.25); } catch (error) {
        throw new Error(`resource step ${tick} failed: ${String(error)}`, { cause: error as Error });
      }
      const current = session.query(query(ResourceOrder))[0]?.get(ResourceOrder);
      if (!restoredNativeAttempt && current && (current.progressSeconds > 0 || session.query(query(ResourceSite)).length > 0)) {
        const pending = session.save();
        session.restore(pending);
        assert.deepEqual(session.save(), pending, "an admitted physical operation must survive exact save/reload");
        restoredNativeAttempt = true;
      }
      if (current?.status === "complete") break;
    }
    assert(restoredNativeAttempt, "the real consumer must cross a durable submitting phase");
    const completed = session.query(query(ResourceOrder))[0]?.get(ResourceOrder);
    assert.equal(completed?.status, "complete", "resource order must complete before conservation is assessed");
    const groundStocks = new Set(session.query(query(GroundStock)).map(row => row.id));
    const harvested = session.query(query(MaterialLot)).filter(row => {
      const lot = row.get(MaterialLot);
      return lot.kind === "mugwort" && groundStocks.has(lot.container);
    });
    assert.equal(harvested.reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 1, "the native harvest lot must land once at its physical site");

    session.command("build", { catalog: "brew-station", orientation: "north", target: { cell: [1, 13, -1] } });
    for (let tick = 0; tick < 500; tick++) {
      const station = session.query(query(ConstructionSite)).find(row => row.get(ConstructionSite).catalog === "brew-station" && row.get(ConstructionSite).phase === "finished");
      if (station) break;
      session.step(0.25);
    }
    const station = session.query(query(ConstructionSite)).find(row => row.get(ConstructionSite).catalog === "brew-station" && row.get(ConstructionSite).phase === "finished");
    assert(station, "retained brew station must be built through ordinary construction");
    session.command("requestBrew", { station: station.id });
    let sawHarvestAllocation = false;
    for (let tick = 0; tick < 2400; tick++) {
      try { session.step(0.25); } catch (error) {
        const processes = session.query(query(StagedProcess)).map(row => ({ id: row.id, ...row.get(StagedProcess) }));
        const deliveries = session.query(query(SupplyAllocation)).map(row => ({ id: row.id, ...row.get(SupplyAllocation) }));
        const lots = session.query(query(MaterialLot)).map(row => ({ id: row.id, ...row.get(MaterialLot) }));
        throw new Error(`brew step ${tick} failed with processes=${JSON.stringify(processes)} deliveries=${JSON.stringify(deliveries)} lots=${JSON.stringify(lots)}: ${String(error)}`, { cause: error as Error });
      }
      sawHarvestAllocation ||= session.query(query(SupplyAllocation)).some(row => {
        const delivery = row.get(SupplyAllocation);
        return delivery.material === "mugwort" && delivery.portion === harvested[0]?.id;
      });
      const process = session.query(query(StagedProcess))[0]?.get(StagedProcess);
      if (process?.phase === "complete") break;
    }
    assert(sawHarvestAllocation, "the shared native supply owner must haul the newly harvested mugwort into the station");
    assert.equal(session.query(query(StagedProcess))[0]?.get(StagedProcess).phase, "complete", "retained herbal-ale process must complete");
    const brewedLots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
    assert.equal(brewedLots.filter(lot => lot.kind === "ale").reduce((sum, lot) => sum + lot.quantity, 0), 4);
    assert.equal(brewedLots.filter(lot => lot.kind === "mugwort").reduce((sum, lot) => sum + lot.quantity, 0), 0, "the harvested mugwort must be consumed exactly once");
    const saved = session.save();
    session.restore(saved);
    assert.deepEqual(session.save(), saved);
  } finally { try { port.dispose(); } catch { /* preserve the primary law assertion */ } }
});
