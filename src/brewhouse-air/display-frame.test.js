import test from "node:test";
import assert from "node:assert/strict";
import { terrainSurfaces } from "../terrain-surface-geometry.js";
import {
  initialTerrain,
  TERRAIN_FRAME,
  TERRAIN_VOXEL_METRIC,
} from "../world-presets/goblin-terrain.ts";
import { createRoomDisplayFrame } from "./display-frame.js";

const scene = {
  frame: TERRAIN_FRAME,
  metric: [
    TERRAIN_VOXEL_METRIC.horizontalM,
    TERRAIN_VOXEL_METRIC.verticalM,
    TERRAIN_VOXEL_METRIC.horizontalM,
  ],
  terrain: { bounds: { min: [0, 0], max: [15, 15] } },
};

test("generated terrain, original site anchors, global air cells and z-faces share one display frame", () => {
  const display = createRoomDisplayFrame(scene),
    face = terrainSurfaces(initialTerrain(), 15).find(
      ({ cell }) => cell.x === 4 && cell.z === 4,
    ),
    center = face.vertices.reduce(
      (sum, point) => ({
        x: sum.x + point.x / 4,
        y: sum.y + point.y / 4,
        z: sum.z + point.z / 4,
      }),
      { x: 0, y: 0, z: 0 },
    );
  assert.deepEqual(
    display.surface(center),
    display.site({ x: 4, z: 4, level: 0 }),
  );
  assert.deepEqual(
    display.cell([TERRAIN_FRAME.x + 4, TERRAIN_FRAME.y, TERRAIN_FRAME.z + 4]),
    [-3, TERRAIN_VOXEL_METRIC.verticalM / 2, -3],
  );
  assert.deepEqual(display.zFace({ x: 7, y: 6, z: 8 }), [
    0,
    6 * TERRAIN_VOXEL_METRIC.verticalM,
    0.5,
  ]);
});
