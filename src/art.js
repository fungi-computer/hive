// Original geometry and poses. Every bitmap below is rendered from these meshes;
// no reference image is loaded. Three is used only for baking; Pixi owns the game.
import * as THREE from "three";
import { Texture } from "pixi.js";

export const SIZE = { width: 480, height: 320, span: 14 };
const C = {
  ink: "#292b2a",
  wood: "#76503b",
  end: "#a0744c",
  lightWood: "#b78a55",
  stone: "#758575",
  plaster: "#bec39b",
  cream: "#eee0b4",
  red: "#ab5348",
  skin: "#91ae52",
  skinLight: "#bbc96b",
  teal: "#35716a",
  gold: "#e9ac52",
};
const materials = new Map();
function mat(color) {
  if (!materials.has(color))
    materials.set(
      color,
      new THREE.MeshLambertMaterial({ color, flatShading: true }),
    );
  return materials.get(color);
}
function mesh(parent, geo, color, x, y, z) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function box(p, color, x, y, z, w, h, d) {
  return mesh(p, new THREE.BoxGeometry(w, h, d), color, x, y, z);
}
function ball(p, color, x, y, z, w, h = w, d = w) {
  const m = mesh(p, new THREE.SphereGeometry(1, 8, 6), color, x, y, z);
  m.scale.set(w, h, d);
  return m;
}
function cylinder(p, color, x, y, z, top, bottom, h, sides = 10) {
  return mesh(
    p,
    new THREE.CylinderGeometry(top, bottom, h, sides),
    color,
    x,
    y,
    z,
  );
}
function group(p, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  p.add(g);
  return g;
}
function camera(width, height, span, targetY) {
  const c = new THREE.OrthographicCamera(
    -span / 2,
    span / 2,
    (span * height) / width / 2,
    (-span * height) / width / 2,
    0.1,
    80,
  );
  c.position.set(12, 12 + targetY, 12);
  c.lookAt(0, targetY, 0);
  c.updateMatrixWorld();
  return c;
}
const roomCamera = camera(480, 320, 14, 0.5);
export function project(x, z, y = 0) {
  const p = new THREE.Vector3(x - 3, y, z - 3).project(roomCamera);
  return { x: Math.round((p.x + 1) * 240), y: Math.round((1 - p.y) * 160) };
}
function scene() {
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight("#fff1cc", "#606c71", 2.15));
  const sun = new THREE.DirectionalLight("#ffe0a4", 2.7);
  sun.position.set(-3, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -6,
    right: 6,
    top: 6,
    bottom: -6,
    near: 0.1,
    far: 30,
  });
  sun.shadow.bias = -0.001;
  s.add(sun);
  return s;
}
function mushroom(p, x, y, z, scale = 1, color = C.red) {
  cylinder(
    p,
    C.cream,
    x,
    y + 0.14 * scale,
    z,
    0.045 * scale,
    0.065 * scale,
    0.28 * scale,
    7,
  );
  const cap = ball(
    p,
    color,
    x,
    y + 0.3 * scale,
    z,
    0.2 * scale,
    0.13 * scale,
    0.2 * scale,
  );
  cap.rotation.z = 0.13;
  ball(
    p,
    C.cream,
    x - 0.07 * scale,
    y + 0.4 * scale,
    z + 0.06 * scale,
    0.04 * scale,
    0.018 * scale,
    0.04 * scale,
  );
}
function room() {
  const s = scene();
  // Earth pedestal, stone footings and individually jointed wooden floorboards.
  box(s, "#373d31", 0, -0.46, 0, 7.7, 0.5, 7.7);
  box(s, "#526348", 0, -0.22, 0, 7.8, 0.16, 7.8);
  box(s, C.wood, 0, -0.14, 0, 7.12, 0.22, 7.12);
  for (let z = 0; z < 14; z++)
    for (let x = 0; x < 7; x++) {
      const shade = ["#987342", "#ab8450", "#a17b48", "#927043"][
        (x * 7 + z * 3) % 4
      ];
      box(s, shade, x - 3, 0.003, z * 0.5 - 3.25, 0.972, 0.06, 0.474);
      if ((x + z) % 3 === 0)
        box(s, "#73563a", x - 3.3, 0.036, z * 0.5 - 3.22, 0.25, 0.006, 0.017);
      for (const dx of [-0.4, 0.4])
        box(
          s,
          "#55493b",
          x - 3 + dx,
          0.036,
          z * 0.5 - 3.4,
          0.022,
          0.006,
          0.022,
        );
    }
  for (let a = 0; a < 7; a++) {
    box(s, C.stone, a - 3, -0.26, 3.57, 0.92, 0.32, 0.25);
    box(s, "#687464", 3.57, -0.26, a - 3, 0.25, 0.32, 0.92);
  }
  // Two open cutaway walls: sage plaster, dark beams, masonry along the base.
  box(s, C.plaster, 0, 1.22, -3.55, 7.2, 2.45, 0.19);
  box(s, "#9da883", -3.55, 1.22, 0, 0.19, 2.45, 7.2);
  for (let a = 0; a < 7; a++)
    for (let h = 0; h < 2; h++) {
      box(
        s,
        ["#7e8e79", "#8d997f", "#79866f"][(a + h) % 3],
        a - 3,
        0.18 + h * 0.32,
        -3.4,
        0.94,
        0.29,
        0.25,
      );
      box(
        s,
        ["#74856e", "#849277", "#73806a"][(a + h) % 3],
        -3.4,
        0.18 + h * 0.32,
        a - 3,
        0.25,
        0.29,
        0.94,
      );
    }
  for (const a of [-3.48, 0, 3.48]) {
    box(s, C.wood, a, 1.28, -3.39, 0.17, 2.6, 0.25);
    box(s, C.wood, -3.39, 1.28, a, 0.25, 2.6, 0.17);
  }
  for (const y of [0.67, 2.44]) {
    box(s, C.wood, 0, y, -3.4, 7.25, 0.15, 0.26);
    box(s, C.wood, -3.4, y, 0, 0.26, 0.15, 7.25);
  }
  // Amber diamond window and its thick sill.
  box(s, "#503e30", 1.65, 1.57, -3.39, 1.5, 1.32, 0.16);
  box(s, "#d9ad63", 1.65, 1.57, -3.29, 1.23, 1.05, 0.035);
  for (const x of [1.3, 1.98])
    for (const angle of [-0.6, 0.6]) {
      const bar = box(s, C.wood, x, 1.57, -3.23, 0.055, 1.18, 0.065);
      bar.rotation.z = angle;
    }
  box(s, C.lightWood, 1.65, 0.94, -3.15, 1.68, 0.14, 0.5);
  // Bed: teal wool blanket, squat posts, two little pillows.
  const bed = group(s, 2.15, 0, -2.15);
  box(bed, C.wood, 0, 0.32, 0, 1.45, 0.22, 2.12);
  box(bed, C.cream, 0, 0.5, 0, 1.34, 0.22, 1.98);
  box(bed, C.teal, 0, 0.65, 0.27, 1.38, 0.12, 1.4);
  for (const x of [-0.55, 0.55])
    box(bed, "#b9bd7e", x, 0.72, 0.3, 0.06, 0.012, 1.37);
  box(bed, "#f2dfb8", 0, 0.68, -0.64, 0.95, 0.2, 0.48);
  for (const x of [-0.67, 0.67])
    for (const z of [-0.97, 0.97]) {
      box(bed, C.wood, x, 0.42, z, 0.13, 0.85, 0.13);
      ball(bed, C.lightWood, x, 0.85, z, 0.1);
    }
  box(bed, C.wood, 0, 0.82, -1.01, 1.4, 0.36, 0.1);
  // Hearth and copper pot: the first useful station.
  const hearth = group(s, -2, 0, -2.35);
  box(hearth, "#5c6358", 0, 0.12, 0, 1.72, 0.22, 1.46);
  for (const x of [-0.63, 0.63])
    box(hearth, C.stone, x, 0.54, -0.1, 0.37, 0.8, 1.08);
  box(hearth, "#353e39", 0, 0.6, -0.39, 0.93, 0.88, 0.38);
  box(hearth, C.stone, 0, 1.07, -0.16, 1.64, 0.26, 1.14);
  box(hearth, C.lightWood, 0, 1.27, -0.12, 1.84, 0.16, 1.28);
  box(hearth, "#7c8170", 0, 1.84, -0.45, 1.1, 1.02, 0.5);
  for (const z of [-0.1, 0.3]) {
    const log = cylinder(hearth, C.wood, 0, 0.32, z, 0.1, 0.1, 0.7, 7);
    log.rotation.z = Math.PI / 2;
  }
  for (const x of [-0.25, 0, 0.25]) {
    const f = mesh(
      hearth,
      new THREE.ConeGeometry(0.17, 0.48, 5),
      "#eb8e37",
      x,
      0.53,
      0.08,
    );
    f.rotation.z = x;
    mesh(
      hearth,
      new THREE.ConeGeometry(0.09, 0.3, 5),
      "#f9ce66",
      x,
      0.46,
      0.19,
    );
  }
  cylinder(hearth, "#333d39", 0, 1.42, -0.06, 0.42, 0.27, 0.29);
  cylinder(hearth, "#dfb458", 0, 1.57, -0.06, 0.365, 0.365, 0.022);
  for (const x of [-0.48, 0.48])
    box(hearth, "#333d39", x, 1.5, -0.06, 0.2, 0.07, 0.11);
  // Peg rail, herbs, jars and cutting board along the left wall.
  box(s, C.wood, -3.18, 1.72, 0.25, 0.16, 0.12, 2.15);
  for (let i = 0; i < 4; i++) {
    box(s, C.gold, -3.02, 1.67, -0.5 + i * 0.48, 0.18, 0.09, 0.07);
    for (let j = 0; j < 3; j++) {
      const leaf = ball(
        s,
        ["#668d59", "#879957", "#a9a865"][i % 3],
        -2.99,
        1.35 - j * 0.1,
        -0.52 + i * 0.48 + j * 0.06,
        0.1,
        0.2,
        0.06,
      );
      leaf.rotation.x = j * 0.6;
    }
  }
  const counter = group(s, -2.85, 0, 0.55);
  box(counter, C.wood, 0, 0.43, 0, 0.88, 0.86, 1.94);
  box(counter, C.lightWood, 0, 0.91, 0, 1.08, 0.12, 2.09);
  for (const z of [-0.55, 0.55]) {
    box(counter, "#5b4835", 0.455, 0.47, z, 0.025, 0.53, 0.78);
    box(counter, C.gold, 0.49, 0.64, z, 0.05, 0.07, 0.14);
  }
  cylinder(counter, "#ba6b43", 0, 1.14, -0.55, 0.17, 0.21, 0.34);
  cylinder(counter, C.cream, 0, 1.33, -0.55, 0.19, 0.19, 0.06);
  box(counter, "#c09d65", 0.06, 1, 0.37, 0.68, 0.07, 0.65);
  mushroom(counter, 0.04, 1.03, 0.3, 0.7);
  mushroom(counter, -0.15, 1.03, 0.5, 0.55, "#b67b49");
  // A woven runner and welcome steps leave the walking corridor legible.
  box(s, "#74443d", 0.1, 0.045, 1.7, 2.2, 0.018, 1.63);
  box(s, C.red, 0.1, 0.059, 1.7, 1.97, 0.012, 1.4);
  for (const z of [1.12, 2.28])
    box(s, "#deb46b", 0.1, 0.068, z, 1.97, 0.01, 0.065);
  for (let i = 0; i < 11; i++)
    for (const z of [0.85, 2.55])
      box(s, "#deb46b", -0.85 + i * 0.19, 0.059, z, 0.055, 0.018, 0.2);
  for (let i = 0; i < 3; i++)
    box(s, C.wood, -1.6, -0.12 - i * 0.12, 3.65 + i * 0.25, 1.5, 0.16, 0.5);
  // Moss and tiny original mushrooms grow around the foundation.
  for (let i = 0; i < 22; i++) {
    const a = i * 2.399;
    const x = Math.cos(a) * 3.72,
      z = Math.sin(a) * 3.72;
    if (Math.abs(x) < 3.35 && Math.abs(z) < 3.35) continue;
    ball(
      s,
      ["#788a4b", "#8f9c55", "#64754c"][i % 3],
      x,
      -0.12,
      z,
      0.18,
      0.09,
      0.2,
    );
    if (i % 4 === 0) mushroom(s, x, -0.1, z, 0.5);
  }
  return s;
}
function ear(parent, side) {
  const shape = new THREE.Shape();
  shape.moveTo(0.22 * side, 0.98);
  shape.lineTo(0.79 * side, 1.47);
  shape.lineTo(0.58 * side, 0.97);
  shape.lineTo(0.28 * side, 0.89);
  const m = mesh(
    parent,
    new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }),
    C.skin,
    0,
    0,
    0.03,
  );
  const inner = new THREE.Shape();
  inner.moveTo(0.35 * side, 1.03);
  inner.lineTo(0.68 * side, 1.35);
  inner.lineTo(0.53 * side, 1.05);
  mesh(parent, new THREE.ShapeGeometry(inner), "#bdad70", 0, 0, 0.141);
  return m;
}
function pawn(pose, phase, direction) {
  const s = scene();
  const puppet = group(s);
  puppet.rotation.y = direction;
  const stride = pose === "walk" ? Math.sin(phase * Math.PI * 2) : 0;
  const lift =
    pose === "walk"
      ? Math.abs(stride) * 0.045
      : Math.sin(phase * Math.PI * 2) * 0.012;
  const body = group(puppet, 0, lift, 0);
  const shirt = C.teal;
  for (const side of [-1, 1]) {
    const leg = group(body, 0.14 * side, 0.37, 0);
    leg.rotation.x = stride * side * 0.55;
    box(leg, "#564837", 0, -0.15, 0, 0.17, 0.31, 0.2);
    box(leg, "#393b31", 0, -0.3, 0.06, 0.22, 0.14, 0.33);
  }
  ball(body, shirt, 0, 0.62, 0, 0.32, 0.38, 0.22);
  box(body, "#654931", 0, 0.43, 0.18, 0.53, 0.09, 0.12);
  {
    box(body, C.cream, 0, 0.63, 0.218, 0.37, 0.47, 0.06);
    box(body, "#c9b68a", 0.03, 0.49, 0.256, 0.23, 0.15, 0.026);
    box(body, C.cream, 0, 0.9, 0.19, 0.3, 0.18, 0.05);
  }
  for (const side of [-1, 1]) {
    const arm = group(body, 0.29 * side, 0.83, 0);
    arm.rotation.x =
      pose === "work"
        ? -0.9 - Math.sin(phase * Math.PI * 2) * 0.35
        : pose === "carry"
          ? -0.95
          : -stride * side * 0.6;
    arm.rotation.z = side * 0.12;
    ball(arm, shirt, 0, -0.075, 0, 0.14, 0.2, 0.15);
    ball(arm, C.skin, 0, -0.29, 0.035, 0.11, 0.14, 0.11);
    if (pose === "work" && side === 1) {
      const spoon = cylinder(
        arm,
        C.lightWood,
        0,
        -0.36,
        0.19,
        0.025,
        0.025,
        0.58,
        5,
      );
      spoon.rotation.x = 1.1;
      ball(arm, C.lightWood, 0, -0.23, 0.44, 0.07, 0.025, 0.09);
    }
  }
  ball(body, C.skin, 0, 1.08, 0.02, 0.37, 0.31, 0.28);
  ear(body, -1);
  ear(body, 1);
  ball(body, C.skinLight, 0, 1.02, 0.28, 0.2, 0.13, 0.19);
  ball(body, C.skin, 0, 1.13, 0.29, 0.13, 0.15, 0.17);
  for (const side of [-1, 1]) {
    box(body, "#ece5b8", 0.177 * side, 1.165, 0.264, 0.155, 0.092, 0.045);
    box(body, "#292c27", 0.178 * side, 1.163, 0.29, 0.065, 0.073, 0.025);
    const brow = box(
      body,
      "#56713b",
      0.18 * side,
      1.235,
      0.267,
      0.2,
      0.05,
      0.065,
    );
    brow.rotation.z = -side * 0.12;
    const fang = mesh(
      body,
      new THREE.ConeGeometry(0.04, 0.11, 4),
      C.cream,
      0.13 * side,
      0.946,
      0.392,
    );
    fang.rotation.x = Math.PI;
  }
  box(body, "#556039", 0, 0.938, 0.373, 0.17, 0.025, 0.025);
  {
    // Floppy saffron cap, tied slightly to one side.
    cylinder(body, C.red, 0, 1.34, 0, 0.29, 0.34, 0.1, 10);
    ball(body, C.gold, -0.075, 1.43, -0.025, 0.3, 0.2, 0.25);
    ball(body, C.gold, -0.29, 1.4, -0.015, 0.15, 0.1, 0.15);
  }
  if (pose === "carry") {
    cylinder(body, C.wood, 0, 0.71, 0.44, 0.21, 0.15, 0.13);
    cylinder(body, C.gold, 0, 0.781, 0.44, 0.19, 0.19, 0.01);
  }
  return s;
}
function table() {
  const s = scene();
  cylinder(s, C.wood, 0, 0.38, 0, 0.13, 0.25, 0.76, 8);
  cylinder(s, C.lightWood, 0, 0.81, 0, 0.79, 0.79, 0.16, 12);
  cylinder(s, "#d0a570", 0, 0.9, 0, 0.74, 0.74, 0.018, 12);
  box(s, "#b87656", 0, 0.92, 0, 0.41, 0.02, 1.38);
  cylinder(s, C.cream, -0.23, 0.95, 0.12, 0.21, 0.2, 0.055);
  cylinder(s, "#e2c998", -0.23, 0.98, 0.12, 0.14, 0.14, 0.018);
  cylinder(s, "#6a6249", 0.26, 1.04, -0.15, 0.09, 0.08, 0.25, 8);
  box(s, C.gold, 0.26, 1.22, -0.15, 0.08, 0.15, 0.08);
  return s;
}
export async function bakeArt() {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const bake = (s, c, w, h, outline = false) => {
    renderer.setSize(w, h, false);
    renderer.render(s, c);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(renderer.domElement, 0, 0);
    if (outline) {
      const src = ctx.getImageData(0, 0, w, h),
        out = ctx.createImageData(w, h);
      out.data.set(src.data);
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;
          if (src.data[i + 3] > 128) continue;
          if ([-1, 1, -w, w].some((d) => src.data[i + d * 4 + 3] > 128))
            out.data.set([43, 48, 38, 255], i);
        }
      ctx.putImageData(out, 0, 0);
    }
    s.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    const texture = Texture.from(canvas);
    texture.source.scaleMode = "nearest";
    return texture;
  };
  const art = {
    room: bake(room(), roomCamera, 480, 320),
    pawn: {},
    table: null,
  };
  const spriteCamera = camera(96, 96, 2.8, 0.65);
  const foot = new THREE.Vector3(0, 0, 0).project(spriteCamera);
  art.anchor = { x: 0.5, y: (1 - foot.y) / 2 };
  const directions = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  renderer.shadowMap.enabled = false;
  art.pawn.keeper = {};
  for (const pose of ["idle", "walk", "work", "carry"]) {
    art.pawn.keeper[pose] = [];
    for (const dir of directions) {
      const frames = [];
      for (let f = 0; f < (pose === "idle" ? 2 : 6); f++)
        frames.push(bake(pawn(pose, f / 6, dir), spriteCamera, 96, 96, true));
      art.pawn.keeper[pose].push(frames);
    }
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const tableScene = table();
  tableScene.scale.set(0.82, 1, 0.82);
  art.table = bake(tableScene, spriteCamera, 96, 96, true);
  renderer.dispose();
  return art;
}
