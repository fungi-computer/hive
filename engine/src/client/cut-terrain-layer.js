import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { createTerrainChunkCache } from "./terrain-chunk-cache.js";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";
import { createTerrainBatchMeshes } from "./terrain-face-batches.js";
import { materialCoverage, terrainCoverRecords, terrainFaceRecords, visibleTerrainChunks } from "./terrain-visibility.js";
import { reconcileWaterSprites, waterCellKey } from "./water-sprite-reconciler.js";
import { project } from "./geometry.js";

const WATER_WIDTH = 32, WATER_HEIGHT = 16;

function createWaterTile() {
  const pixels = new Uint8Array(WATER_WIDTH * WATER_HEIGHT * 4);
  for (let y = 0; y < WATER_HEIGHT; y++) for (let x = 0; x < WATER_WIDTH; x++) {
    const dx = x + 0.5 - WATER_WIDTH / 2, dy = y + 0.5 - WATER_HEIGHT / 2;
    if (Math.abs(dx / (WATER_WIDTH / 2)) + Math.abs(dy / (WATER_HEIGHT / 2)) > 1) continue;
    pixels.set([73, 125, 136, 178], (y * WATER_WIDTH + x) * 4);
  }
  return new Texture({ source: new BufferImageSource({ resource: pixels, width: WATER_WIDTH,
    height: WATER_HEIGHT, format: "rgba8unorm", alphaMode: "no-premultiply-alpha", scaleMode: "nearest" }) });
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
  const waterTexture = createWaterTile();
  let waterEntries = new Map(), frame, epoch, level, records = [], disposed = false;
  let demandIdentity, coverageIdentity, observedService, serviceTurn = 0, servedTurn = -1;

  function installArt(pack) {
    if (disposed || terrainArt) throw new Error("terrain art can only be installed once");
    terrainArt = pack;
    appearance = createTerrainFaceAppearance({ pack });
    coverageIdentity = undefined;
  }

  function update(frameValue, nextEpoch) {
    if (disposed) throw new Error("cut terrain layer is disposed");
    frame = frameValue;
    epoch = nextEpoch;
    if (!frameValue) { records = []; batches.update([]); container.visible = false; return; }
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
      records = [];
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
    if (identity === coverageIdentity) return;
    coverageIdentity = identity;
    const generatedTops = new Map(frame.surfaces.map(surface => [`${surface.cell[0]},${surface.cell[2]}`, surface.generatedTop]));
    const coverage = materialCoverage({ chunks: snapshot.chunks, palette: snapshot.baseline.materials,
      bounds: snapshot.baseline.bounds, verticalMetres: snapshot.baseline.verticalMetres,
      variantSeed: snapshot.baseline.variantSeed,
      epoch: snapshot.epoch, terrainRevision: snapshot.terrainRevision });
    records = terrainFaceRecords(coverage, { level, projection, viewport,
      appearance, generatedTops });
    records.push(...terrainCoverRecords(frame.surfaces, { level, projection, viewport, appearance,
      verticalMetres: snapshot.baseline.verticalMetres, variantSeed: snapshot.baseline.variantSeed }));
  }

  function waterRecords() {
    if (!frame) return [];
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
    return shown.map(cell => {
      const [x, y, z] = cell.at, top = (y - 0.5) * frame.verticalMetres + (cell.level / 7) * frame.verticalMetres;
      const at = project(x, top, z), sprite = waterEntries.get(waterCellKey(cell)).sprite;
      return { id: `water:${x}:${y}:${z}`, part: "surface", role: "water", orderingKind: "compact",
        display: sprite, footprint: [{ x, y: top, z }], screenBounds: { left: at.x - 16, right: at.x + 16,
          top: at.y - 8, bottom: at.y + 8 }, storeyBand: y, pickable: false, visible: true };
    });
  }

  return Object.freeze({
    container,
    installArt,
    update,
    position,
    get sortableItems() { return [...records, ...waterRecords()]; },
    applyOrder: ordered => batches.update(ordered),
    get coverage() { return cache.snapshot(); },
    dispose() {
      if (disposed) return;
      disposed = true; cache.dispose(); batches.dispose(); terrainArt?.dispose();
      for (const entry of waterEntries.values()) entry.sprite.destroy();
      waterEntries.clear(); waterTexture.destroy(true); records = [];
    },
  });
}
