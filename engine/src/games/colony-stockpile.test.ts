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

test("stockpile policy commands require a stable zone identity", () => {
  assert.throws(() => colonyPack.commands?.updateStockpile.invoke({ query: () => [], physicalContacts: () => [], terrainMaterials: () => [], terrainSurfaces: () => [] }, { area: { start: [1, 1, 1], end: [1, 1, 1] }, filterProfile: "wood", priority: 50 }), /Invalid input/);
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
    session.command("designateStockpile", { area: { start: [x, y, z], end: [x + 1, y, z] }, filterProfile: "wood", priority: 9 });
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
    const designatedRow = session.query(query(StockpileCell))[0];
    const designated = designatedRow.get(StockpileCell);
    session.command("updateStockpile", { cell: designatedRow.id, filterProfile: "food" });
    session.step(0);
    const cell = session.query(query(StockpileCell))[0].get(StockpileCell);
    assert.equal(cell.filterProfile, "food", "profile-only update changes profile");
    assert.equal(cell.priority, 9, "profile-only update preserves priority");
    session.command("updateStockpile", { cell: designatedRow.id, priority: 3 });
    session.step(0);
    const reprioritized = session.query(query(StockpileCell))[0].get(StockpileCell);
    assert.equal(reprioritized.priority, 3, "priority-only update changes priority");
    assert.equal(reprioritized.filterProfile, "food", "priority-only update preserves profile");
    assert.match(cell.zone, /^colony\.stockpile\.2\.-?\d+\.2\.2\.2$/);
    assert.ok(session.query(query(StockpileCell)).every(row => row.get(StockpileCell).priority === 3 && row.get(StockpileCell).filterProfile === "food"), "policy updates every cell in the zone");
    assert.throws(() => session.command("updateStockpile", { cell: designatedRow.id, filterProfile: "wood", priority: 101 }), /expected number to be <=100/);
    assert.deepEqual(session.query(query(StockpileCell))[0].get(StockpileCell), reprioritized, "invalid policy is rejected atomically");
    session.command("designateStockpile", { area: { start: [x + 2, y, z], end: [x + 2, y, z] }, filterProfile: "wood", priority: 9 });
    session.step(0);
    const zones = session.query(query(StockpileCell)).map(row => row.get(StockpileCell));
    assert.equal(new Set(zones.map(value => value.zone)).size, 2, "separate rectangles retain independent native identities");
    const saved = session.save();
    const marks = session.pack.presentation?.terrainMarks?.({ query: spec => session.query(spec), atmosphereSamples: cells => session.atmosphereSamples(cells) }) ?? [];
    assert.equal(marks.length, 2);
    assert.ok(marks.every(mark => mark.kind === "stockpile"));
    const inspection = session.pack.presentation?.inspect?.({
      query: spec => session.query(spec),
      atmosphereSamples: cells => session.atmosphereSamples(cells),
      constructionReadiness: sites => session.constructionReadiness(sites),
    }) ?? [];
    assert.ok(inspection.some(fact => fact.label === "Stockpile" && fact.value === "food · priority 3 · 0/6"));
    session.restore(saved);
    assert.deepEqual(session.query(query(StockpileCell))[0].get(StockpileCell), reprioritized);
    assert.equal(session.pack.presentation?.terrainMarks?.({ query: spec => session.query(spec), atmosphereSamples: cells => session.atmosphereSamples(cells) }).filter(mark => mark.kind === "stockpile").length, 2);
  } finally {
    port.dispose();
  }
});
