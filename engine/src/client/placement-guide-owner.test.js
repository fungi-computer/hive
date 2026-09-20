import assert from "node:assert/strict";
import test from "node:test";
import { createPlacementGuideOwner } from "./placement-guide-owner.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";
import { createOrderingProjection } from "./ordering-projection.js";

test("world build guide shares the draw order and owns its display lifetime", () => {
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
  const ground = { id: "ground", part: "face", renderPass: "opaque",
    attachment: { kind: "cell-face", cell: [0, 0, 0], face: "top" } };
  const actor = { id: "standing", part: "body", renderPass: "opaque",
    attachment: { kind: "supported", support: null, feet: { x: 0, y: 0.27, z: 0 } } };
  ground.orderGeometry = center.orderGeometry;
  actor.orderGeometry = {kind:"volume",min:{x:-.2,y:.27,z:-.2},max:{x:.2,y:1.27,z:.2}};
  actor.supportY = .27;
  const ordered = compileSpatialDrawOrder([actor, center, ground],
    { projection: createOrderingProjection() }).records;
  assert(ordered.indexOf(ground) < ordered.indexOf(center));
  assert(ordered.indexOf(center) < ordered.indexOf(actor));
  owner.clear();
  assert(made.every(display => display.destroyed));
  assert.deepEqual(owner.update(), []);
  owner.dispose();
});
