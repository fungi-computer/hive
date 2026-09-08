// Original Astra stone catch basin. Supplied display state owns no water/time.
import * as THREE from "three";
import { scene, group, mesh, box, ball, cylinder } from "./geometry.js";

export const BASIN_FLOOR = 0.055;
export const BASIN_LEVEL = { dry: null, low: 0.165, full: 0.285 };

export function basin(parent, fill = "full") {
  if (!Object.hasOwn(BASIN_LEVEL, fill)) throw new Error("Unknown basin fill");
  const root = group(parent);
  root.name = "spring-basin";
  const profile = [
    [0, 0.012],
    [0.365, 0.012],
    [0.445, 0.12],
    [0.465, 0.325],
    [0.36, 0.325],
    [0.27, BASIN_FLOOR],
    [0, BASIN_FLOOR],
  ];
  const shell = mesh(
    root,
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      12,
    ),
    "#6e777b",
    0,
    0,
    0,
  );
  shell.name = "basin-body";
  // Individual coping stones leave the center genuinely open.
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    const stone = box(
      root,
      ["#8c9992", "#74857d", "#a0a895"][i % 3],
      Math.sin(angle) * 0.411,
      0.326 + (i % 3) * 0.006,
      Math.cos(angle) * 0.411,
      0.198,
      0.065,
      0.106,
    );
    stone.rotation.y = angle;
    stone.rotation.z = (i % 2 ? 1 : -1) * 0.025;
  }
  // A few old seams/moss patches add age without a second opaque basin cap.
  for (const [x, z, a] of [
    [-0.39, 0.14, -1.2],
    [0.31, 0.3, 0.8],
    [0.13, -0.39, 2.9],
  ]) {
    const patch = box(root, "#718047", x, 0.266, z, 0.14, 0.065, 0.014);
    patch.rotation.y = a;
    const seam = box(
      root,
      "#595e48",
      x * 0.98,
      0.165,
      z * 0.98,
      0.024,
      0.1,
      0.015,
    );
    seam.rotation.y = a;
  }
  // Bottom sediment remains underneath the liquid, so draining reveals it.
  for (const [x, z, size] of [
    [-0.13, -0.08, 0.046],
    [0.1, 0.11, 0.052],
    [0.14, -0.1, 0.032],
  ])
    ball(root, "#958369", x, 0.065, z, size, 0.014, size * 0.75);
  if (BASIN_LEVEL[fill] !== null) {
    const height = BASIN_LEVEL[fill];
    const radius =
      0.27 + ((height - BASIN_FLOOR) / (0.325 - BASIN_FLOOR)) * 0.09;
    const water = cylinder(
      root,
      "#397986",
      0,
      height,
      0,
      radius - 0.002,
      radius - 0.002,
      0.004,
      12,
    );
    water.name = "basin-liquid";
    box(water, "#b6d9cb", -0.075, 0.004, 0.08, 0.105, 0.003, 0.017);
    box(water, "#82b4af", 0.1, 0.004, -0.1, 0.07, 0.003, 0.012);
  }
  // A quiet fern tuft on the rear stone fixes orientation at tiny scale.
  for (let i = 0; i < 3; i++) {
    const stem = box(
      root,
      "#657e45",
      -0.18 + i * 0.04,
      0.405,
      -0.37,
      0.018,
      0.15 + (i % 2) * 0.04,
      0.022,
    );
    stem.rotation.z = (i - 1) * 0.3;
    const leaf = ball(
      root,
      i === 1 ? "#9caa61" : "#83944e",
      -0.18 + i * 0.04,
      0.465 + (i % 2) * 0.045,
      -0.37,
      0.04,
      0.015,
      0.07,
    );
    leaf.rotation.z = (i - 1) * 0.3;
  }
  return root;
}

export function basinScene(fill = "full", direction = 0) {
  const s = scene();
  basin(s, fill).rotation.y = (direction * Math.PI) / 2;
  return s;
}
