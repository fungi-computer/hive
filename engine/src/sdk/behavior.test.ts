import test from "node:test";
import assert from "node:assert/strict";
import { component, query } from "./authoring.js";
import { action, actor, behavior, predicate } from "./behavior.js";

const Subject = component<{ value: number }>("test.subject", {
  version: 1,
  fields: { value: "number" },
});
const Related = component<{ value: number }>("test.related", {
  version: 1,
  fields: { value: "number" },
});

const row = (id: string, values: ReadonlyMap<string, object>) => ({
  id,
  get(definition: { readonly id: string }) {
    const value = values.get(definition.id);
    if (!value) throw new Error(`missing ${definition.id}`);
    return value;
  },
});

function context() {
  const subject = row("subject", new Map([[Subject.id, { value: 1 }]]));
  const related = row("related", new Map([[Related.id, { value: 2 }]]));
  const queries = new Map<string, number>();
  return {
    queries,
    value: {
      clock: { now: 0, delta: 1, tick: 0 },
      outcomes: [],
      impacts: [],
      random: { next: () => 0.5 },
      query(spec: { readonly components: readonly { readonly id: string }[] }) {
        const key = spec.components.map(({ id }) => id).join("+");
        queries.set(key, (queries.get(key) ?? 0) + 1);
        return key === Subject.id ? [subject] : key === Related.id ? [related] : [];
      },
      write() {},
      action() {},
      createAuthoredEntity() {},
      removeAuthoredEntity() {},
    } as any,
  };
}

test("behavior batches repeated selections and related reads in one phase", () => {
  const yes = predicate("test.yes", { test: () => true });
  let visits = 0;
  const visit = (id: string) => action(id, {
    reads: [Related],
    run(_subject, world) {
      visits += world.query(query(Related)).length;
    },
  });
  const rule = behavior("test.batched", (scene) => {
    const subjects = scene.find(Subject);
    subjects.where(yes).do(visit("test.visit-first"));
    subjects.where(yes).do(visit("test.visit-second"));
  });
  const fixture = context();
  rule.run(fixture.value);
  assert.equal(visits, 2);
  assert.deepEqual([...fixture.queries], [[Subject.id, 1], [Related.id, 1]]);
});

test("behavior rejects competing exclusive proposals for one actor", () => {
  const first = predicate("test.first", { test: () => true });
  const second = predicate("test.second", { test: () => true });
  const move = (id: string) => action(id, { exclusive: "movement", run() {} });
  const rule = behavior("test.conflict", (scene) => {
    const subjects = scene.find(Subject);
    subjects.where(first).do(move("test.move-first"));
    subjects.where(second).do(move("test.move-second"));
  });
  assert.throws(
    () => rule.run(context().value),
    /competing movement actions for subject/,
  );
});

test("actor composition validates capabilities and behavior attachments", () => {
  const yes = predicate("test.actor-yes", { test: () => true });
  const visit = action("test.actor-visit", { run() {} });
  const rule = behavior("test.actor-rule", (scene) => {
    scene.find(Subject).where(yes).do(visit);
  });
  assert.throws(
    () => actor("test.missing").with(Related).behaves(rule),
    /requires test.subject/,
  );
  const definition = actor("test.complete").with(Subject, { value: 1 }).behaves(rule);
  assert.equal(definition.capabilities[0].component, Subject);
  assert.equal(definition.behaviors[0], rule);
  assert.throws(
    () => actor("test.duplicate").with(Subject).with(Subject),
    /already has test.subject/,
  );
  const inert = actor("test.inert").with(Related, { value: 2 });
  assert.equal(inert.capabilities[0].component, Related);
  assert.deepEqual(inert.behaviors, []);
});

test("behavior rejects native fact reads that were not declared", () => {
  const undeclared = action("test.undeclared-fact", {
    run(_subject, world) { world.terrainSurfaces([[0, 0]]); },
  });
  const invalid = behavior("test.invalid-fact", (scene) => {
    scene.find(Subject).do(undeclared);
  });
  const fixture = context();
  fixture.value.terrainSurfaces = () => [];
  assert.throws(
    () => invalid.run(fixture.value),
    /test.undeclared-fact used undeclared native fact terrainSurfaces/,
  );

  const declared = action("test.declared-fact", {
    facts: ["terrainSurfaces"],
    run(_subject, world) { world.terrainSurfaces([[0, 0]]); },
  });
  const valid = behavior("test.valid-fact", (scene) => {
    scene.find(Subject).do(declared);
  });
  assert.doesNotThrow(() => valid.run(fixture.value));
});
