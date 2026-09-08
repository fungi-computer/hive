// Original Astra-authored reusable brewhouse geometry. No simulation state.
import * as THREE from "three";
import { box, ball, cylinder, mesh, group } from "../../art/geometry.js";
import { mugwortBundle } from "../../art/herbs.js";
import { kettleBody, kettlePaddle } from "../../art/brew-vessel.js";
import { brewKeg } from "../../art/brew-supplies.js";
import { pail } from "../../art/pail.js";

export const PALETTE = {
  wood: "#785037",
  light: "#b48b5c",
  end: "#d2b77e",
  dark: "#423d38",
  copper: "#b86842",
  gold: "#e0a462",
  iron: "#484c49",
  stone: "#777868",
  sage: "#65836c",
  cream: "#d3c4a1",
  ale: "#b47737",
  plum: "#65455b",
};
const P = PALETTE;
function ring(p, c, x, y, z, radius, thickness = 0.025) {
  const m = mesh(
    p,
    new THREE.TorusGeometry(radius, thickness, 4, 16),
    c,
    x,
    y,
    z,
  );
  m.rotation.x = Math.PI / 2;
  return m;
}
function beam(p, a, b, width, color = P.wood) {
  const d = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const m = box(
    p,
    color,
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
    width,
    d.length(),
    width,
  );
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
export function bottle(p, color = "#728e79", size = 1) {
  const g = group(p);
  g.scale.setScalar(size);
  cylinder(g, color, 0, 0.14, 0, 0.1, 0.12, 0.27, 8);
  ball(g, color, 0, 0.28, 0, 0.1, 0.065, 0.1);
  cylinder(g, color, 0, 0.35, 0, 0.04, 0.045, 0.13, 8);
  cylinder(g, P.end, 0, 0.42, 0, 0.047, 0.047, 0.055, 7);
  box(g, P.cream, 0, 0.16, 0.105, 0.105, 0.105, 0.014);
  box(g, "#adc9bd", -0.045, 0.21, 0.07, 0.018, 0.12, 0.018);
  return g;
}
export function tankard(p) {
  cylinder(p, "#947553", 0, 0.13, 0, 0.115, 0.1, 0.24, 10);
  for (const y of [0.045, 0.22]) ring(p, P.iron, 0, y, 0, 0.108, 0.014);
  cylinder(p, P.ale, 0, 0.254, 0, 0.085, 0.085, 0.01, 10);
  const handle = mesh(
    p,
    new THREE.TorusGeometry(0.08, 0.023, 4, 8),
    P.wood,
    0.13,
    0.13,
    0,
  );
  handle.rotation.y = Math.PI / 2;
  for (let i = 0; i < 4; i++)
    ball(
      p,
      P.cream,
      (i % 2) * 0.06 - 0.035,
      0.267,
      Math.floor(i / 2) * 0.05 - 0.025,
      0.042,
      0.016,
      0.035,
    );
}
export function fermenter(p) {
  const g = group(p);
  brewKeg(g, { size: 1.18 });
  for (const x of [-0.33, 0.33]) box(g, P.wood, x, 0.055, 0, 0.13, 0.11, 0.87);
  cylinder(g, P.copper, 0.06, 1.17, 0, 0.025, 0.025, 0.2, 8);
  ball(g, P.gold, 0.06, 1.27, 0, 0.055, 0.07, 0.055);
  box(g, P.cream, 0, 0.64, 0.435, 0.3, 0.18, 0.016);
  box(g, P.sage, 0, 0.64, 0.445, 0.06, 0.1, 0.016);
}
export function kettle(p) {
  // The isolated template intentionally shows no liquid, fuel, or steam.
  kettleBody(p);
  return kettlePaddle(p);
}
export function bench(p, { width = 1.8, depth = 0.75, height = 0.81 } = {}) {
  for (const x of [-width / 2 + 0.15, width / 2 - 0.15])
    for (const z of [-depth / 2 + 0.1, depth / 2 - 0.1])
      box(p, P.wood, x, height / 2, z, 0.11, height, 0.11);
  for (let i = 0; i < 4; i++)
    box(
      p,
      i % 2 ? P.light : P.end,
      0,
      height,
      -depth / 2 + ((i + 0.5) * depth) / 4,
      width,
      0.085,
      depth / 4 - 0.012,
    );
  box(p, P.wood, 0, 0.23, 0, width - 0.2, 0.1, 0.09);
}
export function stool(p) {
  for (const [x, z] of [
    [-0.17, -0.12],
    [0.17, -0.12],
    [0, 0.19],
  ])
    beam(p, [x * 1.2, 0, z * 1.2], [x, 0.49, z], 0.065);
  cylinder(p, P.light, 0, 0.5, 0, 0.26, 0.24, 0.08, 10);
  ring(p, P.wood, 0, 0.515, 0, 0.22, 0.013);
}
export function workbench(p) {
  bench(p);
  box(p, P.wood, -0.35, 0.88, 0.03, 0.55, 0.06, 0.45);
  const herbs = group(p, -0.35, 0.92, 0.05);
  herbs.scale.setScalar(0.63);
  mugwortBundle(herbs);
  bottle(group(p, 0.43, 0.86, -0.17), "#597b72");
  bottle(group(p, 0.66, 0.86, -0.1), "#88687e", 0.72);
  const knife = box(p, "#b8b8a0", 0.12, 0.91, 0.2, 0.26, 0.025, 0.045);
  knife.rotation.y = 0.4;
  box(p, P.wood, -0.04, 0.91, 0.14, 0.15, 0.04, 0.055);
  cylinder(p, P.cream, 0.1, 0.95, -0.12, 0.12, 0.075, 0.17, 9);
}
export function bar(p) {
  for (let i = 0; i < 9; i++)
    box(p, i % 2 ? P.wood : P.light, -0.8 + i * 0.2, 0.48, 0, 0.19, 0.88, 0.66);
  box(p, P.dark, 0, 0.95, 0, 1.92, 0.13, 0.84);
  box(p, P.light, 0, 1.02, 0, 1.95, 0.035, 0.87);
  box(p, P.wood, 0, 0.22, 0.4, 1.92, 0.12, 0.12);
  for (const x of [-0.65, 0, 0.6]) tankard(group(p, x, 1.045, 0.06));
  bottle(group(p, 0.66, 1.045, -0.18), "#657d68", 0.85);
}
export function grainSack(p) {
  ball(p, "#bfa474", 0, 0.29, 0, 0.3, 0.34, 0.28);
  cylinder(p, "#ae8f60", 0, 0.52, 0, 0.27, 0.24, 0.12, 10);
  ring(p, P.end, 0, 0.588, 0, 0.262, 0.03);
  cylinder(p, "#e0c58a", 0, 0.59, 0, 0.235, 0.235, 0.035, 12);
  for (let i = 0; i < 11; i++)
    ball(
      p,
      i % 2 ? "#d4ac66" : "#eed59d",
      Math.sin(i * 2.4) * 0.19,
      0.62,
      Math.cos(i * 2.4) * 0.19,
      0.032,
      0.018,
      0.05,
    );
  box(p, P.cream, 0, 0.32, 0.27, 0.16, 0.15, 0.017);
  box(p, P.wood, 0, 0.32, 0.282, 0.028, 0.1, 0.018);
}
export function bucket(p) {
  return pail(p, 0);
}
export function dryingRack(p) {
  for (const x of [-0.62, 0.62]) box(p, P.wood, x, 0.9, 0, 0.08, 1.8, 0.08);
  for (const y of [0.55, 1.15, 1.78])
    box(p, P.light, 0, y, 0, 1.35, 0.065, 0.065);
  for (let i = 0; i < 5; i++) {
    const herb = group(p, -0.5 + i * 0.25, 1.65, -0.02);
    herb.rotation.x = Math.PI / 2;
    herb.scale.setScalar(0.55);
    mugwortBundle(herb);
  }
  for (const x of [-0.52, 0.52]) box(p, P.wood, x, 0.05, 0, 0.2, 0.1, 0.55);
}
export function bookcase(p) {
  box(p, P.wood, 0, 0.76, -0.23, 1.36, 1.52, 0.08);
  for (const x of [-0.68, 0.68]) box(p, P.light, x, 0.8, 0, 0.11, 1.6, 0.55);
  for (const y of [0.12, 0.66, 1.2, 1.62])
    box(p, P.light, 0, y, 0, 1.47, 0.08, 0.61);
  const colors = ["#658275", "#896276", "#b78754", "#c0ae7e", "#4c626e"];
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 9; i++) {
      const h = 0.31 + (i % 3) * 0.06;
      box(
        p,
        colors[(i + row) % 5],
        -0.57 + i * 0.14,
        0.18 + row * 0.54 + h / 2,
        0.02,
        0.115,
        h,
        0.35,
      );
      box(
        p,
        P.end,
        -0.57 + i * 0.14,
        0.25 + row * 0.54,
        0.203,
        0.11,
        0.024,
        0.012,
      );
    }
  for (let i = 0; i < 4; i++)
    bottle(
      group(p, -0.48 + i * 0.3, 1.245, 0.01),
      colors[i],
      0.75 + (i % 2) * 0.2,
    );
}
export function lantern(p) {
  box(p, P.iron, 0, 0.04, 0, 0.25, 0.08, 0.25);
  box(p, "#efc879", 0, 0.22, 0, 0.18, 0.29, 0.18);
  for (const x of [-0.105, 0.105])
    for (const z of [-0.105, 0.105])
      box(p, P.iron, x, 0.22, z, 0.025, 0.35, 0.025);
  cylinder(p, P.iron, 0, 0.43, 0, 0.04, 0.19, 0.13, 4);
  const hoop = mesh(
    p,
    new THREE.TorusGeometry(0.065, 0.015, 4, 8),
    P.iron,
    0,
    0.54,
    0,
  );
  return hoop;
}
export function sign(p) {
  box(p, P.wood, 0, 1.2, 0, 0.12, 2.4, 0.12);
  box(p, P.wood, 0.43, 2.36, 0, 0.97, 0.12, 0.12);
  beam(p, [0, 1.75, 0], [0.55, 2.36, 0], 0.07);
  for (const x of [0.28, 0.71]) box(p, P.iron, x, 2.11, 0, 0.022, 0.43, 0.022);
  box(p, P.wood, 0.5, 1.76, 0, 0.92, 0.72, 0.12);
  box(p, P.sage, 0.5, 1.78, 0.074, 0.8, 0.58, 0.025);
  // Cat silhouette / copper crescent: readable without tiny raster text.
  ball(p, P.gold, 0.35, 1.8, 0.1, 0.2, 0.2, 0.035);
  ball(p, P.sage, 0.43, 1.84, 0.133, 0.17, 0.18, 0.028);
  ball(p, P.dark, 0.67, 1.72, 0.12, 0.13, 0.17, 0.035);
  for (const x of [0.59, 0.75])
    mesh(p, new THREE.ConeGeometry(0.065, 0.13, 3), P.dark, x, 1.9, 0.12);
  for (const x of [0.63, 0.7])
    box(p, P.gold, x, 1.79, 0.163, 0.022, 0.025, 0.008);
}
export const PROP_BUILDERS = {
  kettle,
  fermenter,
  cask: brewKeg,
  workbench,
  bar,
  stool,
  grainSack,
  bucket,
  dryingRack,
  bookcase,
  lantern,
  sign,
  bottle,
  tankard,
};
export function buildProp(kind, parent, options) {
  const build = PROP_BUILDERS[kind];
  if (!build) throw new Error(`Unknown brewhouse prop: ${kind}`);
  return build(parent, options);
}
