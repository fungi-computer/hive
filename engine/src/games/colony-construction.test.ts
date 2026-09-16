import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { entity, query } from "../sdk/authoring";
import { ConstructionSite, SealedContainer, constructionCell } from "../sdk/construction";
import { DeconstructionOrder } from "../sdk/deconstruction-work";
import { Container, Destination, Emitter, ExcavationOrder, FiniteResource, JobTaskWork, MaterialLot, ResourceSite, SupplyAllocation } from "../sdk/common";
import { OwnedByParty, PartyMember } from "../sdk/party";
import { WorkParticipation } from "../sdk/work-control";
import { StagedProcess } from "../sdk/process-supply";
import { ResourceOrder } from "../sdk/resource-work";
import { createColonyPartyPlan } from "./colony-party";
import { ColonyTreePolicy } from "./colony-work";
import { colonyPack, colonyServerPack } from "./colony";
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

function joinServerParty(session: GameSession, bindingId: string) {
  const identity = session.partyJoinIdentity(bindingId);
  assert.equal(identity.status, "available");
  const spawn = session.findSafeSpawn(colonyServerPack.partyJoin!.footprint);
  assert(spawn, `${bindingId} needs a safe Colony spawn`);
  const plan = createColonyPartyPlan(spawn);
  session.request({
    kind: "instantiate-actors",
    bindingId,
    expectedSequence: identity.sequence,
    plan,
  });
  const outcome = session.step(0)[0];
  assert.equal(outcome?.accepted, true, `${bindingId}: ${outcome?.reason}`);
  const committed = session.partyJoinIdentity(bindingId);
  assert.equal(committed.status, "existing");
  return {
    player: committed.player,
    party: committed.party,
    people: committed.people,
    scope: { kind: "player" as const, player: identity.player },
  };
}

function woodByParty(session: GameSession, party: string) {
  const owned = new Set(
    session.query(query(OwnedByParty)).filter(row => row.get(OwnedByParty).party === party).map(row => row.id),
  );
  return session.query(query(MaterialLot)).reduce((sum, row) => {
    const lot = row.get(MaterialLot);
    return lot.kind === "wood" && owned.has(row.id) ? sum + lot.quantity : sum;
  }, 0);
}

function woodTotal(session: GameSession) {
  return session.query(query(MaterialLot)).reduce((sum, row) => {
    const lot = row.get(MaterialLot);
    return lot.kind === "wood" ? sum + lot.quantity : sum;
  }, 0);
}

function siteFor(session: GameSession, catalog: string, cell: readonly [number, number, number]) {
  return session.query(query(ConstructionSite)).find(row => {
    const site = row.get(ConstructionSite);
    const at = constructionCell(site);
    return site.catalog === catalog && at.x === cell[0] && at.y === cell[1] && at.z === cell[2];
  });
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
    const workerIds = ["party:1.person.0", "party:1.person.1"] as const;
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

test("one Colony lifecycle joins construction, custody, control, reload, and independent parties", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyServerPack, scope: { kind: "host" }, seed: 17 });
  try {
    session.start();
    const first = joinServerParty(session, "law-first");
    const second = joinServerParty(session, "law-second");
    const firstScope = first.scope;
    const secondScope = second.scope;
    const initialWood = woodByParty(session, first.party);
    assert.equal(initialWood, 48, "the first independent party owns its starter lumber");
    assert.equal(woodByParty(session, second.party), 48, "the second independent party owns its starter lumber");

    const ground = port.terrainSurfaces([[1, 0]])[0];
    assert(ground, "the generated clearing must expose a buildable ground cell");
    const [x, y, z] = ground.cell;
    const independentGround = port.terrainSurfaces([[x + 4, z]])[0];
    assert(independentGround, "the independent construction cell must be generated");
    const secondGround = port.terrainSurfaces([[x + 8, z]])[0];
    assert(secondGround, "the second party construction cell must be generated");

    for (const columnX of [x + 8, x + 8, x + 9, x + 8]) {
      const digSurface = port.terrainSurfaces([[columnX, z]])[0];
      assert(digSurface, "the joined party must have a generated dig surface");
      session.command("dig", { area: { start: digSurface.cell, end: digSurface.cell } }, firstScope);
      for (let tick = 0; tick < 500 && port.terrainMaterials([digSurface.cell])[0] !== 0; tick++) session.step(0.25);
      assert.equal(port.terrainMaterials([digSurface.cell])[0], 0, "dig must expose the lower terrain material");
    }
    const plantSurface = port.terrainSurfaces([[0, 0]])[0];
    assert(plantSurface, "the joined party must have a generated planting surface");
    const plantCell = plantSurface.cell;
    const plantMaterial = port.terrainMaterials([plantCell])[0];
    session.command("sowMugwort", { target: { cell: plantCell, material: plantMaterial } }, firstScope);
    session.step(0);
    const plantOrder = session.query(query(ResourceOrder)).find(row => {
      const order = row.get(ResourceOrder);
      return order.cellX === plantCell[0] && order.cellY === plantCell[1] && order.cellZ === plantCell[2];
    });
    assert(plantOrder, "planting must create a durable resource order");
    const plantSaved = session.save();
    session.restore(plantSaved);
    assert.deepEqual(session.save(), plantSaved, "planting intent survives save and reload");
    for (let tick = 0; tick < 2_000; tick++) {
      session.step(0.25);
      if (session.query(query(ResourceOrder)).find(row => row.id === plantOrder.id)?.get(ResourceOrder).status === "complete") break;
    }
    assert.equal(session.query(query(ResourceOrder)).find(row => row.id === plantOrder.id)?.get(ResourceOrder).status, "complete", "planting must complete through native work");
    assert(session.query(query(ResourceSite)).some(row => row.id === plantOrder.id), "completed planting must retain its resource site");

    // A committed first task is the prerequisite of a second task. Cancel it
    // after felling and assert the physical trunk remains available for retry;
    // the same native job owner therefore preserves material conservation and
    // cancels only the unfinished dependent task.
    const tree = "colony.tree.oak";
    session.command("designateTrees", { entities: [tree] }, firstScope);
    session.step(0);
    const treePolicy = session.query(query(ColonyTreePolicy)).find(row => row.id === tree)?.get(ColonyTreePolicy);
    assert(treePolicy?.job, "tree designation must publish one native job identity");
    const fellTask = `${treePolicy.job}:task:fell`;
    let sawFellingWork = false;
    for (let tick = 0; tick < 500 && !session.query(query(MaterialLot)).some(row => row.get(MaterialLot).kind === "wood-felled"); tick++) {
      session.step(0.25);
      sawFellingWork ||= (session.query(query(JobTaskWork)).find(row => row.id === fellTask)?.get(JobTaskWork).seconds ?? 0) > 0;
    }
    assert.equal(sawFellingWork, true, "the prerequisite task must earn durable work");
    assert.equal(session.query(query(FiniteResource)).find(row => row.id === tree)?.get(FiniteResource).quantity, 0);
    assert.equal(session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood-felled").reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 6);
    const woodAfterFelling = woodByParty(session, first.party);
    session.command("cancelTrees", { entities: [tree] }, firstScope);
    session.step(0);
    session.restore(session.save());
    assert.equal(session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood-felled").reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 6);
    assert.equal(woodByParty(session, first.party), woodAfterFelling, "cancelled dependent work preserves committed physical stock");

    // Queue a lower support, its upper dependent, and an unrelated floor.
    // Keep both workers drafted once the support is finished, then use the
    // existing native deconstruct action at its real contact. Removing the
    // prerequisite must cancel only the unsupported pending dependent while
    // retaining the unrelated plan and returning the support salvage.
    session.command("build", { catalog: "timber-wall", target: { edges: [{ cell: [x, y, z], axis: "z" }] } }, firstScope);
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: [x, y + 4, z] } }, firstScope);
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: independentGround.cell } }, firstScope);
    session.step(0);
    const supportWall = session.query(query(ConstructionSite)).find(row => row.get(ConstructionSite).catalog === "timber-wall");
    const upperDependent = session.query(query(ConstructionSite)).find(row => {
      const site = row.get(ConstructionSite);
      const at = constructionCell(site);
      return site.catalog === "timber-floor" && at.x === x && at.y === y + 4 && at.z === z;
    });
    const independentFloor = session.query(query(ConstructionSite)).find(row => {
      const site = row.get(ConstructionSite);
      const at = constructionCell(site);
      return site.catalog === "timber-floor" && at.x === independentGround.cell[0] && at.z === independentGround.cell[2];
    });
    assert(supportWall && upperDependent && independentFloor, "support, dependent, and independent plans must be admitted");
    assert.equal(port.constructionAccess([upperDependent.id])[0]?.support, "waitingForSupport");
    assert.equal("worker" in upperDependent.get(ConstructionSite), false);
    for (let tick = 0; tick < 1_000; tick++) {
      session.step(0.25);
      if (session.query(query(ConstructionSite)).find(row => row.id === supportWall.id)?.get(ConstructionSite).phase === "finished") break;
    }
    assert.equal(session.query(query(ConstructionSite)).find(row => row.id === supportWall.id)?.get(ConstructionSite).phase, "finished");
    assert.equal(session.query(query(ConstructionSite)).find(row => row.id === upperDependent.id)?.get(ConstructionSite).phase, "planned");
    const beforePrerequisiteRemoval = woodByParty(session, first.party);
    session.command("draft", { entities: [...first.people] }, firstScope);
    session.step(0);
    assert(session.query(query(WorkParticipation)).filter(row => first.people.includes(row.id)).every(row => !row.get(WorkParticipation).automatic));
    const wallContact = port.constructionAccess([supportWall.id])[0]?.contacts[0];
    assert(wallContact, "support removal must use a native wall contact");
    const workerLoad = (worker: string) => session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).container === worker).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0);
    const deconstructor = [...first.people].sort((left, right) => workerLoad(left) - workerLoad(right))[0]!;
    const carriedBeforeRemoval = workerLoad(deconstructor);
    for (const lot of session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).container === deconstructor))
      session.request({ kind: "drop-lot", entity: deconstructor, lot: lot.id });
    session.step(0);
    assert.equal(workerLoad(deconstructor), 0, "native salvage must have room beside conserved carried stock");
    session.command("go", {
      entities: [deconstructor],
      destination: { x: wallContact.x, y: wallContact.y, z: wallContact.z, frame: null },
    }, firstScope);
    for (let tick = 0; tick < 200; tick++) {
      session.step(0.1);
      if (!session.query(query(Destination)).some(row => row.id === deconstructor)) break;
    }
    session.request({ kind: "deconstruct", worker: deconstructor, site: supportWall.id });
    session.step(0);
    session.restore(session.save());
    assert.equal(session.query(query(ConstructionSite)).some(row => row.id === upperDependent.id), false, `structurally invalid dependent must be cancelled: ${JSON.stringify({
      outcomes: session.save().outcomes.slice(-8),
      sites: session.query(query(ConstructionSite)).map(row => ({ id: row.id, ...row.get(ConstructionSite) })),
      attempts: first.people.map(worker => port.workAttemptForWorker(worker)),
      positions: port.worldPoses(first.people),
    })}`);
    assert.equal(session.query(query(ConstructionSite)).some(row => row.id === independentFloor.id), true, "independent construction must survive prerequisite cancellation");
    assert.equal(woodByParty(session, first.party), beforePrerequisiteRemoval + 4, "support salvage preserves the physical material total");
    assert(carriedBeforeRemoval > 0, "the prerequisite cancellation path starts with carried stock");
    session.command("undraft", { entities: [...first.people] }, firstScope);
    session.step(0);
    assert.equal(session.query(query(WorkParticipation)).every(row => row.get(WorkParticipation).automatic), true, "workers resume automatic work after prerequisite cancellation");
    for (const worker of first.people) {
      for (const lot of session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).container === worker && row.get(MaterialLot).kind === "wood"))
        session.request({ kind: "drop-lot", entity: worker, lot: lot.id });
    }
    session.step(0);

    // A real two-storey route: stair, upper floor footprint, and brewer. The
    // brewer demand is larger than one worker's carry capacity, so this also
    // observes two distinct native delivery attempts.
    const upperCell: [number, number, number] = [x + 1, y + 4, z - 2];
    session.command("build", { catalog: "timber-stair", orientation: "north", target: { cell: [x, y, z] } }, firstScope);
    session.step(0);
    const stair = siteFor(session, "timber-stair", [x, y, z]);
    assert(stair, `stair plan must be admitted: ${JSON.stringify({
      sites: session.query(query(ConstructionSite)).map(row => ({ id: row.id, ...row.get(ConstructionSite) })),
      outcomes: session.save().outcomes.slice(-8),
    })}`);
    for (let tick = 0; tick < 1_500; tick++) {
      session.step(0.1);
      if (session.query(query(ConstructionSite)).find(row => row.id === stair.id)?.get(ConstructionSite).phase === "finished") break;
    }
    assert.equal(session.query(query(ConstructionSite)).find(row => row.id === stair.id)?.get(ConstructionSite).phase, "finished", "stair must finish before upper-storey admission");
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: upperCell } }, firstScope);
    session.step(0);
    const upperFloorCells: readonly (readonly [number, number, number])[] = [
      upperCell,
      [upperCell[0] + 1, upperCell[1], upperCell[2]],
      [upperCell[0], upperCell[1], upperCell[2] + 1],
      [upperCell[0] + 1, upperCell[1], upperCell[2] + 1],
    ];
    const upperFloors = [];
    for (const cell of upperFloorCells) {
      session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell } }, firstScope);
      session.step(0);
      const floor = siteFor(session, "timber-floor", cell);
      assert(floor, "upper room floor plan must be admitted after stair completion");
      upperFloors.push(floor);
      for (let tick = 0; tick < 1_500; tick++) {
        session.step(0.1);
        if (session.query(query(ConstructionSite)).find(row => row.id === floor.id)?.get(ConstructionSite).phase === "finished") break;
      }
      assert.equal(session.query(query(ConstructionSite)).find(row => row.id === floor.id)?.get(ConstructionSite).phase, "finished", "upper room floor must finish before brewer admission");
    }
    session.command("build", { catalog: "brew-station", orientation: "north", target: { cell: upperCell } }, firstScope);
    session.step(0);
    const brewer = siteFor(session, "brew-station", [upperCell[0], upperCell[1] + 1, upperCell[2]]);
    assert(brewer, `upper brewer plan must be admitted after its floor: ${JSON.stringify({
      sites: session.query(query(ConstructionSite)).map(row => ({ id: row.id, ...row.get(ConstructionSite) })),
      outcomes: session.save().outcomes.slice(-8),
    })}`);
    let concurrent: readonly { readonly worker: string; readonly task: string }[] = [];
    for (let tick = 0; tick < 1_500; tick++) {
      session.step(0.1);
      const attempts = first.people.flatMap(worker => {
        const attempt = port.workAttemptForWorker(worker);
        return attempt?.key.task.startsWith("allocation.") ? [{ worker, task: attempt.key.task }] : [];
      });
      if (attempts.length === 2) {
        concurrent = attempts;
        break;
      }
    }
    assert.equal(concurrent.length, 2, "brewer construction must have two concurrent finite delivery legs");
    assert.equal(new Set(concurrent.map(attempt => attempt.task)).size, 2);
    assert.equal(new Set(concurrent.map(attempt => attempt.worker)).size, 2);

    // Draft one carrier during the real delivery, save/reload while its lot
    // is still in the worker, and Undraft it back into the same automatic
    // attempt. The other carrier remains independent throughout.
    const draftedWorker = concurrent[0]!.worker;
    const otherWorker = concurrent[1]!.worker;
    const carriedBeforeDraft = session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).container === draftedWorker).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0);
    session.command("draft", { entities: [draftedWorker] }, firstScope);
    session.step(0);
    assert.equal(session.query(query(WorkParticipation)).find(row => row.id === draftedWorker)?.get(WorkParticipation).automatic, false);
    assert.equal(session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).container === draftedWorker).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), carriedBeforeDraft, "Draft retains physical cargo");
    assert(port.workAttemptForWorker(otherWorker), "the other party worker keeps its independent delivery attempt");
    const draftedSave = session.save();
    session.restore(draftedSave);
    assert.equal(session.query(query(WorkParticipation)).find(row => row.id === draftedWorker)?.get(WorkParticipation).automatic, false);
    session.command("undraft", { entities: [draftedWorker] }, firstScope);
    session.step(0);
    assert.equal(session.query(query(WorkParticipation)).find(row => row.id === draftedWorker)?.get(WorkParticipation).automatic, true);

    for (let tick = 0; tick < 4_000; tick++) {
      session.step(0.25);
      const currentBrewer = session.query(query(ConstructionSite)).find(row => row.id === brewer.id)?.get(ConstructionSite);
      const currentStair = session.query(query(ConstructionSite)).find(row => row.id === stair.id)?.get(ConstructionSite);
      const finishedUpper = upperFloors.every(row => session.query(query(ConstructionSite)).find(candidate => candidate.id === row.id)?.get(ConstructionSite).phase === "finished");
      if (currentBrewer?.phase === "finished" && currentStair?.phase === "finished" && finishedUpper) break;
    }
    assert.equal(session.query(query(ConstructionSite)).find(row => row.id === stair.id)?.get(ConstructionSite).phase, "finished");
    assert(upperFloors.every(row => session.query(query(ConstructionSite)).find(candidate => candidate.id === row.id)?.get(ConstructionSite).phase === "finished"), "upper room floor must finish before its brewer");
    assert.equal(session.query(query(ConstructionSite)).find(row => row.id === brewer.id)?.get(ConstructionSite).phase, "finished");
    assert(port.structureSurfaces([[upperCell[0], upperCell[2]]])[0].some(surface => surface.cell[1] === upperCell[1]), "upper room surface survives stair traversal construction");
    session.command("requestBrew", { station: brewer.id }, firstScope);
    session.step(0);
    const brewProcess = session.query(query(StagedProcess)).find(row => row.get(StagedProcess).station === brewer.id);
    assert(brewProcess, "the upper brewer must admit a durable brew process");
    for (let tick = 0; tick < 4_000; tick++) {
      session.step(0.25);
      if (session.query(query(StagedProcess)).find(row => row.id === brewProcess.id)?.get(StagedProcess).phase === "complete") break;
    }
    assert.equal(session.query(query(StagedProcess)).find(row => row.id === brewProcess.id)?.get(StagedProcess).phase, "complete", "the upper brewer must finish its native process");

    // The second party can build and consume only its own starter lumber. Its
    // worker set remains disjoint from the first party's set throughout.
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: secondGround.cell } }, secondScope);
    session.step(0);
    const secondPartyWorkers = session.query(query(PartyMember)).filter(row => row.get(PartyMember).party === second.party).map(row => row.id);
    assert(secondPartyWorkers.length > 0 && secondPartyWorkers.every(worker => !first.people.includes(worker)), "independent parties retain disjoint worker membership");
    const secondFloor = siteFor(session, "timber-floor", secondGround.cell);
    assert(secondFloor, `second party must retain its own construction identity: ${JSON.stringify({
      sites: session.query(query(ConstructionSite)).map(row => ({ id: row.id, ...row.get(ConstructionSite) })),
      outcomes: session.save().outcomes.slice(-4),
    })}`);
    for (let tick = 0; tick < 1_000; tick++) {
      session.step(0.25);
      if (session.query(query(ConstructionSite)).find(row => row.id === secondFloor.id)?.get(ConstructionSite).phase === "finished") break;
    }
    assert.equal(session.query(query(ConstructionSite)).find(row => row.id === secondFloor.id)?.get(ConstructionSite).phase, "finished");
    assert.equal(woodByParty(session, second.party), 46, "second party spends only its own two construction units");
    assert.equal(woodTotal(session), woodByParty(session, first.party) + woodByParty(session, second.party), "all wood remains owned by exactly one party");
    const saved = session.save();
    session.restore(saved);
    assert.deepEqual(session.save(), saved, "joined lifecycle reload preserves exact native/session state");
  } finally {
    port.dispose();
  }
});
