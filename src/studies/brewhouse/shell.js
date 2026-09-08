// Original half-timber brewhouse shell. Pieces remain independently reusable.
import * as THREE from "three";
import { box, mesh, group, cylinder, ball } from "../../art/geometry.js";
import { floor } from "../../art/floor.js";
import { stair } from "../../art/stair.js";
import { STOREY_HEIGHT } from "../../art/scale.js";
import { PALETTE as P, lantern, sign } from "./props.js";
import { cutaway } from "./cutaway.js";

export function windowPanel(p) {
  box(p, P.wood, 0, 1.18, 0, 0.9, 1.14, 0.17);
  box(p, "#546a69", 0, 1.2, 0.1, 0.64, 0.8, 0.04);
  for (const x of [-0.21, 0, 0.21])
    box(p, P.end, x, 1.2, 0.135, 0.033, 0.82, 0.035);
  box(p, P.end, 0, 1.21, 0.135, 0.66, 0.045, 0.035);
  for (const side of [-1, 1]) {
    const shutter = group(p, side * 0.57, 1.18, 0.09);
    shutter.rotation.y = side * 0.38;
    for (let i = 0; i < 3; i++)
      box(
        shutter,
        i % 2 ? P.sage : "#547361",
        -0.13 + i * 0.13,
        0,
        0,
        0.12,
        0.94,
        0.065,
      );
    for (const y of [-0.31, 0.31])
      box(shutter, P.wood, 0, y, 0.04, 0.4, 0.055, 0.04);
  }
  box(p, P.light, 0, 0.65, 0.16, 1.12, 0.1, 0.38);
}
export function timberPanel(p, { window = false, door = false } = {}) {
  if (!door) {
    if (window) {
      box(p, P.cream, 0, 0.27, 0, 0.98, 0.54, 0.13);
      box(p, P.cream, 0, 1.98, 0, 0.98, 0.34, 0.13);
      windowPanel(p);
    } else box(p, P.cream, 0, 1.08, 0, 0.98, 2.16, 0.13);
  }
  for (const x of [-0.5, 0.5]) box(p, P.wood, x, 1.08, 0, 0.105, 2.16, 0.23);
  for (const y of [0.09, 2.1]) box(p, P.wood, 0, y, 0, 1.08, 0.14, 0.23);
  if (!window && !door) {
    const diagonal = box(p, P.light, 0, 1.1, 0.1, 0.075, 2.04, 0.04);
    diagonal.rotation.z = 0.4;
  }
  if (door) {
    const leaf = group(p, -0.43, 0, 0.05);
    leaf.rotation.y = -1.1;
    for (let i = 0; i < 5; i++)
      box(leaf, P.sage, 0.09 + i * 0.17, 1.04, 0, 0.16, 1.98, 0.08);
    for (const y of [0.25, 1.75])
      box(leaf, P.iron, 0.43, y, 0.06, 0.8, 0.065, 0.035);
    box(leaf, P.gold, 0.73, 1.02, 0.07, 0.055, 0.09, 0.04);
  }
}
export function roof(p) {
  const rise = 1.45,
    half = 2.9,
    angle = Math.atan2(rise, half),
    length = Math.hypot(rise, half);
  for (const side of [-1, 1]) {
    const slope = group(p, 0, 4.42 + rise / 2, (side * half) / 2);
    slope.rotation.x = side * angle;
    box(slope, P.dark, 0, 0, 0, 7.7, 0.11, length + 0.2);
    const colors = ["#5e7867", "#667f6b", "#72886e", "#597365"];
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 18; col++)
        box(
          slope,
          colors[(row + (col % 7 === 0 ? 1 : 0)) % 4],
          -3.67 + col * 0.43 + (row % 2) * 0.05,
          0.07,
          -length / 2 + 0.16 + row * 0.42,
          0.44,
          0.07,
          0.5,
        );
    for (const x of [-3.83, 3.83])
      box(slope, P.wood, x, 0.075, 0, 0.1, 0.16, length + 0.3);
  }
  box(p, P.wood, 0, 5.91, 0, 7.86, 0.16, 0.19);
  // End gables, repeating joinery and dark loft vent.
  for (const x of [-3.51, 3.51]) {
    const shape = new THREE.Shape();
    shape.moveTo(-2.55, 0);
    shape.lineTo(2.55, 0);
    shape.lineTo(0, 1.39);
    shape.closePath();
    const tri = mesh(
      p,
      new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }),
      P.cream,
      x,
      4.36,
      0,
    );
    tri.rotation.y = Math.PI / 2;
    box(p, P.wood, x, 4.94, 0, 0.19, 1.35, 0.1);
    box(p, P.wood, x, 4.38, 0, 0.18, 0.18, 5.36);
    for (const z of [-1.3, 1.3]) box(p, P.wood, x, 4.69, z, 0.18, 0.68, 0.1);
  }
  // Copper finial: a little crescent at the roof ridge.
  const crescent = mesh(
    p,
    new THREE.TorusGeometry(0.19, 0.047, 4, 14, Math.PI * 1.5),
    P.gold,
    -2.4,
    6.36,
    0,
  );
  crescent.rotation.z = 0.75;
  cylinder(p, P.iron, -2.4, 6.08, 0, 0.02, 0.02, 0.31, 6);
}
export function chimney(p) {
  for (let y = 0; y < 12; y++)
    for (let i = 0; i < 2; i++)
      for (const side of [-1, 1])
        box(
          p,
          (y + i) % 3 ? "#817c6a" : "#99907a",
          side * 0.3,
          3.62 + y * 0.22,
          -0.16 + i * 0.32,
          0.25,
          0.21,
          0.3,
        );
  box(p, P.dark, 0, 6.12, 0, 0.9, 0.14, 0.85);
  box(p, "#4a5048", 0, 6.18, 0, 0.55, 0.04, 0.49);
}
function shellWalls(parent, level, cut) {
  const y = level * STOREY_HEIGHT;
  for (let x = -3; x <= 3; x++)
    for (const side of [-1, 1]) {
      if (cut.hidesWall("z", side)) continue;
      const panel = group(parent, x, y, side * 2.5);
      if (side === -1) panel.rotation.y = Math.PI;
      timberPanel(panel, {
        window: Math.abs(x) === 2,
        door: level === 0 && side === 1 && x === 0,
      });
    }
  for (let z = -2; z <= 2; z++)
    for (const side of [-1, 1]) {
      if (cut.hidesWall("x", side)) continue;
      const panel = group(parent, side * 3.5, y, z);
      panel.rotation.y = (side * Math.PI) / 2;
      timberPanel(panel, { window: z === 0 });
    }
}
export function shell(parent, mode = "dollhouse", facing = 0) {
  const cut = cutaway(mode, facing),
    exploded = mode === "exploded";
  const ground = group(parent);
  ground.name = "ground-shell";
  box(ground, "#665f4d", 0, -0.37, 0, 7.4, 0.36, 5.4);
  for (let x = -3; x <= 3; x++)
    for (let z = -2; z <= 2; z++) floor(group(ground, x, 0, z), "finished");
  shellWalls(ground, 0, cut);
  stair(group(ground, 2, 0, -1), "finished");
  if (mode !== "ground") {
    const upper = group(parent, 0, exploded ? 2.5 : 0, 0);
    upper.name = "upper-shell";
    for (let x = -3; x <= 3; x++)
      for (let z = -2; z <= 2; z++) {
        if (x === 2 && z >= -1 && z <= 1) continue;
        if (cut.hidesUpper(x, z)) continue;
        floor(group(upper, x, STOREY_HEIGHT, z), "finished");
      }
    shellWalls(upper, 1, cut);
    // Guard rail at the edge of the stair void, leaving its landing access open.
    for (const z of [-1.3, -0.5, 0.25]) {
      if (cut.hidesUpper(1.45, z)) continue;
      box(upper, P.wood, 1.45, STOREY_HEIGHT + 0.3, z, 0.065, 0.6, 0.065);
      box(upper, P.light, 1.45, STOREY_HEIGHT + 0.63, z, 0.09, 0.065, 0.76);
    }
  }
  if (mode === "exterior" || mode === "exploded")
    roof(group(parent, 0, exploded ? 4.3 : 0, 0));
  if (mode === "exterior") chimney(group(parent, -2.65, 0, -1.35));
  if (mode === "exterior") lantern(group(parent, 1.1, 1.22, 2.65));
  sign(group(parent, -2.5, 0, 3.4));
  // Exterior path, moss, reusable stepping stones: no gameplay terrain edit.
  for (let i = 0; i < 4; i++)
    box(
      parent,
      i % 2 ? "#a59470" : "#b3a27a",
      0.12 * (i % 2),
      -0.12,
      3 + i * 0.58,
      0.93,
      0.11,
      0.52,
    );
  for (let i = 0; i < 8; i++)
    ball(
      parent,
      "#65794f",
      -3.6 + (i % 2) * 0.2,
      -0.1,
      -2 + i * 0.63,
      0.23,
      0.045,
      0.19,
    );
}
