// Accepted hollow-kettle geometry. Callers choose visible contents and activity;
// this module does not infer recipe, volume, fuel, or thermal state.
import * as THREE from "three";
import { ball, box, cylinder, group, mesh } from "./geometry.js";

const P = {
  wood: "#785037",
  end: "#d2b77e",
  copper: "#b86842",
  gold: "#e0a462",
  iron: "#484c49",
  cream: "#d3c4a1",
  ale: "#b47737",
};

function ring(parent, color, x, y, z, radius, thickness) {
  const item = mesh(
    parent,
    new THREE.TorusGeometry(radius, thickness, 4, 16),
    color,
    x,
    y,
    z,
  );
  item.rotation.x = Math.PI / 2;
  return item;
}

function beam(parent, a, b, width, color) {
  const delta = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const item = box(
    parent,
    color,
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
    width,
    delta.length(),
    width,
  );
  item.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return item;
}

export function kettleBody(parent) {
  const root = group(parent);
  root.name = "kettle-body";
  box(root, "#555b52", 0, 0.1, 0, 1.42, 0.2, 1.32);
  for (let row = 0; row < 3; row++) {
    for (const side of [-1, 1])
      for (let z = 0; z < 3; z++)
        box(
          root,
          (row + z) % 2 ? "#857b65" : "#716955",
          side * 0.55,
          0.23 + row * 0.16,
          -0.4 + z * 0.39,
          0.22,
          0.15,
          0.37,
        );
    for (let x = 0; x < 3; x++)
      box(
        root,
        "#8a765b",
        -0.4 + x * 0.4,
        0.23 + row * 0.16,
        -0.52,
        0.38,
        0.15,
        0.2,
      );
  }
  const profile = [
    [0, 0.53],
    [0.24, 0.53],
    [0.34, 0.59],
    [0.36, 0.63],
    [0.48, 1.27],
    [0.432, 1.27],
    [0.312, 0.66],
    [0.23, 0.62],
    [0, 0.62],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(root, new THREE.LatheGeometry(profile, 16), P.copper, 0, 0, 0).name =
    "copper-vessel";
  ring(root, P.gold, 0, 1.28, 0, 0.475, 0.045);
  for (const x of [-0.53, 0.53]) {
    const handle = mesh(
      root,
      new THREE.TorusGeometry(0.125, 0.03, 4, 8),
      P.iron,
      x,
      1.14,
      0,
    );
    handle.rotation.y = Math.PI / 2;
  }
  const spout = cylinder(root, P.gold, 0, 0.79, 0.54, 0.04, 0.04, 0.24, 8);
  spout.rotation.x = Math.PI / 2;
  box(root, P.iron, 0, 0.87, 0.56, 0.17, 0.04, 0.04);
  return root;
}

export function kettleContents(
  parent,
  { level = 0.8, moving = false, phase = 0 } = {},
) {
  if (!(level > 0 && level <= 1))
    throw new Error("Visible liquid level must be in (0,1].");
  const root = group(parent);
  root.name = "kettle-contents";
  const y = 0.73 + level * 0.47;
  const radius = 0.321 + (y - 0.73) * 0.196;
  cylinder(root, P.ale, 0, y, 0, radius, radius, 0.012, 16);
  if (moving)
    for (let i = 0; i < 6; i++) {
      const wave = Math.sin((phase + i / 6) * Math.PI * 2);
      const size = 0.027 + 0.014 * (1 + wave);
      ball(
        root,
        i % 2 ? P.cream : "#d4a15a",
        Math.sin(i * 2.4) * 0.23,
        y + 0.012,
        Math.cos(i * 2.4) * 0.21,
        size,
        0.012 + 0.013 * (1 + wave),
        size,
      );
    }
  return root;
}

export function kettlePaddle(parent, phase = 0, stirring = false) {
  const root = group(parent);
  root.name = "kettle-paddle";
  const angle = phase * Math.PI * 2;
  const bottom = [0.23, 1.08, 0.2];
  const top = stirring
    ? [0.4 + 0.1 * Math.cos(angle), 1.84, 0.28 + 0.13 * Math.sin(angle)]
    : [0.48, 1.85, 0.35];
  beam(root, bottom, top, 0.055, P.end);
  const blade = box(root, P.end, bottom[0], 1.12, bottom[2], 0.16, 0.25, 0.035);
  blade.rotation.y = stirring ? Math.sin(angle) * 0.2 : 0;
  return root;
}

export function kettleFire(parent, phase = 0) {
  const root = group(parent);
  root.name = "kettle-fire";
  for (const x of [-0.17, 0.17]) {
    const log = cylinder(root, P.wood, x, 0.28, 0.02, 0.09, 0.09, 0.68, 7);
    log.rotation.x = Math.PI / 2;
    ball(root, "#de7041", x, 0.31, 0.15, 0.12, 0.08, 0.16);
  }
  for (let i = 0; i < 5; i++) {
    const wave = Math.sin((phase + i * 0.23) * Math.PI * 2);
    const height = 0.25 + 0.06 * (1 + wave);
    const flame = mesh(
      root,
      new THREE.ConeGeometry(0.07, height, 5),
      "#ffc468",
      -0.3 + i * 0.15,
      0.3 + height / 2,
      0.2,
    );
    flame.rotation.z = (i - 2) * 0.12 + wave * 0.12;
  }
  return root;
}

export function kettleSteam(parent, phase = 0) {
  const root = group(parent);
  root.name = "kettle-steam";
  for (let i = 0; i < 3; i++) {
    const t = (phase + i / 3) % 1;
    const size = 0.045 + 0.065 * Math.sin(t * Math.PI);
    ball(
      root,
      "#c1c8b2",
      -0.16 + Math.sin(i * 2.3 + t * 3) * 0.13,
      1.42 + t * 0.7,
      -0.12,
      size,
      size * 0.72,
      size * 0.78,
    );
  }
  return root;
}
