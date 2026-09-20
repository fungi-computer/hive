import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { createCameraCoverageOwner } from "./camera-coverage-owner.js";
import { createTerrainRegionCache, TERRAIN_REGION_CACHE_CAPACITY } from "./terrain-region-cache.js";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";
import { createTerrainBatchMeshes } from "./terrain-face-batches.js";
import { terrainCoverRecords, terrainFaceRecords, visibleTerrainRegions, prioritizeTerrainRegions } from "./terrain-visibility.js";
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
  const regionEntries = new Map();

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
      cameraCoverage.reset(); cache.clear(); regionEntries.clear(); coverageIdentity = undefined; reportedBudget = undefined;
      waterRecordEntries.clear(); presentedSurfaces = []; exposedFaces = []; presentedFrame = presentedSource = undefined;
      for (const entry of waterEntries.values()) entry.sprite.destroy();
      waterEntries.clear(); publishRecords([], []);
      batches.update([]); container.visible = false; return;
    }
    cache.updateFrame({ epoch: nextEpoch, terrain: frameValue });
  }

  function position(camera, view, screen) {
    if (disposed || !frame?.baseline) return;
    container.visible = true;
    container.position.set(camera.x, camera.y);
    container.scale.set(camera.zoom);
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
    const overrides = new Map(frame.surfaces.map(surface => [`${surface.cell[0]},${surface.cell[2]}`,surface]));
    const paletteSignature = JSON.stringify(snapshot.baseline.materials);
    const nextEntries = new Map(), nextRecords = [], generatedTops = new Map();
    for (const patch of snapshot.patches) {
      const id = patch.key.join(","), previous = regionEntries.get(id);
      const tops = new Map(patch.surfaces.map(surface => [`${surface.cell[0]},${surface.cell[2]}`,surface.generatedTop]));
      for (const [column,top] of tops) generatedTops.set(column,top);
      const sameBody = previous?.patch === patch && previous.paletteSignature === paletteSignature &&
        previous.verticalMetres === snapshot.baseline.verticalMetres && previous.variantSeed === snapshot.baseline.variantSeed;
      const samePrepared = previous?.plan === planned;
      const previousBody = sameBody && !samePrepared ? new Map(previous.body.map(record => [record.id,record])) : undefined;
      const body = sameBody && samePrepared ? previous.body : terrainFaceRecords({ faces:patch.faces, palette:snapshot.baseline.materials,
        verticalMetres:snapshot.baseline.verticalMetres, variantSeed:snapshot.baseline.variantSeed }, { projection, appearance, generatedTops:tops, viewport:prepared })
        .map(record => previousBody?.get(record.id) ?? record);
      // Only returned support columns are eligible. Observations replace current
      // cover facts on those columns; they never invent support in unknown space.
      const surfaces = patch.surfaces.map(surface => overrides.get(`${surface.cell[0]},${surface.cell[2]}`) ?? surface);
      const coverSignature = JSON.stringify(surfaces);
      let cover = sameBody && samePrepared && previous.coverSignature === coverSignature ? previous.cover : undefined;
      if (!cover) {
        const bounds = patch.bounds, world = snapshot.baseline.bounds;
        const minX = bounds.minX - Number(bounds.minX === world.minX);
        const minZ = bounds.minZ - Number(bounds.minZ === world.minZ);
        const previousCover = new Map((previous?.cover ?? []).map(record => [record.id,record]));
        cover = terrainCoverRecords(surfaces, { level, projection, appearance, viewport:prepared,
          verticalMetres:snapshot.baseline.verticalMetres, variantSeed:snapshot.baseline.variantSeed }).filter(record => {
          const root = record.attachment.point;
          return root.x-.5 >= minX && root.x-.5 < bounds.maxX && root.z-.5 >= minZ && root.z-.5 < bounds.maxZ;
        }).map(record => {
          const old = previousCover.get(record.id);
          return old?.mask === record.mask && old.terrainBatch === record.terrainBatch ? old : record;
        });
      }
      nextEntries.set(id,{patch,body,cover,coverSignature,paletteSignature,plan:planned,
        verticalMetres:snapshot.baseline.verticalMetres,variantSeed:snapshot.baseline.variantSeed});
      nextRecords.push(...body,...cover);
    }
    regionEntries.clear();
    for (const [id,entry] of nextEntries) regionEntries.set(id,entry);
    const nextExposed = nextRecords.filter(record => record.role === "terrain");
    const exposedChanged = nextExposed.length !== exposedFaces.length || nextExposed.some((record,index)=>record!==exposedFaces[index]);
    if (exposedChanged) exposedFaces = nextExposed;
    const nextSurfaces = exposedFaces.filter(record=>record.face==="top").map(record=>({cell:record.cell,material:record.material,
      generatedTop:generatedTops.get(`${record.cell[0]},${record.cell[2]}`)}));
    const surfacesChanged = nextSurfaces.length !== presentedSurfaces.length || nextSurfaces.some((surface,index) => {
      const previous = presentedSurfaces[index];
      return surface.cell !== previous.cell || surface.material !== previous.material || surface.generatedTop !== previous.generatedTop;
    });
    if (surfacesChanged) presentedSurfaces = nextSurfaces;
    if (exposedChanged || surfacesChanged) presentedFrame = undefined;
    coverageIdentity = { publication:snapshot.publication, surfaces:surfaceIdentity, plan:planned };
    if (nextRecords.length !== records.length || nextRecords.some((record,index)=>record!==records[index]))
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
      coverageIdentity = undefined; regionEntries.clear(); waterRecordEntries.clear();
      publishRecords([], []);
      batches.update([]);
    },
    update,
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
      waterEntries.clear(); waterRecordEntries.clear(); regionEntries.clear(); waterTexture.destroy(true); records = []; waterRecords = []; retainedRecords = Object.freeze([]);
      frame = undefined; terrainArt = undefined; appearance = undefined;
      presentedSurfaces = []; exposedFaces = []; presentedFrame = undefined; presentedSource = undefined;
      // A fulfilled service promise retains its chunk snapshot until released.
      coverageIdentity = surfaceIdentity = reportedBudget = undefined;
      epoch = level = undefined;
    },
  });
}
