import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  colonyPerformanceGameId,
  colonyPerformanceSizes,
  colonyPerformanceWorkerCounts,
  parseColonyPerformanceGameId,
} from "../games/colony-performance-config.ts";

test("performance page exposes all fixed size share URLs and worker choices", () => {
  const source = readFileSync(new URL("./performance-page.js", import.meta.url), "utf8");
  assert.match(source, /colonyPerformanceSizes/);
  assert.match(source, /colonyPerformanceWorkerCounts/);
  assert.match(source, /createConnectionChoice/);
  assert.match(source, /runtime: "remote"/);
  assert.doesNotMatch(source, /connectBrowserRuntime|new Worker/);
  assert.match(source, /root\.className = "hive-shell"/);
  assert.match(source, /hud\.replaceWith\(rail\)/);
  assert.match(source, /observer.snapshot/);
});

test("performance composition supplies Colony commands to the shared client", () => {
  const page = readFileSync(new URL("./performance-page.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("./client.js", import.meta.url), "utf8");
  assert.match(page, /import \{ colonyPack \} from "\.\.\/games\/colony\.ts"/);
  assert.match(page, /commandDefinitions: colonyPack\.commands/);
  assert.doesNotMatch(client, /const packs =/);
  assert.doesNotMatch(client, /packs\[mode\]/);
});

test("public performance presets round-trip and reject unsupported workload IDs", () => {
  for (const size of colonyPerformanceSizes) {
    for (const workers of colonyPerformanceWorkerCounts) {
      const gameId = colonyPerformanceGameId(size, workers);
      assert.deepEqual(parseColonyPerformanceGameId(gameId), { size, workers });
      assert.equal(gameId, `colony-performance-${size}-${workers}`);
    }
  }
  assert.equal(parseColonyPerformanceGameId("colony-performance-64-6"), null);
  assert.equal(parseColonyPerformanceGameId("colony-performance-1024-8"), null);
});

test("performance page is included in the Vite engine entry set", () => {
  const vite = readFileSync(new URL("../../../vite.config.js", import.meta.url), "utf8");
  assert.match(vite, /enginePerformance: "engine\/colony-performance\.html"/);
});
