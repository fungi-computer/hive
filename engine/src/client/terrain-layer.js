import { WebGLRenderer, Vector3 } from "three";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { renderBakeCanvas } from "../../../src/art/bake.js";
import { camera as artCamera } from "../../../src/art/prop-camera.js";
import { terrainBandScene, TERRAIN_DETAIL_HEIGHT } from "../../../src/art/terrain-columns.js";
import { terrainFaceBounds, terrainColumnMap, terrainChunkKey } from "../../../src/art/terrain-faces.js";
import { project } from "./geometry.js";
import { registerVisibleTexture, visibleHitAreaFor } from "../../../src/visual-hit-geometry.js";
import { planTerrainBandUpdates } from "./terrain-band-plan.js";
import { reconcileWaterSprites, waterCellKey } from "./water-sprite-reconciler.js";

const WIDTH = 2304,
  HEIGHT = 1536,
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

/** Client-only cached image of the host's exterior projection. */
export function createTerrainLayer() {
  const container = new Container();
  container.eventMode = "none";
  container.sortableChildren = true;
  let renderer;
  const bandCache = new Map();
  let waterEntries = new Map(), sortableItems = [], terrainSurfaces = [], previousSurfaces = [];
  const waterTile = createWaterTile();
  let screenTransform = terrainScreenTransform({ x: 0, y: 0, zoom: 1 });
  let canonicalCamera, cachedVerticalMetres;
  let revision, epoch, projectionKey;

  function clear() {
    for (const { sprite } of bandCache.values()) sprite.destroy({ children: true, texture: true, textureSource: true });
    bandCache.clear();
    canonicalCamera = undefined;
    cachedVerticalMetres = undefined;
    revision = undefined;
    for (const { sprite } of waterEntries.values()) sprite.destroy();
    waterEntries.clear();
    sortableItems = [];
    terrainSurfaces = [];
    previousSurfaces = [];
    projectionKey = undefined;
  }

  function fullBake(frame, rebuildChunks = null, removedLevels = []) {
    canonicalCamera = artCamera(WIDTH, HEIGHT, 1.03, 256);
    cachedVerticalMetres = frame.verticalMetres;
    if (!rebuildChunks) {
      for (const { sprite } of bandCache.values()) sprite.destroy({ children: true, texture: true, textureSource: true });
      bandCache.clear();
    }
    for (const [key, prior] of bandCache) if (removedLevels.includes(prior.record.storeyBand)) {
      prior.sprite.destroy({ children: true, texture: true, textureSource: true }); bandCache.delete(key);
    }
    const allChunks = [...new Set(terrainSurfaces.map(({ cell: [x, y, z] }) => `${y}:${terrainChunkKey(x, z)}`))];
    for (const [key, prior] of bandCache) if (!allChunks.includes(key)) {
      prior.sprite.destroy({ children: true, texture: true, textureSource: true }); bandCache.delete(key);
    }
    const chunksToBuild = rebuildChunks ?? allChunks;
    for (const chunkId of chunksToBuild.sort()) {
      const [levelText, chunk] = chunkId.split(":");
      const level = Number(levelText);
      const selected = terrainSurfaces.filter(({ cell: [x, y, z] }) => y === level && terrainChunkKey(x, z) === chunk);
      const prior = bandCache.get(chunkId);
      if (!selected.length) {
        prior?.sprite.destroy({ children: true, texture: true, textureSource: true });
        bandCache.delete(chunkId);
        continue;
      }
      prior?.sprite.destroy({ children: true, texture: true, textureSource: true });
      const raw = terrainFaceBounds(selected, selected.map(({ cell: [x, , z] }) => ({ x, z })), frame.verticalMetres, (x, y, z) => projectedPoint(canonicalCamera, x, y, z), terrainColumnMap(terrainSurfaces));
      const detail = Math.abs(projectedPoint(canonicalCamera, 0, TERRAIN_DETAIL_HEIGHT, 0).y - projectedPoint(canonicalCamera, 0, 0, 0).y);
      const padding = Math.ceil(detail) + 2;
      const bounds = raw && { left: Math.max(0, Math.floor(raw.left) - padding), top: Math.max(0, Math.floor(raw.top) - padding), right: Math.min(WIDTH, Math.ceil(raw.right) + padding), bottom: Math.min(HEIGHT, Math.ceil(raw.bottom) + padding) };
      if (!bounds) continue;
      const bandCamera = canonicalCamera.clone();
      bandCamera.setViewOffset(WIDTH, HEIGHT, bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      const baked = renderBakeCanvas(renderer, terrainBandScene(selected, level, { verticalMetres: frame.verticalMetres, columnIndex: terrainColumnMap(terrainSurfaces) }), bandCamera, bounds.right - bounds.left, bounds.bottom - bounds.top, { ink: false, releaseGeometry: true });
      const sprite = new Sprite(Texture.from(baked.canvas));
      sprite.texture.source.scaleMode = "nearest";
      const pixels = baked.context.getImageData(0, 0, baked.canvas.width, baked.canvas.height).data;
      registerVisibleTexture(sprite.texture, pixels, baked.canvas.width, baked.canvas.height);
      sprite.eventMode = "none";
      container.addChild(sprite);
      sprite.__terrainBounds = bounds;
      const hitArea = visibleHitAreaFor(sprite.texture, { x: 0, y: 0 });
      bandCache.set(chunkId, { sprite, bounds, record: { id: `terrain:${chunkId}`, part: "ground", role: "terrain", relationPolicy: "terrain-band", display: sprite, footprint: selected.map(({ cell: [x, y, z] }) => ({ x, y, z })), screenBounds: bounds, storeyBand: level, pickable: false, visible: true, contains: (point) => hitArea.contains((point.x - sprite.x) / sprite.scale.x, (point.y - sprite.y) / sprite.scale.y) } });
    }
    sortableItems = [...bandCache.values()].sort((a, b) => a.record.storeyBand - b.record.storeyBand).map(({ record }) => record);
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
        projectionKey !== nextProjectionKey ||
        cachedVerticalMetres !== frame.verticalMetres;
      if (needsFull) fullBake(frame);
      else if (revision !== frame.revision) {
        const plan = planTerrainBandUpdates(previousSurfaces, frame.surfaces);
        fullBake(frame, plan.rebuildChunks, plan.removedLevels);
      }
      revision = frame.revision;
      previousSurfaces = frame.surfaces;
      projectionKey = nextProjectionKey;
      sortableItems = sortableItems.filter((item) => item.id.startsWith("terrain:"));
      waterEntries = reconcileWaterSprites(waterEntries, frame.water, {
        key: waterCellKey,
        create: () => {
          const water = new Sprite(waterTile.colorTexture);
          water.anchor.set(0.5);
          water.eventMode = "none";
          container.addChild(water);
          return water;
        },
        update: (water, cell) => {
          const [x, y, z] = cell.at;
          const top = (y - 0.5) * frame.verticalMetres +
            (cell.level / 7) * frame.verticalMetres;
          const projected = project(x, top, z);
          water.position.set(projected.x, projected.y);
        },
        dispose: water => water.destroy(),
      });
      for (const cell of frame.water) {
        if (cell.liquidVolumeM3 <= 0) continue;
        const [x, y, z] = cell.at;
        const top = (y - 0.5) * frame.verticalMetres +
          (cell.level / 7) * frame.verticalMetres;
        const projected = project(x, top, z);
        const water = waterEntries.get(waterCellKey(cell)).sprite;
        sortableItems.push({
          id: `water:${x}:${y}:${z}`,
          part: "surface",
          role: "water",
          relationPolicy: "water-surface",
          display: water,
          footprint: [{ x, y: top, z }],
          screenBounds: { left: projected.x - 16, right: projected.x + 16, top: projected.y - 8, bottom: projected.y + 8 },
          storeyBand: y,
          pickable: false,
          visible: true,
        });
      }
    },
    position(camera) {
      container.position.set(0, 0);
      container.scale.set(1);
      screenTransform = terrainScreenTransform(camera);
      for (const { sprite } of bandCache.values()) {
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
