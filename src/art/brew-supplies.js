// Accepted brewing-supply primitives. Content visibility is supplied by callers.
import * as THREE from "three";
import { ball, box, group, mesh } from "./geometry.js";

const P = Object.freeze({
  wood: "#785037",
  light: "#b48b5c",
  end: "#d2b77e",
  dark: "#423d38",
  iron: "#484c49",
  cream: "#d3c4a1",
  cloth: "#a6b5a0",
  plum: "#65455b",
  cord: "#c5a76d",
  wax: "#a24d43",
  grain: "#a88e52",
  wet: "#4f4135",
});

function ring(p, color, y, radius, thickness) {
  const m = mesh(
    p,
    new THREE.TorusGeometry(radius, thickness, 4, 12),
    color,
    0,
    y,
    0,
  );
  m.rotation.x = Math.PI / 2;
  return m;
}

export function barmCrock(parent) {
  const g = group(parent);
  g.name = "barm-crock";
  const profile = [
    [0, 0.025],
    [0.17, 0.025],
    [0.23, 0.07],
    [0.26, 0.2],
    [0.25, 0.35],
    [0.2, 0.42],
    [0.2, 0.48],
    [0, 0.48],
  ];
  mesh(
    g,
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      12,
    ),
    P.cream,
    0,
    0,
    0,
  );
  ring(g, P.plum, 0.09, 0.205, 0.017);
  ring(g, P.plum, 0.365, 0.237, 0.014);
  ball(g, P.cloth, 0, 0.495, 0, 0.245, 0.04, 0.245);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const fold = box(
      g,
      i % 2 ? P.cloth : "#91a18a",
      Math.sin(a) * 0.22,
      0.45 - (i % 3) * 0.008,
      Math.cos(a) * 0.22,
      0.115,
      0.105,
      0.026,
    );
    fold.rotation.y = a;
  }
  ring(g, P.cord, 0.461, 0.232, 0.014);
  const tag = box(g, P.plum, 0.014, 0.247, 0.258, 0.125, 0.145, 0.015);
  tag.rotation.z = -0.07;
  for (const [x, y, r] of [
    [0, 0.25, 0.028],
    [-0.026, 0.28, 0.017],
    [0.025, 0.22, 0.016],
  ])
    ball(g, P.cream, x, y, 0.272, r, r, 0.007);
  return g;
}

export function spentGrainTray(parent, filled = false) {
  const g = group(parent);
  g.name = "spent-grain-tray";
  const body = group(g);
  body.name = "tray-body";
  box(body, P.dark, 0, 0.026, 0, 0.7, 0.052, 0.48);
  for (let i = 0; i < 4; i++)
    box(
      body,
      i % 2 ? P.wood : P.light,
      -0.255 + i * 0.17,
      0.055,
      0,
      0.162,
      0.027,
      0.434,
    );
  for (const x of [-0.35, 0.35]) box(body, P.wood, x, 0.1, 0, 0.045, 0.14, 0.5);
  for (const z of [-0.25, 0.25])
    box(body, P.light, 0, 0.1, z, 0.745, 0.14, 0.035);
  for (const x of [-0.265, 0.265])
    for (const z of [-0.254, 0.254])
      box(body, P.iron, x, 0.1, z, 0.022, 0.075, 0.012);
  if (filled) {
    const contents = group(g);
    contents.name = "spent-grain-contents";
    ball(contents, P.wet, 0, 0.1, 0, 0.315, 0.08, 0.195);
    for (let i = 0; i < 23; i++) {
      const a = i * 2.399963229728653;
      const radius = Math.sqrt((i + 0.5) / 23);
      const x = Math.cos(a) * radius * 0.283;
      const z = Math.sin(a) * radius * 0.167;
      const y = 0.115 + (1 - radius * radius) * 0.072;
      const grain = ball(
        contents,
        i % 4 ? "#826047" : P.grain,
        x,
        y,
        z,
        0.027,
        0.016,
        0.014,
      );
      grain.rotation.y = a;
    }
  }
  return g;
}

export function brewerCache(parent, sealed = true) {
  const g = group(parent);
  g.name = "brewer-cache";
  for (const x of [-0.34, 0.34])
    for (const z of [-0.28, 0.28]) box(g, P.dark, x, 0.06, z, 0.13, 0.12, 0.13);
  box(g, P.dark, 0, 0.405, 0, 0.85, 0.65, 0.67);
  for (const z of [-0.344, 0.344])
    for (let i = 0; i < 5; i++)
      box(
        g,
        i % 3 ? P.wood : P.light,
        -0.336 + i * 0.168,
        0.41,
        z,
        0.158,
        0.6,
        0.035,
      );
  for (const x of [-0.442, 0.442])
    for (let i = 0; i < 4; i++)
      box(
        g,
        i % 2 ? P.wood : P.light,
        x,
        0.41,
        -0.252 + i * 0.168,
        0.035,
        0.6,
        0.158,
      );
  for (const y of [0.15, 0.64]) {
    for (const z of [-0.369, 0.369])
      box(g, P.dark, 0, y, z, 0.935, 0.075, 0.045);
    for (const x of [-0.47, 0.47]) box(g, P.dark, x, y, 0, 0.045, 0.075, 0.755);
  }
  for (let i = 0; i < 5; i++)
    box(
      g,
      i % 2 ? P.light : P.wood,
      -0.368 + i * 0.184,
      0.767,
      0,
      0.175,
      0.074,
      0.79,
    );
  for (const x of [-0.285, 0.285]) {
    box(g, P.iron, x, 0.814, 0, 0.065, 0.025, 0.805);
    for (const z of [-0.373, 0.373])
      box(g, P.iron, x, 0.705, z, 0.065, 0.17, 0.028);
  }
  box(g, P.iron, 0, 0.65, 0.395, 0.12, 0.17, 0.035);
  if (sealed) {
    const brace = box(g, P.light, 0, 0.841, 0, 0.88, 0.045, 0.105);
    brace.rotation.y = -0.56;
    box(g, P.cloth, 0, 0.732, 0.426, 0.12, 0.24, 0.017);
    ball(g, P.wax, 0, 0.702, 0.445, 0.061, 0.055, 0.014);
  } else box(g, P.end, 0.087, 0.65, 0.414, 0.072, 0.055, 0.035);
  return g;
}
