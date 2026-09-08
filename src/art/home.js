// Original timber joinery, woven bedroll and thatch, baked with the pawn camera.
import { scene, box, cylinder, group } from "./geometry.js";
import { shelf } from "./shelf.js";
import { floor } from "./floor.js";
import { stair } from "./stair.js";
import { stationScene } from "./brew-station.js";
function plank(parent, x, y, z, w, h, d) {
  box(parent, "#8e6a43", x, y, z, w, h, d);
  box(
    parent,
    "#ba925e",
    x - w * 0.15,
    y + h * 0.15,
    z + d / 2 + 0.004,
    w * 0.13,
    h * 0.83,
    0.015,
  );
}
function wall(parent, stage, mask = 5) {
  box(parent, "#656957", 0, 0.07, 0, 0.38, 0.14, 0.38);
  plank(
    parent,
    0,
    stage === "stakes" ? 0.23 : 1.08,
    0,
    0.14,
    stage === "stakes" ? 0.46 : 2.16,
    0.25,
  );
  // Half-panels meet at tile edges. The same joints form straight runs,
  // corners and junctions without gaps between a wall and its neighbor.
  for (const [bit, rotation] of [
    [1, 0],
    [2, -Math.PI / 2],
    [4, Math.PI],
    [8, Math.PI / 2],
  ]) {
    if (!(mask & bit)) continue;
    const panel = group(parent);
    panel.rotation.y = rotation;
    box(panel, "#656957", 0.3, 0.07, 0, 0.6, 0.14, 0.32);
    if (stage === "stakes") continue;
    plank(panel, 0.29, 2.08, 0, 0.6, 0.16, 0.24);
    if (stage === "finished")
      for (let i = 0; i < 3; i++)
        plank(panel, 0.12 + i * 0.18, 1.03, 0, 0.17, 1.94, 0.14);
    box(panel, "#755238", 0.29, 0.36, 0.13, 0.6, 0.09, 0.055);
    for (const y of [0.25, 1.96])
      box(panel, "#4b4940", 0.035, y, 0.145, 0.045, 0.045, 0.018);
  }
}
function door(parent, stage) {
  for (const x of [-0.43, 0.43])
    plank(
      parent,
      x,
      stage === "stakes" ? 0.24 : 1.12,
      0,
      0.13,
      stage === "stakes" ? 0.48 : 2.24,
      0.24,
    );
  box(parent, "#ab8c5d", 0, 0.055, 0, 1, 0.11, 0.4);
  if (stage === "stakes") return;
  plank(parent, 0, 2.23, 0, 1.08, 0.16, 0.29);
  if (stage === "finished") {
    const leaf = group(parent, -0.37, 0, 0);
    leaf.rotation.y = -1.33;
    for (let i = 0; i < 4; i++)
      plank(leaf, 0.095 + i * 0.17, 1.03, 0, 0.16, 1.98, 0.055);
    box(leaf, "#c5ad70", 0.58, 1.05, 0.052, 0.065, 0.11, 0.035);
    box(parent, "#ceb47c", 0, 2.36, 0, 0.36, 0.05, 0.3);
  }
}
function roof(parent, stage) {
  for (const z of [-0.42, 0.42])
    box(parent, "#775639", 0, 2.24, z, 1.08, 0.12, 0.09);
  if (stage === "stakes") return;
  box(parent, "#7b613f", 0, 2.28, 0, 1.03, 0.14, 1.03);
  if (stage !== "finished") return;
  for (let row = 0; row < 5; row++)
    for (let i = 0; i < 7; i++) {
      const straw = box(
        parent,
        ["#b7a164", "#c3ad70", "#aa955c"][(row + i) % 3],
        -0.47 + i * 0.155,
        2.39 + row * 0.022,
        -0.44 + row * 0.22,
        0.15,
        0.1,
        0.28,
      );
      straw.rotation.x = -0.1;
    }
}
function bed(parent, stage) {
  box(parent, "#806445", 0, 0.055, 0.5, 0.81, 0.11, 1.88);
  if (stage === "stakes") return;
  box(parent, "#c2ac73", 0, 0.135, 0.5, 0.77, 0.1, 1.78);
  if (stage === "finished") {
    box(parent, "#537b76", 0, 0.23, 0.67, 0.75, 0.14, 1.4);
    box(parent, "#8baba0", 0, 0.31, 0.17, 0.75, 0.035, 0.18);
    box(parent, "#d3c79e", 0, 0.24, -0.19, 0.6, 0.15, 0.31);
    for (let z = 0.35; z < 1.3; z += 0.23)
      box(parent, "#678e83", 0, 0.305, z, 0.64, 0.012, 0.028);
  }
}
const TYPES = { wall, door, roof, bed, shelf, floor, stair };
export function building(type, stage, direction = 0, options) {
  if (type === "brew-station") return stationScene(stage, direction, options);
  const build = TYPES[type];
  if (!build) throw new Error(`Unknown building art: ${type}`);
  const s = scene(),
    model = group(s);
  model.rotation.y = (direction * Math.PI) / 2;
  build(model, stage);
  return s;
}
export function woodPile(amount) {
  const s = scene();
  for (let i = 0; i < amount; i++) {
    const x = ((i % 3) - 1) * 0.18,
      y = 0.12 + Math.floor(i / 3) * 0.16;
    const log = cylinder(s, "#89653e", x, y, 0, 0.09, 0.1, 0.64, 7);
    log.rotation.x = Math.PI / 2;
    const end = cylinder(s, "#d1ad71", x, y, 0.327, 0.075, 0.075, 0.02, 7);
    end.rotation.x = Math.PI / 2;
  }
  return s;
}

export function wallJoint(stage, mask) {
  const s = scene();
  wall(s, stage, mask);
  return s;
}
