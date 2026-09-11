import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { query } from "../sdk/authoring";
import { ConstructionSite, SealedContainer } from "../sdk/construction";
import { MaterialLot } from "../sdk/common";
import { colonyPack } from "./colony";
initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
test("actual Colony workers supply and finish a player floor with finite lumber", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: [1, 13, 0] } });
    for (let tick = 0; tick < 240; tick++) {
      session.step(0.25);
      if (session.query(query(SealedContainer)).length) break;
    }
    const sites = session.query(query(ConstructionSite));
    assert.equal(sites.length, 1);
    assert.equal(sites[0].get(ConstructionSite).phase, "finished", JSON.stringify(sites[0].get(ConstructionSite)));
    const wood = session.query(query(MaterialLot)).map(row => row.get(MaterialLot)).filter(lot => lot.kind === "wood");
    assert.equal(wood.reduce((sum, lot) => sum + lot.quantity, 0), 48);
    assert.equal(wood.filter(lot => lot.container === sites[0].id).reduce((sum, lot) => sum + lot.quantity, 0), 2);
    const fact = session.renderFacts().find(fact => fact.id === sites[0].id);
    assert.equal(fact?.visual, "colony.floor.finished");
    assert.deepEqual(fact?.view, { pickable: false });
    assert.deepEqual(port.structureSurfaces([[1, 0]]), [[{ cell: [1, 13, 0] }]]);
    session.restore(session.save());
    assert.deepEqual(port.structureSurfaces([[1, 0]]), [[{ cell: [1, 13, 0] }]]);
    assert.equal(session.query(query(ConstructionSite))[0].get(ConstructionSite).phase, "finished");
  } finally { port.dispose(); }
});


test("actual Colony workers build a three-level route from finite supplies", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    for (const [catalog, orientation, cell] of [
      ["timber-stair", "north", [1, 13, 0]],
      ["timber-floor", "north", [2, 17, -4]],
      ["timber-stair", "south", [2, 17, -4]],
    ] as const) {
      const before = session.query(query(ConstructionSite)).length;
      session.command("build", { catalog, orientation, target: { cell } });
      let finished = false;
      for (let tick = 0; tick < 480; tick++) {
        session.step(0.25);
        const sites = session.query(query(ConstructionSite));
        finished = sites.length === before + 1 && sites.every(row => row.get(ConstructionSite).phase === "finished");
        if (finished) break;
      }
      assert(finished, JSON.stringify(session.query(query(ConstructionSite)).map(row => row.get(ConstructionSite))));
      session.restore(session.save());
    }
    assert(port.structureSurfaces([[2, 0]])[0].some(surface => surface.cell[1] === 21));
    const wood = session.query(query(MaterialLot)).map(row => row.get(MaterialLot)).filter(lot => lot.kind === "wood");
    assert.equal(wood.reduce((sum, lot) => sum + lot.quantity, 0), 48);
  } finally { port.dispose(); }
});
