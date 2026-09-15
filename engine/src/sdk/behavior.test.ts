import assert from "node:assert/strict";
import test from "node:test";
import { behavior, condition } from "./behavior";
import { component } from "./authoring";

const Cat = component<{ danger: boolean }>("test.cat", {
  version: 1,
  fields: { danger: "boolean" },
});
const Mood = component<{ fleeing: boolean }>("test.mood", {
  version: 1,
  fields: { fleeing: "boolean" },
});

test("behavior definitions are immutable and do not query during definition", () => {
  let called = false;
  const flee = { id: "flee", reads: [Mood], writes: [Mood], run: () => { called = true; return { actions: [], writes: [] }; } };
  const danger = condition("in-danger", [], () => { called = true; return true; });
  const system = behavior("cats", (scene) => {
    scene.find(Cat).where(danger).do(flee);
  });
  assert.equal(called, false);
  assert.deepEqual(system.reads.map((definition) => definition.id), [Cat.id, Mood.id]);
  assert.deepEqual(system.writes.map((definition) => definition.id), [Mood.id]);
});

test("duplicate branch identities and undeclared writes are rejected by definition", () => {
  const branch = { id: "same", run: () => ({ actions: [], writes: [] }) };
  assert.throws(() => behavior("duplicate", (scene) => {
    const selected = scene.find(Cat);
    selected.where(condition("safe", [], () => true)).do(branch);
    selected.where(condition("danger", [], () => true)).do(branch);
  }), /Duplicate behavior action/);
  const system = behavior("writes", (scene) => scene.find(Cat).where(condition("always", [], () => true)).do({ id: "act", run: () => ({ writes: [{ component: Mood.id, entity: "cat" as never, value: { fleeing: true } }] }) }));
  const context = { query: () => [{ id: "cat", get: () => ({ danger: true }) }] } as never;
  assert.throws(() => system.run(context), /undeclared write/);
});
