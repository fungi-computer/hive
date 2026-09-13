import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { GamePack, ReadContext } from "./contracts";
import { projectPresentation, type GamePresentation } from "./presentation";
import { command } from "./sdk/authoring";
import { z } from "zod";

const pack = (presentation?: GamePresentation): GamePack => ({
  id: "presentation-test", version: 1, definition: new Uint8Array(), components: [], systems: [],
  commands: {
    probe: command({ title: "Probe", category: "Test", description: "Exercise presentation projection.", input: z.object({}).strict(), reads: [], writes: [], run: () => ({ actions: [], writes: [] }) }),
  },
  ...(presentation === undefined ? {} : { presentation }),
});
const context: Pick<ReadContext, "query" | "atmosphereSamples" | "environmentFacts" | "constructionReadiness"> = {
  query: () => [],
  environmentFacts: () => ({}),
  atmosphereSamples: () => { throw new Error("unexpected atmosphere query in fixture"); },
  constructionReadiness: () => [],
};

test("unconfigured packs expose empty retained presentation projections", () => {
  assert.deepEqual(projectPresentation(pack(), context), { facts: [], terrainMarks: [], environmentVisuals: [] });
});

test("presentation facts remain bounded, unique, scoped, and finite", () => {
  const result = projectPresentation(pack({
    inspect: () => [{ id: "mood", label: "Mood", value: 0.5, subjects: ["worker.1"] }],
  }), context);
  assert.deepEqual(result.facts, [{ id: "mood", label: "Mood", value: 0.5, subjects: ["worker.1"] }]);
  assert.throws(() => projectPresentation(pack({ inspect: () => [{ id: "same", label: "A", value: true }, { id: "same", label: "B", value: false }] }), context), /duplicate presentation fact/);
  assert.throws(() => projectPresentation(pack({ inspect: () => [{ id: "bad", label: "Bad", value: Infinity }] }), context), /Invalid input/);
});

test("terrain marks preserve stockpile style and reject duplicates or excess", () => {
  const result = projectPresentation(pack({
    inspect: () => [],
    terrainMarks: () => [
      { id: "work", cell: [1, 4, -2], status: "working" },
      { id: "stockpile", cell: [2, 4, -2], status: "queued", kind: "stockpile" },
    ],
  }), context);
  assert.deepEqual(result.terrainMarks, [
    { id: "work", cell: [1, 4, -2], status: "working" },
    { id: "stockpile", cell: [2, 4, -2], status: "queued", kind: "stockpile" },
  ]);
  assert.throws(() => projectPresentation(pack({ inspect: () => [], terrainMarks: () => [
    { id: "same", cell: [0, 0, 0], status: "queued" }, { id: "same", cell: [1, 0, 0], status: "queued" },
  ] }), context), /invalid terrain presentation mark/);
  assert.throws(() => projectPresentation(pack({ inspect: () => [], terrainMarks: () => Array.from({ length: 257 }, (_, i) => ({ id: `mark-${i}`, cell: [0, 0, 0] as [number, number, number], status: "queued" as const })) }), context), /limit exceeded/);
});

test("environment visuals remain bounded, unique, and valid", () => {
  const result = projectPresentation(pack({
    inspect: () => [],
    environmentVisuals: () => [
      { id: "smoke", position: { x: 1, y: 2, z: -1 }, kind: "smoke", intensity: 0.25 },
      { id: "fire", position: { x: 1, y: 1, z: -1 }, kind: "fire", intensity: 1 },
    ],
  }), context);
  assert.deepEqual(result.environmentVisuals, [
    { id: "smoke", position: { x: 1, y: 2, z: -1 }, kind: "smoke", intensity: 0.25 },
    { id: "fire", position: { x: 1, y: 1, z: -1 }, kind: "fire", intensity: 1 },
  ]);
  assert.throws(() => projectPresentation(pack({ inspect: () => [], environmentVisuals: () => [
    { id: "same", position: { x: 0, y: 0, z: 0 }, kind: "smoke", intensity: 0 },
    { id: "same", position: { x: 1, y: 0, z: 0 }, kind: "smoke", intensity: 0 },
  ] }), context), /duplicate environment visual/);
  assert.throws(() => projectPresentation(pack({ inspect: () => [], environmentVisuals: () => [
    { id: "bad", position: { x: 0, y: 0, z: 0 }, kind: "fire", intensity: 2 },
  ] }), context), /invalid environment presentation visual/);
});
