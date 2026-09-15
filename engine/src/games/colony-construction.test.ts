import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { entity, query } from "../sdk/authoring";
import { ConstructionSite, SealedContainer, constructionCell } from "../sdk/construction";
import { DeconstructionOrder } from "../sdk/deconstruction-work";
import { Container, Emitter, MaterialLot, SupplyAllocation } from "../sdk/common";
import { colonyPack } from "./colony";
initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

function finishedBrewStations(session: GameSession) {
  return session.query(query(ConstructionSite)).filter(row => {
    const site = row.get(ConstructionSite);
    return site.catalog === "brew-station" && site.phase === "finished";
  });
}

function buildBrewStation(session: GameSession, cell: readonly [number, number, number] = [1, 13, -1]) {
  const expected = finishedBrewStations(session).length + 1;
  session.command("build", {
    catalog: "brew-station",
    orientation: "north",
    target: { cell },
  });
  for (
    let tick = 0;
    tick < 600 && finishedBrewStations(session).length < expected;
    tick++
  )
    session.step(0.25);
  const stations = finishedBrewStations(session);
  assert.equal(stations.length, expected, "brew station must finish");
  const site = stations.find((row) => {
    const at = constructionCell(row.get(ConstructionSite));
    return at.x === cell[0] && at.z === cell[2];
  });
  assert(site, "finished brew station must retain its requested cell");
  return site;
}

function materialTotal(session: GameSession) {
  return session.query(query(MaterialLot)).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0);
}

function buildFinished(session: GameSession, catalog: string, cell: readonly [number, number, number]) {
  const before = new Set(session.query(query(ConstructionSite)).map(row => row.id));
  session.command("build", { catalog, orientation: "north", target: { cell } });
  for (let tick = 0; tick < 800; tick++) {
    session.step(0.25);
    const site = session.query(query(ConstructionSite)).find(row => !before.has(row.id) && row.get(ConstructionSite).catalog === catalog);
    if (site?.get(ConstructionSite).phase === "finished") return site;
  }
  const sites = session.query(query(ConstructionSite));
  const pending = sites.find(row => !before.has(row.id) && row.get(ConstructionSite).catalog === catalog);
  throw new Error(`Colony ${catalog} did not finish: ${JSON.stringify({
    sites: sites.map(row => ({ id: row.id, ...row.get(ConstructionSite) })),
    deliveries: session.query(query(SupplyAllocation)).map(row => ({ id: row.id, ...row.get(SupplyAllocation) })),
    lots: session.query(query(MaterialLot)).map(row => ({ id: row.id, ...row.get(MaterialLot) })),
    access: pending ? session.constructionAccess([pending.id]) : [],
  })}`);
}

function stablePortSnapshot(session: GameSession, structure: string) {
  return session.query(query(Container)).filter(row => row.id.startsWith(`${structure}:`)).map(row => [row.id, row.get(Container)] as const).sort(([left], [right]) => left.localeCompare(right));
}

test("brew station is absent initially and completion creates stable retained ports", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    assert.equal(session.query(query(ConstructionSite)).length, 0);
    const site = buildBrewStation(session);
    const containers = session.query(query(Container)).map(row => row.id).filter(id => id.startsWith(`${site.id}:`)).sort();
    assert.deepEqual(containers, ["barm", "hearth", "keg", "kettle", "tray"].map(key => `${site.id}:${key}`));
    assert.equal(session.query(query(Container)).find(row => row.id === `${site.id}:hearth`)?.get(Container).capacity, 2);
    assert.equal(session.query(query(Emitter)).find(row => row.id === `${site.id}:hearth`)?.get(Emitter).catalog, "wood-hearth");
    const saved = session.save();
    session.restore(saved);
    assert.deepEqual(session.query(query(Container)).map(row => row.id).filter(id => id.startsWith(`${site.id}:`)).sort(), containers);
    assert.equal(session.query(query(Container)).some(row => row.id === `${site.id}:hearth`), true);
  } finally { port.dispose(); }
});

test("brew station teardown waits for a process-owned occupied hearth port", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    const site = buildBrewStation(session);
    const hearth = entity(`${site.id}:hearth`);
    session.command("requestBrew", { station: site.id });
    for (let tick = 0; tick < 160 && !session.query(query(MaterialLot)).some(row => row.get(MaterialLot).container === hearth); tick++) session.step(0.25);
    assert.equal(session.query(query(MaterialLot)).some(row => row.get(MaterialLot).container === hearth), true, "the process supply owner must occupy the retained hearth port");
    assert.equal(port.deconstructionAccess([site.id])[0]?.status, "occupiedPort");
    const beforeBlocked = materialTotal(session);
    session.command("deconstruct", { site: site.id });
    for (let tick = 0; tick < 80; tick++) session.step(0.25);
    assert(session.query(query(ConstructionSite)).some(row => row.id === site.id), "occupied port must block teardown");
    assert.equal(materialTotal(session), beforeBlocked, "blocked teardown cannot lose port contents");
  } finally { port.dispose(); }
});

test("Colony floor designation preserves finished brewer and bed callers and their support faces", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    // Place both fixtures directly on generated terrain first. Flooring is
    // then added underneath their already-finished footprints through the
    // public Colony command, rather than through direct native actions.
    const brewer = buildFinished(session, "brew-station", [1, 13, -1]);
    const bed = buildFinished(session, "timber-bed", [5, 13, -1]);
    const brewerPorts = stablePortSnapshot(session, brewer.id);
    const bedPorts = stablePortSnapshot(session, bed.id);
    // Occupied-port content identity is covered by the native brewer/bed
    // replacement laws. This consumer proves the public floor command,
    // resolver/provider path, and furniture stability without coupling to a
    // live brew process's lawful movement of its inputs.
    const beforeFurniture = session.renderFacts().filter(fact => fact.id === brewer.id || fact.id === bed.id);

    // Every support cell under each finished footprint goes through the same
    // user-facing operation and provider path. buildFinished waits for the
    // newly-created floor site to settle before the next designation.
    for (const cell of [[1, 13, -1], [2, 13, -1], [1, 13, 0], [2, 13, 0], [5, 13, -1], [5, 13, 0]] as const) {
      buildFinished(session, "timber-floor", cell);
    }

    assert.equal(session.query(query(ConstructionSite)).filter(row => row.get(ConstructionSite).phase !== "finished").length, 0, "floor designations beneath finished fixtures must complete");
    assert.deepEqual(stablePortSnapshot(session, brewer.id), brewerPorts);
    assert.deepEqual(stablePortSnapshot(session, bed.id), bedPorts);
    const supportCells = [[1, -1], [2, -1], [1, 0], [2, 0], [5, -1], [5, 0]] as const;
    const surfaces = port.structureSurfaces(supportCells);
    assert(surfaces.every((rows, index) => rows.some(surface => surface.cell[1] === 13 && surface.cell[0] === supportCells[index][0] && surface.cell[2] === supportCells[index][1])), "every fixture footprint support cell must have a finished floor");
    const finishedFloors = session.query(query(ConstructionSite)).map(row => row.get(ConstructionSite)).filter(site => site.catalog === "timber-floor" && site.phase === "finished");
    assert.equal(finishedFloors.length, supportCells.length, "each designated support cell must have one finished Colony floor");
    for (const [x, z] of supportCells) assert(finishedFloors.some(site => {
      const at = constructionCell(site);
      return at.x === x && at.y === 13 && at.z === z;
    }), `finished timber floor missing at ${x},13,${z}`);
    assert.deepEqual(session.renderFacts().filter(fact => fact.id === brewer.id || fact.id === bed.id), beforeFurniture);
    assert(session.query(query(ConstructionSite)).some(row => row.id === brewer.id && row.get(ConstructionSite).phase === "finished"));
    assert(session.query(query(ConstructionSite)).some(row => row.id === bed.id && row.get(ConstructionSite).phase === "finished"));
  } finally { port.dispose(); }
});

test("multiple finished stations use one bounded inspection fact each", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    for (const cell of [[1, 13, -1], [5, 13, -1]] as const) {
      buildBrewStation(session, cell);
    }
    const facts = colonyPack.presentation?.inspect?.({
      query: spec => session.query(spec),
      atmosphereSamples: cells => session.atmosphereSamples(cells),
      constructionReadiness: sites => session.constructionReadiness(sites),
    }) ?? [];
    const stations = facts.filter(fact => fact.label === "Brew station");
    assert.equal(stations.length, 2);
    assert(facts.length <= 32, `inspection projection exceeds bound: ${facts.length}`);
    assert(stations.every(fact => fact.subjects?.length === 1));
  } finally { port.dispose(); }
});

test("actual Colony staircase supply assigns two concurrent native haul legs", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("build", { catalog: "timber-stair", orientation: "north", target: { cell: [1, 13, 0] } });
    const workerIds = ["colony.local-party.person.0", "colony.local-party.person.1"] as const;
    let live = workerIds.flatMap(() => [] as NonNullable<ReturnType<typeof port.workAttemptForWorker>>[]);
    for (let tick = 0; tick < 1000; tick++) {
      session.step(0.01);
      const attempts = workerIds.flatMap((worker) => {
        const attempt = port.workAttemptForWorker(worker);
        return attempt?.key.task.startsWith("allocation.") ? [attempt] : [];
      });
      if (attempts.length === 2) {
        live = attempts;
        break;
      }
    }
    assert.equal(live.length, 2, `staircase demand must expose two native haul attempts: ${JSON.stringify(workerIds.map(worker => port.workAttemptForWorker(worker)))}`);
    assert.equal(new Set(live.map((attempt) => attempt.key.task)).size, 2);
    assert.equal(new Set(live.map((attempt) => attempt.worker)).size, 2);
    const saved = session.save();
    session.restore(saved);
    const restored = workerIds.flatMap((worker) => {
      const attempt = port.workAttemptForWorker(worker);
      return attempt?.key.task.startsWith("allocation.") ? [attempt] : [];
    });
    assert.deepEqual(restored, live, "both native haul receipts survive exact reload");
    let finished = false;
    for (let tick = 0; tick < 600; tick++) {
      session.step(0.25);
      const site = session.query(query(ConstructionSite))[0];
      finished = site?.get(ConstructionSite).phase === "finished";
      if (finished) break;
    }
    assert.equal(finished, true);
    const site = session.query(query(ConstructionSite))[0];
    const delivered = session
      .query(query(MaterialLot))
      .filter(
        (row) =>
          row.get(MaterialLot).container === site.id &&
          row.get(MaterialLot).kind === "wood",
      );
    assert.equal(
      delivered.reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0),
      0,
    );
    assert.equal(
      session
        .query(query(MaterialLot))
        .filter((row) => row.get(MaterialLot).kind === "wood")
        .reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0),
      42,
    );
  } finally {
    port.dispose();
  }
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
    assert.equal(
      sites[0].get(ConstructionSite).phase,
      "finished",
      JSON.stringify(sites[0].get(ConstructionSite)),
    );
    const wood = session
      .query(query(MaterialLot))
      .map((row) => row.get(MaterialLot))
      .filter((lot) => lot.kind === "wood");
    assert.equal(
      wood.reduce((sum, lot) => sum + lot.quantity, 0),
      46,
    );
    assert.equal(
      wood
        .filter((lot) => lot.container === sites[0].id)
        .reduce((sum, lot) => sum + lot.quantity, 0),
      0,
    );
    const fact = session.renderFacts().find((fact) => fact.id === sites[0].id);
    assert.equal(fact?.visual, "colony.floor.finished");
    assert.deepEqual(fact?.view, { pickable: true, cutawayTop: 13 });
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
    session.step(0.01);
    assert.equal(session.query(query(DeconstructionOrder)).length, 1);
    assert.equal(session.query(query(DeconstructionOrder))[0].get(DeconstructionOrder).status, "complete");
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
    session.command("build", { catalog: "timber-wall", target: { edges: [{ cell: [1, 13, 0], axis: "z" }] } });
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: [1, 17, 0] } });
    session.step(0.01);
    const sites = session.query(query(ConstructionSite));
    assert.equal(sites.length, 2);
    const wall = sites.find(row => row.get(ConstructionSite).catalog === "timber-wall");
    const floor = sites.find(row => row.get(ConstructionSite).catalog === "timber-floor");
    assert(wall && floor);
    const initialFloor = floor.get(ConstructionSite);
    assert.equal("worker" in initialFloor, false);
    assert.equal(
      port.constructionAccess([floor.id])[0].support,
      "waitingForSupport",
    );
    const current = (id: typeof wall.id) =>
      session
        .query(query(ConstructionSite))
        .find((row) => row.id === id)!
        .get(ConstructionSite);

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
    assert.equal(
      bothFinished,
      true,
      JSON.stringify(
        session
          .query(query(ConstructionSite))
          .map((row) => row.get(ConstructionSite)),
      ),
    );
    const wood = session
      .query(query(MaterialLot))
      .map((row) => row.get(MaterialLot))
      .filter((lot) => lot.kind === "wood");
    assert.equal(
      wood.reduce((sum, lot) => sum + lot.quantity, 0),
      42,
    );
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
    const initialWood = session.query(query(MaterialLot)).reduce((sum, row) =>
      sum + (row.get(MaterialLot).kind === "wood" ? row.get(MaterialLot).quantity : 0), 0);
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
    assert.equal(wood.reduce((sum, lot) => sum + lot.quantity, 0), initialWood - 14);
  } finally { port.dispose(); }
});
