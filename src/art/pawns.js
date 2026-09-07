import * as THREE from "three";
import { scene, box, ball, cylinder, mesh, group } from "./geometry.js";

function legs(body, stride, height, color) {
  for (const side of [-1, 1]) {
    const leg = group(body, 0.13 * side, height, 0);
    leg.rotation.x = stride * side * 0.55;
    box(leg, color, 0, -height * 0.43, 0, 0.17, height * 0.8, 0.19);
    box(leg, "#423e33", 0, -height + 0.09, 0.06, 0.21, 0.18, 0.32);
    box(leg, "#a78b60", 0, -height + 0.18, 0.14, 0.18, 0.04, 0.04);
  }
}
function humanHead(body) {
  ball(body, "#d6a17b", 0, 1.36, 0, 0.255, 0.28, 0.24);
  for (const side of [-1, 1]) {
    ball(body, "#d6a17b", side * 0.25, 1.36, 0, 0.06, 0.085, 0.055);
    box(body, "#f0e0bd", side * 0.113, 1.405, 0.214, 0.1, 0.085, 0.033);
    box(body, "#34362f", side * 0.103, 1.4, 0.239, 0.045, 0.064, 0.022);
    const brow = box(
      body,
      "#674736",
      side * 0.11,
      1.48,
      0.219,
      0.135,
      0.033,
      0.035,
    );
    brow.rotation.z = side * 0.18;
  }
  ball(body, "#e3b28a", 0, 1.34, 0.243, 0.062, 0.087, 0.084);
  box(body, "#855c48", 0, 1.22, 0.219, 0.1, 0.022, 0.025);
  ball(body, "#634733", 0, 1.55, -0.045, 0.27, 0.18, 0.25);
  for (let i = 0; i < 4; i++) {
    const lock = box(
      body,
      i % 2 ? "#87603c" : "#705037",
      -0.19 + i * 0.11,
      1.535 - (i % 2) * 0.055,
      0.17,
      0.14,
      0.19,
      0.13,
    );
    lock.rotation.z = -0.24;
  }
  box(body, "#634733", -0.23, 1.39, -0.045, 0.06, 0.23, 0.28);
}
function mallet(arm) {
  cylinder(arm, "#b19157", 0, -0.26, 0.17, 0.025, 0.03, 0.39, 6);
  box(arm, "#755336", 0, -0.07, 0.17, 0.23, 0.14, 0.16);
}
function axe(arm) {
  const tool = group(arm, 0, -0.37, 0.08);
  tool.rotation.x = 0.5;
  cylinder(tool, "#ae8852", 0, 0.05, 0, 0.026, 0.034, 0.65, 6);
  box(tool, "#626f71", 0.065, 0.29, 0, 0.24, 0.17, 0.07);
  box(tool, "#c6cdc0", 0.17, 0.29, 0, 0.065, 0.21, 0.075);
}
export function outsider(pose, phase, direction) {
  const s = scene(),
    puppet = group(s);
  puppet.rotation.y = direction;
  const cycle = Math.sin(phase * Math.PI * 2);
  const stride = pose === "walk" ? cycle : 0;
  const body = group(puppet, 0, Math.abs(stride) * 0.045, 0);
  if (pose === "chop") body.rotation.x = 0.08 + cycle * 0.07;
  legs(body, stride, 0.6, "#5e6551");
  ball(body, "#547c78", 0, 0.89, 0, 0.26, 0.35, 0.2);
  box(body, "#e2cf9c", 0, 0.89, 0.196, 0.13, 0.4, 0.035);
  box(body, "#6a5039", 0, 0.63, 0, 0.49, 0.085, 0.42);
  box(body, "#d4af64", 0, 0.64, 0.22, 0.09, 0.07, 0.035);
  box(body, "#b67547", 0, 1.12, 0.09, 0.39, 0.1, 0.3);
  box(body, "#d69b56", -0.11, 0.99, 0.23, 0.13, 0.3, 0.07);
  // An empty travel satchel and a patched sleeve, not starting building stock.
  ball(body, "#876741", 0, 0.88, -0.23, 0.21, 0.24, 0.13);
  for (const side of [-1, 1]) {
    const arm = group(body, side * 0.25, 1.08, 0);
    arm.rotation.x =
      pose === "build"
        ? -0.9 - cycle * 0.45
        : pose === "chop"
          ? -1.6 - cycle * 1.0
          : -stride * side * 0.6;
    arm.rotation.z = side * 0.1;
    ball(arm, "#547c78", 0, -0.13, 0, 0.11, 0.22, 0.12);
    box(arm, "#b4ae7b", side * 0.07, -0.17, 0.025, 0.05, 0.12, 0.15);
    ball(arm, "#d6a17b", 0, -0.36, 0.025, 0.078, 0.1, 0.08);
    if (side === 1) {
      if (pose === "build") mallet(arm);
      else axe(arm);
    }
  }
  humanHead(body);
  return s;
}
function ear(parent, side) {
  const shape = new THREE.Shape();
  shape.moveTo(0.22 * side, 0.98);
  shape.lineTo(0.79 * side, 1.47);
  shape.lineTo(0.58 * side, 0.97);
  shape.lineTo(0.28 * side, 0.89);
  mesh(
    parent,
    new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }),
    "#91ae52",
    0,
    0,
    0.03,
  );
  const inner = new THREE.Shape();
  inner.moveTo(0.35 * side, 1.03);
  inner.lineTo(0.68 * side, 1.35);
  inner.lineTo(0.53 * side, 1.05);
  mesh(parent, new THREE.ShapeGeometry(inner), "#bdad70", 0, 0, 0.141);
}
export function goblin(phase) {
  const s = scene(),
    body = group(s, 0, Math.sin(phase * Math.PI * 2) * 0.013, 0);
  legs(body, 0, 0.37, "#654b36");
  ball(body, "#ab5348", 0, 0.62, 0, 0.32, 0.38, 0.22);
  box(body, "#e9ac52", 0, 0.88, 0.22, 0.52, 0.12, 0.09);
  box(body, "#e9ac52", 0.18, 0.7, 0.24, 0.12, 0.33, 0.06);
  for (const side of [-1, 1]) {
    ball(body, "#ab5348", side * 0.3, 0.72, 0, 0.14, 0.24, 0.15);
    ball(body, "#91ae52", side * 0.31, 0.46, 0.03, 0.11, 0.14, 0.11);
  }
  ball(body, "#91ae52", 0, 1.08, 0.02, 0.37, 0.31, 0.28);
  ear(body, -1);
  ear(body, 1);
  ball(body, "#bbc96b", 0, 1.02, 0.28, 0.2, 0.13, 0.19);
  ball(body, "#91ae52", 0, 1.13, 0.29, 0.13, 0.15, 0.17);
  for (const side of [-1, 1]) {
    box(body, "#ece5b8", 0.177 * side, 1.165, 0.264, 0.155, 0.092, 0.045);
    box(body, "#292c27", 0.178 * side, 1.163, 0.29, 0.065, 0.073, 0.025);
    const brow = box(
      body,
      "#56713b",
      0.18 * side,
      1.235,
      0.267,
      0.2,
      0.05,
      0.065,
    );
    brow.rotation.z = -side * 0.2;
    const fang = mesh(
      body,
      new THREE.ConeGeometry(0.04, 0.11, 4),
      "#eee0b4",
      0.13 * side,
      0.946,
      0.392,
    );
    fang.rotation.x = Math.PI;
  }
  box(body, "#556039", 0, 0.938, 0.373, 0.17, 0.025, 0.025);
  cylinder(body, "#795941", 0, 1.36, 0, 0.23, 0.39, 0.17, 8);
  box(body, "#e4bd6d", 0, 1.41, 0.13, 0.45, 0.05, 0.32);
  return s;
}
