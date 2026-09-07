// Original Astra fire silhouettes, hearths and smoke. Phase animates art only.
import * as THREE from "three";
import {
  scene,
  group,
  mesh,
  box,
  ball,
  cylinder,
} from "./src/art/geometry.js";
const TAU = Math.PI * 2;
export const FIRE_COLORS = {
  hearth: {
    label: "Hearthfire",
    outer: "#df6539",
    middle: "#f9ba58",
    core: "#fff0b7",
    light: "#e39a45",
  },
  witch: {
    label: "Witchflame",
    outer: "#387b8c",
    middle: "#74c6ae",
    core: "#e1edb6",
    light: "#60b79e",
  },
  omen: {
    label: "An ill omen",
    outer: "#93538f",
    middle: "#d38aba",
    core: "#f6daca",
    light: "#b271a9",
  },
};
const basic = new Map();
function glowing(color, opacity = 1) {
  const key = `${color}/${opacity}`;
  if (!basic.has(key))
    basic.set(
      key,
      new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity === 1,
      }),
    );
  return basic.get(key);
}
function ember(p, x, y, z, color, r = 0.025, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(r, 0),
    glowing(color, opacity),
  );
  m.position.set(x, y, z);
  p.add(m);
}
function flame(
  p,
  phase,
  color,
  { x = 0, z = 0, width = 0.2, height = 0.8, delay = 0 },
) {
  const t = phase * TAU + delay;
  const root = group(p, x, 0, z);
  const lean = Math.sin(t) * width * 0.8;
  const h = height * (1 + Math.sin(t * 2) * 0.12);
  const shape = new THREE.Shape();
  shape.moveTo(-width, 0);
  shape.bezierCurveTo(
    -width * 1.2,
    h * 0.33,
    lean - width * 0.25,
    h * 0.48,
    lean,
    h,
  );
  shape.bezierCurveTo(
    lean + width * 0.9,
    h * 0.53,
    width * 0.9,
    h * 0.31,
    width,
    0.02,
  );
  shape.quadraticCurveTo(0, -height * 0.06, -width, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width * 0.9,
    bevelEnabled: true,
    bevelSize: width * 0.22,
    bevelThickness: width * 0.15,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 5,
  });
  geometry.translate(0, 0, -width * 0.45);
  const m = new THREE.Mesh(geometry, glowing(color));
  root.add(m);
  root.rotation.y = Math.sin(delay) * 0.5;
}
function flames(p, phase, palette, size = 1) {
  const root = group(p);
  root.scale.setScalar(size);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    flame(root, phase, palette.outer, {
      x: Math.cos(a) * 0.1,
      z: Math.sin(a) * 0.1,
      width: 0.15,
      height: 0.52 + i * 0.08,
      delay: i * 1.8,
    });
  }
  flame(root, phase, palette.middle, {
    width: 0.145,
    height: 0.72,
    z: 0.085,
    delay: 0.5,
  });
  flame(root, phase, palette.core, {
    width: 0.082,
    height: 0.38,
    z: 0.15,
    x: 0.055,
    delay: 1.1,
  });
  for (let i = 0; i < 5; i++) {
    const age = (phase + i / 5) % 1;
    ember(
      root,
      Math.sin(i * 4 + age * 3) * 0.24,
      0.4 + age * 1.05,
      Math.cos(i * 3) * 0.15,
      i % 2 ? palette.middle : palette.core,
      0.015 + (1 - age) * 0.018,
      1 - Math.floor(age * 4) / 4,
    );
  }
}
function smoke(p, phase, baseY, soot) {
  if (!soot) return;
  for (let i = 0; i < 5; i++) {
    const age = (phase + i / 5) % 1;
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(1, 7, 5),
      glowing("#8a8c8b", 0.2 - Math.floor(age * 4) * 0.04),
    );
    cloud.position.set(
      Math.sin(i * 2 + age * 2) * 0.075 + age * 0.32,
      baseY + age * 1.25,
      -0.1 - age * 0.17,
    );
    cloud.scale.set(0.12 + age * 0.17, 0.13 + age * 0.13, 0.1 + age * 0.12);
    p.add(cloud);
  }
}
function camp(p, phase, palette) {
  cylinder(p, "#59493b", 0, 0.055, 0, 0.36, 0.43, 0.08, 10);
  for (let i = 0; i < 9; i++) {
    const a = (i * TAU) / 9;
    ball(
      p,
      i % 2 ? "#888578" : "#a79d85",
      Math.cos(a) * 0.45,
      0.1,
      Math.sin(a) * 0.45,
      0.13,
      0.09,
      0.115,
    );
  }
  for (const side of [-1, 1]) {
    const log = group(p, side * 0.14, 0.13, 0);
    log.rotation.y = side * 0.55;
    cylinder(log, "#6b4937", 0, 0, 0, 0.072, 0.072, 0.67, 7).rotation.x =
      Math.PI / 2;
    cylinder(log, "#b18a58", 0, 0, 0.337, 0.058, 0.058, 0.01, 7).rotation.x =
      Math.PI / 2;
  }
  const fire = group(p, 0, 0.18, 0);
  flames(fire, phase, palette, 0.85);
  return 0.18;
}
function brazier(p, phase, palette) {
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      const leg = box(
        p,
        "#636666",
        side * 0.22,
        0.35,
        end * 0.22,
        0.065,
        0.65,
        0.065,
      );
      leg.rotation.z = -side * 0.13;
    }
  cylinder(p, "#666765", 0, 0.72, 0, 0.36, 0.22, 0.21, 8);
  cylinder(p, "#9b9271", 0, 0.835, 0, 0.37, 0.37, 0.035, 8);
  cylinder(p, "#443e3c", 0, 0.84, 0, 0.31, 0.28, 0.028, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    box(
      p,
      "#77746a",
      Math.cos(a) * 0.32,
      0.9,
      Math.sin(a) * 0.32,
      0.045,
      0.17,
      0.045,
    );
  }
  flames(group(p, 0, 0.85, 0), phase, palette);
  return 0.85;
}
function hearth(p, phase, palette) {
  box(p, "#7d7870", 0, 0.1, 0.04, 1.35, 0.18, 0.9);
  box(p, "#514c47", 0, 0.62, -0.28, 1.19, 1.1, 0.26);
  for (const x of [-0.52, 0.52])
    for (let row = 0; row < 4; row++)
      box(
        p,
        row % 2 ? "#908572" : "#a2977e",
        x,
        0.3 + row * 0.25,
        0.07,
        0.22,
        0.235,
        0.49,
      );
  box(p, "#aaa087", 0, 1.2, 0.035, 1.4, 0.19, 0.69);
  box(p, "#847d6f", 0, 1.4, -0.12, 0.8, 0.3, 0.47);
  for (const x of [-0.2, 0.2])
    cylinder(p, "#73513a", x, 0.24, 0.1, 0.07, 0.07, 0.57, 7).rotation.x =
      Math.PI / 2;
  flames(group(p, 0, 0.24, 0.17), phase, palette, 0.85);
  return 0.24;
}
const sculpt = { camp, brazier, hearth };
export function fireProp(kind, phase = 0, color = "hearth", smoky = true) {
  const s = scene();
  s.traverse((o) => {
    if (o.isHemisphereLight) o.intensity = 0.7;
    if (o.isDirectionalLight) o.intensity = 0.65;
  });
  const root = group(s),
    palette = FIRE_COLORS[color];
  const base = sculpt[kind](root, phase, palette);
  if (kind !== "hearth") smoke(root, phase, base + 0.7, smoky);
  const light = new THREE.PointLight(
    palette.light,
    4 + Math.sin(phase * TAU) * 0.6,
    3.5,
    1.3,
  );
  light.position.set(0.08, base + 0.4, 0.3);
  s.add(light);
  return s;
}
export function nightCourt() {
  const s = scene();
  s.traverse((o) => {
    if (o.isHemisphereLight) o.intensity = 0.6;
    if (o.isDirectionalLight) o.intensity = 0.5;
  });
  for (let x = -5; x <= 5; x++)
    for (let z = -2; z <= 3; z++)
      box(
        s,
        ["#657069", "#5c6968", "#707671"][(x * x + z * z) % 3],
        x,
        -0.12,
        z,
        0.98,
        0.18,
        0.98,
      );
  for (const x of [-4.6, 4.6]) {
    box(s, "#6c726b", x, 0.4, -2.2, 0.55, 0.8, 0.65);
    box(s, "#858879", x, 0.86, -2.2, 0.7, 0.12, 0.75);
  }
  return s;
}

export function fireCourt(phase, color) {
  const s = nightCourt();
  for (const [kind, x] of [
    ["camp", -2.6],
    ["brazier", 0],
    ["hearth", 2.6],
  ]) {
    const source = fireProp(kind, phase, color);
    const placed = group(s, x, 0, 0.25);
    for (const child of [...source.children])
      if (child.isGroup || child.isPointLight) placed.add(child);
  }
  return s;
}
