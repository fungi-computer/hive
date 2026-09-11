// Original silhouette studies. Geometry and poses are authored here; reference
// pictures and Pilgrimage's models never enter the bake.
import * as THREE from "three";
import { scene, box, ball, cylinder, mesh, group } from "./geometry.js";
import { mugwortBundle } from "./herbs.js";
import { rationParcel } from "./food.js";
import { stoneFragments } from "./stone.js";

import { pail, PAIL_GRIP } from "./pail.js";
const PAIL_POSES = {
  "carry-pail-empty": 0,
  "carry-pail-half": 1,
  "carry-pail-full": 2,
};

const SKIN = "#c59a76";
const GREEN = "#8ba74e";

function limb(parent, color, length, width, depth = width) {
  return box(parent, color, 0, -length / 2, 0, width, length, depth);
}

function legs(
  parent,
  phase,
  moving,
  { hip, spread, width, cloth, boots, action = "idle" },
) {
  if (action === "dig") action = "build";
  const length = (hip - 0.1) / 2;
  for (const side of [-1, 1]) {
    const swing = moving ? Math.sin(phase * Math.PI * 2) * side : 0;
    const thigh = group(parent, spread * side, hip, 0);
    thigh.rotation.x =
      action === "build"
        ? side < 0
          ? 0
          : -1.45
        : action === "hit"
          ? side * 0.55 + Math.sin(phase * Math.PI * 2 + side) * 0.3
          : swing * 0.42;
    limb(thigh, cloth, length, width);
    const knee = group(thigh, 0, -length, 0);
    knee.rotation.x =
      action === "build"
        ? side < 0
          ? Math.PI / 2
          : 1.45
        : action === "hit"
          ? 0.5 + Math.sin(phase * Math.PI * 2 + side * 0.7) * 0.55
          : Math.max(0, -swing) * 0.62 + 0.04;
    limb(knee, boots, length, width * 0.82);
    const foot = box(
      knee,
      boots,
      0,
      -length,
      0.045,
      width * 1.08,
      0.1,
      width * 1.8,
    );
    if (action === "build" && side < 0) {
      foot.rotation.x = -Math.PI / 2;
      foot.position.z = 0;
    }
  }
}

function arms(
  parent,
  phase,
  moving,
  { shoulder, spread, length, sleeve, hand, action = "idle" },
) {
  const carryingParcel = [
    "carry-herb",
    "carry-soil",
    "carry-stone",
    "carry-ration",
  ].includes(action);
  if (action === "dig") action = "build";
  const carryingPail = Object.hasOwn(PAIL_POSES, action);
  if (carryingParcel) action = "carry";
  if (action === "pickup-herb") action = "pickup";
  const hands = [];
  for (const side of [-1, 1]) {
    const arm = group(parent, side * spread, shoulder, 0);
    arm.rotation.z = side * 0.12;
    arm.rotation.x = moving
      ? -Math.sin(phase * Math.PI * 2) * side * 0.3
      : -0.05;
    if (action === "chop")
      arm.rotation.x = -1.2 + Math.sin(phase * Math.PI * 2) * 0.95;
    if (action === "hit") {
      arm.rotation.x =
        0.5 + side * 0.5 + Math.sin(phase * Math.PI * 2 + side) * 0.7;
      arm.rotation.z = side * (0.45 + Math.sin(phase * Math.PI * 2) * 0.18);
    }
    if (["pickup", "deliver"].includes(action))
      arm.rotation.x = -0.9 + Math.sin(phase * Math.PI * 2) * 0.3;
    if (action === "build") {
      const stroke = [-1.8, -2.05, -1.45, -0.78, -0.84, -1.0, -1.28, -1.6];
      arm.rotation.x = side < 0 ? stroke[Math.floor(phase * 8) % 8] : -0.2;
      arm.rotation.z = side < 0 ? -0.04 : 0.22;
    }
    if (action === "carry") arm.rotation.x = carryingParcel ? -0.55 : -1.15;
    if (action === "eat") {
      arm.rotation.x =
        side < 0 ? -1.05 + Math.sin(phase * Math.PI * 2) * 0.12 : -0.4;
      arm.rotation.z = -side * 0.1;
      arm.rotation.y = side < 0 ? 0.65 : 0;
    }
    if (carryingPail && side === 1) {
      arm.rotation.x = -0.12 + Math.sin(phase * Math.PI * 2) * 0.05;
      arm.rotation.z = 0.5;
    }
    limb(arm, sleeve, length, 0.14);
    const elbow = group(arm, 0, -length, 0);
    elbow.rotation.x =
      action === "eat"
        ? side < 0
          ? -1.65
          : -0.85
        : action === "hit"
          ? 0.5 + Math.sin(phase * Math.PI * 2 + side) * 0.65
        : carryingParcel
          ? -0.95
          : action === "build"
            ? -0.45
            : -0.12;
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

function rowan(body, phase, moving, pose) {
  legs(body, phase, moving, {
    hip: 0.91,
    spread: 0.095,
    width: 0.145,
    cloth: "#5e6354",
    boots: "#554536",
    action: pose,
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
    action: pose,
  });
  box(body, "#e3bd70", 0, 1.365, 0.04, 0.3, 0.07, 0.28);
  box(body, "#b98243", -0.07, 1.225, 0.17, 0.085, 0.27, 0.045).rotation.z =
    -0.12;
  box(body, "#c8b689", 0.222, 1.13, 0.025, 0.03, 0.13, 0.1);
  ball(body, "#79563d", 0.16, 0.86, -0.12, 0.1, 0.15, 0.09);
  cylinder(body, SKIN, 0, 1.44, 0, 0.06, 0.065, 0.1, 6);
  const head = humanHead(body, 1.59);
  if (pose === "idle") head.rotation.y = Math.sin(phase * Math.PI * 2) * 0.08;
  workGear(body, hands, pose);
}

function carryHerb(body, hands) {
  // This parcel follows the two palms; it is the same geometry as the ground bundle.
  const palms = hands.map((hand) =>
    body.worldToLocal(hand.getWorldPosition(new THREE.Vector3())),
  );
  const middle = palms[0].clone().add(palms[1]).multiplyScalar(0.5);
  const parcel = group(body, middle.x, middle.y - 0.07, middle.z + 0.025);
  parcel.rotation.y = Math.PI / 2;
  mugwortBundle(parcel);
}

function workGear(body, hands, pose) {
  if (Object.hasOwn(PAIL_POSES, pose)) {
    const palmWorld = hands[1].localToWorld(new THREE.Vector3(0, -0.025, 0));
    const palm = body.worldToLocal(palmWorld.clone());
    const vessel = pail(body, PAIL_POSES[pose]);
    vessel.name = "carried-pail";
    vessel.position.copy(palm).sub(new THREE.Vector3(0, PAIL_GRIP, 0));
    const gripWorld = vessel.localToWorld(new THREE.Vector3(0, PAIL_GRIP, 0));
    body.userData.pailGripError = gripWorld.distanceTo(palmWorld);
    return;
  }
  if (pose === "carry-herb") {
    carryHerb(body, hands);
    return;
  }
  if (pose === "carry-ration" || pose === "eat") {
    const palms = hands.map((hand) =>
      body.worldToLocal(hand.getWorldPosition(new THREE.Vector3())),
    );
    const center =
      pose === "eat"
        ? palms[0]
        : palms[0].clone().add(palms[1]).multiplyScalar(0.5);
    const parcel = rationParcel(body);
    parcel.position.set(center.x, center.y - 0.055, center.z + 0.025);
    if (pose === "eat") parcel.scale.setScalar(0.6);
    return;
  }
  if (pose === "carry-soil" || pose === "carry-stone") {
    const palms = hands.map((hand) =>
      body.worldToLocal(hand.getWorldPosition(new THREE.Vector3())),
    );
    const center = palms[0].clone().add(palms[1]).multiplyScalar(0.5);
    // A shared cloth gathering sack follows the palms for either loose material.
    const sack = group(body, center.x, center.y - 0.13, center.z + 0.03);
    ball(sack, "#ac9162", 0, 0, 0, 0.24, 0.22, 0.18);
    if (pose === "carry-stone") {
      const contents = stoneFragments(sack, 2);
      contents.scale.set(0.65, 0.65, 0.65);
      contents.position.y = 0.105;
    } else ball(sack, "#72523c", 0, 0.15, 0, 0.2, 0.075, 0.15);
    return;
  }
  if (pose === "dig") {
    const spade = group(hands[0], 0, -0.025, 0);
    cylinder(spade, "#a17b4d", 0, -0.15, 0, 0.023, 0.023, 0.44, 6);
    box(spade, "#8a9993", 0, -0.39, 0, 0.19, 0.2, 0.04);
    return;
  }
  if (pose === "pickup-herb") return;
  if (pose === "carry") {
    for (const z of [0.32, 0.47]) {
      const log = cylinder(body, "#9b754b", 0, 1.02, z, 0.085, 0.085, 0.77, 7);
      log.rotation.z = Math.PI / 2;
      const end = cylinder(
        body,
        "#d4b37a",
        0.392,
        1.02,
        z,
        0.07,
        0.07,
        0.016,
        7,
      );
      end.rotation.z = Math.PI / 2;
    }
    return;
  }
  if (pose === "sleep") return;
  if (pose === "build") {
    // Tool origin is the grip inside the palm; the head sits beyond the fist.
    const mallet = group(hands[0], 0, -0.025, 0);
    cylinder(mallet, "#a17b4d", 0, -0.1, 0, 0.023, 0.023, 0.36, 6);
    box(mallet, "#ae8656", 0, -0.25, 0, 0.21, 0.115, 0.105);
    box(mallet, "#dac192", -0.11, -0.25, 0, 0.025, 0.105, 0.098);
    return;
  }
  const axe = group(hands[0], 0, -0.025, 0);
  axe.rotation.x = 0.12;
  cylinder(axe, "#a17b4d", 0, -0.14, 0, 0.022, 0.022, 0.44, 6);
  box(axe, "#91a4a0", 0.06, -0.33, 0, 0.18, 0.12, 0.045);
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

function goblin(body, phase, moving, pose) {
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
  if (pose === "hit") {
    // Tumble through a low landing and recover without a flat vertical spin.
    const recovery = Math.max(0, (phase - 0.55) / 0.45);
    body.rotation.z = (1 - recovery) * (-0.65 + phase * 1.15);
    body.rotation.x = (1 - recovery) * (0.22 - phase * 0.7);
    // Keep the native foot clearance while the torso tumbles; the rotation
    // supplies the landing read without sinking the whole puppet underground.
    body.position.y =
      phase < 0.55
        ? -Math.min(1, phase * 2.4) * 0.05
        : -0.05 * (1 - recovery);
  }
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
    const earRoot = group(body, side * 0.09, 0.54, 0.19);
    earRoot.rotation.z =
      !moving && phase >= 0.625 && phase < 0.75 ? side * 0.18 : 0;
    const ear = new THREE.Shape();
    ear.moveTo(side * 0.025, 0.545);
    ear.lineTo(side * 0.11, 0.745);
    ear.lineTo(side * 0.15, 0.53);
    mesh(
      earRoot,
      new THREE.ExtrudeGeometry(ear, {
        depth: 0.055,
        bevelEnabled: false,
      }).translate(-side * 0.09, -0.54, 0),
      patch,
      0,
      0,
      0,
    );
    const inner = new THREE.Shape();
    inner.moveTo(side * 0.057, 0.56);
    inner.lineTo(side * 0.108, 0.675);
    inner.lineTo(side * 0.126, 0.55);
    mesh(
      earRoot,
      new THREE.ShapeGeometry(inner).translate(-side * 0.09, -0.54, 0),
      "#c89384",
      0,
      0,
      0.058,
    );
    const blink = !moving && phase >= 0.625 && phase < 0.75;
    box(
      body,
      "#bf9954",
      side * 0.067,
      0.485,
      0.335,
      0.04,
      blink ? 0.007 : 0.03,
      0.02,
    );
  }
  ball(body, cream, 0, 0.42, 0.325, 0.075, 0.052, 0.06);
  box(body, "#b77e71", 0, 0.445, 0.383, 0.035, 0.024, 0.018);
  const sway = Math.sin(phase * Math.PI * 2) * (moving ? 0.05 : 0.11);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.35, -0.24),
    new THREE.Vector3(0.02 + sway * 0.25, 0.47, -0.46),
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

function witchHat(parent, { tilt = 0.16, accent = "#c98259" } = {}) {
  const hat = group(parent, 0, 1.78, 0);
  cylinder(hat, "#302b42", 0, 0, 0.02, 0.27, 0.29, 0.055, 8);
  const crown = mesh(
    hat,
    new THREE.ConeGeometry(0.19, 0.48, 7),
    "#393249",
    -0.06,
    0.25,
    0,
  );
  crown.rotation.z = tilt;
  const tip = mesh(
    hat,
    new THREE.ConeGeometry(0.07, 0.21, 6),
    "#393249",
    -0.06 - Math.sin(tilt) * 0.24,
    0.46,
    0,
  );
  tip.rotation.z = tilt + 0.85;
  box(hat, accent, 0, 0.07, 0.2, 0.19, 0.035, 0.028).rotation.z = tilt;
  return hat;
}

function witchHead(parent, hair, hat) {
  humanHead(parent, 1.57, hair);
  witchHat(parent, hat);
}

function witchCrooked(body, phase, moving) {
  legs(body, phase, moving, {
    hip: 0.9,
    spread: 0.1,
    width: 0.13,
    cloth: "#373346",
    boots: "#282938",
  });
  coat(body, "#343044", 0.96, 1.4, 0.48, 0.43);
  const hands = arms(body, phase, moving, {
    shoulder: 1.34,
    spread: 0.22,
    length: 0.25,
    sleeve: "#39334a",
    hand: SKIN,
    action: "idle",
  });
  witchHead(body, "#c9c6ab", { tilt: 0.38, accent: "#6aafa5" });
  // A long hair lock and a small teal charm separate the profile from the robe.
  const hair = group(body, -0.08, 1.57, -0.09);
  hair.rotation.x = moving ? Math.sin(phase * Math.PI * 2) * 0.12 - 0.12 : 0;
  box(hair, "#c9c6ab", -0.06, -0.3, 0, 0.19, 0.58, 0.13).rotation.z = -0.16;
  box(hair, "#a7b3a0", 0.07, -0.24, -0.05, 0.09, 0.5, 0.1).rotation.z = 0.12;
  box(body, "#4b9a9a", 0.22, 1.24, 0.12, 0.045, 0.14, 0.045);
  const wand = group(hands[1], 0, -0.08, 0.08);
  wand.rotation.x = -0.25;
  cylinder(wand, "#76533e", 0, 0, 0, 0.018, 0.025, 0.62, 6);
  ball(wand, "#6cb5ae", 0, 0.31, 0, 0.06, 0.06, 0.06);
}

function witchRunner(body, phase, moving, pose) {
  legs(body, phase, moving, {
    hip: 0.88,
    spread: 0.13,
    width: 0.115,
    cloth: "#343040",
    boots: "#3a3030",
    action: pose,
  });
  // A short jacket and separated trousers make this silhouette read as practical.
  box(body, "#403a4b", 0, 1.08, 0, 0.37, 0.36, 0.25);
  box(body, "#b36c52", 0, 0.99, 0.14, 0.28, 0.055, 0.04);
  const hands = arms(body, phase, moving, {
    shoulder: 1.35,
    spread: 0.22,
    length: 0.24,
    sleeve: "#403a4b",
    hand: SKIN,
    action: pose,
  });
  witchHead(body, "#9a5443", { tilt: -0.2, accent: "#6f9f8b" });
  copperHair(body, phase, moving, pose);
  box(body, "#d09b62", 0.2, 1.1, 0.16, 0.06, 0.12, 0.03);
  workGear(body, hands, pose);
}

// Broad tapered locks read as a single generous silhouette at 1x. Motion is
// authored from the bake phase; no hair simulation or wall-clock owner.
function copperHair(body, phase, moving, pose) {
  const angle = phase * Math.PI * 2;
  const working = [
    "chop",
    "build",
    "dig",
    "pickup",
    "pickup-herb",
    "deliver",
  ].includes(pose);
  const sway = moving ? 0.18 : working ? 0.1 : 0.035;
  const root = group(body, 0, 1.62, -0.12);
  root.scale.set(0.9, 0.86, 0.9);
  root.rotation.x = (moving ? 0.38 : 0.16) + Math.sin(angle - 0.9) * sway;
  root.rotation.z = Math.sin(angle - 0.7) * sway * 0.75;
  root.rotation.y = Math.sin(angle - 1.2) * sway * 0.65;
  if (pose === "sleep") {
    root.position.z = 0.03;
    root.scale.z *= 0.28;
    root.rotation.set(0, 0, 0);
  }
  const profile = new THREE.Shape();
  profile.moveTo(-0.12, 0);
  profile.lineTo(0.11, 0.01);
  profile.lineTo(0.24, -0.24);
  profile.lineTo(0.27, -0.56);
  profile.lineTo(0.1, -0.96);
  profile.lineTo(0.015, -0.76);
  profile.lineTo(-0.11, -1.03);
  profile.lineTo(-0.17, -0.83);
  profile.lineTo(-0.23, -0.58);
  profile.lineTo(-0.24, -0.24);
  profile.closePath();
  for (const [x, z, scale, color, delay] of [
    [-0.1, -0.1, 1.03, "#743e35", 0],
    [0.1, -0.12, 1.1, "#ac6247", 0.55],
    [-0.09, -0.22, 0.88, "#c47b55", 1.05],
  ]) {
    const lock = group(root, x, 0, z);
    lock.rotation.z = Math.sin(angle - 1.1 - delay) * sway * 0.35;
    lock.scale.set(scale, scale, 1);
    mesh(
      lock,
      new THREE.ExtrudeGeometry(profile, {
        depth: 0.13,
        bevelEnabled: false,
      }),
      color,
      0,
      0,
      0,
    );
    // Broken long streaks and separated tips prevent the back view reading as
    // one smooth oval, while keeping the palette and polygon count restrained.
    box(lock, "#db9664", -0.06, -0.23, -0.012, 0.035, 0.28, 0.024).rotation.z =
      -0.12;
    box(lock, "#8d4d39", 0.04, -0.6, -0.012, 0.045, 0.32, 0.024).rotation.z =
      0.12;
  }
  // A short face-framing lock leaves the working arm and palms visible.
  box(body, "#b66b4c", 0.16, 1.43, 0.03, 0.075, 0.28, 0.12).rotation.z = 0.13;
}

function childCloth(body, phase, moving) {
  legs(body, phase, moving, {
    hip: 0.53,
    spread: 0.09,
    width: 0.1,
    cloth: "#4b4658",
    boots: "#3c3b43",
  });
  coat(body, "#4b4658", 0.6, 0.9, 0.4, 0.31);
  arms(body, phase, moving, {
    shoulder: 0.88,
    spread: 0.16,
    length: 0.19,
    sleeve: "#4b4658",
    hand: SKIN,
  });
  humanHead(body, 1.08, "#6f5549");
  box(body, "#75a8a0", 0, 1.24, 0.13, 0.23, 0.055, 0.035);
  box(body, "#c07a59", 0.16, 0.91, 0.13, 0.055, 0.08, 0.035);
}

function childApprentice(body, phase, moving) {
  legs(body, phase, moving, {
    hip: 0.5,
    spread: 0.1,
    width: 0.095,
    cloth: "#3f4650",
    boots: "#514536",
  });
  box(body, "#3f4650", 0, 0.72, 0, 0.33, 0.35, 0.24);
  box(body, "#d19a63", 0, 0.87, 0.14, 0.2, 0.05, 0.035);
  arms(body, phase, moving, {
    shoulder: 0.91,
    spread: 0.17,
    length: 0.18,
    sleeve: "#3f4650",
    hand: SKIN,
  });
  humanHead(body, 1.1, "#3c353b");
  const cap = new THREE.ConeGeometry(0.13, 0.22, 6);
  mesh(body, cap, "#537f85", 0, 1.31, 0.01).rotation.z = -0.22;
  box(body, "#e0b66f", -0.16, 0.82, 0.15, 0.045, 0.15, 0.035);
}

const FIGURES = {
  rowan,
  knight,
  wizard,
  goblin,
  cat,
  "witch-crooked": witchCrooked,
  "witch-runner": witchRunner,
  "child-cloth": childCloth,
  "child-apprentice": childApprentice,
};

export function figure(kind, phase = 0, direction = 0, pose = "idle") {
  const s = scene();
  const puppet = group(s);
  puppet.rotation.y = direction;
  const moving =
    pose === "walk" ||
    pose === "carry" ||
    pose === "carry-herb" ||
    pose === "carry-soil" ||
    pose === "carry-stone" ||
    pose === "carry-ration" ||
    pose === "hit" ||
    Object.hasOwn(PAIL_POSES, pose);
  const body = group(
    puppet,
    0,
    moving ? Math.abs(Math.sin(phase * Math.PI * 2)) * 0.025 : 0,
    0,
  );
  if (
    ["build", "dig"].includes(pose) &&
    ["rowan", "witch-runner"].includes(kind)
  )
    body.position.y = -0.39;
  if (pose === "idle" && ["rowan", "witch-runner", "cat"].includes(kind)) {
    body.scale.y = 1 + Math.sin(phase * Math.PI * 2) * 0.012;
    if (kind !== "cat") body.rotation.z = Math.sin(phase * Math.PI * 2) * 0.008;
  }
  if (pose === "sleep" && kind === "cat") {
    ball(body, "#e4ddbb", 0, 0.16, 0, 0.26, 0.15, 0.23);
    ball(body, "#465c57", -0.06, 0.24, -0.06, 0.18, 0.055, 0.16);
    ball(body, "#e4ddbb", 0.1, 0.2, 0.16, 0.1, 0.09, 0.09);
    box(body, "#465c57", 0.11, 0.26, 0.18, 0.1, 0.07, 0.08);
  } else {
    FIGURES[kind](body, phase, moving, pose);
    if (pose === "sleep") {
      body.rotation.x = -Math.PI / 2;
      body.position.set(0, 0.25, 1.45);
    }
  }
  return s;
}
