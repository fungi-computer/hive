import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("performance page exposes all fixed size share URLs and worker choices", () => {
  const source = readFileSync(new URL("./performance-page.js", import.meta.url), "utf8");
  for (const size of [64, 128, 256, 512]) assert.match(source, new RegExp(`size=\\$\\{value\\}`));
  for (const count of [4, 8, 16, 32, 50, 100, 200]) assert.match(source, new RegExp(`\\[4, 8, 16, 32, 50, 100, 200\\]`));
  assert.match(source, /performance-worker-entry/);
  assert.match(source, /name: `colony-performance:\$\{size\}:\$\{workers\}`/);
  assert.match(source, /root\.className = "hive-shell"/);
  assert.match(source, /hud\.replaceWith\(rail\)/);
  assert.match(source, /createPerformancePersistence\(runtime\)/);
});

test("performance composition supplies Colony commands to the shared client", () => {
  const page = readFileSync(new URL("./performance-page.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("./client.js", import.meta.url), "utf8");
  assert.match(page, /import \{ colonyPack \} from "\.\.\/games\/colony\.ts"/);
  assert.match(page, /commandDefinitions: colonyPack\.commands/);
  assert.doesNotMatch(client, /const packs =/);
  assert.doesNotMatch(client, /packs\[mode\]/);
});

test("performance page is included in the Vite engine entry set", () => {
  const vite = readFileSync(new URL("../../../vite.config.js", import.meta.url), "utf8");
  assert.match(vite, /enginePerformance: "engine\/colony-performance\.html"/);
});
