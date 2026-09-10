import { Vector3 } from "three";
import { camera } from "../../../src/art/prop-camera.js";

// Retained art/scale projection, centered on the shared bank's 15-cell ground.
// Fresh scenes use signed coordinates about that center instead of Goblin cells.
export const WIDTH = 640,
  HEIGHT = 400;
const view = camera(WIDTH, HEIGHT, 1.03);
export function project(x, y, z) {
  const point = new Vector3(x, y, z).project(view);
  return {
    x: Math.round(((point.x + 1) * WIDTH) / 2),
    y: Math.round(((1 - point.y) * HEIGHT) / 2),
  };
}
const origin = project(0, 0, 0);
export function groundPoint(x, y) {
  const dx = x - origin.x,
    dy = y - origin.y;
  return {
    x: Math.round(dx / 32 + dy / 16),
    y: 0,
    z: Math.round(dy / 16 - dx / 32),
  };
}
