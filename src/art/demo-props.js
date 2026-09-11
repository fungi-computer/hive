// Original shared deck/pantry props. Visuals never grant storage or collision.
import * as THREE from "three";
import { scene, box, cylinder, mesh, group } from "./geometry.js";

export function cargoScene(kind = "crate") {
  const result = scene();
  const root = group(result);
  if (kind === "barrel") {
    cylinder(root, "#825637", 0, 0.43, 0, 0.32, 0.32, 0.78, 10);
    cylinder(root, "#a77a48", 0, 0.44, 0, 0.37, 0.37, 0.5, 10);
    for (const y of [0.16, 0.65]) cylinder(root, "#4c5a54", 0, y, 0, 0.355, 0.355, 0.09, 10);
    cylinder(root, "#b88d55", 0, 0.83, 0, 0.305, 0.305, 0.035, 10);
    return result;
  }
  const chest = kind === "chest";
  box(root, "#614533", 0, 0.34, 0, 0.95, 0.62, 0.67);
  for (let i = 0; i < 4; i++) {
    box(root, i % 2 ? "#987044" : "#aa8050", -0.345 + i * 0.23, 0.35, 0.344, 0.205, 0.52, 0.035);
    box(root, "#916540", -0.345 + i * 0.23, 0.35, -0.344, 0.205, 0.52, 0.035);
    box(root, "#bc915d", -0.345 + i * 0.23, 0.67, 0, 0.21, 0.06, 0.69);
  }
  if (chest) {
    box(root, "#a67842", 0, 0.73, 0, 0.92, 0.12, 0.6);
    box(root, "#bc9357", 0, 0.8, 0, 0.84, 0.09, 0.42);
    for (const x of [-0.31, 0.31]) {
      box(root, "#475653", x, 0.45, 0.37, 0.075, 0.7, 0.045);
      box(root, "#52645c", x, 0.86, 0, 0.075, 0.035, 0.44);
    }
    box(root, "#d3b165", 0, 0.59, 0.39, 0.12, 0.15, 0.05);
    box(root, "#3d4844", 0, 0.59, 0.422, 0.025, 0.045, 0.012);
  } else {
    for (const x of [-0.38, 0.38]) box(root, "#c49a62", x, 0.35, 0.38, 0.095, 0.66, 0.07);
    const brace = box(root, "#bc9059", 0, 0.35, 0.42, 0.78, 0.075, 0.05);
    brace.rotation.z = 0.48;
  }
  return result;
}

export function rippleScene(phase = 0) {
  const result = scene();
  const t = Math.max(0, Math.min(1, phase));
  for (const [offset, color] of [[0, "#8fb7ad"], [0.15, "#547e82"]]) {
    const radius = 0.19 + t * 0.4 + offset;
    const ring = mesh(result, new THREE.TorusGeometry(radius, 0.018 + (1 - t) * 0.016, 4, 16, Math.PI * 1.5), color, 0, 0.025, 0);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = offset ? 1.8 : 0.4;
  }
  return result;
}
