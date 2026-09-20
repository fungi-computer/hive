import assert from "node:assert/strict";
import test from "node:test";
import { createPlacementGuideOwner } from "./placement-guide-owner.js";
import { pickVoxelDrawRecord } from "./voxel-draw-picking.js";

test("selected-plane guides are retained non-interactive overlays with owned display lifetime", () => {
  const made = [], parent = { addChild(display) { display.parent = this; } };
  const createGraphic = () => {
    const display = { eventMode: "auto", clear() { this.drawn = 0; return this; },
      poly() { this.drawn++; return this; }, fill() { return this; }, stroke() { return this; },
      destroy() { this.destroyed = true; } };
    made.push(display);
    return display;
  };
  const project = (x, y, z) => ({ x: (x - z) * 32, y: (x + z) * 16 - y * 32 });
  const owner = createPlacementGuideOwner({ parent, project, createGraphic });
  const records = owner.update({ hoveredCell: [0, 0, 0], planeY: 0,
    footprintCells: [[0, 0, 0]], verticalMetres: 0.54, status: "ready" });
  const center = records.find(record => record.cell.join(",") === "0,0,0");
  assert(center && center.display.parent === parent && center.display.drawn > 0);
  assert.equal(center.display.eventMode, "none");
  assert.strictEqual(owner.update({ hoveredCell: [0, 0, 0], planeY: 0,
    footprintCells: [[0, 0, 0]], verticalMetres: 0.54, status: "ready" }), records);
  assert.equal(records.length, 49);
  for (const record of records) {
    assert.equal(record.presentation, "overlay");
    assert.equal(record.display.visible, true);
    assert.equal(record.pickable, false);
    assert.equal(record.contains({x:0,y:0}), false);
    for (const field of ["orderGeometry", "contactSurface", "support", "attachment", "footprint", "moving"])
      assert.equal(field in record, false, `overlay does not advertise physical ${field}`);
  }
  const physical = { id: "cat-under-selected-plane", visible:true, pickable:true, contains:()=>true };
  assert.equal(pickVoxelDrawRecord([physical, ...records], {x:0,y:0}).target, physical.id,
    "guide neither selects nor occludes the physical subject even if accidentally presented to picking");
  const rejected = owner.update({ hoveredCell: [0,0,0], planeY:0,
    footprintCells:[[0,0,0]], verticalMetres:.54, status:"rejected" });
  assert.notStrictEqual(rejected, records, "advisory changes refresh appearance");
  assert.strictEqual(rejected.find(record=>record.hovered).display, center.display, "style changes reuse graphics");
  assert.equal(made.length,49);
  const high = owner.update({ hoveredCell:[0,14,0], planeY:14, verticalMetres:.54 });
  assert(high.every(record=>record.presentation==="overlay" && record.cell[1]===14 && record.display.visible));
  assert(records.every(record=>record.display.destroyed), "leaving a selected plane releases its old graphics");
  owner.clear();
  assert(made.every(display => display.destroyed));
  assert.deepEqual(owner.update(), []);
  owner.dispose(); owner.dispose();
  assert.throws(()=>owner.update({hoveredCell:[0,0,0],planeY:0,verticalMetres:.54}), /disposed/);
});
