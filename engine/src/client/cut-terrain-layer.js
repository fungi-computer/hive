import { createTerrainPictureOwner } from "./terrain-picture-owner.js";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { createCameraCoverageOwner } from "./camera-coverage-owner.js";
import { createTerrainRegionCache, TERRAIN_REGION_CACHE_CAPACITY } from "./terrain-region-cache.js";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";
import { createTerrainBatchMeshes } from "./terrain-face-batches.js";
import { visibleTerrainRegions, prioritizeTerrainRegions } from "./terrain-visibility.js";
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
    attachment: Object.freeze({ kind: "liquid-surface", point: Object.freeze({ x, y: top, z }) }),
    orderingKind: "compact",
    ...(display ? { display } : {}),
    footprint: Object.freeze([{ x, y: top, z }]),
    orderGeometry: { kind: "face", points: [[-.5,-.5],[-.5,.5],[.5,.5],[.5,-.5]]
      .map(([dx,dz]) => ({ x: x + dx, y: top, z: z + dz })) },
    surfaceOrder: 1,
    screenBounds: Object.freeze({ left: at.x - 16, right: at.x + 16, top: at.y - 8, bottom: at.y + 8 }),
    storeyBand: y,
    pickable: false,
    visible: true,
  });
}

/** One disposable owner for requested terrain coverage, logical faces, water and
 * consecutive Pixi mesh runs. The simulation remains authoritative elsewhere.
 */
export function createCutTerrainLayer({ runtime, projection: initialProjection, onCoverage } = {}) {
  let projection = initialProjection, viewTurn = 0;
  if (!projection) throw new Error("cut terrain layer requires the canonical projection");
  const container = new Container();
  container.eventMode = "none";
  container.sortableChildren = true;
  let coverageQueued = false, coverageAnimation;
  const cache = createTerrainRegionCache({ runtime, onChange() {
    if (coverageQueued) return;
    coverageQueued = true;
    const publish = () => { coverageQueued = false; coverageAnimation = undefined; if (!disposed) onCoverage?.({ kind:"ready" }); };
    if (globalThis.requestAnimationFrame) coverageAnimation = globalThis.requestAnimationFrame(publish);
    else queueMicrotask(publish);
  } });
  const cameraCoverage = createCameraCoverageOwner();
  let appearance, terrainArt;
  const batches = createTerrainBatchMeshes({ parent: container });
  const waterTexture = createWaterSurfaceTexture();
  let waterEntries = new Map(), waterRecordEntries = new Map(), waterRecords = [];
  let frame, epoch, level, records = [], disposed = false, recordRevision = 0;
  let retainedRecords = Object.freeze([]);
  let coverageIdentity, reportedBudget;
  let surfaceIdentity;
  let presentedSurfaces = [], exposedFaces = [], presentedFrame, presentedSource;
  const pictures = createTerrainPictureOwner();

  function installArt(pack) {
    if (disposed || terrainArt) throw new Error("terrain art can only be installed once");
    terrainArt = pack;
    appearance = createTerrainFaceAppearance({ pack, turn: viewTurn });
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
    // Observation references and the terrain projection retain unchanged
    // surface arrays. Water/actor ticks must not reserialize their cover facts.
    if (frame?.surfaces !== frameValue?.surfaces)
      surfaceIdentity = frameValue ? JSON.stringify(frameValue.surfaces) : undefined;
    frame = frameValue;
    epoch = nextEpoch;
    if (!frameValue) {
      cameraCoverage.reset(); cache.clear(); pictures.clear(); coverageIdentity = undefined; reportedBudget = undefined;
      waterRecordEntries.clear(); presentedSurfaces = []; exposedFaces = []; presentedFrame = presentedSource = undefined;
      for (const entry of waterEntries.values()) entry.sprite.destroy();
      waterEntries.clear(); publishRecords([], []);
      batches.update([]); container.visible = false; return;
    }
    cache.updateFrame({ epoch: nextEpoch, terrain: frameValue });
  }

  function transform(camera) {
    if (disposed) return;
    container.position.set(camera.x, camera.y);
    container.scale.set(camera.zoom);
  }

  function position(camera, view, screen) {
    if (disposed || !frame?.baseline) return;
    container.visible = true;
    transform(camera);
    level = view.cutaway ? view.level : frame.baseline.bounds.maxY - 1;
    const viewport = { left:-camera.x/camera.zoom, right:(screen.width-camera.x)/camera.zoom,
      top:-camera.y/camera.zoom, bottom:(screen.height-camera.y)/camera.zoom };
    const planned = cameraCoverage.update(viewport, `${epoch}:${level}:${viewTurn}`, prepared =>
      visibleTerrainRegions({ bounds:frame.baseline.bounds, level, verticalMetres:frame.baseline.verticalMetres,
        projection, viewport:prepared, limit:TERRAIN_REGION_CACHE_CAPACITY }));
    if (planned.kind === "view-budget") {
      const budgetId = `${epoch}:${level}:${viewport.left}:${viewport.right}:${viewport.top}:${viewport.bottom}`;
      if (reportedBudget !== budgetId) {
        reportedBudget = budgetId;
        cache.updateDemand({ regions:[], level });
        coverageIdentity = undefined; presentedSurfaces = []; exposedFaces = []; presentedFrame = undefined;
        publishRecords([], []); batches.update([]);
        queueMicrotask(() => { if (!disposed) onCoverage?.({ kind:"view-budget", limit:planned.limit }); });
      }
      return;
    }
    reportedBudget = undefined;
    cache.updateDemand({ ...prioritizeTerrainRegions(planned, viewport), level });
    const snapshot = cache.snapshot();
    // Requests may finish before the checked atlas is installed. Keep those
    // patches resident and publish them once appearance is ready.
    if (!appearance) return;
    if (coverageIdentity?.publication === snapshot.publication && coverageIdentity.surfaces === surfaceIdentity && coverageIdentity.plan === planned) return;
    // Cull to the retained plan, not the moving camera. A new plan must recull
    // even when it requests exactly the same already-resident regions.
    const prepared = cameraCoverage.snapshot().prepared;
    const task = pictures.prepare({ snapshot, plan: planned, viewport: prepared, surfaces: frame.surfaces,
      level, projection, appearance });
    // The frame owner will schedule this same task incrementally. The current
    // synchronous entrypoint drains it for existing consumers during integration.
    while (task.status === "pending") task.advance({ maxOperations: 2048 });
    const product = task.publish();
    if (product.exposedFaces !== exposedFaces || product.surfaces !== presentedSurfaces) presentedFrame = undefined;
    exposedFaces = product.exposedFaces; presentedSurfaces = product.surfaces;
    coverageIdentity = { publication:snapshot.publication, surfaces:surfaceIdentity, plan:planned };
    if (product.records !== records) publishRecords(product.records, waterRecords);
  }

  function refreshWaterRecords() {
    if (!frame) return;
    const shown = frame.water.filter(cell => cell.liquidVolumeM3 > 0 && cell.at[1] <= level);
    waterEntries = reconcileWaterSprites(waterEntries, shown, {
      key: waterCellKey,
      create: () => { const sprite = new Sprite(waterTexture); sprite.anchor.set(0.5); sprite.eventMode = "none"; container.addChild(sprite); return sprite; },
      update: (sprite, cell) => {
        const [x, y, z] = cell.at, top = (y - 0.5) * frame.verticalMetres + (cell.level / 7) * frame.verticalMetres;
        const at = projection.project({ x, y: top, z }); sprite.position.set(at.x, at.y);
      },
      dispose: sprite => sprite.destroy(),
    });
    const nextEntries = new Map(), nextRecords = shown.map(cell => {
      const key = waterCellKey(cell), display = waterEntries.get(key).sprite;
      const signature = `${cell.at.join(",")}:${cell.level}:${frame.verticalMetres}`;
      const previous = waterRecordEntries.get(key);
      const record = previous?.signature === signature && previous.record.display === display
        ? previous.record
        : waterDrawRecord(cell, { verticalMetres: frame.verticalMetres, display,
          projection: (x, y, z) => projection.project({ x, y, z }) });
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
    setProjection(nextProjection, turn) {
      if (!nextProjection?.project || !nextProjection?.ray || !Number.isSafeInteger(turn) || turn < 0 || turn > 3)
        throw new Error("invalid terrain view projection");
      projection = nextProjection; viewTurn = turn;
      appearance = terrainArt ? createTerrainFaceAppearance({ pack: terrainArt, turn }) : undefined;
      cameraCoverage.reset(); presentedSurfaces = []; exposedFaces = []; presentedFrame = undefined;
      coverageIdentity = undefined; pictures.clear(); waterRecordEntries.clear();
      publishRecords([], []);
      batches.update([]);
    },
    update,
    transform,
    position,
    get sortableItems() { refreshWaterRecords(); return retainedRecords; },
    get retainedRecords() {
      refreshWaterRecords();
      return Object.freeze({ revision: recordRevision, records: retainedRecords });
    },
    applyOrder: ordered => batches.update(ordered),
    get coverage() {
      const snapshot = cache.snapshot();
      return reportedBudget === undefined ? snapshot : Object.freeze({ ...snapshot, viewBudget:true, visibleComplete:false, demandComplete:false });
    },
    get meshMetrics() { return batches.metrics(); },
    get cameraCoverage() { return cameraCoverage.snapshot(); },
    get presentedTerrain() {
      if (!frame) return undefined;
      if (!presentedFrame || presentedSource !== frame) {
        presentedSource = frame;
        presentedFrame = { ...frame, surfaces: presentedSurfaces, exposedFaces };
      }
      return presentedFrame;
    },
    dispose() {
      if (disposed) return;
      disposed = true; if (coverageAnimation !== undefined) globalThis.cancelAnimationFrame?.(coverageAnimation);
      coverageAnimation = undefined; coverageQueued = false; cameraCoverage.reset(); cache.dispose(); batches.dispose(); terrainArt?.dispose();
      for (const entry of waterEntries.values()) entry.sprite.destroy();
      waterEntries.clear(); waterRecordEntries.clear(); pictures.dispose(); waterTexture.destroy(true); records = []; waterRecords = []; retainedRecords = Object.freeze([]);
      frame = undefined; terrainArt = undefined; appearance = undefined;
      presentedSurfaces = []; exposedFaces = []; presentedFrame = undefined; presentedSource = undefined;
      // A fulfilled service promise retains its chunk snapshot until released.
      coverageIdentity = surfaceIdentity = reportedBudget = undefined;
      epoch = level = undefined;
    },
  });
}
