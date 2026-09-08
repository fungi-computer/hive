// Accepted hollow pail geometry. Fill is a caller-supplied art fact.
import * as THREE from "three";
import { box, cylinder, group, mesh } from "./geometry.js";

export const PAIL_GRIP = 0.66;
export const PAIL_FILL_HEIGHT = [0.083, 0.235, 0.382];
const WOOD = "#785037";
const END = "#b48b5c";
const IRON = "#484c49";

function band(parent, y, radius) {
  const hoop = mesh(
    parent,
    new THREE.TorusGeometry(radius, 0.024, 4, 12),
    IRON,
    0,
    y,
    0,
  );
  hoop.rotation.x = Math.PI / 2;
}

export function pail(parent, units = 0) {
  if (![0, 1, 2].includes(units))
    throw new Error("Pail fill must be 0, 1 or 2");
  const root = group(parent);
  root.name = "pail";
  const profile = [
    [0, 0.02],
    [0.19, 0.02],
    [0.24, 0.42],
    [0.207, 0.42],
    [0.158, 0.083],
    [0, 0.083],
  ];
  const body = mesh(
    root,
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      12,
    ),
    WOOD,
    0,
    0,
    0,
  );
  body.name = "pail-body";
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const seam = box(
      root,
      i % 3 === 0 ? END : "#65432f",
      Math.sin(a) * 0.217,
      0.225,
      Math.cos(a) * 0.217,
      0.012,
      0.34,
      0.012,
    );
    seam.rotation.y = a;
    seam.rotation.x = 0.122;
  }
  band(root, 0.07, 0.203);
  band(root, 0.35, 0.235);
  const bail = mesh(
    root,
    new THREE.TorusGeometry(0.24, 0.018, 4, 12, Math.PI),
    IRON,
    0,
    0.42,
    0,
  );
  bail.name = "pail-handle";
  for (const side of [-1, 1]) {
    const rivet = cylinder(
      root,
      IRON,
      side * 0.245,
      0.42,
      0,
      0.025,
      0.025,
      0.018,
      6,
    );
    rivet.rotation.z = Math.PI / 2;
  }
  const grip = cylinder(root, END, 0, PAIL_GRIP, 0, 0.028, 0.028, 0.13, 8);
  grip.rotation.z = Math.PI / 2;
  grip.name = "pail-grip";
  if (units) {
    const y = PAIL_FILL_HEIGHT[units];
    const r = 0.158 + ((y - 0.083) / (0.42 - 0.083)) * (0.207 - 0.158);
    const water = cylinder(
      root,
      "#668a88",
      0,
      y,
      0,
      r - 0.003,
      r - 0.003,
      0.005,
      12,
    );
    water.name = "pail-water";
    box(root, "#b8cec0", -0.045, y + 0.004, 0.04, 0.065, 0.003, 0.016);
  }
  return root;
}
