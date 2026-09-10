import * as THREE from "three";
import { Application, Sprite, Texture } from "pixi.js";
import { camera } from "../art/prop-camera.js";
import { scene as litScene } from "../art/geometry.js";
import { tree } from "../art/clearing.js";
import { building, wallJoint } from "../art/home.js";
import { kettleFire } from "../art/brew-vessel.js";
import { createRoomDisplayFrame } from "./display-frame.js";

const WIDTH = 640;
const HEIGHT = 400;
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

function cellVisible(cell, layer, frame) {
  const y = cell.at[1] - frame.y;
  if (layer === "ground") return y >= 0 && y < 4;
  if (layer === "upstairs") return y >= 4 && y < 8;
  if (layer === "cutaway") return y >= 0 && y < 8;
  return true;
}

function addSiteArt(site, structural, target, display, burning) {
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
  // Original builders share the logical site anchor. Station art owns the
  // positive-footprint half-cell offset inside its unchanged group.
  anchor.position.fromArray(display.site(site));
  moveArt(art, anchor);
  target.add(anchor);
}

function addTreeArt(treeFact, target, display) {
  const anchor = new THREE.Group();
  anchor.position.fromArray(display.column(treeFact));
  moveArt(tree("standing"), anchor);
  target.add(anchor);
}

function terrainFace(face, material, target, display) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      face.vertices.flatMap((point) => display.surface(point)),
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  target.add(new THREE.Mesh(geometry, material));
}

function shutterBar(marker, material, x, y, width, height) {
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.06),
    material,
  );
  bar.position.set(x, y, 0);
  marker.add(bar);
}

function addShutterMarker(scene, layer, target, display, materials) {
  if (layer === "ground") return;
  const upperDoor = scene.sites.find(
    (site) => site.type === "door" && site.level === 1,
  );
  if (!upperDoor) throw new Error("brewhouse upper shutter site is missing");
  const marker = new THREE.Group(),
    storeyHeight = scene.frame.storeyVoxels * scene.metric[1];
  marker.position.fromArray(
    display.zFace({
      x: upperDoor.x,
      y: upperDoor.level * scene.frame.storeyVoxels + 2,
      z: upperDoor.z,
    }),
  );
  if (scene.result.ventOpen) {
    for (const bar of [
      [-0.45, 0, 0.06, storeyHeight],
      [0.45, 0, 0.06, storeyHeight],
      [0, storeyHeight / 2, 0.96, 0.06],
      [0, -storeyHeight / 2, 0.96, 0.06],
    ])
      shutterBar(marker, materials.open, ...bar);
  } else {
    shutterBar(marker, materials.closed, 0, 0, 0.9, storeyHeight);
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
    "Isometric two-storey brewhouse on generated terrain with optional heat and smoke overlays",
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
  const waterRoot = new THREE.Group();
  const fieldRoot = new THREE.Group();
  room.add(staticRoot, waterRoot, fieldRoot);
  world.add(room);
  const viewCamera = camera(WIDTH, HEIGHT, 2.3);
  viewCamera.zoom = 1.45;
  viewCamera.updateProjectionMatrix();

  const cellGeometry = new THREE.BoxGeometry(1, 1, 1);
  const heatMaterials = makeMaterials("#ed8b3a", 0.12, 0.52);
  const smokeMaterials = makeMaterials("#9bb0b5", 0.16, 0.64);
  const terrainMaterials = Object.freeze({
    ground: new THREE.MeshLambertMaterial({
      color: "#697e44",
      side: THREE.DoubleSide,
    }),
    "pit-floor": new THREE.MeshLambertMaterial({
      color: "#806143",
      side: THREE.DoubleSide,
    }),
    "cut-wall": new THREE.MeshLambertMaterial({
      color: "#9a744f",
      side: THREE.DoubleSide,
    }),
  });
  const waterMaterial = new THREE.MeshLambertMaterial({
    color: "#397986",
    side: THREE.DoubleSide,
  });
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

  function clearWater() {
    for (const child of [...waterRoot.children]) {
      child.geometry.dispose();
      waterRoot.remove(child);
    }
  }

  function buildStatic(scene, layer, turn) {
    const burning =
      scene.result.fuelUnits === 0 && scene.result.remainingDoseFraction > 0;
    const key = `${layer}:${turn}:${scene.result.ventOpen}:${burning}:${scene.terrain.key}`;
    if (staticKey === key) return;
    staticKey = key;
    clearStatic();
    const display = createRoomDisplayFrame(scene);
    for (const face of scene.terrain.faces)
      terrainFace(face, terrainMaterials[face.kind], staticRoot, display);
    const structural = new Set(
      scene.sites
        .filter((site) => site.type === "wall" || site.type === "door")
        .map(structuralKey),
    );
    const perimeter = wallPerimeter(scene.sites);
    for (const site of scene.sites)
      if (siteVisible(site, layer, perimeter, turn))
        addSiteArt(site, structural, staticRoot, display, burning);
    if (layer !== "upstairs")
      for (const treeFact of scene.trees)
        addTreeArt(treeFact, staticRoot, display);
    addShutterMarker(scene, layer, staticRoot, display, {
      closed: shutterClosedMaterial,
      open: shutterOpenMaterial,
    });
  }

  function buildWater(scene) {
    clearWater();
    const display = createRoomDisplayFrame(scene);
    for (const water of scene.terrain.water) {
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), waterMaterial);
      pool.rotation.x = -Math.PI / 2;
      pool.position.fromArray(display.column(water));
      waterRoot.add(pool);
    }
  }

  function buildField(scene, layer, fields) {
    clearField();
    const display = createRoomDisplayFrame(scene);
    for (const cell of scene.cells) {
      if (!cellVisible(cell, layer, scene.frame)) continue;
      const heatBin = binFor(
        Math.max(0, cell.temperatureK - REFERENCE_TEMPERATURE_K),
        AIR_VISUAL_SCALE.heatDeltaK,
      );
      const smokeBin = binFor(cell.smokeKgM3, AIR_VISUAL_SCALE.smokeKgM3);
      const [x, y, z] = display.cell(cell.at);
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
      buildWater(scene);
      buildField(scene, layer, fields);
      room.rotation.y = turn * Math.PI * 0.5;
      bake();
    },
    destroy() {
      clearStatic();
      clearWater();
      clearField();
      previousTexture?.destroy(true);
      cellGeometry.dispose();
      for (const material of [...heatMaterials, ...smokeMaterials])
        material.dispose();
      for (const material of Object.values(terrainMaterials))
        material.dispose();
      waterMaterial.dispose();
      shutterClosedMaterial.dispose();
      shutterOpenMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      app.destroy(true, { children: true });
    },
  };
}
