import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { Container, MaterialLot, Position, query } from "../sdk";
import { entity } from "../sdk/authoring";
import { StockpileCell } from "../sdk/stockpile";
import { colonyPack } from "./colony";
import { terrainAreaPresentationCommand } from "../presentation";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("Colony stockpile rectangle is worker independent, atomic, and durable", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  try {
    session.start();
    session.command("pauseDelivery", { entities: ["colony.worker.1", "colony.worker.2"] });
    const surface = session.terrainSurfaces([[2, 2]])[0];
    assert.ok(surface, "fixture must expose an authored floor surface");
    const [x, y, z] = surface.cell;
    session.command("designateStockpile", { area: { start: [x, y, z], end: [x + 1, y, z] }, filterProfile: "wood", priority: 9 });
    session.step(0);
    const cells = session.query(query(StockpileCell, Container, Position));
    assert.equal(cells.length, 2);
    assert.equal(new Set(cells.map(row => row.get(StockpileCell).zone)).size, 1);
    assert.ok(cells[0].get(StockpileCell).zone.startsWith("colony.stockpile."));
    assert.deepEqual(cells.map(row => ({ priority: row.get(StockpileCell).priority, filterProfile: row.get(StockpileCell).filterProfile })), [
      { priority: 9, filterProfile: "wood" }, { priority: 9, filterProfile: "wood" },
    ]);
    assert.deepEqual(cells.map(row => row.get(Container).capacity), [6, 6]);

    const before = session.query(query(StockpileCell)).length;
    assert.throws(() => session.command("designateStockpile", { area: { start: [x, y, z], end: [x, y + 1, z] }, filterProfile: "wood", priority: 9 }), /one level/);
    assert.equal(session.query(query(StockpileCell)).length, before, "mixed-level native rejection is atomic");
    session.command("designateStockpile", { area: { start: [999_999, y, 999_999], end: [999_999, y, 999_999] }, filterProfile: "wood", priority: 9 });
    session.step(0);
    assert.equal(session.query(query(StockpileCell)).length, before, "non-floor native rejection is atomic");

    const saved = session.save();
    session.restore(saved);
    assert.equal(session.query(query(StockpileCell)).length, before);
    assert.equal(session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).container === "colony.stockpile").length, 0);
  } finally {
    port.dispose();
  }
});

test("stockpile control submits the same bounded rectangle command", () => {
  const control = colonyPack.presentation?.controls.find(item => item.id === "designate-stockpile");
  assert.ok(control);
  const submitted = terrainAreaPresentationCommand(control, [], { start: [2, 13, 2], end: [3, 13, 2] });
  assert.equal(submitted.name, "designateStockpile");
  assert.deepEqual(submitted.input, { area: { start: [2, 13, 2], end: [3, 13, 2] } });
  assert.equal(control.target, "terrain-area");
  assert.deepEqual(control.designation, ["rectangle"]);
});

test("Colony command leaves a conflicting native zone untouched", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  try {
    session.start();
    const surface = session.terrainSurfaces([[2, 2]])[0];
    assert.ok(surface);
    const [x, y, z] = surface.cell;
    session.request({ kind: "designate-stockpile", zone: entity("foreign.zone"), cells: [{ x, y, z, priority: 1, filterProfile: "wood", capacity: 6 }] });
    session.step(0);
    session.command("designateStockpile", { area: { start: [x, y, z], end: [x, y, z] }, filterProfile: "wood", priority: 9 });
    session.step(0);
    const cells = session.query(query(StockpileCell));
    assert.equal(cells.length, 1);
    assert.equal(cells[0].get(StockpileCell).zone, "foreign.zone");
  } finally {
    port.dispose();
  }
});

test("stockpile policy is player configurable and survives reload", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  try {
    session.start();
    const surface = session.terrainSurfaces([[2, 2]])[0];
    assert.ok(surface);
    const [x, y, z] = surface.cell;
    session.command("designateStockpile", { area: { start: [x, y, z], end: [x, y, z] }, filterProfile: "wood", priority: 9 });
    session.step(0);
    session.command("designateStockpile", { area: { start: [x, y, z], end: [x, y, z] }, filterProfile: "food", priority: 3 });
    session.step(0);
    const cell = session.query(query(StockpileCell))[0].get(StockpileCell);
    assert.match(cell.zone, /^colony\.stockpile\.2\.-?\d+\.2\.2\.2$/);
    assert.deepEqual({ priority: cell.priority, filterProfile: cell.filterProfile }, { priority: 3, filterProfile: "food" });
    session.command("designateStockpile", { area: { start: [x + 1, y, z], end: [x + 1, y, z] }, filterProfile: "wood", priority: 9 });
    session.step(0);
    const zones = session.query(query(StockpileCell)).map(row => row.get(StockpileCell));
    assert.equal(new Set(zones.map(value => value.zone)).size, 2, "separate rectangles retain independent native identities");
    const saved = session.save();
    session.restore(saved);
    assert.deepEqual(session.query(query(StockpileCell))[0].get(StockpileCell), cell);
  } finally {
    port.dispose();
  }
});
