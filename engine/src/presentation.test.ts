import { strict as assert } from "node:assert";
import { test } from "node:test";
import { projectPresentation, type GamePresentation } from "./presentation";
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
const context = { query: () => [] };
test("unconfigured packs project empty output", () =>
  assert.deepEqual(projectPresentation(pack(), context), {
    facts: [],
    controls: [],
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
