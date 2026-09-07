// Original Astra geometry and poses. These are art definitions, not animal AI.
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
const INK = "#454036";
export const ANIMALS = {
  donkey: {
    name: "Donkey",
    role: "A patient travelling companion",
    pack: true,
  },
  llama: { name: "Llama", role: "Wool, luggage, strong opinions", pack: true },
  cow: { name: "Cow", role: "A warm barn and fresh milk", pack: false },
  sheep: { name: "Sheep", role: "A very small wool factory", pack: false },
  chicken: {
    name: "Hen",
    role: "Eggs and unsolicited commentary",
    pack: false,
  },
};

function link(p, a, b, color, radius, endRadius = radius) {
  const from = new THREE.Vector3(...a),
    to = new THREE.Vector3(...b);
  const delta = to.clone().sub(from);
  const m = mesh(
    p,
    new THREE.CylinderGeometry(endRadius, radius, delta.length(), 6),
    color,
    ...from.add(to).multiplyScalar(0.5).toArray(),
  );
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return m;
}

function fourLegs(
  p,
  phase,
  pose,
  { y, spread, length, width, coat, sock = coat },
) {
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      const stride =
        pose === "walk"
          ? Math.sin(
              phase * TAU +
                (side < 0 ? Math.PI : 0) +
                (end < 0 ? Math.PI / 2 : 0),
            )
          : 0;
      const hip = group(p, side * spread, y, end * length);
      hip.rotation.x = stride * 0.29;
      const half = (y - 0.08) / 2;
      link(hip, [0, 0, 0], [0, -half, 0], coat, width, width * 0.75);
      const knee = group(hip, 0, -half, 0);
      knee.rotation.x = Math.max(0, -stride) * 0.35;
      link(knee, [0, 0, 0], [0, -half, 0.02], sock, width * 0.7, width * 0.6);
      box(knee, INK, 0, -half + 0.015, 0.04, width * 1.65, 0.115, width * 2.15);
    }
}

function ears(p, phase, { height, spread, width, color, inside, tilt = 0.16 }) {
  for (const side of [-1, 1]) {
    const ear = group(p, side * spread, 0.15, -0.04);
    ear.rotation.z =
      -side * (tilt + Math.max(0, Math.sin(phase * TAU + side * 1.7)) * 0.12);
    ball(ear, color, 0, height / 2, 0, width, height / 2, width * 0.65);
    ball(
      ear,
      inside,
      0,
      height / 2 + 0.01,
      width * 0.48,
      width * 0.48,
      height * 0.35,
      width * 0.2,
    );
  }
}

function eyes(p, x, y, z, phase) {
  const blink = phase === 0.75;
  for (const side of [-1, 1]) {
    ball(p, "#eee0bd", side * x, y + 0.01, z, 0.045, 0.05, 0.035);
    box(
      p,
      INK,
      side * (x + 0.005),
      y,
      z + 0.025,
      0.035,
      blink ? 0.013 : 0.039,
      0.026,
    );
  }
}

function swish(p, phase, y, z, color, tuft, size = 1) {
  const root = group(p, 0, y, z);
  root.rotation.z = Math.sin(phase * TAU) * 0.32;
  root.rotation.x = -0.3;
  link(
    root,
    [0, 0, 0],
    [0, -0.45 * size, -0.08],
    color,
    0.033 * size,
    0.022 * size,
  );
  ball(
    root,
    tuft,
    0,
    -0.45 * size,
    -0.08,
    0.065 * size,
    0.14 * size,
    0.07 * size,
  );
}

function packs(p, phase, y, width, blanket) {
  const load = group(p, 0, y, -0.06);
  load.rotation.z = Math.sin(phase * TAU) * 0.025;
  box(load, blanket, 0, 0, 0, width * 2 + 0.16, 0.13, 0.72);
  for (const side of [-1, 1]) {
    box(load, blanket, side * width, -0.2, 0, 0.07, 0.4, 0.72);
    for (const z of [-0.26, 0.25])
      box(load, "#dec691", side * (width + 0.04), -0.15, z, 0.035, 0.39, 0.042);
    const bag = group(load, side * (width + 0.13), -0.18, 0);
    bag.rotation.z = side * 0.08;
    box(bag, "#99704b", 0, -0.04, 0, 0.25, 0.39, 0.58);
    box(bag, "#c39b66", 0, 0.17, 0, 0.28, 0.085, 0.6);
    for (const z of [-0.15, 0.15])
      box(bag, "#544d3b", side * 0.14, -0.005, z, 0.025, 0.41, 0.04);
    box(bag, "#dfc388", side * 0.156, 0.02, -0.15, 0.02, 0.068, 0.065);
  }
  const roll = cylinder(load, "#829b87", 0, 0.2, -0.12, 0.12, 0.12, 0.74, 8);
  roll.rotation.z = Math.PI / 2;
  for (const x of [-0.22, 0.22]) {
    const tie = cylinder(
      load,
      "#514e3c",
      x,
      0.2,
      -0.12,
      0.125,
      0.125,
      0.035,
      8,
    );
    tie.rotation.z = Math.PI / 2;
  }
}

function donkey(p, phase, pose, loaded) {
  const gray = "#919082",
    pale = "#d4c9ac";
  fourLegs(p, phase, pose, {
    y: 0.88,
    spread: 0.22,
    length: 0.42,
    width: 0.09,
    coat: gray,
    sock: pale,
  });
  ball(p, gray, 0, 0.99, -0.06, 0.35, 0.36, 0.7);
  ball(p, "#a3a08c", 0, 1.2, -0.25, 0.29, 0.19, 0.42);
  swish(p, phase, 1.16, -0.7, gray, INK, 0.8);
  const neck = group(p, 0, 1.0, 0.44);
  neck.rotation.x =
    pose === "graze" ? 1.75 + Math.sin(phase * TAU) * 0.05 : -0.18;
  ball(neck, gray, 0, 0.23, 0.04, 0.23, 0.38, 0.25);
  const head = group(neck, 0, 0.53, 0.13);
  head.rotation.x = pose === "graze" ? -0.16 : Math.sin(phase * TAU) * 0.035;
  ball(head, gray, 0, -0.015, 0.1, 0.205, 0.24, 0.27);
  ball(head, pale, 0, -0.11, 0.32, 0.195, 0.145, 0.17);
  for (const side of [-1, 1])
    ball(head, "#68665a", side * 0.13, -0.07, 0.45, 0.027, 0.034, 0.017);
  eyes(head, 0.153, 0.045, 0.235, phase);
  ears(head, phase, {
    height: 0.43,
    spread: 0.12,
    width: 0.073,
    color: gray,
    inside: "#b2998a",
  });
  for (let i = 0; i < 5; i++)
    box(neck, "#57584f", 0, 0.08 + i * 0.11, -0.2, 0.075, 0.14, 0.085);
  if (loaded) {
    packs(p, phase, 1.28, 0.35, "#697e79");
    box(head, "#5b5343", 0, -0.025, 0.3, 0.41, 0.045, 0.045);
  }
}

function llama(p, phase, pose, loaded) {
  const wool = "#d6c7a5",
    shade = "#bca88c";
  fourLegs(p, phase, pose, {
    y: 0.92,
    spread: 0.205,
    length: 0.34,
    width: 0.087,
    coat: shade,
  });
  ball(p, wool, 0, 1.02, -0.1, 0.36, 0.4, 0.59);
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++)
      ball(
        p,
        i % 2 ? wool : "#c9b996",
        side * 0.265,
        0.95 + (i % 2) * 0.09,
        -0.48 + i * 0.24,
        0.12,
        0.23,
        0.17,
      );
  const neck = group(p, 0, 0.94, 0.31);
  neck.rotation.x =
    pose === "graze" ? 1.85 + Math.sin(phase * TAU) * 0.03 : -0.06;
  ball(neck, wool, 0, 0.43, 0, 0.185, 0.6, 0.21);
  const head = group(neck, 0, 0.98, 0.065);
  head.rotation.z = pose === "idle" ? Math.sin(phase * TAU) * 0.035 : 0;
  ball(head, wool, 0, 0, 0.03, 0.19, 0.22, 0.2);
  ball(head, "#ac8c70", 0, -0.075, 0.23, 0.14, 0.12, 0.135);
  ball(head, "#746252", 0, -0.055, 0.345, 0.065, 0.041, 0.021);
  eyes(head, 0.142, 0.03, 0.17, phase);
  ears(head, phase, {
    height: 0.25,
    spread: 0.125,
    width: 0.062,
    color: wool,
    inside: "#b09888",
    tilt: 0.1,
  });
  for (const x of [-0.11, 0, 0.11])
    ball(head, "#e2d3b0", x, 0.165, 0.11, 0.095, 0.085, 0.12);
  const tail = group(p, 0, 1.1, -0.62);
  tail.rotation.z = Math.sin(phase * TAU) * 0.4;
  ball(tail, wool, 0, 0.07, -0.06, 0.09, 0.18, 0.15);
  if (loaded) packs(p, phase, 1.36, 0.35, "#a96559");
}

function cow(p, phase, pose) {
  const cream = "#dfd0ae",
    patch = "#987154";
  fourLegs(p, phase, pose, {
    y: 0.94,
    spread: 0.32,
    length: 0.49,
    width: 0.105,
    coat: cream,
  });
  ball(p, cream, 0, 1.09, -0.1, 0.47, 0.44, 0.83);
  for (const side of [-1, 1]) {
    ball(p, patch, side * 0.35, 1.2, -0.5, 0.18, 0.3, 0.29);
    ball(p, patch, side * 0.42, 1.08, 0.25, 0.075, 0.23, 0.25);
  }
  ball(p, "#bf9482", 0, 0.63, -0.3, 0.22, 0.13, 0.23);
  for (const x of [-0.1, 0.1])
    for (const z of [-0.2, -0.38])
      cylinder(p, "#c49b85", x, 0.51, z, 0.027, 0.024, 0.12, 6);
  swish(p, phase, 1.33, -0.86, cream, patch);
  const neck = group(p, 0, pose === "graze" ? 0.79 : 1.11, 0.6);
  neck.rotation.x =
    pose === "graze" ? 1.35 + Math.sin(phase * TAU) * 0.04 : -0.06;
  ball(neck, patch, 0, 0.03, 0.18, 0.32, 0.3, 0.35);
  const head = group(neck, 0, 0.12, 0.36);
  ball(head, cream, 0, 0, 0.03, 0.25, 0.31, 0.24);
  ball(head, "#bc9280", 0, -0.17, 0.21, 0.25, 0.13, 0.17);
  for (const side of [-1, 1]) {
    ball(head, "#75564c", side * 0.135, -0.15, 0.35, 0.035, 0.024, 0.015);
    const ear = ball(head, patch, side * 0.32, 0.1, -0.03, 0.16, 0.07, 0.08);
    ear.rotation.z = side * (0.14 + Math.sin(phase * TAU) * 0.12);
    link(
      head,
      [side * 0.17, 0.22, -0.04],
      [side * 0.3, 0.36, -0.05],
      "#c4b491",
      0.06,
      0.026,
    );
    link(
      head,
      [side * 0.3, 0.36, -0.05],
      [side * 0.26, 0.45, -0.07],
      "#e0d5b2",
      0.027,
      0.005,
    );
  }
  eyes(head, 0.185, 0.07, 0.18, phase);
  box(neck, "#69776a", 0, -0.15, -0.02, 0.55, 0.075, 0.42);
  cylinder(neck, "#b79a59", 0, -0.31, 0.22, 0.045, 0.09, 0.11, 6);
}

function sheep(p, phase, pose) {
  const fleece = "#dbcfaf",
    face = "#786b59";
  fourLegs(p, phase, pose, {
    y: 0.51,
    spread: 0.19,
    length: 0.28,
    width: 0.061,
    coat: face,
  });
  ball(p, fleece, 0, 0.64, -0.05, 0.34, 0.34, 0.49);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    ball(
      p,
      i % 3 ? fleece : "#c6b89b",
      Math.cos(a) * 0.24,
      0.73 + (i % 2) * 0.09,
      Math.sin(a) * 0.34,
      0.17,
      0.19,
      0.19,
    );
  }
  const head = group(p, 0, 0.69, 0.37);
  head.rotation.x =
    pose === "graze" ? 0.95 + Math.sin(phase * TAU) * 0.06 : -0.13;
  ball(head, face, 0, -0.035, 0.12, 0.145, 0.205, 0.23);
  ball(head, "#93836b", 0, -0.11, 0.29, 0.105, 0.105, 0.095);
  for (const side of [-1, 1]) {
    const ear = ball(head, face, side * 0.2, 0.04, 0.025, 0.12, 0.042, 0.07);
    ear.rotation.z = side * (0.16 + Math.sin(phase * TAU) * 0.13);
    ball(head, fleece, side * 0.07, 0.145, 0.065, 0.11, 0.095, 0.12);
  }
  eyes(head, 0.11, 0.02, 0.25, phase);
  const tail = group(p, 0, 0.69, -0.47);
  tail.rotation.x = Math.sin(phase * TAU) * 0.16;
  ball(tail, fleece, 0, -0.07, -0.01, 0.09, 0.17, 0.1);
}

function chicken(p, phase, pose) {
  const coat = "#b0804e",
    wing = "#dbb87b";
  const stride = pose === "walk" ? Math.sin(phase * TAU) : 0;
  for (const side of [-1, 1]) {
    const hip = group(p, side * 0.075, 0.2, 0);
    hip.rotation.x = stride * side * 0.45;
    link(hip, [0, 0, 0], [0, -0.16, 0.025], "#bc995b", 0.018);
    for (const spread of [-1, 0, 1])
      link(
        hip,
        [0, -0.16, 0.025],
        [spread * 0.045, -0.17, 0.1],
        "#bc995b",
        0.012,
      );
  }
  ball(p, coat, 0, 0.36, 0, 0.18, 0.23, 0.27);
  for (const side of [-1, 1]) {
    const root = group(p, side * 0.15, 0.39, -0.035);
    root.rotation.z =
      side *
      (0.12 + (pose === "idle" ? Math.max(0, Math.sin(phase * TAU)) * 0.1 : 0));
    ball(root, wing, 0, -0.02, -0.025, 0.055, 0.15, 0.18);
  }
  const tail = group(p, 0, 0.41, -0.2);
  tail.rotation.x = -0.55;
  for (let i = -1; i <= 1; i++) {
    const feather = ball(
      tail,
      i ? coat : "#665a47",
      i * 0.06,
      0.12,
      0,
      0.055,
      0.19,
      0.055,
    );
    feather.rotation.z = -i * 0.25;
  }
  const peck = pose === "graze" ? (1 + Math.sin(phase * TAU)) / 2 : 0;
  const head = group(p, 0, 0.54 - peck * 0.22, 0.16 + peck * 0.09);
  head.rotation.x = pose === "graze" ? 0.2 + peck * 1.35 : stride * 0.09;
  if (pose === "idle") head.rotation.y = Math.sin(phase * TAU) * 0.18;
  ball(head, wing, 0, 0.045, 0.03, 0.105, 0.14, 0.115);
  for (let i = 0; i < 3; i++)
    ball(
      head,
      "#ad5346",
      0,
      0.185 + (i === 1 ? 0.025 : 0),
      -0.04 + i * 0.055,
      0.026,
      0.047,
      0.037,
    );
  const beak = mesh(
    head,
    new THREE.ConeGeometry(0.047, 0.13, 4),
    "#d9b15f",
    0,
    0.015,
    0.175,
  );
  beak.rotation.x = Math.PI / 2;
  ball(head, "#ad5346", 0, -0.055, 0.1, 0.032, 0.064, 0.039);
  for (const side of [-1, 1])
    ball(head, INK, side * 0.088, 0.07, 0.092, 0.019, 0.023, 0.015);
}

const sculpt = { donkey, llama, cow, sheep, chicken };
export function animal(
  kind,
  phase = 0,
  facing = 0,
  pose = "idle",
  loaded = false,
) {
  const s = scene(),
    root = group(s);
  root.rotation.y = facing;
  const body = group(root);
  if (pose === "walk")
    body.position.y = Math.abs(Math.sin(phase * TAU)) * 0.018;
  else body.scale.y = 1 + Math.sin(phase * TAU) * 0.006;
  sculpt[kind](body, phase, pose, loaded);
  return s;
}

export function pasture() {
  const s = scene();
  for (let x = -6; x <= 6; x++)
    for (let z = -3; z <= 4; z++) {
      const n = (x * x * 7 + z * z * 11 + x * z + 111) % 5;
      const trail = x > 0 && z < 0;
      box(
        s,
        trail
          ? ["#a99568", "#b09c70"][n % 2]
          : ["#85915f", "#909e6c", "#879664", "#8a9764", "#949e6b"][n],
        x,
        -0.08,
        z,
        1.005,
        0.14,
        1.005,
      );
      if (!trail && n < 2)
        for (let i = 0; i < 3; i++)
          box(
            s,
            "#697f53",
            x + 0.25 + i * 0.07,
            0.06,
            z + 0.3,
            0.035,
            0.12 + i * 0.025,
            0.04,
          ).rotation.z = (i - 1) * 0.3;
    }
  for (let x = -6; x <= 6; x += 2) {
    box(s, "#8f7651", x, 0.47, -3.4, 0.13, 0.98, 0.13);
    if (x < 6)
      for (const y of [0.29, 0.66])
        box(s, "#a58b5e", x + 1, y, -3.4, 2.02, 0.105, 0.08);
  }
  for (const z of [-3, -1, 1, 3]) {
    box(s, "#8f7651", -6.4, 0.47, z, 0.13, 0.98, 0.13);
    if (z < 3)
      for (const y of [0.29, 0.66])
        box(s, "#a58b5e", -6.4, y, z + 1, 0.08, 0.105, 2.02);
  }
  const trough = group(s, -3.6, 0, -2.45);
  box(trough, "#786952", 0, 0.22, 0, 1.5, 0.35, 0.6);
  box(trough, "#668785", 0, 0.4, 0, 1.28, 0.025, 0.4);
  for (const x of [-0.76, 0.76])
    box(trough, "#b3a080", x, 0.28, 0, 0.08, 0.43, 0.67);
  for (const z of [-0.3, 0.3])
    box(trough, "#a59371", 0, 0.42, z, 1.58, 0.11, 0.08);
  return s;
}
