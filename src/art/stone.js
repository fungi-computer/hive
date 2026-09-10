import * as THREE from "three";
import { scene, group, mesh } from "./geometry.js";

// Original broken stone. The same faceted pieces sit loose or inside a sack.
const FRAGMENTS = Object.freeze([
  [-0.14, 0.12, 0.08, 0.17, 0.12, 0.14, 0.3],
  [0.14, 0.11, 0.06, 0.15, 0.11, 0.16, -0.5],
  [-0.06, 0.1, -0.16, 0.15, 0.1, 0.13, 0.8],
  [0.16, 0.09, -0.15, 0.12, 0.09, 0.13, 1.2],
  [0, 0.23, 0, 0.14, 0.1, 0.12, -0.2],
  [-0.27, 0.065, -0.08, 0.08, 0.065, 0.09, 0.6],
]);
const COLORS = Object.freeze(["#858b83", "#a2a69a", "#69736f"]);

export function stoneFragments(parent, amount = 3) {
  const result = group(parent);
  const count = Math.min(3, Math.max(1, amount)) * 2;
  for (let i = 0; i < count; i++) {
    const [x, y, z, width, height, depth, turn] = FRAGMENTS[i];
    const rock = mesh(
      result,
      new THREE.DodecahedronGeometry(1, 0),
      COLORS[i % COLORS.length],
      x,
      y,
      z,
    );
    rock.scale.set(width, height, depth);
    rock.rotation.y = turn;
  }
  return result;
}

export function stonePile(amount) {
  const result = scene();
  stoneFragments(result, amount);
  return result;
}
