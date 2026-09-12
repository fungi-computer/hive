import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { MaterialLot } from "../sdk/common";
import { query } from "../sdk/authoring";
import { colonyPack, ColonyDigOrder } from "./colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("actual WASM accepts a compact area and saves one stable order per cell", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("dig", { area: { start: [1, 13, 0], end: [2, 13, 0] } });
    session.step(0);
    const orders = session.query(query(ColonyDigOrder));
    assert.deepEqual(orders.map((row) => row.id), [
      "colony.dig.1.13.0",
      "colony.dig.2.13.0",
    ]);
    assert.equal(orders.length, 2);
    assert.ok(orders.every((row) => ["queued", "approaching", "excavating", "blocked"].includes(row.get(ColonyDigOrder).phase)));
    const saved = session.save();
    const restoredPort = wasmKernelPort(new WasmKernel());
    try {
      const restored = new GameSession({ port: restoredPort, pack: colonyPack });
      restored.restore(saved);
      assert.deepEqual(restored.save(), saved);
    } finally {
      restoredPort.dispose();
    }
  } finally {
    port.dispose();
  }
});

test("actual WASM rejects an area above the bounded designation size", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    assert.throws(
      () => session.command("dig", { area: { start: [0, 13, 0], end: [16, 13, 15] } }),
      /256 cells/,
    );
    assert.equal(session.query(query(ColonyDigOrder)).length, 0);
  } finally {
    port.dispose();
  }
});


test("area workers excavate and return finite spoil without manual movement", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("dig", { area: { start: [1,13,0], end: [2,13,0] } });
    let finished = false;
    for (let tick = 0; tick < 120; tick++) {
      session.step(.25);
      if (tick === 12) session.restore(session.save());
      if (session.query(query(ColonyDigOrder)).length === 0) { finished = true; break; }
    }
    const orders = session.query(query(ColonyDigOrder)).map(row => row.get(ColonyDigOrder));
    assert.equal(finished, true, JSON.stringify(orders));
    const spoil = session.query(query(MaterialLot)).map(row => row.get(MaterialLot)).filter(lot => lot.kind === "soil-spoil");
    assert.equal(spoil.reduce((sum,lot)=>sum+lot.quantity,0),6);
    assert.ok(spoil.every(lot=>lot.container === "colony.pantry"));
  } finally { port.dispose(); }
});


test("area excavation preserves hauling across changed terrain at browser-sized steps", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({port,pack:colonyPack});
    session.start();
    for(let tick=0;tick<60;tick++) session.step(.016);
    session.command("dig",{area:{start:[1,13,0],end:[2,13,0]}});
    let finished=false;
    for(let tick=0;tick<2500;tick++) {
      session.step(.016);
      if(tick % 200 === 199) session.restore(session.save());
      if(session.query(query(ColonyDigOrder)).length===0) {finished=true;break;}
    }
    if(!finished) writeFileSync(".botanical/area-lifecycle/stuck.json",JSON.stringify(session.save()));
    assert.equal(finished,true,"both excavations unload after nearby terrain changes");
    const spoil = session.query(query(MaterialLot)).map(row=>row.get(MaterialLot)).filter(lot=>lot.kind === "soil-spoil");
    assert.equal(spoil.reduce((sum,lot)=>sum+lot.quantity,0),6);
    assert.ok(spoil.every(lot=>lot.container === "colony.pantry"));
  } finally {port.dispose();}
});
