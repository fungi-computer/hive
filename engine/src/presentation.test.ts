import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  presentationCommand,
  terrainPresentationCommand,
  projectPresentation,
  type GamePresentation,
} from "./presentation";
import type { GamePack } from "./contracts";
const pack = (presentation?: GamePresentation): GamePack =>
  ({
    id: "colony",
    version: 1,
    definition: new Uint8Array(),
    components: [],
    systems: [],
    commands: {
      greet: {
        reads: [],
        writes: [],
        run: () => ({ actions: [], writes: [] }),
      },
    },
    ...(presentation ? { presentation } : {}),
  }) as GamePack;
const context = { query: () => [], environmentFacts: () => ({}), atmosphereSamples: () => { throw new Error("unexpected atmosphere query in this fixture"); } };
test("selection controls capture current IDs without granting game authority", () => {
  const control = {
    id: "order",
    label: "Order",
    command: "greet",
    selection: "entities" as const,
    input: { quantity: 2 },
  };
  const selected = ["worker.1", "worker.1", "guest.1"];
  const result = presentationCommand(control, selected);
  selected.length = 0;
  assert.deepEqual(result.input, {
    quantity: 2,
    entities: ["worker.1", "guest.1"],
  });
  assert.deepEqual(presentationCommand(control, []).input, {
    quantity: 2,
    entities: [],
  });
  assert.throws(() =>
    presentationCommand({ ...control, input: { entities: ["forged"] } }, []),
  );
  assert.throws(() =>
    presentationCommand(control, Array(129).fill("worker.1")),
  );
});
test("unconfigured packs project empty output", () =>
  assert.deepEqual(projectPresentation(pack(), context), {
    facts: [],
    controls: [],
    terrainMarks: [],
    environmentVisuals: [],
  }));
test("projects bounded facts and cloned command input", () => {
  const input = { amount: 2 };
  const result = projectPresentation(
    pack({
      controls: [{ id: "greet", label: "Greet", command: "greet", input }],
      inspect: () => [{ id: "mood", label: "Mood", value: 0.5 }],
    }),
    context,
  );
  input.amount = 9;
  assert.equal(result.facts[0].value, 0.5);
  assert.deepEqual(result.controls[0].input, { amount: 2 });
});

test("projects bounded committed terrain marks", () => {
  const result = projectPresentation(pack({
    controls: [],
    inspect: () => [],
    terrainMarks: () => [
      { id: "order-1", cell: [1, 4, -2], status: "queued" },
      { id: "order-2", cell: [2, 4, -2], status: "working" },
    ],
  }), context);
  assert.deepEqual(result.terrainMarks, [
    { id: "order-1", cell: [1, 4, -2], status: "queued" },
    { id: "order-2", cell: [2, 4, -2], status: "working" },
  ]);
  assert.throws(() => projectPresentation(pack({ controls: [], inspect: () => [], terrainMarks: () => Array.from({ length: 257 }, (_, index) => ({ id: `mark-${index}`, cell: [0, 0, 0], status: "queued" })) }), context));
});
test("rejects unknown commands, duplicate IDs, and nonfinite values", () => {
  assert.throws(() =>
    projectPresentation(
      pack({
        controls: [{ id: "x", label: "X", command: "missing" }],
        inspect: () => [],
      }),
      context,
    ),
  );
  assert.throws(() =>
    projectPresentation(
      pack({
        controls: [{ id: "same", label: "X", command: "greet" }],
        inspect: () => [{ id: "same", label: "Y", value: true }],
      }),
      context,
    ),
  );
  assert.throws(() =>
    projectPresentation(
      pack({
        controls: [],
        inspect: () => [{ id: "x", label: "X", value: Infinity }],
      }),
      context,
    ),
  );
});

test("presentation rejects inputs whose JSON meaning would change", () => {
  for (const input of [
    { value: NaN },
    { value: undefined },
    { value: () => 1 },
    { value: "x".repeat(4097) },
  ]) {
    assert.throws(() =>
      projectPresentation(
        pack({
          controls: [
            { id: "control", label: "Control", command: "greet", input },
          ],
          inspect: () => [],
        }),
        context,
      ),
    );
  }
});

test("terrain controls bind selected actors and copy the visible cell", () => {
  const control = { id: "dig", label: "Dig", command: "greet", selection: "entities" as const, target: "terrain-cell" as const };
  const cell: [number, number, number] = [2, -5, 3];
  const result = terrainPresentationCommand(control, ["worker"], { cell, material: 2 });
  cell[0] = 9;
  assert.deepEqual(result.input, { entities: ["worker"], target: { cell: [2, -5, 3], material: 2 } });
  assert.equal(projectPresentation(pack({ controls: [control], inspect: () => [] }), context).controls[0].target, "terrain-cell");
  assert.throws(() => terrainPresentationCommand({ ...control, input: { target: {} } }, [], { cell, material: 2 }));
  assert.throws(() => terrainPresentationCommand(control, [], { cell: [0, NaN, 0], material: 2 }));
});


test("building surface controls preserve structure identity without fake earth material", () => {
  const control = { id: "build", label: "Build", command: "greet", target: "world-surface" as const };
  const target = { cell: [0, 8, 0] as const, source: "structure" as const };
  assert.deepEqual(terrainPresentationCommand(control, [], target).input, { target });
  assert.throws(() => terrainPresentationCommand({ ...control, target: "terrain-cell" }, [], target), /requires terrain/);
  assert.equal(projectPresentation(pack({ controls: [control], inspect: () => [] }), context).controls[0].target, "world-surface");
});


test("projects bounded environment visuals and rejects duplicates or invalid intensity", () => {
  const result = projectPresentation(pack({
    controls: [],
    inspect: () => [],
    environmentVisuals: () => [
      { id: "hearth-smoke", position: { x: 1, y: 2, z: -1 }, kind: "smoke", intensity: 0.25 },
      { id: "hearth-fire", position: { x: 1, y: 1, z: -1 }, kind: "fire", intensity: 1 },
    ],
  }), context);
  assert.deepEqual(result.environmentVisuals, [
    { id: "hearth-smoke", position: { x: 1, y: 2, z: -1 }, kind: "smoke", intensity: 0.25 },
    { id: "hearth-fire", position: { x: 1, y: 1, z: -1 }, kind: "fire", intensity: 1 },
  ]);
  assert.throws(() => projectPresentation(pack({ controls: [], inspect: () => [], environmentVisuals: () => [
    { id: "same", position: { x: 0, y: 0, z: 0 }, kind: "smoke", intensity: 0 },
    { id: "same", position: { x: 1, y: 0, z: 0 }, kind: "smoke", intensity: 0 },
  ] }), context), /duplicate environment visual/);
  assert.throws(() => projectPresentation(pack({ controls: [], inspect: () => [], environmentVisuals: () => [
    { id: "bad", position: { x: 0, y: 0, z: 0 }, kind: "fire", intensity: 2 },
  ] }), context), /invalid environment presentation visual/);
});
