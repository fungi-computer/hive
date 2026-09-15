import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  colonyPerformanceGameId,
  colonyPerformanceSizes,
  colonyPerformanceWorkerCounts,
  colonyPerformanceWorkerName,
  parseColonyPerformanceWorkerName,
} from "../games/colony-performance-config.ts";

test("performance page exposes all fixed size share URLs and worker choices", () => {
  const source = readFileSync(new URL("./performance-page.js", import.meta.url), "utf8");
  assert.match(source, /colonyPerformanceSizes/);
  assert.match(source, /colonyPerformanceWorkerCounts/);
  assert.match(source, /performance-worker-entry/);
  assert.match(source, /name: colonyPerformanceWorkerName\(size, workers\)/);
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

test("performance page and Worker share every real preset identity", () => {
  for (const size of colonyPerformanceSizes) {
    for (const workers of colonyPerformanceWorkerCounts) {
      const workerName = colonyPerformanceWorkerName(size, workers);
      const gameId = colonyPerformanceGameId(size, workers);
      assert.deepEqual(parseColonyPerformanceWorkerName(workerName), { size, workers });
      assert.equal(gameId, `colony-performance-${size}-${workers}`);
    }
  }
  assert.equal(parseColonyPerformanceWorkerName("colony-performance:64:6"), null);
  assert.equal(parseColonyPerformanceWorkerName("colony-performance-64-8"), null);
});
