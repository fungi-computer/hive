import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { entity, query } from "../sdk/authoring";
import { ConstructionSite, SealedContainer } from "../sdk/construction";
import { ConstructionApproach } from "../sdk/construction-work";
import { DeconstructionApproach, DeconstructionOrder } from "../sdk/deconstruction-work";
import { Container, MaterialLot, transfer } from "../sdk/common";
import { DeliveryTask } from "../sdk/delivery";
import { EmissionOrder } from "../sdk/emission-work";
import { colonyPack } from "./colony";
initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("disabled ignition does not reserve workers or lumber ahead of construction", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("build", { catalog: "brew-station", orientation: "north", target: { cell: [1, 13, -1] } });
    for (let tick = 0; tick < 240 && !session.query(query(EmissionOrder)).length; tick++) session.step(0.25);
    const station = session.query(query(EmissionOrder))[0].id.replace(/:hearth$/, "");
    const tasks = session.query(query(DeliveryTask)).map(row => row.get(DeliveryTask));
    assert.equal(session.query(query(EmissionOrder))[0].get(EmissionOrder).enabled, false);
    const hearth = session.query(query(EmissionOrder))[0].id;
    assert(tasks.every(task => task.destination !== hearth), "disabled ignition has no fuel delivery");
    session.command("lightHearth", { station });
    session.step(0.25);
    assert(session.query(query(DeliveryTask)).some(row => row.get(DeliveryTask).destination === hearth), "requested ignition uses shared delivery");
  } finally { port.dispose(); }
});

test("brew station is absent initially and completion creates stable retained ports", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    assert.equal(session.query(query(ConstructionSite)).length, 0);
    assert.equal(session.query(query(EmissionOrder)).length, 0);
    session.command("build", { catalog: "brew-station", orientation: "north", target: { cell: [1, 13, -1] } });
    for (let tick = 0; tick < 240 && !session.query(query(EmissionOrder)).length; tick++) session.step(0.25);
    const site = session.query(query(ConstructionSite)).find(row => row.get(ConstructionSite).catalog === "brew-station");
    assert(site && site.get(ConstructionSite).phase === "finished");
    const containers = session.query(query(Container)).map(row => row.id).filter(id => id.startsWith(`${site.id}:`)).sort();
    assert.deepEqual(containers, ["barm", "hearth", "keg", "kettle", "tray"].map(key => `${site.id}:${key}`));
    assert.equal(session.query(query(EmissionOrder)).map(row => row.id), [`${site.id}:hearth`]);
    const saved = session.save();
    session.restore(saved);
    assert.deepEqual(session.query(query(Container)).map(row => row.id).filter(id => id.startsWith(`${site.id}:`)).sort(), containers);
    assert.equal(session.query(query(EmissionOrder)).map(row => row.id), [`${site.id}:hearth`]);
  } finally { port.dispose(); }
});

test("brew station teardown waits for occupied retained ports and salvages after emptying them", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("build", { catalog: "brew-station", orientation: "north", target: { cell: [1, 13, -1] } });
    for (let tick = 0; tick < 240 && !session.query(query(EmissionOrder)).length; tick++) session.step(0.25);
    const site = session.query(query(ConstructionSite)).find(row => row.get(ConstructionSite).catalog === "brew-station");
    assert(site && site.get(ConstructionSite).phase === "finished");
    const hearth = entity(`${site.id}:hearth`);
    const lumber = entity("colony.lumber");
    const source = session.query(query(MaterialLot)).find(row => row.get(MaterialLot).container === lumber && row.get(MaterialLot).kind === "wood");
    assert(source);
    session.request(transfer(source.id, lumber, hearth, 1));
    session.step(0);
    const beforeBlocked = session.query(query(MaterialLot)).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0);
    session.command("deconstruct", { site: site.id });
    for (let tick = 0; tick < 80; tick++) session.step(0.25);
    assert(session.query(query(ConstructionSite)).some(row => row.id === site.id), "occupied port must block teardown");
    assert.equal(session.query(query(MaterialLot)).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), beforeBlocked, "blocked teardown cannot lose port contents");
    const occupied = session.query(query(MaterialLot)).find(row => row.get(MaterialLot).container === hearth);
    assert(occupied);
    session.request(transfer(occupied.id, hearth, lumber, 1));
    session.step(0);
    for (let tick = 0; tick < 240 && session.query(query(ConstructionSite)).some(row => row.id === site.id); tick++) session.step(0.25);
    assert.equal(session.query(query(ConstructionSite)).some(row => row.id === site.id), false);
    assert(session.query(query(MaterialLot)).some(row => row.get(MaterialLot).container === "colony.worker.1" && row.get(MaterialLot).kind === "wood") || session.query(query(MaterialLot)).some(row => row.get(MaterialLot).container === "colony.worker.2" && row.get(MaterialLot).kind === "wood"), "finite wood salvage must be delivered to a worker");
  } finally { port.dispose(); }
});

test("actual Colony staircase supply splits one shared lumber lot into two lawful haul legs", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("build", { catalog: "timber-stair", orientation: "north", target: { cell: [1, 13, 0] } });
    let live = session.query(query(DeliveryTask)).filter(() => false);
    for (let tick = 0; tick < 1000; tick++) {
      session.step(0.01);
      const tasks = session.query(query(DeliveryTask)).filter((row) => {
        const task = row.get(DeliveryTask);
        return task.destination.startsWith("colony.build.") && task.phase !== "complete";
      });
      if (tasks.length === 2 && tasks.every((row) => row.get(DeliveryTask).actor !== null)) {
        live = tasks;
        break;
      }
    }
    assert.equal(live.length, 2, `staircase demand must expose two assigned haul legs: ${JSON.stringify(session.query(query(DeliveryTask)).map((row) => row.get(DeliveryTask)))}`);
    const tasks = live;
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

test("actual Colony queues, performs, reloads, and conserves a floor deconstruction", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    const initialWood = session.query(query(MaterialLot)).reduce((sum, row) => sum + (row.get(MaterialLot).kind === "wood" ? row.get(MaterialLot).quantity : 0), 0);
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: [1, 13, 0] } });
    for (let tick = 0; tick < 240 && !session.query(query(SealedContainer)).length; tick++) session.step(0.25);
    const site = session.query(query(ConstructionSite))[0];
    assert(site && site.get(ConstructionSite).phase === "finished");
    session.command("deconstruct", { site: site.id });
    for (let tick = 0; tick < 240 && session.query(query(ConstructionSite)).some((row) => row.id === site.id); tick++) session.step(0.25);

    assert.equal(session.query(query(ConstructionSite)).some((row) => row.id === site.id), false);
    session.step(0.01); // retire the authored order after the native receipt removed its site
    assert.equal(session.query(query(DeconstructionOrder)).length, 0);
    assert.equal(session.query(query(DeconstructionApproach)).length, 0);
    assert.equal(session.query(query(MaterialLot)).reduce((sum, row) => sum + (row.get(MaterialLot).kind === "wood" ? row.get(MaterialLot).quantity : 0), 0), initialWood);
    const saved = session.save();
    session.restore(saved);
    assert.equal(session.query(query(ConstructionSite)).some((row) => row.id === site.id), false);
    assert.equal(session.query(query(MaterialLot)).reduce((sum, row) => sum + (row.get(MaterialLot).kind === "wood" ? row.get(MaterialLot).quantity : 0), 0), initialWood);
  } finally { port.dispose(); }
});

test("actual Colony queues an upper floor before its timber wall and waits for support", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("build", { catalog: "timber-wall", target: { cell: [1, 13, 0] } });
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: [1, 17, 0] } });
    session.step(0.01);
    const sites = session.query(query(ConstructionSite));
    assert.equal(sites.length, 2);
    const wall = sites.find(row => row.get(ConstructionSite).catalog === "timber-wall");
    const floor = sites.find(row => row.get(ConstructionSite).catalog === "timber-floor");
    assert(wall && floor);
    const initialFloor = floor.get(ConstructionSite);
    assert.equal(initialFloor.worker, null);
    assert.equal(session.query(query(ConstructionApproach)).some(row => row.get(ConstructionApproach).site === floor.id), false);
    assert.equal(port.constructionAccess([floor.id])[0].support, "waitingForSupport");
    const current = (id: typeof wall.id) => session.query(query(ConstructionSite)).find(row => row.id === id)!.get(ConstructionSite);

    let wallFinished = false;
    let wallCompletionTick = -1;
    let floorCompletionTick = -1;
    for (let tick = 0; tick < 800; tick++) {
      session.step(0.25);
      wallFinished = current(wall.id).phase === "finished";
      if (wallFinished && wallCompletionTick < 0) wallCompletionTick = tick;
      if (current(floor.id).phase === "finished" && floorCompletionTick < 0) floorCompletionTick = tick;
      if (wallFinished) break;
    }
    assert.equal(wallFinished, true, JSON.stringify(session.query(query(ConstructionSite)).map(row => row.get(ConstructionSite))));
    assert(floorCompletionTick < 0 || wallCompletionTick <= floorCompletionTick, `upper floor completed before wall: ${JSON.stringify({ wallCompletionTick, floorCompletionTick })}`);
    assert.equal(port.constructionAccess([floor.id])[0].support, "ready");

    let bothFinished = current(floor.id).phase === "finished" && current(wall.id).phase === "finished";
    for (let tick = 0; tick < 800; tick++) {
      session.step(0.25);
      bothFinished = current(floor.id).phase === "finished" && current(wall.id).phase === "finished";
      if (bothFinished) break;
    }
    assert.equal(bothFinished, true, JSON.stringify(session.query(query(ConstructionSite)).map(row => row.get(ConstructionSite))));
    const wood = session.query(query(MaterialLot)).map(row => row.get(MaterialLot)).filter(lot => lot.kind === "wood");
    assert.equal(wood.reduce((sum, lot) => sum + lot.quantity, 0), 48);
    const surfaces = port.structureSurfaces([[1, 0]]);
    assert(surfaces[0].some(surface => surface.cell[1] === 17), JSON.stringify(surfaces));
    const saved = session.save();
    session.restore(saved);
    assert.equal(session.query(query(ConstructionSite)).length, 2);
    assert(session.query(query(ConstructionSite)).every(row => row.get(ConstructionSite).phase === "finished"));
    assert.equal(port.constructionAccess([floor.id])[0].support, "ready");
    assert.deepEqual(port.structureSurfaces([[1, 0]]), surfaces);
  } finally { port.dispose(); }
});


test("actual Colony workers build a three-level route from finite supplies", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    for (const [catalog, orientation, cell] of [
      ["timber-stair", "north", [1, 13, 0]],
      ["timber-floor", "north", [2, 17, -2]],
      ["timber-stair", "south", [2, 17, -2]],
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
