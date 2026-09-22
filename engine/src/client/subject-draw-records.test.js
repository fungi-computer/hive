import assert from "node:assert/strict";
import test from "node:test";
import { building } from "../../../src/art/home.js";
import { DEFAULT_VISUAL_BINDINGS } from "./visual-bindings.js";
import {
  multipartSubjectDrawRecords,
  multipartSubjectPartInputs,
  ordinarySubjectDrawRecord,
  subjectDrawGeometry,
} from "./subject-draw-records.js";

const texture = (width, height) => ({ width, height });
const project = (x, y, z) => ({ x: (x - z) * 10, y: (x + z) * 5 - y * 10 });
const display = { x: 0, y: 0 };
const sprite = { x: 0, y: 0 };

test("the real goblin binding produces one ordinary actor record", () => {
  const subject = { id: "goblin-1", x: 2, y: 0.27, z: -1, screen: project(2, 0.27, -1), support: "floor-1" };
  const binding = DEFAULT_VISUAL_BINDINGS["goblin.worker"];
  const hitArea = { contains: () => true };
  const geometry = subjectDrawGeometry({ subject, binding, texture: texture(16, 32), anchor: { x: 0.5, y: 1 },
    verticalMetres: 0.54, hitArea });
  const record = ordinarySubjectDrawRecord({ subject, binding, geometry, display, sprite });
  assert.deepEqual(record.footprint, [{ x: 2, y: 0.27, z: -1 }]);
  assert.equal(record.role, "actor");
  assert.equal(record.moving, true);
  assert.equal(record.renderPass, "opaque");
  assert.deepEqual(record.attachment, { kind: "supported", support: "floor-1", feet: { x: 2, y: 0.27, z: -1 } });
  assert.equal(record.storeyBand, 0);
  assert.equal(record.contains({ x: 0, y: 0 }), true);
});

test("the real bed binding aligns and retains its whole authored footprint", () => {
  const source = building("bed", "finished", 1);
  try {
    const subject = { id: "bed-1", facing: 1, x: 4, y: 0.81, z: 3, screen: project(4, 0.81, 3),
      placement: { kind: "footprint", footprint: [[0, 0], [0, 1]], orientation: "east" } };
    const binding = DEFAULT_VISUAL_BINDINGS["colony.bed.finished"];
    const geometry = subjectDrawGeometry({ subject, binding, texture: texture(32, 40), anchor: { x: 0.5, y: 1 },
      artPlacement: source.userData.staticPlacement, verticalMetres: 0.54, project });
    const record = ordinarySubjectDrawRecord({ subject, binding, geometry, display, sprite });
    assert.deepEqual([...record.footprint].sort((a,b)=>a.x-b.x), [{ x: 3, y: 0.81, z: 3 }, { x: 4, y: 0.81, z: 3 }]);
    assert.deepEqual(geometry.offset, [-1,0]);
    assert.equal(record.orderingKind, "line");
    assert.equal(record.role, "structure");
    assert.equal(record.moving, false);
    assert.equal(record.renderPass, "opaque");
    assert.deepEqual(record.attachment, { kind: "footprint", points: record.footprint });
  } finally {
    source.traverse(object => object.geometry?.dispose());
  }
});

test("real stair parts share bounds before owner sync and preserve sibling roles afterward", () => {
  const source = building("stair", "finished", 0);
  try {
    assert.equal(DEFAULT_VISUAL_BINDINGS["colony.stair.finished"].kind, "static");
    const geometry = Object.freeze({ anchor: { x: 0.5, y: 1 }, screen: { x: 30, y: 40 }, storeyBand: 2 });
    const parts = multipartSubjectPartInputs({ parts: source.userData.staticParts.map(part => ({ ...part, texture: texture(48, 64) })), geometry });
    assert.deepEqual(parts.map(part => part.id), ["surface", "rail.left", "rail.right"]);
    assert(parts.every(part => part.storeyBand === 2 && part.screenBounds.left === 6 && part.screenBounds.bottom === 40));
    const records = multipartSubjectDrawRecords(parts.map(part => ({ id: "stair-1", part: part.id, role: part.role,
      footprint: [{ x: 0, y: 0, z: 0 }], screenBounds: part.screenBounds, display: { x: 0, y: 0 }, hitArea: undefined })));
    assert.deepEqual(records.map(record => [record.part, record.partRole, record.role]), [
      ["surface", "supporting-surface", "structure"],
      ["rail.left", "upright-boundary", "structure"],
      ["rail.right", "upright-boundary", "structure"],
    ]);
    assert(records.every(record => record.renderPass === "opaque" && record.attachment.kind === "part" &&
      record.attachment.owner === "stair-1" && record.attachment.role === record.partRole && record.attachment.geometry === record.footprint));
  } finally {
    source.traverse(object => object.geometry?.dispose());
  }
});

test('ordinary hit coordinates stay with the immutable geometry when shared displays move', () => {
  const subject = {id:'a',x:2,y:0,z:0,screen:{x:20,y:10}};
  const binding = DEFAULT_VISUAL_BINDINGS['goblin.worker'];
  const hitArea = {contains:(x,y) => x === 2 && y === -3};
  const geometry = subjectDrawGeometry({subject,binding,texture:texture(8,8),anchor:{x:.5,y:1},hitArea,verticalMetres:.54});
  const display = {x:999,y:999}, sprite = {x:999,y:999};
  const record = ordinarySubjectDrawRecord({subject,binding,geometry,display,sprite});
  assert.equal(record.contains({x:22,y:7}),true);
  display.x = -888; sprite.y = 444; subject.screen.x = 0;
  assert.equal(record.contains({x:22,y:7}),true);
  assert.equal(record.contains({x:2,y:-3}),false);
});

test('multipart hit coordinates pin the prepared origin and scale', () => {
  const display = {x:1000,y:1000};
  const [record] = multipartSubjectDrawRecords([{id:'a',part:'side',role:'upright-boundary',display,
    footprint:[{x:0,y:0,z:0}],screen:Object.freeze({x:20,y:10}),scale:2,
    hitArea:{contains:(x,y) => x === 2 && y === -3}}]);
  assert.equal(record.contains({x:24,y:4}),true); display.x = -5; display.y = -9;
  assert.equal(record.contains({x:24,y:4}),true); assert.equal(record.contains({x:22,y:7}),false);
});
