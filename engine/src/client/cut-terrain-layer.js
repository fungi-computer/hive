import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { createTerrainChunkCache } from "./terrain-chunk-cache.js";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";
import { createTerrainBatchMeshes } from "./terrain-face-batches.js";
import { materialCoverage, terrainCoverRecords, terrainFaceRecords, visibleTerrainChunks } from "./terrain-visibility.js";
import { reconcileWaterSprites, waterCellKey } from "./water-sprite-reconciler.js";
import { project } from "./geometry.js";

const WATER_WIDTH = 32, WATER_HEIGHT = 16;

export function createWaterSurfaceTexture() {
  const pixels = new Uint8Array(WATER_WIDTH * WATER_HEIGHT * 4);
  for (let y = 0; y < WATER_HEIGHT; y++) for (let x = 0; x < WATER_WIDTH; x++) {
    const dx = x + 0.5 - WATER_WIDTH / 2, dy = y + 0.5 - WATER_HEIGHT / 2;
    if (Math.abs(dx / (WATER_WIDTH / 2)) + Math.abs(dy / (WATER_HEIGHT / 2)) > 1) continue;
    pixels.set([73, 125, 136, 178], (y * WATER_WIDTH + x) * 4);
  }
  return new Texture({ source: new BufferImageSource({ resource: pixels, width: WATER_WIDTH,
    height: WATER_HEIGHT, format: "rgba8unorm", alphaMode: "no-premultiply-alpha", scaleMode: "nearest" }) });
}

/** One authoritative world-space presentation record for a visible liquid cell. */
export function waterDrawRecord(cell, { verticalMetres, projection = project, display } = {}) {
  if (!cell || !Array.isArray(cell.at) || cell.at.length !== 3 || !cell.at.every(Number.isFinite)
    || !Number.isFinite(cell.level) || !(verticalMetres > 0) || typeof projection !== "function")
    throw new Error("invalid water draw cell");
  const [x, y, z] = cell.at;
  const top = (y - 0.5) * verticalMetres + (cell.level / 7) * verticalMetres;
  const at = projection(x, top, z);
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) throw new Error("invalid projected water cell");
  return Object.freeze({
    id: `water:${x}:${y}:${z}`,
    part: "surface",
    role: "water",
    renderPass: "transparent",
    attachment: Object.freeze({ kind: "surface-root", supports: Object.freeze([Object.freeze([x, y, z])]), point: Object.freeze({ x, y: top, z }) }),
    orderingKind: "compact",
    ...(display ? { display } : {}),
    footprint: Object.freeze([{ x, y: top, z }]),
    screenBounds: Object.freeze({ left: at.x - 16, right: at.x + 16, top: at.y - 8, bottom: at.y + 8 }),
    storeyBand: y,
    pickable: false,
    visible: true,
  });
}

/** One disposable owner for requested terrain coverage, logical faces, water and
 * consecutive Pixi mesh runs. The simulation remains authoritative elsewhere.
 */
export function createCutTerrainLayer({ runtime, projection, onCoverage } = {}) {
  if (!projection) throw new Error("cut terrain layer requires the canonical projection");
  const container = new Container();
  container.eventMode = "none";
  container.sortableChildren = true;
  const cache = createTerrainChunkCache({ runtime });
  let appearance, terrainArt;
  const batches = createTerrainBatchMeshes({ parent: container });
  const waterTexture = createWaterSurfaceTexture();
  let waterEntries = new Map(), waterRecordEntries = new Map(), waterRecords = [];
  let frame, epoch, level, records = [], disposed = false, recordRevision = 0;
  let retainedRecords = Object.freeze([]);
  let demandIdentity, coverageIdentity, observedService, serviceTurn = 0, servedTurn = -1;
  let retainedViewport;

  function installArt(pack) {
    if (disposed || terrainArt) throw new Error("terrain art can only be installed once");
    terrainArt = pack;
    appearance = createTerrainFaceAppearance({ pack });
    coverageIdentity = undefined;
  }

  function publishRecords(nextTerrain = records, nextWater = waterRecords) {
    records = nextTerrain;
    waterRecords = nextWater;
    retainedRecords = Object.freeze([...records, ...waterRecords]);
    recordRevision++;
  }

  function update(frameValue, nextEpoch) {
    if (disposed) throw new Error("cut terrain layer is disposed");
    frame = frameValue;
    epoch = nextEpoch;
    if (!frameValue) {
      waterRecordEntries.clear();
      publishRecords([], []);
      batches.update([]); container.visible = false; return;
    }
    cache.updateFrame({ epoch: nextEpoch, terrain: frameValue });
    serviceTurn++;
  }

  function position(camera, view, screen) {
    if (disposed || !frame?.baseline) return;
    container.visible = true;
    container.position.set(camera.x, camera.y);
    container.scale.set(camera.zoom);
    level = view.cutaway ? view.level : view.range.max;
    const viewport = { left: -camera.x / camera.zoom, right: (screen.width - camera.x) / camera.zoom,
      top: -camera.y / camera.zoom, bottom: (screen.height - camera.y) / camera.zoom };
    const planned = visibleTerrainChunks({ bounds: frame.baseline.bounds, level,
      verticalMetres: frame.baseline.verticalMetres, projection, viewport });
    if (planned.kind === "view-budget") {
      publishRecords([], []);
      onCoverage?.({ kind: "view-budget", limit: planned.limit });
      return;
    }
    const nextDemand = planned.chunks.map(key => key.join(",")).join(";");
    if (nextDemand !== demandIdentity) {
      demandIdentity = nextDemand;
      cache.updateDemand(planned.chunks);
      serviceTurn++;
    }
    const snapshot = cache.snapshot();
    if (!snapshot.viewComplete && !snapshot.viewBudget && servedTurn !== serviceTurn) {
      servedTurn = serviceTurn;
      const service = cache.service();
      if (service !== observedService) {
        observedService = service;
        void service.then(next => {
          if (!disposed && next.viewComplete) onCoverage?.({ kind: "ready" });
        }).catch(error => onCoverage?.({ kind: "error", error }));
      }
    }
    if (!snapshot.viewComplete || snapshot.chunks.length === 0) return;
    if (!appearance) throw new Error("cut terrain art is not installed");
    const identity = `${snapshot.epoch}:${snapshot.terrainRevision}:${level}:${nextDemand}`;
    const viewportRetained = retainedViewport && viewport.left >= retainedViewport.left
      && viewport.right <= retainedViewport.right && viewport.top >= retainedViewport.top
      && viewport.bottom <= retainedViewport.bottom;
    if (identity === coverageIdentity && viewportRetained) return;
    coverageIdentity = identity;
    // Keep a little offscreen geometry so small pans only move the container.
    // Chunk demand alone cannot key records culled against a narrower viewport.
    retainedViewport = { left: viewport.left - 64, right: viewport.right + 64,
      top: viewport.top - 64, bottom: viewport.bottom + 64 };
    const generatedTops = new Map(frame.surfaces.map(surface => [`${surface.cell[0]},${surface.cell[2]}`, surface.generatedTop]));
    const coverage = materialCoverage({ chunks: snapshot.chunks, palette: snapshot.baseline.materials,
      bounds: snapshot.baseline.bounds, verticalMetres: snapshot.baseline.verticalMetres,
      variantSeed: snapshot.baseline.variantSeed,
      epoch: snapshot.epoch, terrainRevision: snapshot.terrainRevision });
    const nextRecords = terrainFaceRecords(coverage, { level, projection, viewport: retainedViewport,
      appearance, generatedTops });
    const availableSupports = new Set(nextRecords.map(record => `${record.id}\u0000${record.part ?? ""}`));
    nextRecords.push(...terrainCoverRecords(frame.surfaces, { level, projection, viewport: retainedViewport, appearance,
      verticalMetres: snapshot.baseline.verticalMetres, variantSeed: snapshot.baseline.variantSeed, availableSupports }));
    publishRecords(nextRecords, waterRecords);
  }

  function refreshWaterRecords() {
    if (!frame) return;
    const shown = frame.water.filter(cell => cell.liquidVolumeM3 > 0 && cell.at[1] <= level);
    waterEntries = reconcileWaterSprites(waterEntries, shown, {
      key: waterCellKey,
      create: () => { const sprite = new Sprite(waterTexture); sprite.anchor.set(0.5); sprite.eventMode = "none"; container.addChild(sprite); return sprite; },
      update: (sprite, cell) => {
        const [x, y, z] = cell.at, top = (y - 0.5) * frame.verticalMetres + (cell.level / 7) * frame.verticalMetres;
        const at = project(x, top, z); sprite.position.set(at.x, at.y);
      },
      dispose: sprite => sprite.destroy(),
    });
    const nextEntries = new Map(), nextRecords = shown.map(cell => {
      const key = waterCellKey(cell), display = waterEntries.get(key).sprite;
      const signature = `${cell.at.join(",")}:${cell.level}:${cell.liquidVolumeM3}:${frame.verticalMetres}`;
      const previous = waterRecordEntries.get(key);
      const record = previous?.signature === signature && previous.record.display === display
        ? previous.record
        : waterDrawRecord(cell, { verticalMetres: frame.verticalMetres, display });
      nextEntries.set(key, { signature, record });
      return record;
    });
    const unchanged = nextRecords.length === waterRecords.length
      && nextRecords.every((record, index) => record === waterRecords[index]);
    waterRecordEntries = nextEntries;
    if (!unchanged) publishRecords(records, nextRecords);
  }

  return Object.freeze({
    container,
    installArt,
    update,
    position,
    get sortableItems() { refreshWaterRecords(); return retainedRecords; },
    get retainedRecords() {
      refreshWaterRecords();
      return Object.freeze({ revision: recordRevision, records: retainedRecords });
    },
    applyOrder: ordered => batches.update(ordered),
    get coverage() { return cache.snapshot(); },
    dispose() {
      if (disposed) return;
      disposed = true; cache.dispose(); batches.dispose(); terrainArt?.dispose();
      for (const entry of waterEntries.values()) entry.sprite.destroy();
      waterEntries.clear(); waterRecordEntries.clear(); waterTexture.destroy(true); records = []; waterRecords = [];
    },
  });
}
