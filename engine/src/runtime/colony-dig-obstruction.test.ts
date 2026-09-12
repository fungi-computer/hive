import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { colonyPack, ColonyDigOrder } from "../games/colony";
import { entity, query } from "../sdk/authoring";
import { MaterialLot, move } from "../sdk/common";
import { GroundStock } from "../sdk/ground-stock";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("rectangular digging leaves an occupied tile waiting and resumes after its guest moves", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("dig", { area: { start: [1, 13, 0], end: [4, 13, 3] } });
    const rejected: string[] = [];
    for (let i = 0; i < 1000; i++) {
      for (const outcome of session.step(0.1)) if (!outcome.accepted) rejected.push(outcome.reason ?? "rejected");
    }
    assert.deepEqual(rejected, [], "occupied targets must be filtered before native admission");
    const orders = session.query(query(ColonyDigOrder));
    assert.equal(orders.length, 1, "other fifteen cuts must finish despite full storage");
    const waiting = orders[0].get(ColonyDigOrder);
    assert.equal(waiting.actor, null, "waiting must release the worker");
    assert.equal(waiting.reason, "Someone is standing on this tile");
    const lots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
    assert.equal(lots.filter(lot => lot.kind === "soil-spoil").reduce((n, lot) => n + lot.quantity, 0), 45);
    const ground = new Set(session.query(query(GroundStock)).map(row => row.id));
    assert(lots.some(lot => ground.has(lot.container) && lot.quantity > 0), "excess spoil stays on the ground");
    assert(lots.filter(lot => lot.container === "colony.pantry").reduce((n, lot) => n + lot.quantity, 0) <= 20);

    const surface = port.terrainSurfaces([[3, 0]])[0];
    assert(surface);
    session.request(move(entity("colony.guest.1"), { x: 3, y: (surface.cell[1] + 0.5) * 0.54, z: 0, frame: null }));
    for (let i = 0; i < 240 && session.query(query(ColonyDigOrder)).length; i++) session.step(0.1);
    assert.equal(session.query(query(ColonyDigOrder)).length, 0, "last cut resumes when guest leaves");
    assert.equal(session.query(query(MaterialLot)).reduce((n, row) => {
      const lot = row.get(MaterialLot);
      return n + (lot.kind === "soil-spoil" ? lot.quantity : 0);
    }, 0), 48);
  } finally { port.dispose(); }
});
