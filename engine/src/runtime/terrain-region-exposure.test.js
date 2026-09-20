import assert from "node:assert/strict";
import test from "node:test";
import { exposeTerrainFaces } from "./terrain-region-exposure.js";
const bounds = { minX: 0, maxX: 3, minY: 0, maxY: 8, minZ: 0, maxZ: 3 };
const core = { minX: 1, maxX: 2, minZ: 1, maxZ: 2 };
const sample = ([x, y, z]) => ({
  kind: "known",
  solid: x === 1 && z === 1 && (y === 0 || y === 3),
  material: 1,
});
test("exposure preserves cave floor, ceiling and all side orientations without camera state", () => {
  const faces = exposeTerrainFaces({ bounds, core, level: 7, sample });
  assert.equal(faces.length, 11, "world bottom is not invented air");
  assert.deepEqual(
    faces.filter((f) => f.face === "top").map((f) => f.cell),
    [
      [1, 0, 1],
      [1, 3, 1],
    ],
  );
  assert(faces.some((f) => f.face === "bottom" && f.cell[1] === 3));
  assert.deepEqual(
    new Set(faces.map((f) => f.face)),
    new Set(["top", "bottom", "east", "west", "south", "north"]),
  );
  assert.deepEqual(
    exposeTerrainFaces({ bounds, core, level: 7, sample, columnTop: () => 3 }),
    faces,
  );
});
test("cut caps differ from natural tops and unknown/outside never invent side faces", () => {
  const solid = () => ({ kind: "known", solid: true, material: 2 });
  const faces = exposeTerrainFaces({ bounds, core, level: 2, sample: solid });
  assert.deepEqual(faces, [
    { cell: [1, 2, 1], face: "top", material: 2, cap: true },
  ]);
  const edge = exposeTerrainFaces({
    bounds,
    core: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
    level: 7,
    sample: solid,
  });
  assert.deepEqual(edge, [
    { cell: [0, 7, 0], face: "top", material: 2, cap: true },
  ]);
  const unknown = (cell) =>
    cell[0] === 1 && cell[2] === 1 ? solid() : { kind: "unknown" };
  assert.deepEqual(
    exposeTerrainFaces({ bounds, core, level: 2, sample: unknown }),
    faces,
  );
  assert.equal(
    exposeTerrainFaces({ bounds, core, level: 0, sample })[0].cap,
    false,
  );
});
test("exposure rejects unsupported work or face budgets instead of truncating", () => {
  assert.throws(
    () => exposeTerrainFaces({ bounds, core, level: 7, sample, maxFaces: 2 }),
    /face budget/,
  );
  assert.throws(
    () =>
      exposeTerrainFaces({
        bounds: { ...bounds, maxY: 2048 },
        core,
        level: 2047,
        sample,
      }),
    /work budget/,
  );
  assert.deepEqual(exposeTerrainFaces({ bounds, core, level: -1, sample }), []);
});
