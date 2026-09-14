import assert from "node:assert/strict";
import test from "node:test";
import { createTerrainLayer } from "./terrain-layer.js";

test("terrain layer has no opaque sprite owner and disposal is repeatable", () => {
  const layer = createTerrainLayer();
  assert.equal(layer.drawItem, undefined);
  layer.dispose();
  layer.dispose();
});

test("terrain source uses one paired bake and updates both atlas sources", async () => {
  const source = await import("node:fs").then(({ readFileSync }) => readFileSync(new URL("./terrain-layer.js", import.meta.url), "utf8"));
  assert.match(source, /renderBakePairCanvas/);
  assert.match(source, /colorTexture\.source\.update\(\)/);
  assert.match(source, /depthTexture\.source\.update\(\)/);
  assert.match(source, /patch\.depthRange\.min !== depthRange\.min/);
  assert.match(source, /physicalRole: "terrain"/);
  assert.match(source, /pickable: false/);
});
