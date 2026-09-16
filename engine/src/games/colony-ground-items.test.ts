import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_VISUAL_BINDINGS } from "../client/visual-bindings.js";
import { colonyGroundMaterialVisual } from "./colony-material-presentation.ts";

test("retained loose-material visuals are data-driven and resolve to item art", () => {
  const expected = new Map([
    ["soil-spoil", "soil"],
    ["stone-spoil", "stone"],
    ["wood-felled", "colony.tree.felled"],
    ["wood", "colony.material.wood"],
    ["bread", "colony.material.bread"],
    ["mugwort", "colony.material.mugwort"],
  ]);
  assert.deepEqual(colonyGroundMaterialVisual, expected);
  for (const visual of expected.values()) {
    const binding = DEFAULT_VISUAL_BINDINGS[visual];
    assert.ok(binding, `missing visual binding for ${visual}`);
    assert.equal(binding.worldRole, visual === "colony.tree.felled" ? "structure" : "item");
  }
});
