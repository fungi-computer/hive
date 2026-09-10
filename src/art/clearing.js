import * as THREE from "three";
import { batchStaticScene } from "./static-batch.js";
import {
  scene,
  box,
  ball,
  cylinder,
  mushroom,
  mesh,
  group,
} from "./geometry.js";

import { SIZE, ROCKS, WATCHER } from "../world.js";
const CENTER = (SIZE - 1) / 2;
const greens = ["#758947", "#8f9e53", "#a7ad60", "#627b46"];
function fern(s, x, z, size) {
  const plant = group(s, x, 0.04, z);
  for (let i = 0; i < 5; i++) {
    const leaf = mesh(
      plant,
      new THREE.ConeGeometry(0.08, size, 3),
      greens[i % 4],
      0,
      size * 0.25,
      0,
    );
    leaf.rotation.z = -0.8 + i * 0.4;
    leaf.rotation.y = i * 1.9;
  }
}
function ground() {
  const s = scene();
  box(s, "#3b4130", 0, -0.36, 0, SIZE + 0.5, 0.62, SIZE + 0.5);
  box(s, "#697e44", 0, -0.06, 0, SIZE + 0.6, 0.16, SIZE + 0.6);
  // Soft irregular grass and a worn diagonal trail, all original geometry.
  for (let z = 0; z < SIZE; z++)
    for (let x = 0; x < SIZE; x++) {
      const dirt =
        Math.abs(x - z - 1) < 1.6 || (x > 4 && x < 11 && z > 4 && z < 11);
      const tile = cylinder(
        s,
        dirt
          ? ["#9a895a", "#a08e62", "#96865a"][(x + z) % 3]
          : greens[(x * 3 + z) % 4],
        x - CENTER,
        0.015,
        z - CENTER,
        0.77,
        0.77,
        0.03,
        7,
      );
      tile.rotation.y = x * 2.3 + z;
    }
  for (let i = 0; i < 110; i++) {
    const a = i * 2.399,
      r = CENTER + 0.3 + (i % 3) * 0.16;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    if (Math.abs(x) < CENTER - 0.2 && Math.abs(z) < CENTER - 0.2) continue;
    ball(s, greens[i % 4], x, 0.08, z, 0.24, 0.12, 0.22);
    if (i % 3 === 0) fern(s, x, z, 0.28 + (i % 4) * 0.06);
    if (i % 7 === 0) mushroom(s, x, 0.1, z, 0.65);
  }
  // Exposed roots and embedded pebbles on the cut earth edge.
  for (let i = 0; i < 25; i++) {
    const x = -CENTER - 0.3 + i * 0.6;
    box(
      s,
      "#746343",
      x,
      -0.26,
      CENTER + 0.77,
      0.06,
      0.28 + (i % 3) * 0.05,
      0.02,
    );
    ball(s, "#929078", CENTER + 0.76, -0.24, x, 0.04, 0.07, 0.16);
  }
  return s;
}
export function clearing() {
  const s = ground();
  // These corner boulders correspond to blocked navigation cells.
  for (const { x, z } of ROCKS) {
    ball(s, "#778576", x - CENTER, 0.23, z - CENTER, 0.44, 0.36, 0.4);
    ball(s, "#92a074", x - CENTER - 0.1, 0.43, z - CENTER, 0.28, 0.15, 0.25);
    fern(s, x - CENTER + 0.3, z - CENTER + 0.25, 0.42);
  }
  // A goblin boundary marker, not a usable building or stockpile.
  const marker = group(
    s,
    WATCHER.x - CENTER + 0.6,
    0,
    WATCHER.z - CENTER - 0.1,
  );
  box(marker, "#66513b", 0, 0.55, 0, 0.12, 1.1, 0.12);
  const sign = box(marker, "#935b42", 0, 0.95, 0, 0.6, 0.28, 0.12);
  sign.rotation.z = -0.12;
  for (const x of [-0.16, 0.16])
    box(marker, "#e1ce94", x, 0.99, 0.07, 0.055, 0.12, 0.025);
  box(marker, "#e1ce94", 0, 0.88, 0.08, 0.28, 0.025, 0.025);
  return batchStaticScene(s);
}
export function tree(stage) {
  const s = scene();
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 0.4;
    const root = box(
      s,
      "#705039",
      Math.cos(a) * 0.21,
      0.09,
      Math.sin(a) * 0.21,
      0.14,
      0.15,
      0.63,
    );
    root.rotation.y = -a + Math.PI / 2;
  }
  cylinder(
    s,
    "#765237",
    0,
    stage === "stump" ? 0.2 : 0.84,
    0,
    0.17,
    0.27,
    stage === "stump" ? 0.4 : 1.68,
    8,
  );
  if (stage === "stump") {
    cylinder(s, "#d0a76a", 0, 0.409, 0, 0.172, 0.172, 0.018, 8);
    cylinder(s, "#ad8050", 0, 0.421, 0, 0.11, 0.11, 0.012, 8);
    cylinder(s, "#dfba79", 0, 0.429, 0, 0.065, 0.065, 0.012, 8);
    for (let i = 0; i < 4; i++) {
      const chip = box(
        s,
        "#c79d62",
        0.32 + i * 0.06,
        0.04,
        (i - 2) * 0.14,
        0.15,
        0.055,
        0.07,
      );
      chip.rotation.y = i;
    }
    return s;
  }
  for (let i = 0; i < 4; i++) {
    const branch = cylinder(
      s,
      "#765237",
      (i % 2 ? 1 : -1) * 0.31,
      1.5 + i * 0.13,
      ((i % 3) - 1) * 0.22,
      0.07,
      0.13,
      0.9,
      7,
    );
    branch.rotation.z = i % 2 ? -0.8 : 0.8;
  }
  const crown = group(s);
  // Deliberately asymmetric broadleaf silhouette; gold tips over shaded moss.
  for (const [x, y, z, r, shade] of [
    [-0.6, 1.95, 0, 0.71, 0],
    [0.45, 2.1, -0.15, 0.81, 1],
    [0, 2.61, 0, 0.71, 2],
    [-0.13, 2.06, 0.48, 0.63, 1],
    [0.72, 2.28, 0.33, 0.49, 2],
    [-0.4, 2.4, -0.4, 0.58, 0],
  ])
    ball(crown, greens[shade], x, y, z, r, r * 0.65, r * 0.85);
  if (stage === "notched") {
    box(s, "#d8af70", 0, 0.61, 0.19, 0.3, 0.13, 0.12);
    box(s, "#372f24", 0, 0.66, 0.26, 0.26, 0.035, 0.03);
  }
  mushroom(s, -0.34, 0.03, 0.17, 0.65);
  return s;
}

/** Only newly exposed soil is rebaked. The orthographic opening mask removes
 * the old top surface in the composite, while the same faces own picking. */
export function excavationScene(faces) {
  const s = scene();
  for (const face of faces) {
    if (face.kind === "ground") continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [...face.vertices, ...face.vertices].flatMap(({ x, y, z }) => [
          x - CENTER,
          y,
          z - CENTER,
        ]),
        3,
      ),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3, 6, 5, 4, 7, 6, 4]);
    geometry.computeVertexNormals();
    mesh(
      s,
      geometry,
      face.kind === "pit-floor" ? "#806143" : "#9a744f",
      0,
      0,
      0,
    );
    if (face.kind === "cut-wall") {
      const mid = face.vertices.reduce(
        (p, v) => ({ x: p.x + v.x / 4, y: p.y + v.y / 4, z: p.z + v.z / 4 }),
        { x: 0, y: 0, z: 0 },
      );
      ball(
        s,
        "#bb9b6c",
        mid.x - CENTER,
        mid.y,
        mid.z - CENTER,
        0.07,
        0.035,
        0.06,
      );
    }
  }
  return batchStaticScene(s);
}
