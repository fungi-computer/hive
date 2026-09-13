import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("performance page exposes all fixed size share URLs and worker choices", () => {
  const source = readFileSync(new URL("./performance-page.js", import.meta.url), "utf8");
  for (const size of [64, 128, 256]) assert.match(source, new RegExp(`size=\\$\\{value\\}`));
  for (const count of [4, 8, 16, 32, 50]) assert.match(source, new RegExp(`\\[4, 8, 16, 32, 50\\]`));
  assert.match(source, /performance-worker-entry/);
  assert.match(source, /name: `colony-performance:\$\{size\}:\$\{workers\}`/);
  assert.match(source, /root\.className = "hive-shell"/);
  assert.match(source, /hud\.replaceWith\(rail\)/);
});
