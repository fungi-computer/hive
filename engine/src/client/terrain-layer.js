import { WebGLRenderer, Vector3 } from "three";
import { BufferImageSource, Container, Texture } from "pixi.js";
import { renderBakePairCanvas } from "../../../src/art/bake.js";
import { camera as artCamera } from "../../../src/art/prop-camera.js";
import { createTerrainSceneCache, TERRAIN_DETAIL_HEIGHT } from "../../../src/art/terrain-columns.js";
import {
  terrainChunkKey,
  terrainFaceBounds,
} from "../../../src/art/terrain-faces.js";
import { project, WORLD_TOWARD_CAMERA } from "./geometry.js";
import { worldDepthBasis } from "./world-depth.js";

const WIDTH = 2304,
  HEIGHT = 1536,
  CHUNK_SIZE = 8,
  WATER_TILE_WIDTH = 32,
  WATER_TILE_HEIGHT = 16,
  WATER_DEPTH_MIN = -1,
  WATER_DEPTH_MAX = 1;

export function waterTileWorldOffset(pixelX, pixelY) {
  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) throw new Error("invalid water tile pixel");
  const origin = project(0, 0, 0);
  const axisX = project(1, 0, 0);
  const axisZ = project(0, 0, 1);
  const basisX = { x: axisX.x - origin.x, y: axisX.y - origin.y };
  const basisZ = { x: axisZ.x - origin.x, y: axisZ.y - origin.y };
  const determinant = basisX.x * basisZ.y - basisZ.x * basisX.y;
  const screenX = pixelX - WATER_TILE_WIDTH / 2;
  const screenY = pixelY - WATER_TILE_HEIGHT / 2;
  return {
    x: (screenX * basisZ.y - basisZ.x * screenY) / determinant,
    z: (basisX.x * screenY - screenX * basisX.y) / determinant,
  };
}

function encodeDepth24(value) {
  const normalized = Math.max(0, Math.min(1, (value - WATER_DEPTH_MIN) / (WATER_DEPTH_MAX - WATER_DEPTH_MIN)));
  const encoded = Math.round(normalized * 16777215);
  return [encoded >> 16, (encoded >> 8) & 255, encoded & 255, 255];
}

function createWaterTilePair() {
  const colorPixels = new Uint8Array(WATER_TILE_WIDTH * WATER_TILE_HEIGHT * 4);
  const depthPixels = new Uint8Array(colorPixels.length);
  const basis = worldDepthBasis(WORLD_TOWARD_CAMERA);
  for (let y = 0; y < WATER_TILE_HEIGHT; y++) {
    for (let x = 0; x < WATER_TILE_WIDTH; x++) {
      const screenX = x + 0.5 - WATER_TILE_WIDTH / 2;
      const screenY = y + 0.5 - WATER_TILE_HEIGHT / 2;
      const diamond = Math.abs(screenX / (WATER_TILE_WIDTH / 2)) + Math.abs(screenY / (WATER_TILE_HEIGHT / 2));
      const offset = (y * WATER_TILE_WIDTH + x) * 4;
      if (diamond > 1) continue;
      colorPixels[offset] = 73;
      colorPixels[offset + 1] = 125;
      colorPixels[offset + 2] = 136;
      colorPixels[offset + 3] = 178;
      const world = waterTileWorldOffset(x + 0.5, y + 0.5);
      depthPixels.set(encodeDepth24(basis[0] * world.x + basis[2] * world.z), offset);
    }
  }
  const colorTexture = new Texture({ source: new BufferImageSource({ resource: colorPixels, width: WATER_TILE_WIDTH, height: WATER_TILE_HEIGHT, format: "rgba8unorm", alphaMode: "no-premultiply-alpha", scaleMode: "nearest" }) });
  const depthTexture = new Texture({ source: new BufferImageSource({ resource: depthPixels, width: WATER_TILE_WIDTH, height: WATER_TILE_HEIGHT, format: "rgba8unorm", alphaMode: "no-premultiply-alpha", scaleMode: "nearest" }) });
  return Object.freeze({ colorTexture, depthTexture, depthPixels });
}

export function terrainScreenTransform(camera) {
  const zoom = camera?.zoom ?? 1;
  return {
    x: camera?.x + ((640 - WIDTH) / 2) * zoom,
    y: camera?.y + ((400 - HEIGHT) / 2) * zoom,
    scale: zoom,
  };
}

export function copyTerrainDepthPixels(target, source) {
  if (!(target instanceof Uint8Array) || target.length !== source.length)
    throw new Error("terrain depth pixel buffers differ");
  target.set(source);
  return target;
}

function projectedPoint(camera, x, y, z) {
  const point = new Vector3(x, y, z).project(camera);
  return { x: ((point.x + 1) * WIDTH) / 2, y: ((1 - point.y) * HEIGHT) / 2 };
}

function clippedBounds(bounds, padding) {
  if (!bounds) return null;
  const left = Math.max(0, Math.floor(bounds.left) - padding);
  const top = Math.max(0, Math.floor(bounds.top) - padding);
  const right = Math.min(WIDTH, Math.ceil(bounds.right) + padding);
  const bottom = Math.min(HEIGHT, Math.ceil(bounds.bottom) + padding);
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : null;
}

function regionForChunk(
  chunk,
  changed,
  previous,
  current,
  previousIndex,
  currentIndex,
  verticalMetres,
  camera,
) {
  const columns = changed.filter(
    ({ x, z }) => terrainChunkKey(x, z, CHUNK_SIZE) === chunk,
  );
  const oldBounds = terrainFaceBounds(
    previous,
    columns,
    verticalMetres,
    (x, y, z) => projectedPoint(camera, x, y, z),
    previousIndex,
  );
  const newBounds = terrainFaceBounds(
    current,
    columns,
    verticalMetres,
    (x, y, z) => projectedPoint(camera, x, y, z),
    currentIndex,
  );
  if (!oldBounds && !newBounds) return null;
  const bounds = {
    left: Math.min(oldBounds?.left ?? Infinity, newBounds?.left ?? Infinity),
    top: Math.min(oldBounds?.top ?? Infinity, newBounds?.top ?? Infinity),
    right: Math.max(
      oldBounds?.right ?? -Infinity,
      newBounds?.right ?? -Infinity,
    ),
    bottom: Math.max(
      oldBounds?.bottom ?? -Infinity,
      newBounds?.bottom ?? -Infinity,
    ),
  };
  const detailPixels = Math.abs(projectedPoint(camera, 0, TERRAIN_DETAIL_HEIGHT, 0).y - projectedPoint(camera, 0, 0, 0).y);
  return clippedBounds(bounds, Math.ceil(detailPixels) + 3);
}

/** Client-only cached image of the host's exterior projection. */
export function createTerrainLayer() {
  const container = new Container();
  container.eventMode = "none";
  let renderer, colorTexture, depthTexture, colorCanvas, colorContext, depthCanvas, depthContext;
  let depthPixels, depthRange, drawItem, waterItems = [];
  const waterTile = createWaterTilePair();
  let screenTransform = terrainScreenTransform({ x: 0, y: 0, zoom: 1 });
  let terrainCache, canonicalCamera, cachedVerticalMetres;
  let revision, epoch, projectionKey;

  function clear() {
    colorTexture?.destroy(true);
    depthTexture?.destroy(true);
    colorTexture = undefined;
    depthTexture = undefined;
    colorCanvas = undefined;
    colorContext = undefined;
    depthCanvas = undefined;
    depthContext = undefined;
    depthPixels = undefined;
    depthRange = undefined;
    drawItem = undefined;
    terrainCache?.dispose();
    terrainCache = undefined;
    canonicalCamera = undefined;
    cachedVerticalMetres = undefined;
    revision = undefined;
    waterItems = [];
    projectionKey = undefined;
  }

  function fullBake(frame) {
    terrainCache ??= createTerrainSceneCache({
      verticalMetres: frame.verticalMetres,
    });
    terrainCache.update(frame.surfaces, frame.verticalMetres);
    cachedVerticalMetres = frame.verticalMetres;
    canonicalCamera = artCamera(WIDTH, HEIGHT, 1.03, 256);
    const rendered = renderBakePairCanvas(
      renderer,
      terrainCache.scene,
      canonicalCamera,
      WIDTH,
      HEIGHT,
      { ink: false, releaseGeometry: false },
    );
    colorCanvas = rendered.colorCanvas;
    colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
    depthCanvas = rendered.depthCanvas;
    depthContext = depthCanvas.getContext("2d", { willReadFrequently: true });
    depthPixels = new Uint8Array(rendered.depthPixels);
    depthRange = rendered.depthRange;
    colorTexture?.destroy(true);
    depthTexture?.destroy(true);
    colorTexture = Texture.from(colorCanvas);
    colorTexture.source.scaleMode = "nearest";
    depthTexture = new Texture({ source: new BufferImageSource({ resource: depthPixels, width: WIDTH, height: HEIGHT, format: "rgba8unorm", alphaMode: "no-premultiply-alpha", scaleMode: "nearest" }) });
    drawItem = makeDrawItem();
  }

  function patchBake(frame, update) {
    if (!update.dirtyChunks.length || !canonicalCamera) return;
    for (const chunk of update.dirtyChunks) {
      const bounds = regionForChunk(
        chunk,
        update.affectedColumns,
        update.previous,
        update.surfaces,
        update.previousIndex,
        update.columnIndex,
        frame.verticalMetres,
        canonicalCamera,
      );
      if (!bounds) continue;
      const camera = canonicalCamera.clone();
      camera.setViewOffset(
        WIDTH,
        HEIGHT,
        bounds.left,
        bounds.top,
        bounds.width,
        bounds.height,
      );
      const patch = renderBakePairCanvas(
        renderer,
        terrainCache.scene,
        camera,
        bounds.width,
        bounds.height,
        { ink: false, releaseGeometry: false },
      );
      if (patch.depthRange.min !== depthRange.min || patch.depthRange.max !== depthRange.max) {
        fullBake(frame);
        return;
      }
      colorContext.clearRect(bounds.left, bounds.top, bounds.width, bounds.height);
      colorContext.drawImage(patch.colorCanvas, bounds.left, bounds.top);
      depthContext.clearRect(bounds.left, bounds.top, bounds.width, bounds.height);
      depthContext.drawImage(patch.depthCanvas, bounds.left, bounds.top);
      camera.clearViewOffset();
    }
    copyTerrainDepthPixels(depthPixels, depthContext.getImageData(0, 0, WIDTH, HEIGHT).data);
    colorTexture.source.update();
    depthTexture.source.update();
  }

  function makeDrawItem() {
    return {
      entityId: "terrain",
      visualPartId: "opaque",
      physicalRole: "terrain",
      colorTexture,
      depthTexture,
      colorFrame: { frame: { x: 0, y: 0, width: WIDTH, height: HEIGHT } },
      depthFrame: { frame: { x: 0, y: 0, width: WIDTH, height: HEIGHT }, pixels: depthPixels, atlasWidth: WIDTH, atlasHeight: HEIGHT, depthRange },
      worldOrigin: { x: 0, y: 0, z: 0 },
      screenTransform,
      anchor: { x: 0, y: 0 },
      visible: true,
      pickable: false,
    };
  }

  return {
    container,
    update(frame, nextEpoch, nextProjectionKey = "full") {
      if (epoch !== nextEpoch) {
        clear();
        epoch = nextEpoch;
      }
      if (!frame) {
        clear();
        container.visible = false;
        return;
      }
      container.visible = true;
      renderer ??= new WebGLRenderer({ alpha: true, antialias: false });
      const needsFull =
        !terrainCache ||
        !colorTexture ||
        projectionKey !== nextProjectionKey ||
        cachedVerticalMetres !== frame.verticalMetres;
      if (needsFull) fullBake(frame);
      else if (revision !== frame.revision) {
        const update = terrainCache.update(
          frame.surfaces,
          frame.verticalMetres,
        );
        patchBake(frame, update);
      }
      revision = frame.revision;
      projectionKey = nextProjectionKey;
      // Water is composed by the shared world-depth owner after opaque terrain.
      waterItems = [];
      for (const cell of frame.water) {
        if (cell.liquidVolumeM3 <= 0) continue;
        const [x, y, z] = cell.at;
        const top = (y - 0.5) * frame.verticalMetres +
          (cell.level / 7) * frame.verticalMetres;
        const projected = project(x, top, z);
        waterItems.push({
          entityId: `water:${x}:${y}:${z}`,
          visualPartId: "surface",
          physicalRole: "terrain",
          colorTexture: waterTile.colorTexture,
          depthTexture: waterTile.depthTexture,
          colorFrame: { frame: { x: 0, y: 0, width: WATER_TILE_WIDTH, height: WATER_TILE_HEIGHT } },
          depthFrame: { frame: { x: 0, y: 0, width: WATER_TILE_WIDTH, height: WATER_TILE_HEIGHT }, pixels: waterTile.depthPixels, atlasWidth: WATER_TILE_WIDTH, atlasHeight: WATER_TILE_HEIGHT, depthRange: { min: WATER_DEPTH_MIN, max: WATER_DEPTH_MAX } },
          worldOrigin: { x, y: top, z },
          screenTransform: { x: projected.x, y: projected.y, scale: 1 },
          anchor: { x: 0.5, y: 0.5 },
          visible: true,
          pickable: false,
          alpha: 1,
        });
      }
    },
    position(camera) {
      container.position.set(camera.x, camera.y);
      container.scale.set(camera.zoom);
      screenTransform = terrainScreenTransform(camera);
      if (drawItem) drawItem.screenTransform = screenTransform;
      for (const item of waterItems) {
        const projected = project(item.worldOrigin.x, item.worldOrigin.y, item.worldOrigin.z);
        item.screenTransform = { x: projected.x * camera.zoom + camera.x, y: projected.y * camera.zoom + camera.y, scale: camera.zoom };
      }
    },
    get drawItem() { return drawItem; },
    get transparentItems() { return waterItems; },
    get waterTile() { return waterTile; },
    dispose() {
      clear();
      waterTile.colorTexture.destroy(true);
      waterTile.depthTexture.destroy(true);
      renderer?.dispose();
      renderer?.forceContextLoss();
      container.destroy({ children: true });
    },
  };
}
