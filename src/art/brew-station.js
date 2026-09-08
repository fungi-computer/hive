// Accepted station geometry. Callers own footprint, stage, and facing facts.
import * as THREE from "three";
import { box, group, mesh, scene } from "./geometry.js";
import { spentGrainTray } from "./brew-supplies.js";
import { kettleBody, kettlePaddle } from "./brew-vessel.js";

export const STATION_STAGES = ["stakes", "frame", "finished"];
const P = {
  wood: "#785037",
  end: "#d2b77e",
  cord: "#c5a76d",
  stone: "#716955",
  lightStone: "#8a765b",
  copper: "#b86842",
};

function beam(parent, a, b, width, color) {
  const delta = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const item = box(
    parent,
    color,
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
    width,
    delta.length(),
    width,
  );
  item.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
}

function stakes(parent) {
  for (const x of [-0.89, 0.89])
    for (const z of [-0.89, 0.89]) {
      box(parent, P.wood, x, 0.13, z, 0.08, 0.26, 0.08);
      box(parent, P.end, x, 0.268, z, 0.087, 0.022, 0.087);
    }
  for (const side of [-0.89, 0.89]) {
    box(parent, P.cord, 0, 0.2, side, 1.78, 0.016, 0.016);
    box(parent, P.cord, side, 0.2, 0, 0.016, 0.016, 1.78);
  }
  for (let i = 0; i < 3; i++)
    box(
      parent,
      i === 1 ? P.end : P.wood,
      -0.18 + i * 0.14,
      0.035,
      -0.44,
      0.11,
      0.07,
      0.52 - i * 0.04,
    );
}

function trayMount(parent) {
  const g = group(parent);
  g.name = "fixed-tray-mount";
  box(g, P.stone, 0, 0.075, 0.72, 0.82, 0.15, 0.53);
  box(g, P.lightStone, 0, 0.158, 0.72, 0.84, 0.018, 0.54);
  return g;
}

function frame(parent) {
  box(parent, "#555b52", 0, 0.07, 0, 1.42, 0.14, 1.32);
  for (const x of [-0.55, 0.55])
    for (let z = 0; z < 3; z++)
      box(
        parent,
        z % 2 ? P.lightStone : P.stone,
        x,
        0.215,
        -0.4 + z * 0.39,
        0.22,
        0.15,
        0.37,
      );
  for (let x = 0; x < 3; x++)
    box(parent, P.lightStone, -0.4 + x * 0.4, 0.215, -0.52, 0.38, 0.15, 0.2);
  for (const x of [-0.64, 0.64]) {
    box(parent, P.wood, x, 0.4, 0, 0.07, 0.8, 0.1);
    beam(parent, [x, 0.11, 0.51], [x, 0.68, -0.4], 0.055, P.end);
  }
  box(parent, P.end, 0, 0.805, 0, 1.37, 0.07, 0.1);
  const rim = mesh(
    parent,
    new THREE.TorusGeometry(0.43, 0.027, 4, 14),
    P.copper,
    0,
    0.38,
    0,
  );
  rim.rotation.x = Math.PI / 2;
  trayMount(parent);
}

/** Centered 2x2 station body: caller applies its positive-cell datum once. */
export function brewStation(parent, stage) {
  const g = group(parent);
  g.name = "brew-station";
  if (stage === "stakes") stakes(g);
  else if (stage === "frame") frame(g);
  else if (stage === "finished") {
    kettleBody(g);
    kettlePaddle(g, 0, false);
    trayMount(g);
    const tray = spentGrainTray(g, false);
    tray.position.set(0, 0.17, 0.72);
  } else throw new Error(`Unknown brew station stage: ${stage}`);
  return g;
}

/** Isolated rendering adapter: a 2x2 positive-cell station rotates about (.5,0,.5). */
export function stationScene(stage, direction = 0) {
  if (direction !== 0 && direction !== 1)
    throw new Error("Expected one of the two station facings");
  const s = scene();
  const datum = group(s, 0.5, 0, 0.5);
  datum.name = "station-datum";
  datum.rotation.y = (direction * Math.PI) / 2;
  brewStation(datum, stage);
  return s;
}
