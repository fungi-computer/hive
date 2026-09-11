import { test } from "node:test";
import { strict as assert } from "node:assert";
import { entity } from "../sdk/authoring";
import { appendVisualProjections } from "./visual-projection";
const id = entity("site.floor");
const contact = { position: { x: -1, y: 2, z: 0 }, facing: 0 };
const art = { id, pose: { position: { x: 0, y: 2, z: 0 }, facing: 2 }, visual: "floor", label: "Floor" };
test("static entity display keeps identity and contact without a second entity", () => {
  const facts = [{ id, pose: contact, local: contact, visual: null }];
  const result = appendVisualProjections(facts, [art], () => [true], 512);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].pose, art.pose);
  assert.deepEqual(result[0].local, contact);
  assert.deepEqual(facts[0].pose, contact);
});
test("projection rejects missing entities, duplicate projections and existing art", () => {
  assert.throws(() => appendVisualProjections([], [art], () => [false], 512));
  assert.throws(() => appendVisualProjections([], [art, art], () => [true, true], 512));
  assert.throws(() => appendVisualProjections([{ id, visual: "worker" }], [art], () => [true], 512));
});
