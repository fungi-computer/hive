// Original low-poly timber carriage cannon and iron shot for the pirate pack.
// Rendering only: gameplay owns firing, collision and projectile state.
import { scene, box, ball, cylinder, group } from "./geometry.js";

function wheel(parent, z) {
  const result = cylinder(parent, "#694733", -0.36, 0.42, z, 0.38, 0.42, 0.16, 10);
  result.rotation.x = Math.PI / 2;
  cylinder(parent, "#b27d48", -0.36, 0.42, z + (z < 0 ? -0.086 : 0.086), 0.2, 0.2, 0.018, 10).rotation.x = Math.PI / 2;
}

function carriage(parent) {
  box(parent, "#8e6a43", -0.35, 0.22, 0, 1.35, 0.34, 0.62);
  box(parent, "#ba925e", -0.35, 0.43, 0, 1.08, 0.14, 0.5);
  const axle = cylinder(parent, "#5d3e2b", -0.36, 0.42, 0, 0.08, 0.08, 1.05, 8);
  axle.rotation.x = Math.PI / 2;
  wheel(parent, -0.43);
  wheel(parent, 0.43);
}

function barrel(parent) {
  const iron = cylinder(parent, "#3d4542", 0.42, 0.77, 0, 0.16, 0.23, 1.82, 8);
  iron.rotation.z = Math.PI / 2;
  const muzzle = cylinder(parent, "#59615a", 1.35, 0.77, 0, 0.25, 0.25, 0.16, 8);
  muzzle.rotation.z = Math.PI / 2;
  const bore = cylinder(parent, "#171b1a", 1.435, 0.77, 0, 0.13, 0.13, 0.012, 8);
  bore.rotation.z = Math.PI / 2;
  const collar = cylinder(parent, "#59615a", 0.9, 0.77, 0, 0.2, 0.2, 0.1, 8);
  collar.rotation.z = Math.PI / 2;
}

export function cannonScene(direction = 0) {
  if (!Number.isSafeInteger(direction) || direction < 0 || direction > 3)
    throw new Error("Cannon direction must be one of four quarter turns");
  const result = scene();
  const model = group(result);
  model.name = "cannon";
  // Native facing turns local +x toward local +z for direction 1.
  model.rotation.y = -(direction * Math.PI) / 2;
  carriage(model);
  barrel(model);
  const datum = group(model);
  datum.name = "cannon-ground-datum";
  return result;
}

/** A centered projectile visual; physical flight owns its world position. */
export function cannonballScene() {
  const result = scene();
  const projectile = ball(result, "#252c2a", 0, 0, 0, 0.22, 0.22, 0.22);
  projectile.name = "cannonball";
  return result;
}
