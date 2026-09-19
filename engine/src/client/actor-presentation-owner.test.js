import { test } from "node:test";
import assert from "node:assert/strict";
import { Container, Texture } from "pixi.js";
import { createActorPresentationOwner } from "./actor-presentation-owner.js";
import { registerVisibleSilhouette } from "../../../src/visual-hit-geometry.js";

test("actor presentation owns one live drawable and removes it on disappearance and reset", () => {
  const priorStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ fontFamily: "sans-serif" });
  try {
    const width = Texture.WHITE.width, height = Texture.WHITE.height;
    registerVisibleSilhouette(Texture.WHITE, { width, height,
      rows: Array.from({ length: height + 1 }, (_, index) => index),
      spans: Array.from({ length: height }, () => [0, width - 1]).flat() });
    const parent = new Container();
    const owner = createActorPresentationOwner({ parent, project: (x, y, z) => ({ x: x - z, y: x + z - y }),
      bindings: { bed: { kind: "static", path: ["buildings", "bed", "finished"], facing: true, anchor: "propAnchor" } },
      root: {}, effectClock: () => 0 });
    const art = { buildings: { bed: { finished: Array(4).fill(Texture.WHITE) } }, propAnchor: { x: 0.5, y: 1 },
      placementByTexture: new Map() };
    const subject = { id: "bed:1", name: "Bed", visual: "bed", x: 1, y: 0.27, z: 2, facing: 2,
      surface: { level: 0 }, pickable: true };
    const frame = { selectedIds: [], art, terrainFrame: { verticalMetres: 0.54 }, paused: true, frameSequence: 1, cameraTurn: 1 };
    const records = owner.update({ ...frame, subjects: [subject] });
    assert.equal(records.length, 1);
    assert.equal(parent.children.length, 1);
    assert.equal(records[0].display, parent.children[0]);
    owner.update({ ...frame, subjects: [] });
    assert.equal(parent.children.length, 0);
    owner.update({ ...frame, subjects: [subject] });
    owner.clear();
    assert.equal(parent.children.length, 0);
    owner.dispose();
    assert.throws(() => owner.update({ ...frame, subjects: [] }), /disposed/);
  } finally { globalThis.getComputedStyle = priorStyle; }
});
