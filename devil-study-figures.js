// Original Astra-authored creatures. Only programmable geometry enters the bake.
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
export const DEMONS = {
  devil: { name: "The Devil", note: "An impeccably polite opponent." },
  imp: { name: "Moth page", note: "Has definitely counted your pieces." },
  porter: { name: "Cinder porter", note: "Your luggage. Your secrets." },
};

function taperedLink(parent, from, to, color, a, b) {
  const start = new THREE.Vector3(...from),
    end = new THREE.Vector3(...to);
  const delta = end.clone().sub(start);
  const link = mesh(
    parent,
    new THREE.CylinderGeometry(b, a, delta.length(), 6),
    color,
    ...start.add(end).multiplyScalar(0.5).toArray(),
  );
  link.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return link;
}

function horn(parent, points, color, width) {
  for (let i = 1; i < points.length; i++)
    taperedLink(
      parent,
      points[i - 1],
      points[i],
      color,
      width * (1 - (i - 1) / (points.length - 1)),
      Math.max(0.003, width * (1 - i / (points.length - 1))),
    );
}

function tail(parent, phase, color, length = 1) {
  const sway = Math.sin(phase * TAU) * 0.1;
  const points = [
    [0, 0.68, -0.15],
    [0.22, 0.43, -0.37],
    [0.51, 0.31, -0.32],
    [0.69, 0.46 + sway, -0.1],
    [0.66, 0.72 + sway, 0.03],
  ].map(([x, y, z]) => new THREE.Vector3(x * length, y * length, z * length));
  mesh(
    parent,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      12,
      0.03 * length,
      5,
      false,
    ),
    color,
    0,
    0,
    0,
  );
  const tip = group(parent, ...points.at(-1).toArray());
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.19);
  shape.lineTo(-0.09, 0.025);
  shape.quadraticCurveTo(-0.08, -0.05, 0, 0.0);
  shape.quadraticCurveTo(0.08, -0.05, 0.09, 0.025);
  shape.closePath();
  mesh(
    tip,
    new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false }),
    color,
    0,
    0,
    0,
  );
  tip.rotation.z = -0.22 + sway;
}

function legs(parent, phase, pose, { hip, spread, cloth, shoe, width }) {
  const stride = pose === "walk" ? Math.sin(phase * TAU) : 0;
  const half = (hip - 0.12) / 2;
  for (const side of [-1, 1]) {
    const thigh = group(parent, side * spread, hip, 0);
    thigh.rotation.x = side * stride * 0.4;
    box(thigh, cloth, 0, -half / 2, 0, width, half, width);
    const knee = group(thigh, 0, -half, 0);
    knee.rotation.x = Math.max(0, -side * stride) * 0.52;
    box(knee, cloth, 0, -half / 2, 0, width * 0.82, half, width * 0.9);
    box(knee, shoe, 0, -half + 0.025, 0.055, width * 1.05, 0.12, width * 1.7);
  }
}

function arm(parent, side, y, spread, color, skin, phase, pose, length = 0.28) {
  const shoulder = group(parent, side * spread, y, 0);
  shoulder.rotation.z = side * 0.13;
  shoulder.rotation.x =
    pose === "walk" ? -side * Math.sin(phase * TAU) * 0.3 : -0.08;
  if (pose === "offer" && side === -1)
    shoulder.rotation.x = -0.95 - Math.sin(phase * TAU) * 0.24;
  box(shoulder, color, 0, -length / 2, 0, 0.135, length, 0.15);
  const elbow = group(shoulder, 0, -length, 0);
  elbow.rotation.x = pose === "offer" && side === -1 ? -0.65 : -0.15;
  box(elbow, color, 0, -length * 0.42, 0, 0.105, length * 0.85, 0.12);
  const hand = group(elbow, 0, -length * 0.88, 0.02);
  ball(hand, skin, 0, -0.025, 0, 0.057, 0.065, 0.056);
  return hand;
}

function chessPiece(parent, color, x = 0, y = 0, z = 0, size = 1) {
  const piece = group(parent, x, y, z);
  piece.scale.setScalar(size);
  cylinder(piece, color, 0, 0, 0, 0.052, 0.075, 0.035, 8);
  cylinder(piece, color, 0, 0.07, 0, 0.022, 0.04, 0.13, 6);
  ball(piece, color, 0, 0.145, 0, 0.048, 0.052, 0.048);
}

function devil(parent, phase, pose) {
  const skin = "#b95c54",
    coat = "#563c54",
    ink = "#302e3f";
  legs(parent, phase, pose, {
    hip: 1.01,
    spread: 0.1,
    cloth: "#423644",
    shoe: ink,
    width: 0.14,
  });
  tail(parent, phase, "#984948");
  const torso = group(parent, 0, 1.02, 0);
  cylinder(torso, coat, 0, 0.25, 0, 0.24, 0.17, 0.54, 8).scale.z = 0.65;
  for (const side of [-1, 1]) {
    const skirt = group(parent, side * 0.11, 1.02, -0.09);
    skirt.rotation.x =
      0.12 +
      Math.sin(phase * TAU + side * 0.4) * (pose === "walk" ? 0.1 : 0.025);
    taperedLink(
      skirt,
      [0, 0, 0],
      [side * 0.06, -0.45, -0.035],
      coat,
      0.115,
      0.035,
    );
  }
  box(parent, "#bd7c59", 0, 1.26, 0.148, 0.18, 0.43, 0.035);
  for (const y of [1.16, 1.28, 1.4])
    ball(parent, "#e0c282", 0.045, y, 0.173, 0.025, 0.022, 0.017);
  for (const side of [-1, 1]) {
    const lapel = box(
      parent,
      "#936274",
      side * 0.12,
      1.4,
      0.13,
      0.11,
      0.29,
      0.035,
    );
    lapel.rotation.z = -side * 0.35;
  }
  box(parent, "#eee0b9", 0, 1.51, 0.06, 0.28, 0.065, 0.22);
  box(parent, "#d5c998", 0.015, 1.43, 0.18, 0.075, 0.15, 0.034).rotation.z =
    -0.16;
  const hand = arm(parent, -1, 1.45, 0.24, coat, "#e0cfa7", phase, pose);
  arm(parent, 1, 1.45, 0.24, coat, "#e0cfa7", phase, pose);
  if (pose === "offer") chessPiece(hand, "#dbc799", 0, 0.06, 0.03, 1.2);
  cylinder(parent, skin, 0, 1.59, 0, 0.07, 0.07, 0.16, 7);
  const head = group(parent, 0, 1.78, 0);
  head.rotation.y = Math.sin(phase * TAU) * 0.055;
  ball(head, skin, 0, 0.01, 0, 0.17, 0.21, 0.145);
  box(head, skin, 0, -0.1, 0.04, 0.2, 0.12, 0.19);
  ball(head, "#d78265", 0, -0.025, 0.145, 0.043, 0.071, 0.078);
  ball(head, ink, 0, 0.135, -0.055, 0.18, 0.11, 0.155);
  box(head, ink, 0, 0.085, 0.125, 0.09, 0.12, 0.05).rotation.z = -0.33;
  cylinder(head, ink, 0, -0.18, 0.105, 0.044, 0.007, 0.115, 5).rotation.x =
    -0.22;
  for (const side of [-1, 1]) {
    box(head, "#e6bd68", side * 0.079, 0.018, 0.13, 0.048, 0.035, 0.03);
    box(head, ink, side * 0.078, 0.059, 0.14, 0.088, 0.028, 0.027).rotation.z =
      -side * 0.17;
    horn(
      head,
      [
        [side * 0.13, 0.14, -0.07],
        [side * 0.28, 0.28, -0.08],
        [side * 0.3, 0.48, -0.12],
        [side * 0.18, 0.6, -0.15],
      ],
      "#c9c4a5",
      0.085,
    );
    ball(head, skin, side * 0.18, -0.005, -0.015, 0.08, 0.045, 0.05);
  }
}

function wing(parent, side, phase, color) {
  const root = group(parent, side * 0.1, 0.8, -0.08);
  root.rotation.y = side * (0.15 + Math.sin(phase * TAU) * 0.12);
  const points = [
    [0, 0],
    [0.28 * side, 0.23],
    [0.54 * side, 0.12],
    [0.43 * side, -0.03],
    [0.34 * side, 0.015],
    [0.27 * side, -0.15],
    [0.17 * side, -0.1],
    [0.12 * side, -0.27],
  ];
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  mesh(
    root,
    new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false }),
    color,
    0,
    0,
    0,
  );
  taperedLink(
    root,
    [0, 0, 0.04],
    [side * 0.28, 0.23, 0.04],
    "#4f4a65",
    0.035,
    0.015,
  );
  taperedLink(
    root,
    [side * 0.28, 0.23, 0.04],
    [side * 0.54, 0.12, 0.04],
    "#4f4a65",
    0.02,
    0.005,
  );
}

function imp(parent, phase, pose) {
  const skin = "#827197";
  legs(parent, phase, pose, {
    hip: 0.42,
    spread: 0.085,
    cloth: skin,
    shoe: "#454456",
    width: 0.11,
  });
  tail(parent, phase + 0.2, skin, 0.7);
  for (const side of [-1, 1]) wing(parent, side, phase, "#b589a8");
  ball(parent, skin, 0, 0.57, 0, 0.18, 0.23, 0.15);
  box(parent, "#514555", 0, 0.64, 0.13, 0.2, 0.22, 0.05);
  box(parent, "#c7b77e", 0, 0.71, 0.16, 0.17, 0.042, 0.02);
  const hand = arm(parent, -1, 0.69, 0.17, skin, skin, phase, pose, 0.15);
  arm(parent, 1, 0.69, 0.17, skin, skin, phase, pose, 0.15);
  chessPiece(hand, "#333b46", 0, 0.07, 0.04, 1.25);
  const head = group(parent, 0, 0.98, 0.015);
  head.rotation.z = Math.sin(phase * TAU) * 0.08;
  ball(head, skin, 0, 0, 0, 0.21, 0.19, 0.17);
  for (const side of [-1, 1]) {
    const ear = ball(
      head,
      skin,
      side * 0.23,
      0.055,
      -0.025,
      0.145,
      0.063,
      0.065,
    );
    ear.rotation.z = side * 0.42;
    ball(head, "#caafa5", side * 0.25, 0.065, 0.02, 0.07, 0.022, 0.021);
    ball(head, "#d6dfb1", side * 0.081, 0.017, 0.153, 0.048, 0.055, 0.023);
    box(head, "#384148", side * 0.081, 0.018, 0.175, 0.018, 0.05, 0.012);
    horn(
      head,
      [
        [side * 0.12, 0.12, -0.04],
        [side * 0.18, 0.29, -0.09],
        [side * 0.08, 0.32, -0.12],
      ],
      "#ddd0ae",
      0.045,
    );
  }
  ball(head, "#b88c98", 0, -0.055, 0.17, 0.045, 0.033, 0.037);
}

function porter(parent, phase, pose) {
  const skin = "#b97854",
    coat = "#4f685e";
  legs(parent, phase, pose, {
    hip: 0.55,
    spread: 0.16,
    cloth: "#674f45",
    shoe: "#433e3e",
    width: 0.18,
  });
  ball(parent, coat, 0, 0.88, 0, 0.34, 0.4, 0.26);
  box(parent, "#c4b18a", 0, 0.86, 0.24, 0.36, 0.42, 0.065);
  box(parent, "#67523e", 0, 0.68, 0.27, 0.4, 0.05, 0.04);
  ball(parent, "#d7b878", 0, 0.7, 0.305, 0.045, 0.035, 0.02);
  const hand = arm(parent, -1, 1.07, 0.32, coat, skin, phase, pose, 0.23);
  arm(parent, 1, 1.07, 0.32, coat, skin, phase, pose, 0.23);
  const bell = group(hand, 0, -0.03, 0.085);
  bell.rotation.x = Math.sin(phase * TAU) * (pose === "offer" ? 0.45 : 0.06);
  cylinder(bell, "#816643", 0, -0.03, 0, 0.022, 0.022, 0.12, 6);
  cylinder(bell, "#bd9a54", 0, -0.13, 0, 0.042, 0.1, 0.11, 8);
  const head = group(parent, 0, 1.38, 0.005);
  head.rotation.x = pose === "offer" ? Math.sin(phase * TAU) * 0.07 : 0;
  ball(head, skin, 0, 0, 0, 0.245, 0.23, 0.2);
  ball(head, "#cc966e", 0, -0.06, 0.18, 0.17, 0.085, 0.07);
  ball(head, "#9a644a", 0, -0.005, 0.24, 0.07, 0.04, 0.025);
  for (const side of [-1, 1]) {
    box(head, "#403b3e", side * 0.103, 0.055, 0.174, 0.05, 0.034, 0.025);
    box(
      head,
      "#dac5a1",
      side * 0.117,
      0.11,
      0.159,
      0.1,
      0.04,
      0.05,
    ).rotation.z = side * 0.13;
    horn(
      head,
      [
        [side * 0.19, 0.12, -0.01],
        [side * 0.35, 0.18, -0.1],
        [side * 0.44, 0.08, -0.08],
        [side * 0.43, -0.06, 0.06],
        [side * 0.31, -0.075, 0.16],
        [side * 0.27, 0.02, 0.19],
      ],
      "#c5b895",
      0.105,
    );
  }
}

const sculpt = { devil, imp, porter };
export function demon(kind, phase = 0, facing = 0, pose = "idle") {
  const s = scene(),
    root = group(s);
  root.rotation.y = facing;
  const body = group(
    root,
    0,
    pose === "walk" ? Math.abs(Math.sin(phase * TAU)) * 0.02 : 0,
    0,
  );
  if (pose === "idle") body.scale.y = 1 + Math.sin(phase * TAU) * 0.009;
  sculpt[kind](body, phase, pose);
  return s;
}

export function courtyard() {
  const s = scene();
  for (let x = -4; x <= 4; x++)
    for (let z = -2; z <= 3; z++) {
      const tone = ["#5a5b5d", "#626261", "#696762", "#545959"][
        (x * x + z * z + 3) % 4
      ];
      box(s, tone, x, -0.1, z, 0.97, 0.17, 0.97);
    }
  for (const x of [-3.6, 3.6]) {
    box(s, "#515452", x, 0.38, -2.2, 0.62, 0.76, 0.65);
    box(s, "#7c7970", x, 0.8, -2.2, 0.74, 0.12, 0.76);
    cylinder(s, "#aa9365", x, 0.97, -2.2, 0.065, 0.1, 0.2, 8);
    ball(s, "#e5c384", x, 1.12, -2.2, 0.055, 0.09, 0.055);
  }
  for (const [x, z] of [
    [-2.8, 2.1],
    [-2.4, 1.7],
    [3.0, 1.4],
    [2.4, -1.8],
  ])
    for (let i = 0; i < 3; i++)
      box(
        s,
        ["#657253", "#82815b", "#8a8d64"][i],
        x + i * 0.07,
        0.055 + i * 0.025,
        z,
        0.04,
        0.15,
        0.08,
      ).rotation.z = (i - 1) * 0.35;
  return s;
}

export function chessTable() {
  const s = scene();
  for (const x of [-0.42, 0.42])
    for (const z of [-0.42, 0.42])
      box(s, "#65473e", x, 0.44, z, 0.09, 0.88, 0.09);
  box(s, "#775143", 0, 0.92, 0, 1.25, 0.14, 1.25);
  box(s, "#c9ae76", 0, 1.002, 0, 1.08, 0.02, 1.08);
  for (let x = 0; x < 4; x++)
    for (let z = 0; z < 4; z++)
      box(
        s,
        (x + z) % 2 ? "#9b5353" : "#dbca97",
        (x - 1.5) * 0.245,
        1.022,
        (z - 1.5) * 0.245,
        0.239,
        0.025,
        0.239,
      );
  for (const x of [-0.365, 0.12, 0.365])
    chessPiece(s, "#383940", x, 1.06, -0.365, 0.7);
  for (const x of [-0.365, -0.12, 0.365])
    chessPiece(s, "#e3d7b2", x, 1.06, 0.365, 0.7);
  chessPiece(s, "#383940", 0.12, 1.06, 0.12, 0.7);
  return s;
}
