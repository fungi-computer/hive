import { compositeWaterOccluders } from "./visual-order.js";
import { sliceCamera } from "./art/slice-camera.js";
import { terrainCell } from "./terrain.ts";
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
import { stonePile } from "./art/stone.js";
import { rationPile } from "./art/food.js";
import { stationScene } from "./art/brew-station.js";
import { shipScene } from "./art/ship.js";
import {
  STATION_VISUAL_PROFILES,
  stationProfileOptions,
} from "./brew-station-profiles.js";
import { BUILDINGS } from "./construction.js";
import { registerVisibleTexture } from "./visual-hit-geometry.js";
import { loadStaticArtPack } from "./art/static-pack.js";
import { STATIC_ART_RENDER } from "./art/static-manifest.js";

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
// Scratch query output, not remembered size: every bake reads its actual renderer.
const bakeSize = new THREE.Vector2();
export function bake(renderer, s, c, w, h, ink = true, releaseGeometry = true) {
  renderer.getSize(bakeSize);
  if (bakeSize.x !== w || bakeSize.y !== h) renderer.setSize(w, h, false);
  else renderer.setViewport(0, 0, w, h);
  renderer.render(s, c);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(renderer.domElement, 0, 0);
  if (ink) outline(ctx, w, h);
  s.traverse((o) => {
    if (releaseGeometry && o.geometry) o.geometry.dispose();
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
function bakeTerrainPatch(renderer, terrain, previous, changedCells, faces) {
  // Bake only exposed earth, clipped to the union of actual top openings.
  // Original board art is clipped where canonical generated surfaces differ.
  // Both this mask and mouse picking use the same world-space cell faces.
  const points = changedCells.flatMap(({ x, z }) =>
    [-2, 2].flatMap((dx) =>
      [-2, 2].flatMap((dz) =>
        [0, terrainCell(terrain, x, z).height].map((y) =>
          project(x + dx, z + dz, y),
        ),
      ),
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
    excavationScene(faces),
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
  for (const { x, z } of changedCells) {
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

/** One bounded projected viewport for terrain slices and their water overlay.
 * Signed offsets remain in the original camera frame, never clamped to the board. */
function sliceViewport(renderer, vertices, depthVertices = vertices) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const { x, y, z } of vertices) {
    const point = project(x, z, y);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const x = Math.floor(minX) - 2,
    y = Math.floor(minY) - 2;
  const width = Math.ceil(maxX) - x + 3,
    height = Math.ceil(maxY) - y + 3;
  const gl = renderer.getContext();
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const limit = Math.min(
    renderer.capabilities.maxTextureSize,
    gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    viewport[0],
    viewport[1],
  );
  if (
    ![width, height].every(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= limit,
    )
  )
    throw new Error("Projected slice exceeds the renderer texture limit.");
  const camera = sliceCamera(worldCamera, depthVertices);
  camera.setViewOffset(WIDTH, HEIGHT, x, y, width, height);
  return { x, y, width, height, camera };
}

/** Matching picker faces write depth only. Water owns no input surface. */
function createWaterBake(renderer) {
  const result = scene();
  const mask = new THREE.MeshBasicMaterial({
    colorWrite: false,
    side: THREE.DoubleSide,
  });
  const liquid = new THREE.MeshLambertMaterial({
    color: "#397986",
    side: THREE.DoubleSide,
  });
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  let maskFaces = null;
  const masks = [],
    planes = [];
  let disposed = false;
  function clearMask() {
    for (const mesh of masks) {
      mesh.geometry.dispose();
      result.remove(mesh);
    }
    masks.length = 0;
    maskFaces = null;
  }
  function draw(water, faces, occluders = []) {
    if (disposed) throw new Error("Water baker is disposed");
    if (!water.length) return { texture: Texture.EMPTY, x: 0, y: 0 };
    if (faces !== maskFaces) {
      clearMask();
      maskFaces = faces;
      for (const face of faces) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            face.vertices.flatMap(({ x, y, z }) => [x - 7, y, z - 7]),
            3,
          ),
        );
        geometry.setIndex([0, 1, 2, 0, 2, 3]);
        const mesh = new THREE.Mesh(geometry, mask);
        mesh.renderOrder = -1;
        result.add(mesh);
        masks.push(mesh);
      }
    }
    while (planes.length < water.length) {
      const mesh = new THREE.Mesh(planeGeometry, liquid);
      mesh.rotation.x = -Math.PI / 2;
      result.add(mesh);
      planes.push(mesh);
    }
    planes.forEach((mesh, index) => {
      const surface = water[index];
      mesh.visible = !!surface;
      if (surface)
        mesh.position.set(surface.x - 7, surface.height, surface.z - 7);
    });
    const vertices = water.flatMap((surface) =>
      [-0.5, 0.5].flatMap((dx) =>
        [-0.5, 0.5].map((dz) => ({
          x: surface.x + dx,
          y: surface.height,
          z: surface.z + dz,
        })),
      ),
    );
    const viewport = sliceViewport(renderer, vertices, [
      ...vertices,
      ...faces.flatMap((face) => face.vertices),
    ]);
    const texture = bake(
      renderer,
      result,
      viewport.camera,
      viewport.width,
      viewport.height,
      false,
      false,
    );
    if (occluders.length) {
      // Original atlas frame, not a recolored silhouette or duplicate sprite.
      compositeWaterOccluders(
        texture.source.resource.getContext("2d"),
        viewport,
        occluders,
      );
      texture.source.update();
    }
    return { texture, x: viewport.x, y: viewport.y };
  }
  return {
    bake: draw,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearMask();
      planeGeometry.dispose();
      mask.dispose();
      liquid.dispose();
      result.clear();
      planes.length = 0;
    },
  };
}

function createArtRenderer() {
  const settings = STATIC_ART_RENDER.renderer;
  const renderer = new THREE.WebGLRenderer({
    alpha: settings.alpha,
    antialias: settings.antialias,
    preserveDrawingBuffer: settings.preserveDrawingBuffer,
  });
  renderer.setPixelRatio(settings.pixelRatio);
  renderer.setClearColor(settings.clearColor, settings.clearAlpha);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function textureDisposer(textures) {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const texture of textures) texture.destroy(true);
  };
}

function attachDynamicBakers(art, renderer, disposeStatic) {
  const waterBake = createWaterBake(renderer);
  let disposed = false;
  art.bakeTerrainWater = waterBake.bake;
  art.bakeTerrain = (terrain, previous, changedCells, faces) =>
    bakeTerrainPatch(renderer, terrain, previous, changedCells, faces);
  art.bakeTerrainSlice = (faces) => {
    if (!faces.length) return { texture: Texture.EMPTY, x: 0, y: 0 };
    const { x, y, width, height, camera } = sliceViewport(
      renderer,
      faces.flatMap((face) => face.vertices),
    );
    return {
      texture: bake(
        renderer,
        excavationScene(faces),
        camera,
        width,
        height,
        false,
      ),
      x,
      y,
    };
  };
  art.dispose = () => {
    if (disposed) return;
    disposed = true;
    waterBake.dispose();
    renderer.dispose();
    disposeStatic();
  };
  return art;
}

/** Load the maintained static bank; ordinary startup never falls back to authoring. */
export async function loadArt(onProgress = () => {}, options = {}) {
  const loaded = await loadStaticArtPack({ ...options, onProgress });
  let renderer;
  try {
    renderer = createArtRenderer();
    return attachDynamicBakers(loaded.art, renderer, loaded.dispose);
  } catch (error) {
    renderer?.dispose();
    loaded.dispose();
    throw error;
  }
}

export async function bakeArt(onProgress = () => {}) {
  let completedTextures = 0;
  const bakedTextures = new Set();
  let detail = "Preparing the drawing tools";
  const report = (waitingFor = null) =>
    onProgress({ detail, completedTextures, waitingFor });
  report();
  function bakeStartup(...args) {
    try {
      const texture = bake(...args);
      bakedTextures.add(texture);
      completedTextures++;
      return texture;
    } catch (error) {
      args[1]?.traverse((object) => object.geometry?.dispose());
      throw error;
    }
  }
  const renderer = createArtRenderer();
  const disposeStatic = textureDisposer(bakedTextures);
  try {
    const portrait = camera(
        STATIC_ART_RENDER.portrait.width,
        STATIC_ART_RENDER.portrait.height,
        STATIC_ART_RENDER.portrait.cameraHeight,
      ),
      prop = camera(
        STATIC_ART_RENDER.prop.width,
        STATIC_ART_RENDER.prop.height,
        STATIC_ART_RENDER.prop.cameraHeight,
      ),
      // Vehicles are wider than props; keep one deterministic larger frame
      // and anchor for all four facings rather than squeezing the hull.
      vehicle = camera(
        STATIC_ART_RENDER.vehicle.width,
        STATIC_ART_RENDER.vehicle.height,
        STATIC_ART_RENDER.vehicle.cameraHeight,
      );
    const vehicleAnchor = anchor(vehicle);
    detail = "Drawing the landscape";
    report();
    const art = {
      ground: bakeStartup(
        renderer,
        clearing(),
        worldCamera,
        WIDTH,
        HEIGHT,
        false,
      ),
      figures: {},
      tree: {},
      herbs: { mugwort: {} },
      buildings: {},
      sources: { spring: {}, cache: {} },
      pail: {},
      wood: {},
      soil: {},
      stone: {},
      ration: {},
      wallJoints: {},
      mixedShelf: {},
      pawnAnchor: anchor(portrait),
      propAnchor: anchor(prop),
      vehicleAnchor,
      vehicles: { ship: [] },
    };
    const workPoses = [
      "idle",
      "walk",
      "chop",
      "build",
      "dig",
      "carry-soil",
      "carry-stone",
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
      ["goblin", ["idle", "walk"]],
    ]) {
      const target = (art.figures[kind] = {});
      for (const pose of poses) {
        detail = `Drawing ${kind}: ${pose}`;
        report();
        target[pose] = [];
        for (let direction = 0; direction < 4; direction++) {
          const count =
            pose === "sleep" || (pose === "idle" && kind === "goblin") ? 1 : 8;
          target[pose].push(
            Array.from({ length: count }, (_, frame) =>
              bakeStartup(
                renderer,
                figure(kind, frame / count, (direction * Math.PI) / 2, pose),
                portrait,
                80,
                80,
              ),
            ),
          );
        }
        report("animation-frame");
        await new Promise((resolve) => requestAnimationFrame(resolve));
        report();
      }
    }
    detail = "Drawing trees and plants";
    report();
    for (const stage of ["standing", "notched", "stump"])
      art.tree[stage] = bakeStartup(renderer, tree(stage), prop, 112, 112);
    for (const stage of MUGWORT_STAGES)
      art.herbs.mugwort[stage] = bakeStartup(
        renderer,
        mugwort(stage),
        prop,
        112,
        112,
      );
    for (const type of Object.keys(BUILDINGS)) {
      detail = `Drawing ${type}`;
      report();
      art.buildings[type] = {};
      const stages =
        type === "shelf"
          ? ["stakes", "frame", "finished", "filled"]
          : ["stakes", "frame", "finished"];
      for (const stage of stages)
        art.buildings[type][stage] = [0, 1].map((direction) =>
          bakeStartup(
            renderer,
            building(type, stage, direction),
            prop,
            112,
            112,
          ),
        );
      if (type === "brew-station")
        art.buildings[type].profiles = Object.fromEntries(
          STATION_VISUAL_PROFILES.map((profile) => [
            profile,
            [0, 1].map((direction) => {
              const options = stationProfileOptions(profile);
              const frames =
                options.stirring || options.fire || options.steam ? 8 : 1;
              return Array.from({ length: frames }, (_, frame) =>
                bakeStartup(
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
    detail = "Drawing supplies and furnishings";
    report();
    for (const fill of ["dry", "low", "full"])
      art.sources.spring[fill] = bakeStartup(
        renderer,
        basinScene(fill),
        prop,
        112,
        112,
      );
    for (const [state, sealed] of [
      ["sealed", true],
      ["repaired", false],
    ])
      art.sources.cache[state] = bakeStartup(
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
      art.pail[state] = bakeStartup(
        renderer,
        propScene((parent) => pail(parent, units)),
        prop,
        112,
        112,
      );
    for (const profile of PROFILES)
      art.mixedShelf[profile.key] = [0, 1].map((direction) =>
        bakeStartup(
          renderer,
          mixedShelf(profile.key, direction),
          prop,
          112,
          112,
        ),
      );
    for (const stage of ["stakes", "frame", "finished"])
      art.wallJoints[stage] = Array.from({ length: 16 }, (_, mask) =>
        bakeStartup(renderer, wallJoint(stage, mask || 5), prop, 112, 112),
      );
    for (let amount = 1; amount <= 6; amount++)
      art.wood[amount] = bakeStartup(
        renderer,
        woodPile(amount),
        prop,
        112,
        112,
      );
    for (const [material, pile] of [
      ["soil", soilPile],
      ["stone", stonePile],
    ])
      for (let amount = 1; amount <= 3; amount++)
        art[material][amount] = bakeStartup(
          renderer,
          pile(amount),
          prop,
          112,
          112,
        );
    for (let amount = 1; amount <= 3; amount++)
      art.ration[amount] = bakeStartup(
        renderer,
        rationPile(amount),
        prop,
        112,
        112,
      );
    detail = "Drawing vehicles";
    report();
    art.vehicles.ship = Array.from({ length: 4 }, (_, direction) =>
      bakeStartup(
        renderer,
        shipScene(direction),
        vehicle,
        STATIC_ART_RENDER.vehicle.width,
        STATIC_ART_RENDER.vehicle.height,
      ),
    );
    // This one retained renderer rebakes terrain only after a physical edit/load.
    // It never updates simulation state or time. View owns replacement textures.
    detail = "Preparing water rendering";
    report();
    return attachDynamicBakers(art, renderer, disposeStatic);
  } catch (error) {
    disposeStatic();
    renderer.dispose();
    throw error;
  }
}
