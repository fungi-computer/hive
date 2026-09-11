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
    session.restore(session.save());
    assert.equal(session.query(query(ConstructionSite))[0].get(ConstructionSite).phase, "finished");
  } finally { port.dispose(); }
});
