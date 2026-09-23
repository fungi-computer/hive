// Original Three geometry -> fixed low-resolution canvas textures -> Pixi.
// Reference pictures never enter this pipeline.
import * as THREE from "three";
import { Texture } from "pixi.js";
import { camera, worldCamera, project, WIDTH, HEIGHT } from "./art/scale.js";
import { clearing, tree, excavationScene } from "./art/clearing.js";
import { figure } from "./art/figures.js";
import { mugwort, MUGWORT_STAGES } from "./art/herbs.js";
import { building, woodPile, wallJoint } from "./art/home.js";
import { PROFILES, mixedShelf } from "./art/mixed-shelf.js";
import { basinScene } from "./art/spring-basin.js";
import { brewerCache } from "./art/brew-supplies.js";
import { pail } from "./art/pail.js";
import { scene } from "./art/geometry.js";
import { soilPile } from "./art/soil.js";
import { rationPile } from "./art/food.js";
import { stationScene } from "./art/brew-station.js";
import { STATION_VISUAL_PROFILES } from "./brew-station-profiles.js";
import { BUILDINGS } from "./construction.js";
import { registerVisibleTexture } from "./visual-hit-geometry.js";

function outline(ctx, w, h) {
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

function propScene(draw) {
  const result = scene();
  draw(result);
  return result;
}
export function bake(renderer, s, c, w, h, ink = true) {
  renderer.setSize(w, h, false);
  renderer.render(s, c);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(renderer.domElement, 0, 0);
  if (ink) outline(ctx, w, h);
  s.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  registerVisibleTexture(texture, ctx.getImageData(0, 0, w, h).data, w, h);
  return texture;
}
export function anchor(c) {
  const foot = new THREE.Vector3(0, 0, 0).project(c);
  return { x: 0.5, y: (1 - foot.y) / 2 };
}
function bakeTerrainPatch(renderer, terrain, previous, changedCells) {
  // Bake only exposed earth, clipped to the union of actual top openings.
  // The static board is never rebuilt by a dig; fill restores its original top.
  // Both this mask and mouse picking use the same world-space cell faces.
  const points = changedCells.flatMap(({ x, z }) =>
    [-2, 2].flatMap((dx) =>
      [-2, 2].flatMap((dz) => [0, -0.8].map((y) => project(x + dx, z + dz, y))),
    ),
  );
  const left = Math.max(0, Math.floor(Math.min(...points.map((p) => p.x))) - 2);
  const top = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y))) - 2);
  const right = Math.min(
    WIDTH,
    Math.ceil(Math.max(...points.map((p) => p.x))) + 3,
  );
  const bottom = Math.min(
    HEIGHT,
    Math.ceil(Math.max(...points.map((p) => p.y))) + 3,
  );
  const camera = worldCamera.clone();
  camera.setViewOffset(WIDTH, HEIGHT, left, top, right - left, bottom - top);
  const patch = bake(
    renderer,
    excavationScene(terrain),
    camera,
    right - left,
    bottom - top,
    false,
  );
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  context.drawImage(previous.source.resource, 0, 0);
  context.beginPath();
  for (const { x, z } of terrain.edits) {
    const points = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([dx, dz]) => project(x + dx, z + dz, 0));
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
  }
  context.clip();
  context.clearRect(left, top, right - left, bottom - top);
  context.drawImage(patch.source.resource, left, top);
  patch.destroy(true);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}

export async function bakeArt() {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const portrait = camera(80, 80),
    prop = camera(112, 112, 1.1);
  const art = {
    ground: bake(renderer, clearing(), worldCamera, WIDTH, HEIGHT, false),
    figures: {},
    tree: {},
    herbs: { mugwort: {} },
    buildings: {},
    sources: { spring: {}, cache: {} },
    pail: {},
    wood: {},
    soil: {},
    ration: {},
    wallJoints: {},
    mixedShelf: {},
    pawnAnchor: anchor(portrait),
    propAnchor: anchor(prop),
  };
  const workPoses = [
    "idle",
    "walk",
    "chop",
    "build",
    "dig",
    "carry-soil",
    "carry-ration",
    "eat",
    "carry",
    "carry-herb",
    "carry-pail-empty",
    "carry-pail-half",
    "carry-pail-full",
    "pickup-herb",
    "pickup",
    "deliver",
    "sleep",
  ];
  for (const [kind, poses] of [
    ["rowan", workPoses],
    ["witch-runner", workPoses],
    ["cat", ["idle", "walk", "sleep"]],
    ["goblin", ["idle"]],
  ]) {
    const target = (art.figures[kind] = {});
    for (const pose of poses) {
      target[pose] = [];
      for (let direction = 0; direction < 4; direction++) {
        const count =
          pose === "sleep" || (pose === "idle" && kind === "goblin") ? 1 : 8;
        target[pose].push(
          Array.from({ length: count }, (_, frame) =>
            bake(
              renderer,
              figure(kind, frame / count, (direction * Math.PI) / 2, pose),
              portrait,
              80,
              80,
            ),
          ),
        );
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  for (const stage of ["standing", "notched", "stump"])
    art.tree[stage] = bake(renderer, tree(stage), prop, 112, 112);
  for (const stage of MUGWORT_STAGES)
    art.herbs.mugwort[stage] = bake(renderer, mugwort(stage), prop, 112, 112);
  for (const type of Object.keys(BUILDINGS)) {
    art.buildings[type] = {};
    const stages =
      type === "shelf"
        ? ["stakes", "frame", "finished", "filled"]
        : ["stakes", "frame", "finished"];
    for (const stage of stages)
      art.buildings[type][stage] = [0, 1].map((direction) =>
        bake(renderer, building(type, stage, direction), prop, 112, 112),
      );
    if (type === "brew-station")
      art.buildings[type].profiles = Object.fromEntries(
        STATION_VISUAL_PROFILES.map((profile) => [
          profile,
          [0, 1].map((direction) => {
            const frames = profile === "prepare-attended" ? 8 : 1;
            return Array.from({ length: frames }, (_, frame) =>
              bake(
                renderer,
                stationScene("finished", direction, {
                  profile,
                  phase: frame / frames,
                }),
                prop,
                112,
                112,
              ),
            );
          }),
        ]),
      );
  }
  for (const fill of ["dry", "low", "full"])
    art.sources.spring[fill] = bake(renderer, basinScene(fill), prop, 112, 112);
  for (const [state, sealed] of [
    ["sealed", true],
    ["repaired", false],
  ])
    art.sources.cache[state] = bake(
      renderer,
      propScene((parent) => brewerCache(parent, sealed)),
      prop,
      112,
      112,
    );
  for (const [state, units] of [
    ["empty", 0],
    ["filled", 2],
  ])
    art.pail[state] = bake(
      renderer,
      propScene((parent) => pail(parent, units)),
      prop,
      112,
      112,
    );
  for (const profile of PROFILES)
    art.mixedShelf[profile.key] = [0, 1].map((direction) =>
      bake(renderer, mixedShelf(profile.key, direction), prop, 112, 112),
    );
  for (const stage of ["stakes", "frame", "finished"])
    art.wallJoints[stage] = Array.from({ length: 16 }, (_, mask) =>
      bake(renderer, wallJoint(stage, mask || 5), prop, 112, 112),
    );
  for (let amount = 1; amount <= 6; amount++)
    art.wood[amount] = bake(renderer, woodPile(amount), prop, 112, 112);
  for (let amount = 1; amount <= 3; amount++)
    art.soil[amount] = bake(renderer, soilPile(amount), prop, 112, 112);
  for (let amount = 1; amount <= 3; amount++)
    art.ration[amount] = bake(renderer, rationPile(amount), prop, 112, 112);
  // This one retained renderer rebakes terrain only after a physical edit/load.
  // It never updates simulation state or time. View owns replacement textures.
  art.bakeTerrain = (terrain, previous, changedCells) =>
    bakeTerrainPatch(renderer, terrain, previous, changedCells);
  art.dispose = () => renderer.dispose();
  return art;
}
