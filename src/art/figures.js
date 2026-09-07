// Original silhouette studies. Geometry and poses are authored here; reference
// pictures and Pilgrimage's models never enter the bake.
import * as THREE from "three";
import { scene, box, ball, cylinder, mesh, group } from "./geometry.js";

const SKIN = "#c59a76";
const GREEN = "#8ba74e";

function limb(parent, color, length, width, depth = width) {
  return box(parent, color, 0, -length / 2, 0, width, length, depth);
}

function legs(parent, phase, moving, { hip, spread, width, cloth, boots }) {
  const length = (hip - 0.1) / 2;
  for (const side of [-1, 1]) {
    const swing = moving ? Math.sin(phase * Math.PI * 2) * side : 0;
    const thigh = group(parent, spread * side, hip, 0);
    thigh.rotation.x = swing * 0.42;
    limb(thigh, cloth, length, width);
    const knee = group(thigh, 0, -length, 0);
    knee.rotation.x = Math.max(0, -swing) * 0.62 + 0.04;
    limb(knee, boots, length, width * 0.82);
    box(knee, boots, 0, -length, 0.045, width * 1.08, 0.1, width * 1.8);
  }
}

function arms(
  parent,
  phase,
  moving,
  { shoulder, spread, length, sleeve, hand },
) {
  const hands = [];
  for (const side of [-1, 1]) {
    const arm = group(parent, side * spread, shoulder, 0);
    arm.rotation.z = side * 0.12;
    arm.rotation.x = moving
      ? -Math.sin(phase * Math.PI * 2) * side * 0.3
      : -0.05;
    limb(arm, sleeve, length, 0.14);
    const elbow = group(arm, 0, -length, 0);
    elbow.rotation.x = -0.12;
    limb(elbow, sleeve, length * 0.85, 0.105);
    const palm = group(elbow, 0, -length * 0.9, 0.015);
    ball(palm, hand, 0, -0.025, 0, 0.057, 0.075, 0.06);
    hands.push(palm);
  }
  return hands;
}

function coat(parent, color, waist, shoulder, hem, width) {
  const profile = [
    [width * 0.72, hem],
    [width * 0.56, waist - 0.06],
    [width * 0.43, waist + 0.04],
    [width * 0.58, shoulder - 0.08],
    [width * 0.3, shoulder],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const garment = mesh(
    parent,
    new THREE.LatheGeometry(profile, 8),
    color,
    0,
    0,
    0,
  );
  garment.scale.z = 0.65;
  return garment;
}

function humanHead(parent, y, hair = "#6a4938") {
  const head = group(parent, 0, y, 0);
  ball(head, SKIN, 0, 0, 0, 0.155, 0.175, 0.14);
  box(head, SKIN, 0, -0.105, 0.04, 0.21, 0.12, 0.19);
  ball(head, "#d7af83", 0, -0.015, 0.145, 0.043, 0.062, 0.064);
  for (const side of [-1, 1]) {
    box(head, "#392e29", side * 0.065, 0.035, 0.126, 0.035, 0.035, 0.025);
    ball(head, SKIN, side * 0.15, -0.018, -0.015, 0.037, 0.055, 0.032);
  }
  ball(head, hair, 0, 0.09, -0.025, 0.165, 0.115, 0.147);
  box(head, hair, -0.135, -0.005, -0.04, 0.04, 0.2, 0.19);
  box(head, hair, 0.05, 0.12, 0.12, 0.17, 0.09, 0.07).rotation.z = -0.2;
  return head;
}

function rowan(body, phase, moving) {
  legs(body, phase, moving, {
    hip: 0.91,
    spread: 0.095,
    width: 0.145,
    cloth: "#5e6354",
    boots: "#554536",
  });
  coat(body, "#537e79", 0.96, 1.4, 0.75, 0.34);
  box(body, "#344f4c", 0, 0.96, 0, 0.32, 0.055, 0.24);
  box(body, "#c39b59", 0, 0.96, 0.129, 0.07, 0.055, 0.025);
  const hands = arms(body, phase, moving, {
    shoulder: 1.34,
    spread: 0.205,
    length: 0.245,
    sleeve: "#537e79",
    hand: SKIN,
  });
  box(body, "#e3bd70", 0, 1.365, 0.04, 0.3, 0.07, 0.28);
  box(body, "#b98243", -0.07, 1.225, 0.17, 0.085, 0.27, 0.045).rotation.z =
    -0.12;
  box(body, "#c8b689", 0.222, 1.13, 0.025, 0.03, 0.13, 0.1);
  ball(body, "#79563d", 0.16, 0.86, -0.12, 0.1, 0.15, 0.09);
  cylinder(body, SKIN, 0, 1.44, 0, 0.06, 0.065, 0.1, 6);
  humanHead(body, 1.59);
  const axe = group(hands[0], 0, -0.15, 0.04);
  axe.rotation.x = 0.12;
  cylinder(axe, "#a17b4d", 0, 0, 0, 0.022, 0.022, 0.44, 6);
  box(axe, "#91a4a0", 0.06, 0.14, 0, 0.18, 0.12, 0.045);
}

function knight(body, phase, moving) {
  legs(body, phase, moving, {
    hip: 0.91,
    spread: 0.11,
    width: 0.165,
    cloth: "#657778",
    boots: "#8f9c94",
  });
  coat(body, "#78554d", 0.96, 1.38, 0.68, 0.38);
  ball(body, "#9fada3", 0, 1.22, 0, 0.245, 0.245, 0.175);
  box(body, "#c1c6aa", 0, 1.27, 0.164, 0.055, 0.23, 0.028);
  box(body, "#4f5e5a", 0, 0.975, 0, 0.37, 0.06, 0.26);
  arms(body, phase, moving, {
    shoulder: 1.35,
    spread: 0.245,
    length: 0.24,
    sleeve: "#8e9d96",
    hand: "#adb7a8",
  });
  for (const side of [-1, 1]) {
    ball(body, "#b2baa7", side * 0.26, 1.345, 0, 0.13, 0.12, 0.15);
    box(
      body,
      "#7b8c86",
      side * 0.15,
      0.82,
      0.13,
      0.16,
      0.25,
      0.055,
    ).rotation.z = -side * 0.12;
  }
  cylinder(body, "#4d5e5c", 0, 1.44, 0, 0.09, 0.12, 0.14, 8);
  ball(body, "#a6b0a3", 0, 1.625, 0, 0.17, 0.22, 0.16);
  box(body, "#435654", 0, 1.63, 0.148, 0.225, 0.044, 0.034);
  box(body, "#c5c8ad", 0, 1.535, 0.148, 0.22, 0.09, 0.05);
  box(body, "#8b5148", 0, 1.8, -0.025, 0.075, 0.07, 0.2);
  const shield = group(body, -0.38, 0.97, 0.05);
  box(shield, "#655448", 0, 0, 0, 0.085, 0.42, 0.32);
  box(shield, "#987343", -0.05, 0, 0, 0.02, 0.34, 0.04);
}

function wizard(body, phase, moving) {
  legs(body, phase, moving, {
    hip: 0.89,
    spread: 0.1,
    width: 0.13,
    cloth: "#494652",
    boots: "#514439",
  });
  coat(body, "#625775", 0.99, 1.37, 0.14, 0.47);
  coat(body, "#81738e", 1.16, 1.4, 1.04, 0.54);
  box(body, "#b59a60", 0, 0.99, 0.19, 0.33, 0.055, 0.045);
  const hands = arms(body, phase, moving, {
    shoulder: 1.32,
    spread: 0.24,
    length: 0.25,
    sleeve: "#625775",
    hand: SKIN,
  });
  humanHead(body, 1.57, "#bbb9a2");
  const beard = mesh(
    body,
    new THREE.ConeGeometry(0.13, 0.32, 5),
    "#c8c5a6",
    0,
    1.35,
    0.18,
  );
  beard.rotation.z = Math.PI + 0.18;
  cylinder(body, "#504861", 0, 1.76, 0, 0.38, 0.39, 0.055, 10);
  const hat = group(body, 0, 1.77, 0);
  const crown = mesh(
    hat,
    new THREE.ConeGeometry(0.22, 0.5, 7),
    "#71617d",
    -0.065,
    0.23,
    0,
  );
  crown.rotation.z = 0.28;
  const tip = mesh(
    hat,
    new THREE.ConeGeometry(0.08, 0.22, 6),
    "#71617d",
    -0.19,
    0.45,
    0.01,
  );
  tip.rotation.z = 1.02;
  box(body, "#b8a36f", 0, 1.81, 0.2, 0.26, 0.055, 0.03);
  const staff = group(hands[1], 0, 0.05, 0.08);
  cylinder(staff, "#75543d", 0, 0, 0, 0.025, 0.035, 1.38, 6);
  const hook = new THREE.TorusGeometry(0.085, 0.024, 5, 8, Math.PI * 1.6);
  mesh(staff, hook, "#a47e49", 0.03, 0.71, 0);
  ball(staff, "#dca568", 0.03, 0.71, 0, 0.04);
}

function goblinEar(parent, side) {
  const shape = new THREE.Shape();
  shape.moveTo(side * 0.12, 1.16);
  shape.lineTo(side * 0.57, 1.4);
  shape.lineTo(side * 0.36, 1.03);
  shape.lineTo(side * 0.17, 1.04);
  mesh(
    parent,
    new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false }),
    GREEN,
    0,
    0,
    -0.015,
  );
  const inner = new THREE.Shape();
  inner.moveTo(side * 0.23, 1.16);
  inner.lineTo(side * 0.48, 1.33);
  inner.lineTo(side * 0.32, 1.12);
  mesh(parent, new THREE.ShapeGeometry(inner), "#c4b466", 0, 0, 0.025);
}

function goblin(body, phase, moving) {
  legs(body, phase, moving, {
    hip: 0.57,
    spread: 0.115,
    width: 0.105,
    cloth: GREEN,
    boots: "#59794a",
  });
  coat(body, "#a14b43", 0.6, 0.96, 0.47, 0.27);
  box(body, "#573f32", 0, 0.6, 0, 0.26, 0.055, 0.23);
  arms(body, phase, moving, {
    shoulder: 0.91,
    spread: 0.16,
    length: 0.21,
    sleeve: GREEN,
    hand: "#a6b65c",
  });
  ball(body, GREEN, 0, 1.12, 0.03, 0.22, 0.21, 0.17);
  ball(body, "#a4b659", 0, 1.01, 0.2, 0.15, 0.09, 0.12);
  const nose = mesh(
    body,
    new THREE.ConeGeometry(0.065, 0.23, 5),
    GREEN,
    0,
    1.105,
    0.24,
  );
  nose.rotation.x = Math.PI / 2;
  goblinEar(body, -1);
  goblinEar(body, 1);
  for (const side of [-1, 1]) {
    box(
      body,
      "#e7db93",
      side * 0.097,
      1.145,
      0.179,
      0.095,
      0.065,
      0.028,
    ).rotation.z = side * 0.14;
    box(body, "#44354b", side * 0.11, 1.145, 0.202, 0.03, 0.047, 0.016);
    const tooth = mesh(
      body,
      new THREE.ConeGeometry(0.021, 0.068, 4),
      "#e9d6a2",
      side * 0.074,
      0.984,
      0.284,
    );
    tooth.rotation.z = Math.PI;
  }
  box(body, "#b16c45", 0, 0.93, 0.035, 0.28, 0.06, 0.25);
  box(body, "#853e3c", -0.03, 0.77, -0.17, 0.2, 0.37, 0.05).rotation.z = -0.13;
}

function cat(body, phase, moving) {
  const cream = "#e4ddbb",
    patch = "#465c57";
  for (const front of [-1, 1])
    for (const side of [-1, 1]) {
      const leg = group(body, side * 0.09, 0.25, front * 0.17);
      leg.rotation.x = moving
        ? Math.sin(phase * Math.PI * 2 + (front * side > 0 ? Math.PI : 0)) *
          0.55
        : 0;
      limb(leg, cream, 0.2, 0.055);
      box(leg, cream, 0, -0.205, 0.025, 0.075, 0.06, 0.12);
    }
  ball(body, cream, 0, 0.32, -0.015, 0.14, 0.16, 0.3);
  ball(body, patch, -0.025, 0.41, -0.15, 0.125, 0.075, 0.15);
  ball(body, cream, 0, 0.46, 0.225, 0.14, 0.15, 0.12);
  ball(body, patch, -0.08, 0.505, 0.225, 0.075, 0.1, 0.105);
  for (const side of [-1, 1]) {
    const ear = new THREE.Shape();
    ear.moveTo(side * 0.025, 0.545);
    ear.lineTo(side * 0.11, 0.745);
    ear.lineTo(side * 0.15, 0.53);
    mesh(
      body,
      new THREE.ExtrudeGeometry(ear, { depth: 0.055, bevelEnabled: false }),
      patch,
      0,
      0,
      0.19,
    );
    const inner = new THREE.Shape();
    inner.moveTo(side * 0.057, 0.56);
    inner.lineTo(side * 0.108, 0.675);
    inner.lineTo(side * 0.126, 0.55);
    mesh(body, new THREE.ShapeGeometry(inner), "#c89384", 0, 0, 0.248);
    box(body, "#bf9954", side * 0.067, 0.485, 0.335, 0.04, 0.03, 0.02);
  }
  ball(body, cream, 0, 0.42, 0.325, 0.075, 0.052, 0.06);
  box(body, "#b77e71", 0, 0.445, 0.383, 0.035, 0.024, 0.018);
  const sway = moving ? Math.sin(phase * Math.PI * 2) * 0.05 : 0;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.35, -0.24),
    new THREE.Vector3(0.02, 0.47, -0.46),
    new THREE.Vector3(0.16 + sway, 0.69, -0.55),
    new THREE.Vector3(0.25 + sway, 0.67, -0.51),
  ]);
  mesh(
    body,
    new THREE.TubeGeometry(curve, 10, 0.038, 5, false),
    patch,
    0,
    0,
    0,
  );
}

const FIGURES = { rowan, knight, wizard, goblin, cat };

export function figure(kind, phase = 0, direction = 0, pose = "idle") {
  const s = scene();
  const puppet = group(s);
  puppet.rotation.y = direction;
  const moving = pose === "walk";
  const body = group(
    puppet,
    0,
    moving ? Math.abs(Math.sin(phase * Math.PI * 2)) * 0.025 : 0,
    0,
  );
  FIGURES[kind](body, phase, moving);
  return s;
}
