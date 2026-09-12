import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { MaterialLot, LotWater, query } from "../sdk/index";
import { colonyPack, ColonyDigOrder } from "./colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

// Exercise the current area-designation API and its real autonomous workers.
// The former worker-target Dig command was removed when area orders landed.
for (const x of [1, 9]) test(`Colony area digging earns finite groundwater at x=${x} across reload`, () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  const tick = () => {
    for (const result of session.step(0.25)) {
      // Another cut may invalidate a hauling approach; the shared work owner
      // receives that ordinary rejection and re-plans without freezing Dig.
      if (!result.accepted) assert.match(result.reason ?? "", /route endpoint lacks support or clearance|destination is occupied/);
    }
  };
  const dig = (columnX: number) => {
    const surface = port.terrainSurfaces([[columnX, 0]])[0];
    assert.ok(surface, "the next cut comes from the actual generated surface");
    session.command("dig", { area: { start: surface.cell, end: surface.cell } });
    let completed = false;
    for (let step = 0; step < 240; step++) {
      tick();
      if (port.terrainMaterials([[...surface.cell]])[0] === 0) { completed = true; break; }
    }
    assert.ok(completed, JSON.stringify(session.query(query(ColonyDigOrder)).map(row => row.get(ColonyDigOrder))));
    return surface.cell;
  };
  try {
    session.start();
    const initialGoods = session.query(query(MaterialLot)).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0);
    dig(x);
    // Restore with real worker/hauling state, not just an isolated water array.
    const midway = session.save();
    session.restore(midway);
    assert.deepEqual(session.save(), midway);
    dig(x);
    dig(x + 1);
    const exposed = dig(x);
    for (let step = 0; step < 16; step++) tick();
    const visible = session.terrainView()!.water.filter(cell =>
      Math.abs(cell.at[0] - x) <= 1 && Math.abs(cell.at[2]) <= 1 && cell.at[1] <= exposed[1] && cell.liquidVolumeM3 > 0);
    assert.ok(visible.length > 0, "finite groundwater reaches the open cut and connected cave");
    const facts = port.environmentFacts() as { totalKg: number; initialTotalKg: number; boundaryKg: number };
    const spoilWater = session.query(query(LotWater)).reduce((sum, row) => sum + row.get(LotWater).waterKg, 0);
    assert.ok(spoilWater > 0, "wet spoil retains the removed pore water");
    assert.ok(Math.abs(facts.totalKg + spoilWater - facts.initialTotalKg) < 1e-8, "field plus physical goods conserve water");
    assert.equal(session.query(query(MaterialLot)).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), initialGoods + 12);
    const saved = session.save();
    const waterBefore = port.environmentFacts();
    session.restore(saved);
    assert.deepEqual(session.save(), saved);
    assert.deepEqual(port.environmentFacts(), waterBefore);
  } finally { port.dispose(); }
});
