import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { query } from "../sdk/authoring";
import { ConstructionSite, SealedContainer } from "../sdk/construction";
import { MaterialLot } from "../sdk/common";
import { DeliveryTask } from "../sdk/delivery";
import { colonyPack } from "./colony";
initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("actual Colony staircase supply assigns two workers to two independent lumber lots", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("build", { catalog: "timber-stair", orientation: "north", target: { cell: [1, 13, 0] } });
    let live: readonly any[] = [];
    for (let tick = 0; tick < 1000; tick++) {
      session.step(0.01);
      const tasks = session.query(query(DeliveryTask)).filter((row) => {
        const task = row.get(DeliveryTask);
        return task.destination.startsWith("colony.build.") && task.phase !== "complete";
      });
      if (tasks.length === 2 && tasks.every((row) => row.get(DeliveryTask).actor !== null)) {
        live = [tasks];
        break;
      }
    }
    assert.equal(live.length, 1, `staircase demand must expose two assigned haul legs: ${JSON.stringify(session.query(query(DeliveryTask)).map((row) => row.get(DeliveryTask)))}`);
    const tasks = live[0];
    const states = tasks.map((row) => row.get(DeliveryTask));
    assert.equal(new Set(tasks.map((row) => row.id)).size, 2);
    assert.equal(new Set(states.map((task) => task.actor)).size, 2);
    assert.equal(states.reduce((sum, task) => sum + task.quantity, 0), 6);
    assert(states.every((task) => task.quantity === 3));
    const saved = session.save();
    session.restore(saved);
    const restored = session.query(query(DeliveryTask)).map((row) => row.get(DeliveryTask)).filter((task) => task.destination.startsWith("colony.build.") && task.phase !== "complete");
    assert.deepEqual(restored.map((task) => [task.sourceLot, task.actor, task.quantity]), states.map((task) => [task.sourceLot, task.actor, task.quantity]));
    let finished = false;
    for (let tick = 0; tick < 600; tick++) {
      session.step(0.25);
      const site = session.query(query(ConstructionSite))[0];
      finished = site?.get(ConstructionSite).phase === "finished";
      if (finished) break;
    }
    assert.equal(finished, true);
    const site = session.query(query(ConstructionSite))[0];
    const delivered = session.query(query(MaterialLot)).filter((row) => row.get(MaterialLot).container === site.id && row.get(MaterialLot).kind === "wood");
    assert.equal(delivered.reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 6);
    assert.equal(session.query(query(MaterialLot)).filter((row) => row.get(MaterialLot).kind === "wood").reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 48);
  } finally { port.dispose(); }
});

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
    assert.deepEqual(fact?.view, { pickable: false, cutawayTop: 13 });
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
