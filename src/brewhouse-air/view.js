import * as THREE from "three";
import { Application, Sprite, Texture } from "pixi.js";
import { camera } from "../art/prop-camera.js";
import { box, scene as litScene } from "../art/geometry.js";
import { building, wallJoint } from "../art/home.js";
import { kettleFire } from "../art/brew-vessel.js";

const WIDTH = 640;
const HEIGHT = 400;
const STOREY_HEIGHT_M = 4 * 0.54;
const REFERENCE_TEMPERATURE_K = 293.15;
export const AIR_VISUAL_SCALE = Object.freeze({
  heatDeltaK: 0.5,
  smokeKgM3: 0.0001,
  bins: 8,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function binFor(value, maximum) {
  const scaled = clamp01(value / maximum);
  return scaled <= 1e-9
    ? -1
    : Math.min(
        AIR_VISUAL_SCALE.bins - 1,
        Math.ceil(scaled * AIR_VISUAL_SCALE.bins) - 1,
      );
}

function makeMaterials(color, minimumOpacity, maximumOpacity) {
  return Array.from(
    { length: AIR_VISUAL_SCALE.bins },
    (_, index) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity:
          minimumOpacity +
          (maximumOpacity - minimumOpacity) *
            (index / (AIR_VISUAL_SCALE.bins - 1)),
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
  );
}

function structuralKey(site) {
  return `${site.x},${site.z},${site.level}`;
}

function wallMask(site, structural) {
  let mask = 0;
  for (const [dx, dz, bit] of [
    [1, 0, 1],
    [0, 1, 2],
    [-1, 0, 4],
    [0, -1, 8],
  ])
    if (structural.has(`${site.x + dx},${site.z + dz},${site.level}`))
      mask |= bit;
  return mask || 5;
}

function moveArt(source, target) {
  for (const child of [...source.children]) {
    if (child.isLight) continue;
    target.add(child);
  }
}

function disposeGeometry(root) {
  const disposed = new Set();
  root.traverse((object) => {
    if (object.isMesh && object.geometry && !disposed.has(object.geometry)) {
      disposed.add(object.geometry);
      object.geometry.dispose();
    }
  });
}

function rotatedHorizontal({ x, z }, turn) {
  const angle = turn * Math.PI * 0.5;
  return {
    x: x * Math.cos(angle) + z * Math.sin(angle),
    z: -x * Math.sin(angle) + z * Math.cos(angle),
  };
}

function wallPerimeter(sites) {
  const walls = sites.filter(
    (site) => site.type === "wall" || site.type === "door",
  );
  return {
    minX: Math.min(...walls.map((site) => site.x)),
    maxX: Math.max(...walls.map((site) => site.x)),
    minZ: Math.min(...walls.map((site) => site.z)),
    maxZ: Math.max(...walls.map((site) => site.z)),
  };
}

function frontWall(site, perimeter, turn) {
  if (site.type !== "wall" && site.type !== "door") return false;
  const normals = [];
  if (site.x === perimeter.minX) normals.push({ x: -1, z: 0 });
  if (site.x === perimeter.maxX) normals.push({ x: 1, z: 0 });
  if (site.z === perimeter.minZ) normals.push({ x: 0, z: -1 });
  if (site.z === perimeter.maxZ) normals.push({ x: 0, z: 1 });
  return normals.some((normal) => {
    const rotated = rotatedHorizontal(normal, turn);
    return rotated.x + rotated.z > 0.5;
  });
}

function siteVisible(site, layer, perimeter, turn) {
  if (layer === "exterior") return true;
  if (site.type === "roof") return false;
  if (frontWall(site, perimeter, turn)) return false;
  if (layer === "ground") return site.level === 0;
  if (layer === "upstairs") return site.level === 1 || site.type === "stair";
  return true;
}

function cellVisible(cell, layer) {
  const y = cell.at[1];
  if (layer === "ground") return y >= 0 && y < 4;
  if (layer === "upstairs") return y >= 4 && y < 8;
  if (layer === "cutaway") return y >= 0 && y < 8;
  return true;
}

function addSiteArt(site, structural, target, centerX, centerZ, burning) {
  const art =
    site.type === "wall"
      ? wallJoint("finished", wallMask(site, structural))
      : building(site.type, "finished", site.direction, { profile: "empty" });
  if (site.type === "brew-station" && burning) {
    const station = art.getObjectByName("brew-station");
    if (!station) throw new Error("brewhouse station art is missing");
    kettleFire(station, 0);
  }
  const anchor = new THREE.Group();
  // Station art owns its positive-cell (.5,.5) datum internally. Every other
  // building is centered on the current corner-addressed voxel.
  anchor.position.set(
    site.x + (site.type === "brew-station" ? 0 : 0.5) - centerX,
    site.level * STOREY_HEIGHT_M,
    site.z + (site.type === "brew-station" ? 0 : 0.5) - centerZ,
  );
  moveArt(art, anchor);
  target.add(anchor);
}

function shutterBar(marker, material, x, y, width, height) {
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.06),
    material,
  );
  bar.position.set(x, y, 0);
  marker.add(bar);
}

function addShutterMarker(scene, layer, target, centerX, centerZ, materials) {
  if (layer === "ground") return;
  const upperDoor = scene.sites.find(
    (site) => site.type === "door" && site.level === 1,
  );
  if (!upperDoor) throw new Error("brewhouse upper shutter site is missing");
  const marker = new THREE.Group();
  marker.position.set(
    upperDoor.x + 0.5 - centerX,
    STOREY_HEIGHT_M * 1.5,
    upperDoor.z - centerZ,
  );
  if (scene.result.ventOpen) {
    for (const bar of [
      [-0.45, 0, 0.06, STOREY_HEIGHT_M],
      [0.45, 0, 0.06, STOREY_HEIGHT_M],
      [0, STOREY_HEIGHT_M / 2, 0.96, 0.06],
      [0, -STOREY_HEIGHT_M / 2, 0.96, 0.06],
    ])
      shutterBar(marker, materials.open, ...bar);
  } else {
    shutterBar(marker, materials.closed, 0, 0, 0.9, STOREY_HEIGHT_M);
  }
  target.add(marker);
}

/** Original building geometry, fixed low-resolution Three bake, then Pixi. */
export async function createBrewhouseAirView(host) {
  const app = new Application();
  await app.init({
    width: WIDTH,
    height: HEIGHT,
    antialias: false,
    backgroundAlpha: 0,
    autoStart: false,
    resolution: 1,
  });
  host.append(app.canvas);
  app.canvas.setAttribute(
    "aria-label",
    "Isometric authored two-storey brewhouse with optional heat and smoke overlays",
  );

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const world = litScene();
  const room = new THREE.Group();
  const staticRoot = new THREE.Group();
  const fieldRoot = new THREE.Group();
  room.add(staticRoot, fieldRoot);
  world.add(room);
  const viewCamera = camera(WIDTH, HEIGHT, 2.3);
  viewCamera.zoom = 1.45;
  viewCamera.updateProjectionMatrix();

  const cellGeometry = new THREE.BoxGeometry(1, 1, 1);
  const heatMaterials = makeMaterials("#ed8b3a", 0.12, 0.52);
  const smokeMaterials = makeMaterials("#9bb0b5", 0.16, 0.64);
  const shutterClosedMaterial = new THREE.MeshBasicMaterial({
    color: "#806548",
    opacity: 0.72,
    transparent: true,
  });
  const shutterOpenMaterial = new THREE.MeshBasicMaterial({
    color: "#d5c58d",
  });
  const sprite = new Sprite();
  app.stage.addChild(sprite);
  let previousTexture = null;
  let staticKey = "";

  function clearStatic() {
    disposeGeometry(staticRoot);
    staticRoot.clear();
  }

  function clearField() {
    fieldRoot.clear();
  }

  function buildStatic(scene, layer, turn) {
    const burning =
      scene.result.fuelUnits === 0 && scene.result.remainingDoseFraction > 0;
    const key = `${layer}:${turn}:${scene.result.ventOpen}:${burning}`;
    if (staticKey === key) return;
    staticKey = key;
    clearStatic();
    const centerX = (scene.bounds.min[0] + scene.bounds.max[0]) / 2;
    const centerZ = (scene.bounds.min[2] + scene.bounds.max[2]) / 2;
    box(
      staticRoot,
      "#3b4130",
      0,
      -0.18,
      0,
      scene.bounds.max[0] - scene.bounds.min[0],
      0.36,
      scene.bounds.max[2] - scene.bounds.min[2],
    );
    const structural = new Set(
      scene.sites
        .filter((site) => site.type === "wall" || site.type === "door")
        .map(structuralKey),
    );
    const perimeter = wallPerimeter(scene.sites);
    for (const site of scene.sites)
      if (siteVisible(site, layer, perimeter, turn))
        addSiteArt(site, structural, staticRoot, centerX, centerZ, burning);
    addShutterMarker(scene, layer, staticRoot, centerX, centerZ, {
      closed: shutterClosedMaterial,
      open: shutterOpenMaterial,
    });
  }

  function buildField(scene, layer, fields) {
    clearField();
    const centerX = (scene.bounds.min[0] + scene.bounds.max[0]) / 2;
    const centerZ = (scene.bounds.min[2] + scene.bounds.max[2]) / 2;
    for (const cell of scene.cells) {
      if (!cellVisible(cell, layer)) continue;
      const heatBin = binFor(
        Math.max(0, cell.temperatureK - REFERENCE_TEMPERATURE_K),
        AIR_VISUAL_SCALE.heatDeltaK,
      );
      const smokeBin = binFor(cell.smokeKgM3, AIR_VISUAL_SCALE.smokeKgM3);
      const x = (cell.at[0] + 0.5) * scene.metric[0] - centerX;
      const y = (cell.at[1] + 0.5) * scene.metric[1];
      const z = (cell.at[2] + 0.5) * scene.metric[2] - centerZ;
      if (fields.heat && heatBin >= 0) {
        const heat = new THREE.Mesh(cellGeometry, heatMaterials[heatBin]);
        heat.position.set(x, y, z);
        heat.scale.set(
          scene.metric[0] * 0.88,
          scene.metric[1] * 0.88,
          scene.metric[2] * 0.88,
        );
        fieldRoot.add(heat);
      }
      if (fields.smoke && smokeBin >= 0) {
        const smoke = new THREE.Mesh(cellGeometry, smokeMaterials[smokeBin]);
        smoke.position.set(x, y, z);
        smoke.scale.set(
          scene.metric[0] * 0.62,
          scene.metric[1] * 0.94,
          scene.metric[2] * 0.62,
        );
        fieldRoot.add(smoke);
      }
    }
  }

  function bake() {
    world.updateMatrixWorld(true);
    renderer.render(world, viewCamera);
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.getContext("2d").drawImage(renderer.domElement, 0, 0);
    const texture = Texture.from(canvas);
    texture.source.scaleMode = "nearest";
    sprite.texture = texture;
    app.render();
    previousTexture?.destroy(true);
    previousTexture = texture;
  }

  return {
    draw(scene, turn, layer, fields) {
      buildStatic(scene, layer, turn);
      buildField(scene, layer, fields);
      room.rotation.y = turn * Math.PI * 0.5;
      bake();
    },
    destroy() {
      clearStatic();
      clearField();
      previousTexture?.destroy(true);
      cellGeometry.dispose();
      for (const material of [...heatMaterials, ...smokeMaterials])
        material.dispose();
      shutterClosedMaterial.dispose();
      shutterOpenMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      app.destroy(true, { children: true });
    },
  };
}
