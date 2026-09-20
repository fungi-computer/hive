import assert from "node:assert/strict";
import test from "node:test";
import { Scene, Group, Mesh, BoxGeometry, MeshBasicMaterial } from "three";
import { captureVisualVolume } from "./ordering-geometry.js";

test("capture detaches precise transformed visual bounds including a part's parent", () => {
  const scene = new Scene(), parent = new Group(), part = new Group();
  scene.add(parent); parent.add(part);
  parent.position.set(4, 2, -3); parent.rotation.y = Math.PI / 2;
  part.add(new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial()));
  const volume = captureVisualVolume(part);
  for (const [bound, expected] of [[volume.min, [1, 0, -4]], [volume.max, [7, 4, -2]]])
    for (const [i, axis] of ["x", "y", "z"].entries())
      assert(Math.abs(bound[axis] - expected[i]) < 1e-12);
  parent.position.set(99, 99, 99);
  part.traverse(node => node.geometry?.dispose());
  assert.equal(volume.min.x, 1);
  assert(Object.isFrozen(volume));
  assert(Object.isFrozen(volume.min));
});

test("capture rejects empty art sources", () => {
  assert.throws(() => captureVisualVolume(new Scene()), /no mesh geometry/);
});
