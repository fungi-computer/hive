import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { GameSession } from "../runtime/session";
import { formationsPack, Health, Morale } from "./formations";
import { MaterialLot, Position } from "../sdk/common";
import { query } from "../sdk/authoring";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("formation cannon spends one round and restores flight into one authored hit", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: formationsPack });
    session.start();
    session.command("fire", {});
    session.step(0.1);
    assert.equal(session.query(query(MaterialLot))[0].get(MaterialLot).quantity, 5);
    assert(port.renderFacts().some(fact => fact.visual === "formation.cannonball"));
    const flight = session.save();
    for (let i = 0; i < 8; i++) session.step(0.1);
    const state = () => session.query(query(Health, Morale, Position)).map(row => ({
      id: row.id, health: row.get(Health).value, morale: row.get(Morale).value,
      position: row.get(Position),
    }));
    const after = state();
    assert.equal(after.reduce((sum, row) => sum + row.health, 0), 280);
    assert.equal(after.reduce((sum, row) => sum + row.morale, 0), 210);
    assert(after.some(row => row.position.x !== Number(row.id.split('.').at(-1))));
    assert(!port.renderFacts().some(fact => fact.visual === "formation.cannonball"));
    session.restore(flight);
    for (let i = 0; i < 8; i++) session.step(0.1);
    assert.deepEqual(state(), after);
    assert.equal(session.query(query(MaterialLot))[0].get(MaterialLot).quantity, 5);
  } finally { port.dispose(); }
});
