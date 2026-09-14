import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_VISUAL_BINDINGS } from "./visual-bindings.js";
import { projectWorldFact } from "./world-view.js";

const bank = JSON.parse(readFileSync("public/generated-art/goblin-static-art-v2/manifest.json", "utf8"));
const paths = new Set(bank.entries.map((entry) => JSON.stringify(entry.path)));

test("retained v4 bank covers bed, brewer, and all four authored stair directions", () => {
  for (const type of ["bed", "brew-station"]) {
    const binding = DEFAULT_VISUAL_BINDINGS[`colony.${type}.finished`];
    const path = binding.facing ? [...binding.path, 0] : binding.path;
    assert(paths.has(JSON.stringify(path)), `missing retained ${type} source path`);
  }
  const stair = DEFAULT_VISUAL_BINDINGS["colony.stair.finished"];
  for (let facing = 0; facing < 4; facing += 1)
    assert(paths.has(JSON.stringify([...stair.path, facing])), `missing retained stair frame ${facing}`);
});

test("cutaway policy excludes upper facts before color/depth projection and picking", () => {
  const view = { range: { min: 0, max: 1 }, level: 0, cutaway: true, presentedSurfaces: new Set() };
  assert.deepEqual(
    projectWorldFact({ id: "upper", view: { level: 1 } }, view),
    { visible: false, pickable: false },
  );
  assert.deepEqual(
    projectWorldFact({ id: "lower", view: { level: 0 } }, view),
    { visible: true, pickable: true },
  );
});
