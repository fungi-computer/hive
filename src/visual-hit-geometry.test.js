import assert from "node:assert/strict";
import test from "node:test";
import { Container } from "pixi.js";
import {
  createVisualHitGeometryOwner,
  debugPrimitives,
  registerVisibleTexture,
} from "./visual-hit-geometry.js";

function rgba(width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of pixels) data[(y * width + x) * 4 + 3] = 255;
  return data;
}

function display() {
  return {
    visible: true,
    renderable: true,
    eventMode: "static",
    hitArea: null,
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    pivot: { x: 0, y: 0 },
    skew: { x: 0, y: 0 },
    rotation: 0,
  };
}

test("diagonal herb stages and a loose bundle resolve exact visible targets", () => {
  const owner = createVisualHitGeometryOwner(),
    anchor = { x: 0.5, y: 0.6924599083615355 },
    records = [];
  const cases = [
    ["planted", "herb-1"],
    ["growing", "herb-2"],
    ["ready", "herb-3"],
    ["bundle", "bundle-1"],
  ];
  for (const [index, [orientation, id]] of cases.entries()) {
    const texture = {};
    registerVisibleTexture(texture, rgba(112, 112, [[66, 77]]), 112, 112);
    const targetDisplay = display();
    targetDisplay.position.x = index * 16;
    targetDisplay.position.y = index * 8;
    const kind = orientation === "bundle" ? "bundle" : "herb";
    const action = kind === "bundle" ? "inspect-bundle" : "inspect-herb";
    const record = owner.bind(targetDisplay, {
      texture,
      anchor,
      orientation,
      target: { kind, id, level: 0, action },
    });
    records.push(record);
    const localX = 66 - anchor.x * 112 + 0.1,
      localY = 77 - anchor.y * 112 + 0.1;
    assert.equal(targetDisplay.hitArea, record.hitArea);
    assert.equal(record.hitArea.contains(localX, localY), true);
    assert.equal(record.hitArea.contains(-10, -8), false);
    assert.deepEqual(record.target, { kind, id, level: 0, action });
  }
  const rearVisiblePoint = {
    x: records[0].display.position.x + 10.1,
    y: records[0].display.position.y - 0.45,
  };
  const oldForegroundRectangleWouldSteal =
    rearVisiblePoint.x - records[1].display.position.x >= -18 &&
    rearVisiblePoint.x - records[1].display.position.x <= 18 &&
    rearVisiblePoint.y - records[1].display.position.y >= -34 &&
    rearVisiblePoint.y - records[1].display.position.y <= 4;
  assert.equal(oldForegroundRectangleWouldSteal, true);
  const dispatched = [...records]
    .reverse()
    .find((record) =>
      record.hitArea.contains(
        rearVisiblePoint.x - record.display.position.x,
        rearVisiblePoint.y - record.display.position.y,
      ),
    );
  assert.equal(dispatched.target.id, "herb-1");
  const paddingPoint = { x: -10, y: -8 };
  assert.equal(
    records.some((record) =>
      record.hitArea.contains(
        paddingPoint.x - record.display.position.x,
        paddingPoint.y - record.display.position.y,
      ),
    ),
    false,
  );
});

test("texture and orientation refresh one record and its debug rows together", () => {
  const owner = createVisualHitGeometryOwner(),
    targetDisplay = display(),
    stakes = {},
    finished = {};
  registerVisibleTexture(stakes, rgba(4, 4, [[1, 2]]), 4, 4);
  registerVisibleTexture(
    finished,
    rgba(4, 4, [
      [2, 1],
      [2, 2],
    ]),
    4,
    4,
  );
  const target = {
    kind: "site",
    id: "site-8",
    level: 1,
    action: "inspect-site",
  };
  const first = owner.bind(targetDisplay, {
    texture: stakes,
    anchor: { x: 0.5, y: 0.75 },
    orientation: "stakes:0",
    target,
  });
  const second = owner.bind(targetDisplay, {
    texture: finished,
    anchor: { x: 0.5, y: 0.75 },
    orientation: "finished:1",
    target,
  });
  assert.notEqual(second, first);
  assert.notEqual(second.hitArea, first.hitArea);
  assert.equal(owner.recordFor(targetDisplay), second);
  assert.equal(targetDisplay.hitArea, second.hitArea);
  assert.equal(second.orientation, "finished:1");
  assert.equal(second.hitArea.contains(0.1, -1.9), true);
  assert.equal(second.hitArea.contains(-0.9, -0.9), false);
  const debug = debugPrimitives(second);
  assert.deepEqual(second.debug, debug);
  assert.equal(debug.rows.length, 2);
  assert.equal(debug.label, "inspect-site → site:site-8 · L1 · finished:1");
  for (const row of debug.rows)
    assert.equal(second.hitArea.contains(row.x + 0.1, row.y + 0.1), true);
});

test("debug siblings follow the bound Pixi transform without taking input", () => {
  const parent = new Container(),
    targetDisplay = new Container(),
    stakes = {},
    finished = {};
  parent.addChild(targetDisplay);
  targetDisplay.position.set(31, 47);
  targetDisplay.scale.set(2, 3);
  targetDisplay.rotation = 0.2;
  targetDisplay.eventMode = "static";
  registerVisibleTexture(stakes, rgba(3, 3, [[1, 1]]), 3, 3);
  registerVisibleTexture(
    finished,
    rgba(3, 3, [
      [0, 1],
      [1, 1],
      [2, 1],
    ]),
    3,
    3,
  );
  const owner = createVisualHitGeometryOwner(parent);
  assert.equal(owner.layer.visible, false);
  owner.bind(targetDisplay, {
    texture: stakes,
    anchor: { x: 0.5, y: 0.5 },
    orientation: "finished:0",
    target: {
      kind: "site",
      id: "site-2",
      level: 0,
      action: "inspect-site",
    },
  });
  owner.renderDebug(true);
  const debugDisplay = owner.layer.children[0],
    firstDebug = owner.debugFor(targetDisplay);
  assert.equal(owner.layer.eventMode, "none");
  assert.equal(debugDisplay.eventMode, "none");
  assert.deepEqual(
    [
      debugDisplay.x,
      debugDisplay.y,
      debugDisplay.scale.x,
      debugDisplay.scale.y,
    ],
    [31, 47, 2, 3],
  );
  assert.equal(debugDisplay.rotation, 0.2);
  targetDisplay.position.set(-12, 19);
  targetDisplay.scale.set(4);
  targetDisplay.pivot.set(2, 3);
  targetDisplay.skew.set(0.1, -0.15);
  targetDisplay.rotation = -0.4;
  owner.bind(targetDisplay, {
    texture: finished,
    anchor: { x: 0.5, y: 0.5 },
    orientation: "finished:1:joint-10",
    target: {
      kind: "site",
      id: "site-2",
      level: 1,
      action: "inspect-site",
    },
  });
  owner.renderDebug(true);
  assert.equal(owner.layer.children[0], debugDisplay);
  assert.deepEqual(
    [
      debugDisplay.x,
      debugDisplay.y,
      debugDisplay.scale.x,
      debugDisplay.scale.y,
    ],
    [-12, 19, 4, 4],
  );
  assert.deepEqual([debugDisplay.pivot.x, debugDisplay.pivot.y], [2, 3]);
  assert.deepEqual([debugDisplay.skew.x, debugDisplay.skew.y], [0.1, -0.15]);
  assert.equal(debugDisplay.rotation, -0.4);
  const secondDebug = owner.debugFor(targetDisplay);
  assert.notEqual(secondDebug, firstDebug);
  assert.equal(firstDebug.rows.length, 1);
  assert.equal(secondDebug.rows.length, 1);
  assert.equal(secondDebug.rows[0].width, 3);
  assert.equal(
    secondDebug.label,
    "inspect-site → site:site-2 · L1 · finished:1:joint-10",
  );
  owner.renderDebug(false);
  assert.equal(owner.layer.visible, false);
});
