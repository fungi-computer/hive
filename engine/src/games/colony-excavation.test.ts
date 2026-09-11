import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { ExcavationWork, MaterialLot, query, entity } from "../sdk/index";
import { colonyPack } from "./colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

function makeSession() {
  const port = wasmKernelPort(new WasmKernel());
  return { port, session: new GameSession({ port, pack: colonyPack }) };
}

function adjacentTarget(port: ReturnType<typeof wasmKernelPort>) {
  const surface = port.terrainSurfaces([[1, 0]])[0];
  assert.ok(surface, "native terrain must publish the adjacent surface");
  const cell = [1, surface.cell[1], 0] as const;
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
    const cell = [0, surface.cell[1], 0] as const;
    const material = port.terrainMaterials([cell])[0];
    session.command("dig", { entities: [worker], target: { cell, material } });
    const result = session.step(0);
    assert.equal(result[0]?.accepted, false);
    assert.match(result[0]?.reason ?? "", /support|standing|occupied/);
  } finally {
    port.dispose();
  }
});
