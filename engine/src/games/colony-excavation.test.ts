import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { ExcavationWork, MaterialLot, LotWater, Destination, query, entity } from "../sdk/index";
import { colonyPack } from "./colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

function makeSession() {
  const port = wasmKernelPort(new WasmKernel());
  return { port, session: new GameSession({ port, pack: colonyPack }) };
}

function adjacentTarget(port: ReturnType<typeof wasmKernelPort>) {
  const surface = port.terrainSurfaces([[1, 0]])[0];
  assert.ok(surface, "native terrain must publish the adjacent surface");
  const cell: [number, number, number] = [1, surface.cell[1], 0];
  const material = port.terrainMaterials([cell])[0];
  assert.equal(material, 1, "adjacent surface must be diggable Colony soil");
  return { cell, material };
}

function quantities(session: GameSession, worker: string) {
  const lots = session.query(query(MaterialLot)).map((row) => row.get(MaterialLot));
  return {
    total: lots.reduce((sum, lot) => sum + lot.quantity, 0),
    bread: lots.filter((lot) => lot.kind === "bread").reduce((sum, lot) => sum + lot.quantity, 0),
    spoil: lots.filter((lot) => lot.container === worker && lot.kind === "soil-spoil").reduce((sum, lot) => sum + lot.quantity, 0),
  };
}

test("Colony native excavation earns three spoil units across a midway restore", () => {
  const { port, session } = makeSession();
  const worker = entity("colony.worker.1");
  try {
    session.start();
    const target = adjacentTarget(port);
    const before = quantities(session, worker);
    assert.equal(before.total, 6);
    session.command("dig", { entities: [worker], target });
    const first = session.step(1);
    assert.equal(first[0]?.accepted, true);
    const mid = session.save();
    assert.equal(session.query(query(ExcavationWork)).find((row) => row.id === worker)?.get(ExcavationWork).seconds, 1);
    session.restore(mid);
    assert.equal(session.query(query(ExcavationWork)).find((row) => row.id === worker)?.get(ExcavationWork).seconds, 1);
    session.step(1);
    assert.equal(port.terrainMaterials([target.cell])[0], 0);
    assert.equal(session.query(query(ExcavationWork)).some((row) => row.id === worker), false);
    assert.deepEqual(quantities(session, worker), { total: 9, bread: 6, spoil: 3 });
    const completed = session.save();
    session.restore(completed);
    assert.deepEqual(session.save(), completed);
    assert.deepEqual(quantities(session, worker), { total: 9, bread: 6, spoil: 3 });
  } finally {
    port.dispose();
  }
});

test("Colony native excavation rejects a target occupied by the worker", () => {
  const { port, session } = makeSession();
  const worker = entity("colony.worker.1");
  try {
    session.start();
    const surface = port.terrainSurfaces([[0, 0]])[0];
    assert.ok(surface);
    const cell: [number, number, number] = [0, surface.cell[1], 0];
    const material = port.terrainMaterials([cell])[0];
    session.command("dig", { entities: [worker], target: { cell, material } });
    const result = session.step(0);
    assert.equal(result[0]?.accepted, false);
    assert.match(result[0]?.reason ?? "", /support|standing|occupied/);
  } finally {
    port.dispose();
  }
});


test("Colony deposits spoil and exposes finite groundwater through a stepped excavation", () => {
  const { port, session } = makeSession();
  const worker = entity("colony.worker.1");
  const tick = () => { for (const result of session.step(0.25)) assert.equal(result.accepted, true, result.reason); };
  const walk = (x: number, z: number) => {
    const surface = port.terrainSurfaces([[x, z]])[0];
    assert.ok(surface);
    session.request({ kind: "move", entity: worker, destination: { x, y: (surface.cell[1] + 0.5) * 0.54, z, frame: null }, facing: 0 });
    tick();
    for (let step = 0; step < 100 && session.query(query(Destination)).some(row => row.id === worker); step++) tick();
    assert.equal(session.query(query(Destination)).some(row => row.id === worker), false, "walk reaches the generated standing surface");
  };
  const dig = (x: number, z: number) => {
    const surface = port.terrainSurfaces([[x, z]])[0];
    assert.ok(surface);
    session.command("dig", { entities: [worker], target: { cell: surface.cell, material: surface.material } });
    tick();
    for (let step = 0; step < 24 && session.query(query(ExcavationWork)).some(row => row.id === worker); step++) tick();
    assert.equal(session.query(query(ExcavationWork)).some(row => row.id === worker), false, "dig completes using native work");
    assert.equal(port.terrainMaterials([[...surface.cell]])[0], 0);
  };
  const deposit = () => {
    walk(-2, 0);
    session.command("deposit", { entities: [worker] });
    tick();
    assert.equal(session.query(query(MaterialLot)).some(row => row.get(MaterialLot).container === worker), false);
  };
  try {
    session.start();
    dig(1, 0); deposit(); walk(0, 0);
    dig(1, 0); deposit(); walk(2, 1);
    dig(2, 0); deposit(); walk(2, 0);
    dig(1, 0);
    for (let step = 0; step < 40; step++) tick();
    const visible = session.terrainView()!.water.find(cell => cell.at[0] === 1 && cell.at[1] === 11 && cell.at[2] === 0);
    assert.ok(visible && visible.liquidVolumeM3 > 0, "groundwater seeps into the exposed deeper cut");
    const facts = port.environmentFacts() as { totalKg: number; initialTotalKg: number; boundaryKg: number };
    const carriedWater = session.query(query(LotWater)).reduce((sum, row) => sum + row.get(LotWater).waterKg, 0);
    assert.ok(carriedWater > 0, "wet spoil retains water removed from the field");
    assert.ok(Math.abs(facts.totalKg + carriedWater - facts.initialTotalKg) < 1e-8, "field plus physical spoil water is conserved");
    const lots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
    assert.equal(lots.reduce((sum, lot) => sum + lot.quantity, 0), 18);
    assert.equal(lots.filter(lot => lot.container === "colony.pantry").reduce((sum, lot) => sum + lot.quantity, 0), 15);
    const saved = session.save();
    session.restore(saved);
    assert.deepEqual(session.save(), saved);
  } finally { port.dispose(); }
});
