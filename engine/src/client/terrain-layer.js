import { WebGLRenderer, Vector3 } from "three";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { renderBakeCanvas } from "../../../src/art/bake.js";
import { camera as artCamera } from "../../../src/art/prop-camera.js";
import { createTerrainSceneCache, terrainBandScene, TERRAIN_DETAIL_HEIGHT } from "../../../src/art/terrain-columns.js";
import { terrainChunkKey, terrainFaceBounds, terrainColumnMap } from "../../../src/art/terrain-faces.js";
import { project } from "./geometry.js";
import { registerVisibleTexture, visibleHitAreaFor } from "../../../src/visual-hit-geometry.js";

const WIDTH = 2304,
  HEIGHT = 1536,
  CHUNK_SIZE = 8,
  WATER_TILE_WIDTH = 32,
  WATER_TILE_HEIGHT = 16;

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

function createWaterTile() {
  const colorPixels = new Uint8Array(WATER_TILE_WIDTH * WATER_TILE_HEIGHT * 4);
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
    }
  }
  const colorTexture = new Texture({ source: new BufferImageSource({ resource: colorPixels, width: WATER_TILE_WIDTH, height: WATER_TILE_HEIGHT, format: "rgba8unorm", alphaMode: "no-premultiply-alpha", scaleMode: "nearest" }) });
  return Object.freeze({ colorTexture });
}

export function terrainScreenTransform(camera) {
  const zoom = camera?.zoom ?? 1;
  return {
    x: camera?.x + ((640 - WIDTH) / 2) * zoom,
    y: camera?.y + ((400 - HEIGHT) / 2) * zoom,
    scale: zoom,
  };
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
  let renderer;
  let bandSprites = [], waterItems = [], sortableItems = [], terrainSurfaces = [];
  const waterTile = createWaterTile();
  let screenTransform = terrainScreenTransform({ x: 0, y: 0, zoom: 1 });
  let terrainCache, canonicalCamera, cachedVerticalMetres;
  let revision, epoch, projectionKey;

  function clear() {
    for (const sprite of bandSprites) sprite.destroy();
    bandSprites = [];
    terrainCache?.dispose();
    terrainCache = undefined;
    canonicalCamera = undefined;
    cachedVerticalMetres = undefined;
    revision = undefined;
    for (const item of waterItems) item.destroy();
    waterItems = [];
    sortableItems = [];
    terrainSurfaces = [];
    projectionKey = undefined;
  }

  function fullBake(frame) {
    terrainCache ??= createTerrainSceneCache({
      verticalMetres: frame.verticalMetres,
    });
    terrainCache.update(frame.surfaces, frame.verticalMetres);
    cachedVerticalMetres = frame.verticalMetres;
    canonicalCamera = artCamera(WIDTH, HEIGHT, 1.03, 256);
    for (const sprite of bandSprites) sprite.destroy();
    bandSprites = [];
    sortableItems = [];
    for (const level of [...new Set(terrainSurfaces.map(({ cell: [, y] }) => y))].sort((a, b) => a - b)) {
      const selected = terrainSurfaces.filter(({ cell: [, y] }) => y === level);
      const raw = terrainFaceBounds(selected, selected.map(({ cell: [x, , z] }) => ({ x, z })), frame.verticalMetres, (x, y, z) => projectedPoint(canonicalCamera, x, y, z), terrainColumnMap(terrainSurfaces));
      const bounds = raw && { left: Math.max(0, Math.floor(raw.left) - 3), top: Math.max(0, Math.floor(raw.top) - 3), right: Math.min(WIDTH, Math.ceil(raw.right) + 3), bottom: Math.min(HEIGHT, Math.ceil(raw.bottom) + 3) };
      if (!bounds) continue;
      const bandCamera = canonicalCamera.clone();
      bandCamera.setViewOffset(WIDTH, HEIGHT, bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      const baked = renderBakeCanvas(renderer, terrainBandScene(terrainSurfaces, level, { verticalMetres: frame.verticalMetres }), bandCamera, bounds.right - bounds.left, bounds.bottom - bounds.top, { ink: false, releaseGeometry: true });
      const sprite = new Sprite(Texture.from(baked.canvas));
      sprite.texture.source.scaleMode = "nearest";
      const pixels = baked.context.getImageData(0, 0, baked.canvas.width, baked.canvas.height).data;
      registerVisibleTexture(sprite.texture, pixels, baked.canvas.width, baked.canvas.height);
      sprite.eventMode = "none";
      bandSprites.push(sprite);
      container.addChild(sprite);
      sprite.__terrainBounds = bounds;
      const hitArea = visibleHitAreaFor(sprite.texture, { x: 0, y: 0 });
      sortableItems.push({ id: `terrain:${level}`, part: "ground", role: "terrain", display: sprite, footprint: selected.map(({ cell: [x, y, z] }) => ({ x, y, z })), screenBounds: bounds, storeyBand: level, pickable: false, visible: true, contains: (point) => hitArea.contains(point.x - sprite.x, point.y - sprite.y) });
    }
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
      const patch = renderBakeCanvas(
        renderer,
        terrainCache.scene,
        camera,
        bounds.width,
        bounds.height,
        { ink: false, releaseGeometry: false },
      );
      void patch;
      camera.clearViewOffset();
    }
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
      terrainSurfaces = frame.surfaces;
      renderer ??= new WebGLRenderer({ alpha: true, antialias: false });
      const needsFull =
        !terrainCache ||
        projectionKey !== nextProjectionKey ||
        cachedVerticalMetres !== frame.verticalMetres;
      if (needsFull) fullBake(frame);
      else if (revision !== frame.revision) fullBake(frame);
      revision = frame.revision;
      projectionKey = nextProjectionKey;
      sortableItems = sortableItems.filter((item) => item.id.startsWith("terrain:"));
      for (const item of waterItems) item.destroy();
      waterItems = [];
      for (const cell of frame.water) {
        if (cell.liquidVolumeM3 <= 0) continue;
        const [x, y, z] = cell.at;
        const top = (y - 0.5) * frame.verticalMetres +
          (cell.level / 7) * frame.verticalMetres;
        const projected = project(x, top, z);
        const water = new Sprite(waterTile.colorTexture);
        water.anchor.set(0.5);
        water.position.set(projected.x, projected.y);
        water.eventMode = "none";
        waterItems.push(water);
        sortableItems.push({
          id: `water:${x}:${y}:${z}`,
          part: "surface",
          role: "water",
          display: water,
          footprint: [{ x, y: top, z }],
          screenBounds: { left: projected.x - 16, right: projected.x + 16, top: projected.y - 8, bottom: projected.y + 8 },
          storeyBand: y,
          pickable: false,
          visible: true,
        });
        container.addChild(water);
      }
    },
    position(camera) {
      container.position.set(0, 0);
      container.scale.set(1);
      screenTransform = terrainScreenTransform(camera);
      for (const sprite of bandSprites) {
        sprite.position.set(
          camera.x + ((640 - WIDTH) / 2 + (sprite.__terrainBounds?.left ?? 0)) * camera.zoom,
          camera.y + ((400 - HEIGHT) / 2 + (sprite.__terrainBounds?.top ?? 0)) * camera.zoom,
        );
        sprite.scale.set(camera.zoom);
      }
      for (const terrain of sortableItems.filter((item) => item.id.startsWith("terrain:"))) {
        const bounds = terrain.display.__terrainBounds;
        terrain.screenBounds = {
          left: camera.x + ((640 - WIDTH) / 2 + bounds.left) * camera.zoom,
          right: camera.x + ((640 - WIDTH) / 2 + bounds.right) * camera.zoom,
          top: camera.y + ((400 - HEIGHT) / 2 + bounds.top) * camera.zoom,
          bottom: camera.y + ((400 - HEIGHT) / 2 + bounds.bottom) * camera.zoom,
        };
      }
      for (const item of sortableItems) if (!item.id.startsWith("terrain:")) {
        const projected = project(item.footprint[0].x, item.footprint[0].y, item.footprint[0].z);
        item.display.position.set(projected.x * camera.zoom + camera.x, projected.y * camera.zoom + camera.y);
        item.display.scale.set(camera.zoom);
        item.screenBounds = {
          left: projected.x * camera.zoom + camera.x - 16,
          right: projected.x * camera.zoom + camera.x + 16,
          top: projected.y * camera.zoom + camera.y - 8,
          bottom: projected.y * camera.zoom + camera.y + 8,
        };
      }
    },
    get drawItem() { return null; },
    get transparentItems() { return waterItems; },
    get sortableItems() { return sortableItems; },
    get waterTile() { return waterTile; },
    dispose() {
      clear();
      waterTile.colorTexture.destroy(true);
      renderer?.dispose();
      renderer?.forceContextLoss();
      container.destroy({ children: true });
    },
  };
}
