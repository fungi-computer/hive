import assert from "node:assert/strict";
import test from "node:test";
import { createColonyPerformancePack } from "./colony-performance";

const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as { initial: { id: string; components: Record<string, unknown> }[]; game: string };

test("performance presets are deterministic and keep a fixed 50-tree workload", () => {
  for (const size of [64, 128, 256] as const) {
    const a = createColonyPerformancePack(size, 50), b = createColonyPerformancePack(size, 50);
    assert.deepEqual([...a.definition], [...b.definition]);
    const scene = decode(a.definition);
    assert.equal(scene.game, `colony-performance-${size}-50`);
    assert.equal(a.id, scene.game);
    assert.equal(scene.initial.filter(record => record.components["colony.worker"]).length, 50);
    assert.equal(scene.initial.filter(record => record.components["colony.tree"]).length, 50);
    assert.deepEqual(a.presentationWindow, { minX: -32, maxX: 32, minZ: -32, maxZ: 32 });
  }
});

test("performance world bounds vary while the presentation window stays bounded", () => {
  const bounds = [64, 128, 256].map(size => {
    const environment = JSON.parse(new TextDecoder().decode(createColonyPerformancePack(size as 64 | 128 | 256, 4).environmentDefinition!)) as { world: { bounds: { minX: number; maxX: number; minZ: number; maxZ: number } } };
    return [environment.world.bounds.maxX - environment.world.bounds.minX, environment.world.bounds.maxZ - environment.world.bounds.minZ];
  });
  assert.deepEqual(bounds, [[64, 64], [128, 128], [256, 256]]);
});

test("performance actors and trees occupy distinct generated columns", () => {
  const pack = createColonyPerformancePack(64, 50);
  const environment = JSON.parse(new TextDecoder().decode(pack.environmentDefinition!)) as {
    initialPlacements: Array<{ entity: string; column: [number, number] }>;
  };
  assert.equal(new Set(environment.initialPlacements.map(row => row.column.join(","))).size, environment.initialPlacements.length);
});
