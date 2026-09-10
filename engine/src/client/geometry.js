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
    x: ((point.x + 1) * WIDTH) / 2,
    y: ((1 - point.y) * HEIGHT) / 2,
  };
}
const origin = project(0, 0, 0);
const axisX = project(1, 0, 0);
const axisZ = project(0, 0, 1);
const basisX = { x: axisX.x - origin.x, y: axisX.y - origin.y };
const basisZ = { x: axisZ.x - origin.x, y: axisZ.y - origin.y };
const determinant = basisX.x * basisZ.y - basisZ.x * basisX.y;
export function groundPoint(x, y) {
  const dx = x - origin.x,
    dy = y - origin.y;
  return {
    x: Math.round((dx * basisZ.y - basisZ.x * dy) / determinant),
    y: 0,
    z: Math.round((basisX.x * dy - dx * basisX.y) / determinant),
  };
}
