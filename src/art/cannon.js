// Original low-poly timber carriage cannon and iron shot for the pirate pack.
// Rendering only: gameplay owns firing, collision and projectile state.
import * as THREE from "three";
import { scene, box, ball, cylinder, group, mesh } from "./geometry.js";

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

function barrel(parent, recoil = 0) {
  // Recoil is authored along the cannon's local barrel axis. The parent turns
  // the complete model into one of the four world facings after this build.
  const kick = Math.max(0, Math.min(1, recoil)) * 0.18;
  const iron = cylinder(parent, "#3d4542", 0.42 - kick, 0.77, 0, 0.16, 0.23, 1.82, 8);
  iron.rotation.z = Math.PI / 2;
  const muzzle = cylinder(parent, "#59615a", 1.35 - kick, 0.77, 0, 0.25, 0.25, 0.16, 8);
  muzzle.rotation.z = Math.PI / 2;
  const bore = cylinder(parent, "#171b1a", 1.435 - kick, 0.77, 0, 0.13, 0.13, 0.012, 8);
  bore.rotation.z = Math.PI / 2;
  const collar = cylinder(parent, "#59615a", 0.9 - kick, 0.77, 0, 0.2, 0.2, 0.1, 8);
  collar.rotation.z = Math.PI / 2;
}

export function cannonScene(direction = 0, recoil = 0) {
  if (!Number.isSafeInteger(direction) || direction < 0 || direction > 3)
    throw new Error("Cannon direction must be one of four quarter turns");
  const result = scene();
  const model = group(result);
  model.name = "cannon";
  // Native facing turns local +x toward local +z for direction 1.
  model.rotation.y = -(direction * Math.PI) / 2;
  carriage(model);
  barrel(model, recoil);
  const datum = group(model);
  datum.name = "cannon-ground-datum";
  return result;
}

function puffScene(kind, phase = 0) {
  const result = scene();
  const root = group(result, 0, 0.16, 0);
  const t = Math.max(0, Math.min(1, phase));
  const palette = {
    smoke: ["#6e7369", "#9b9b83", "#c0b796"],
    dust: ["#8c704b", "#b08b59", "#d2ad70"],
    flash: ["#e9c66c", "#df7548", "#8d3f35"],
  }[kind];
  const count = kind === "flash" ? 5 : 6;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const radius = (0.08 + t * 0.24) * (1 + (i % 2) * 0.2);
    const size = kind === "flash" ? 0.08 + (1 - t) * 0.13 : 0.07 + t * 0.06;
    const mote = ball(
      root,
      palette[i % palette.length],
      Math.cos(angle) * radius,
      Math.sin(angle) * radius + t * 0.08,
      Math.sin(angle * 1.7) * radius * 0.55,
      size,
      size * (0.75 + (i % 3) * 0.12),
      size,
    );
    mote.rotation.z = angle;
  }
  if (kind === "flash") {
    const core = mesh(
      root,
      new THREE.OctahedronGeometry(0.16 + (1 - t) * 0.1, 0),
      "#f4e1a0",
      0,
      0.02,
      0,
    );
    core.scale.x = 1.3;
  }
  return result;
}

export function smokeScene(phase = 0) {
  return puffScene("smoke", phase);
}

export function dustScene(phase = 0) {
  return puffScene("dust", phase);
}

export function flashScene(phase = 0) {
  return puffScene("flash", phase);
}

/** A centered projectile visual; physical flight owns its world position. */
export function cannonballScene() {
  const result = scene();
  const projectile = ball(result, "#252c2a", 0, 0, 0, 0.22, 0.22, 0.22);
  projectile.name = "cannonball";
  return result;
}

/** A lodged shot with a visible dirt lip and a small contact shadow. */
export function cannonballEmbeddedScene() {
  const result = scene();
  ball(result, "#252c2a", 0, 0.08, 0, 0.22, 0.2, 0.22).name = "embedded-cannonball";
  const lip = new THREE.TorusGeometry(0.23, 0.045, 5, 10);
  const dirt = mesh(result, lip, "#8b6945", 0, 0.012, 0);
  dirt.rotation.x = Math.PI / 2;
  const shadow = ball(result, "#3d3b30", 0, 0.008, 0.015, 0.29, 0.018, 0.17);
  shadow.name = "cannonball-contact-shadow";
  return result;
}
