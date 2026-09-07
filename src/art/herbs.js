// Original mugwort silhouettes. Static geometry only; game code owns growth.
import * as THREE from "three";
import { scene, mesh, group, ball, cylinder } from "./geometry.js";

export const MUGWORT_STAGES = ["planted", "growing", "ready", "bundle"];
const LEAVES = ["#597e69", "#779878", "#a5b5a0"];

function leaf(parent, length, color) {
  // Broad, broken lobes stay readable after the fixed low-resolution bake.
  const shape = new THREE.Shape();
  for (const [i, [x, y]] of [
    [0, 0],
    [-0.2, 0.22],
    [-0.09, 0.27],
    [-0.34, 0.43],
    [-0.12, 0.43],
    [-0.31, 0.65],
    [-0.1, 0.59],
    [0, 1],
    [0.14, 0.66],
    [0.3, 0.72],
    [0.13, 0.47],
    [0.32, 0.49],
    [0.11, 0.28],
    [0.19, 0.2],
  ].entries()) {
    if (i === 0) shape.moveTo(x * length, y * length);
    else shape.lineTo(x * length, y * length);
  }
  shape.closePath();
  mesh(
    parent,
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.018,
      bevelEnabled: false,
    }),
    color,
    0,
    0,
    0,
  );
  cylinder(
    parent,
    "#a9b28a",
    0,
    length * 0.28,
    0.012,
    0.007,
    0.009,
    length * 0.56,
    4,
  );
}

function soil(parent) {
  const mound = ball(parent, "#6c5740", 0, 0.025, 0, 0.33, 0.045, 0.3);
  mound.rotation.y = 0.3;
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4;
    ball(
      parent,
      i % 2 ? "#8f7650" : "#796444",
      Math.cos(a) * 0.24,
      0.04,
      Math.sin(a) * 0.21,
      0.07,
      0.035,
      0.045,
    );
  }
}

function shoot(parent, x, z, height, angle, mature = false) {
  const stem = group(parent, x, 0.04, z);
  stem.rotation.y = angle;
  stem.rotation.z = x * -0.6;
  cylinder(stem, "#826f53", 0, height / 2, 0, 0.011, 0.02, height, 5);
  const tiers = mature ? 3 : 2;
  for (let tier = 0; tier < tiers; tier++) {
    for (const side of [-1, 1]) {
      const fan = group(stem, 0, height * (0.22 + tier * 0.23), 0);
      fan.rotation.y = (side * Math.PI) / 2 + tier * 0.72;
      fan.rotation.x = 1.1 + tier * 0.12;
      leaf(
        fan,
        (mature ? 0.29 : 0.26) - tier * 0.045,
        LEAVES[(tier + (side > 0 ? 1 : 0)) % LEAVES.length],
      );
    }
  }
  if (mature) {
    // Small warm seed heads distinguish harvest readiness from leafy growth.
    for (let i = 0; i < 3; i++) {
      const bud = group(stem, (i - 1) * 0.045, height - i * 0.055, 0);
      ball(bud, i % 2 ? "#b09a77" : "#947a60", 0, 0, 0, 0.039, 0.062, 0.035);
    }
  }
}

function planted(parent) {
  soil(parent);
  cylinder(parent, "#7b8457", 0, 0.16, 0, 0.018, 0.024, 0.28, 5);
  for (const [angle, length, color] of [
    [0.2, 0.3, LEAVES[1]],
    [2.5, 0.32, LEAVES[2]],
    [4.5, 0.25, LEAVES[0]],
  ]) {
    const fan = group(parent, 0, 0.17, 0);
    fan.rotation.y = angle;
    fan.rotation.x = 0.45;
    leaf(fan, length, color);
  }
}

function growing(parent) {
  soil(parent);
  shoot(parent, -0.1, -0.04, 0.49, 0.2);
  shoot(parent, 0.12, 0.08, 0.39, 1.6);
  shoot(parent, 0.01, -0.1, 0.59, 3.1);
}

function ready(parent) {
  soil(parent);
  for (const [x, z, height, angle] of [
    [-0.13, -0.09, 0.82, 0.2],
    [0.14, 0.04, 0.73, 1.5],
    [0.04, -0.12, 0.96, 3],
    [-0.07, 0.13, 0.66, 4.2],
  ])
    shoot(parent, x, z, height, angle, true);
}

function bundle(parent) {
  const tied = group(parent, 0, 0.085, 0);
  tied.rotation.y = -0.58;
  for (let i = 0; i < 5; i++) {
    const stalk = group(tied, (i - 2) * 0.034, (i % 2) * 0.022, 0);
    stalk.rotation.y = (i - 2) * 0.12;
    const cut = cylinder(
      stalk,
      i % 2 ? "#a18b60" : "#806747",
      0,
      0,
      0,
      0.014,
      0.021,
      0.64 + (i % 2) * 0.08,
      5,
    );
    cut.rotation.x = Math.PI / 2;
    for (let tier = 0; tier < 2; tier++) {
      const fan = group(stalk, 0, 0.025, 0.03 + tier * 0.14);
      fan.rotation.x = Math.PI / 2 - 0.3;
      fan.rotation.z = (i - 2) * 0.14;
      leaf(fan, 0.28 - tier * 0.045, LEAVES[(i + tier) % 3]);
    }
  }
  for (const z of [-0.12, -0.075]) {
    const tie = mesh(
      tied,
      new THREE.TorusGeometry(0.105, 0.016, 4, 8),
      "#c9ad76",
      0,
      0.015,
      z,
    );
    tie.scale.y = 0.55;
  }
  const knot = group(tied, 0.03, 0.09, -0.1);
  leaf(knot, 0.09, "#ccb985");
}

const STAGES = { planted, growing, ready, bundle };
export function mugwort(stage) {
  const build = STAGES[stage];
  if (!build) throw new Error(`Unknown mugwort art stage: ${stage}`);
  const s = scene();
  build(s);
  return s;
}
