import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const style = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const targetRule = style.match(/\.window\.target-window \{([\s\S]*?)\n\}/)?.[1];

test("target windows share their docked top with the rail-reserved scroll height", () => {
  assert.ok(targetRule, "target-window rule exists");
  assert.match(targetRule, /--target-docked-top:\s*clamp\(/);
  assert.match(targetRule, /top:\s*var\(--target-docked-top\)/);
  assert.match(
    targetRule,
    /max-height:\s*calc\([\s\S]*?var\(--hud-rail-bottom\)[\s\S]*?var\(--target-docked-top\)/,
  );
  assert.match(targetRule, /overflow-y:\s*auto/);
});
