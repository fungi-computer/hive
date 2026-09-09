import * as THREE from "three";
import { TERRAIN_VOXEL_METRIC } from "../terrain.ts";
import { SIZE } from "../world.js";
// The accepted study camera: a 32×16 diamond and ~19.6 pixels per vertical unit.
export const WIDTH = 640,
  HEIGHT = 400;
export const STOREY_HEIGHT = 4 * TERRAIN_VOXEL_METRIC.verticalM;
const PIXELS_PER_UNIT = 16 * Math.SQRT2;
export function camera(width, height, targetY = 1.03) {
  const c = new THREE.OrthographicCamera(
    -width / PIXELS_PER_UNIT / 2,
    width / PIXELS_PER_UNIT / 2,
    height / PIXELS_PER_UNIT / 2,
    -height / PIXELS_PER_UNIT / 2,
    0.1,
    80,
  );
  c.position.set(12, Math.sqrt(288) * Math.tan(Math.PI / 6) + targetY, 12);
  c.lookAt(0, targetY, 0);
  c.updateMatrixWorld();
  return c;
}
export const worldCamera = camera(WIDTH, HEIGHT, 1.03);
export function project(x, z, y = 0) {
  const center = (SIZE - 1) / 2;
  const point = new THREE.Vector3(x - center, y, z - center).project(
    worldCamera,
  );
  return {
    x: Math.round(((point.x + 1) * WIDTH) / 2),
    y: Math.round(((1 - point.y) * HEIGHT) / 2),
  };
}
export function projectCell(cell, height = 0) {
  return project(cell.x, cell.z, height + (cell.level ?? 0) * STOREY_HEIGHT);
}
export function groundCell(x, y) {
  const origin = project(0, 0),
    dx = x - origin.x,
    dy = y - origin.y;
  return {
    x: Math.round(dx / 32 + dy / 16),
    z: Math.round(dy / 16 - dx / 32),
    level: 0,
  };
}
