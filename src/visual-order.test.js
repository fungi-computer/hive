import test from "node:test";
import assert from "node:assert/strict";
import {
  compositeWaterOccluders,
  visualDepth,
  structureDepth,
  waterDepth,
  waterBehindStructure,
} from "./visual-order.js";
const floor = {
  id: "floor",
  type: "floor",
  x: 8,
  z: 8,
  level: 1,
  direction: 0,
  finishedAt: 0,
};
const water = { id: "cell:1,19,127", x: 8, z: 8, height: 2.16 + 0.002 };

test("upper-floor water sorts above support but below the ordinary actor", () => {
  const depth = waterDepth(water, [floor]);
  assert(depth > structureDepth(floor));
  assert(depth < visualDepth(floor, 0.45));
  assert.equal(waterBehindStructure(water, depth, floor), false);
});

test("covering multi-cell art behind the water requires its original silhouette, not anchor retargeting", () => {
  const station = { ...floor, id: "station", type: "brew-station", x: 7, z: 7 };
  const depth = waterDepth(water, [floor, station]);
  assert.equal(structureDepth(station), 14 + 0.35 + 0.15);
  assert.equal(waterBehindStructure(water, depth, station), true);
  assert.equal(
    waterBehindStructure(water, depth, { ...station, x: 2, z: 2 }),
    false,
  );
  assert.equal(
    waterBehindStructure(water, depth, { ...station, level: 0 }),
    false,
  );
  assert.equal(
    waterBehindStructure(water, depth, { ...station, level: 2 }),
    false,
  );
  assert.equal(
    waterBehindStructure(water, depth, { ...floor, type: "wall", z: 9 }),
    false,
  );
});

test("original raster alpha contributes once inside water and never duplicates outside it", () => {
  // Independent one-pixel Porter-Duff reference, not a browser/raster witness.
  const water = 0.3,
    original = 0.8;
  for (const displayAlpha of [0.28, 0.42, 1]) {
    for (const rasterAlpha of [0.5, 1]) {
      for (const coverage of [0, 1]) {
        let color = water * coverage,
          alpha = coverage;
        const calls = [];
        const image = { color: original, alpha: rasterAlpha };
        const context = {
          save() {},
          restore() {},
          globalAlpha: 1,
          globalCompositeOperation: "source-over",
          drawImage(resource, ...args) {
            calls.push(args);
            const sourceAlpha = resource.alpha * this.globalAlpha;
            const mode = this.globalCompositeOperation;
            const sourceFactor =
              mode === "source-atop" ? alpha : mode === "source-over" ? 1 : 0;
            color =
              resource.color * sourceAlpha * sourceFactor +
              color * (1 - sourceAlpha);
            alpha = sourceAlpha * sourceFactor + alpha * (1 - sourceAlpha);
          },
        };
        compositeWaterOccluders(context, { x: 10, y: 20 }, [
          {
            texture: {
              source: { resource: image },
              frame: { x: 3, y: 4, width: 112, height: 112 },
            },
            x: 12,
            y: 24,
            alpha: displayAlpha,
          },
        ]);
        assert.deepEqual(calls, [[3, 4, 112, 112, 2, 4, 112, 112]]);
        const effectiveAlpha = displayAlpha * rasterAlpha;
        assert(
          Math.abs(
            color -
              coverage *
                (original * effectiveAlpha + water * (1 - effectiveAlpha)),
          ) < 1e-12,
        );
        assert.equal(alpha, coverage);
      }
    }
  }
});
