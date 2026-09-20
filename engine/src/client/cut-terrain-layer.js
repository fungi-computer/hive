import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { createCameraCoverageOwner } from "./camera-coverage-owner.js";
import { createTerrainChunkCache, TERRAIN_CHUNK_CACHE_CAPACITY } from "./terrain-chunk-cache.js";
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
  const cache = createTerrainChunkCache({ runtime });
  const cameraCoverage = createCameraCoverageOwner();
  let appearance, terrainArt;
  const batches = createTerrainBatchMeshes({ parent: container });
  const waterTexture = createWaterSurfaceTexture();
  let waterEntries = new Map(), waterRecordEntries = new Map(), waterRecords = [];
  let frame, epoch, level, records = [], disposed = false, recordRevision = 0;
  let retainedRecords = Object.freeze([]);
  let lastPlan, demandIdentity, coverageIdentity, terrainContext, observedService, reportedBudget;
  let surfaceIdentity;
  let presentedSurfaces = [], exposedFaces = [], presentedFrame, presentedSource;
  const faceChunks = new Map();
  let coverEntries = new Map();

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
    frame = frameValue;
    epoch = nextEpoch;
    surfaceIdentity = frameValue ? JSON.stringify(frameValue.surfaces) : undefined;
    if (!frameValue) {
      cameraCoverage.reset(); faceChunks.clear(); coverEntries.clear(); coverageIdentity = undefined; terrainContext = undefined; demandIdentity = undefined; lastPlan = undefined;
      waterRecordEntries.clear(); presentedSurfaces = []; exposedFaces = []; presentedFrame = undefined;
      publishRecords([], []);
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
    const nextTerrainContext = `${epoch}:${frame.revision}:${level}`;
    if (terrainContext !== undefined && terrainContext !== nextTerrainContext) {
      // A previous cut or terrain revision cannot stand in for an incomplete
      // replacement view: its caps and cover may now be inside solid ground.
      terrainContext = undefined;
      presentedSurfaces = []; exposedFaces = []; presentedFrame = undefined;
      coverageIdentity = undefined;
      publishRecords([], []);
      batches.update([]);
    }
    const viewport = { left: -camera.x / camera.zoom, right: (screen.width - camera.x) / camera.zoom,
      top: -camera.y / camera.zoom, bottom: (screen.height - camera.y) / camera.zoom };
    const planned = cameraCoverage.update(viewport, `${epoch}:${level}:${viewTurn}`, prepared =>
      visibleTerrainChunks({ bounds: frame.baseline.bounds, level,
        verticalMetres: frame.baseline.verticalMetres, projection, viewport: prepared, limit: TERRAIN_CHUNK_CACHE_CAPACITY }));
    if (planned.kind === "view-budget") {
      const budgetId = `${epoch}:${level}:${viewport.left}:${viewport.right}:${viewport.top}:${viewport.bottom}`;
      if (reportedBudget !== budgetId) {
        reportedBudget = budgetId;
        // Discarding the presented scene also invalidates its publication key.
        // A return to the same resident demand must republish those faces.
        coverageIdentity = undefined;
        terrainContext = undefined;
        presentedSurfaces = []; exposedFaces = []; presentedFrame = undefined;
        publishRecords([], []);
        queueMicrotask(() => { if (!disposed) onCoverage?.({ kind: "view-budget", limit: planned.limit }); });
      }
      return;
    }
    reportedBudget = undefined;
    if (lastPlan !== planned) {
      lastPlan = planned;
      const nextDemand = planned.chunks.map(key => key.join(",")).join(";");
      if (nextDemand !== demandIdentity) {
        demandIdentity = nextDemand;
        cache.updateDemand(planned.chunks);
      }
    }
    const snapshot = cache.snapshot();
    if (!snapshot.demandComplete && !snapshot.viewBudget) {
      const beforeReady = snapshot.coverage.filter(item => item.status === "ready").length;
      const requestedDemand = demandIdentity;
      const service = cache.service();
      if (service !== observedService) {
        observedService = service;
        void service.then(next => {
          if (!disposed && (requestedDemand !== demandIdentity ||
            next.coverage.filter(item => item.status === "ready").length > beforeReady))
            onCoverage?.({ kind: "ready" });
        }, error => { if (!disposed) onCoverage?.({ kind: "error", error }); });
      }
    }
    if (!snapshot.demandComplete) return;
    if (snapshot.chunks.length === 0) {
      if (records.length || presentedSurfaces.length) {
        coverageIdentity = undefined;
        presentedSurfaces = []; exposedFaces = []; presentedFrame = undefined;
        publishRecords([], waterRecords);
      }
      return;
    }
    if (!appearance) throw new Error("cut terrain art is not installed");
    if (coverageIdentity?.epoch === snapshot.epoch && coverageIdentity.revision === snapshot.terrainRevision &&
        coverageIdentity.level === level && coverageIdentity.demand === demandIdentity && coverageIdentity.surfaces === surfaceIdentity) return;
    const surfacesByColumn = new Map(snapshot.chunks.flatMap(chunk => chunk.surfaces).map(surface =>
      [`${surface.cell[0]},${surface.cell[2]}`, surface]));
    // Current observed facts can change appearance without a voxel edit (mowing).
    // They override the corresponding streamed column, never synthesize cover.
    for (const surface of frame.surfaces) surfacesByColumn.set(`${surface.cell[0]},${surface.cell[2]}`, surface);
    const surfaces = [...surfacesByColumn.values()];
    const generatedTops = new Map(surfaces.map(surface => [`${surface.cell[0]},${surface.cell[2]}`, surface.generatedTop]));
    const coverage = materialCoverage({ chunks: snapshot.chunks, palette: snapshot.baseline.materials,
      bounds: snapshot.baseline.bounds, verticalMetres: snapshot.baseline.verticalMetres,
      variantSeed: snapshot.baseline.variantSeed,
      epoch: snapshot.epoch, terrainRevision: snapshot.terrainRevision });
    const paletteSignature = JSON.stringify(snapshot.baseline.materials);
    const chunksById = new Map(snapshot.chunks.map(chunk => [chunk.key.join(","), chunk]));
    const nextFaceChunks = new Map();
    const nextRecords = [];
    for (const chunk of snapshot.chunks) {
      const id = chunk.key.join(",");
      const neighbors = [[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
        .map(([x,y,z]) => chunksById.get([chunk.key[0]+x,chunk.key[1]+y,chunk.key[2]+z].join(",")));
      const tops = chunk.columns.map(column => generatedTops.get(`${column.x},${column.z}`));
      const previous = faceChunks.get(id);
      const same = previous && previous.level === level && previous.variantSeed === coverage.variantSeed
        && previous.verticalMetres === coverage.verticalMetres && previous.paletteSignature === paletteSignature
        && neighbors.every((neighbor, index) => previous.neighbors[index] === neighbor)
        && tops.every((top, index) => previous.tops[index] === top);
      const faces = same ? previous.faces : terrainFaceRecords({ ...coverage, chunks: [chunk] },
        { level, projection, appearance, generatedTops });
      nextFaceChunks.set(id, { level, variantSeed: coverage.variantSeed,
        verticalMetres: coverage.verticalMetres, paletteSignature,
        neighbors, tops, faces });
      nextRecords.push(...faces);
    }
    faceChunks.clear();
    for (const [id, entry] of nextFaceChunks) faceChunks.set(id, entry);
    const supportedCover = surfaces.filter(surface => {
      const ground = coverage.sample(surface.cell);
      const air = coverage.sample([surface.cell[0], surface.cell[1] + 1, surface.cell[2]]);
      return ground.kind === "known" && ground.solid && air.kind === "known" && !air.solid;
    });
    const nextCoverEntries = new Map();
    for (const record of terrainCoverRecords(supportedCover, { level, projection, appearance,
      verticalMetres: snapshot.baseline.verticalMetres, variantSeed: snapshot.baseline.variantSeed })) {
      const previous = coverEntries.get(record.id);
      const retained = previous && previous.mask === record.mask && previous.terrainBatch === record.terrainBatch
        ? previous : record;
      nextCoverEntries.set(record.id, retained); nextRecords.push(retained);
    }
    coverEntries = nextCoverEntries;
    // Picking follows the exact accepted top faces, including cut caps. Cover
    // still requires real solid/air support above; a cap never grows grass.
    const nextExposedFaces = nextRecords.filter(record => record.role === "terrain");
    if (nextExposedFaces.length !== exposedFaces.length || nextExposedFaces.some((record, index) => record !== exposedFaces[index]))
      exposedFaces = nextExposedFaces;
    presentedSurfaces = exposedFaces.filter(record => record.face === "top")
      .map(record => ({ cell: record.cell, material: record.material,
        generatedTop: generatedTops.get(`${record.cell[0]},${record.cell[2]}`) }));
    presentedFrame = undefined;
    coverageIdentity = { epoch: snapshot.epoch, revision: snapshot.terrainRevision, level, demand: demandIdentity, surfaces: surfaceIdentity };
    terrainContext = nextTerrainContext;
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
      coverageIdentity = undefined; terrainContext = undefined; faceChunks.clear(); coverEntries.clear(); waterRecordEntries.clear();
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
    get coverage() { return cache.snapshot(); },
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
      disposed = true; cameraCoverage.reset(); cache.dispose(); batches.dispose(); terrainArt?.dispose();
      for (const entry of waterEntries.values()) entry.sprite.destroy();
      waterEntries.clear(); waterRecordEntries.clear(); faceChunks.clear(); coverEntries.clear(); waterTexture.destroy(true); records = []; waterRecords = []; retainedRecords = Object.freeze([]);
      frame = undefined; terrainArt = undefined; appearance = undefined;
      presentedSurfaces = []; exposedFaces = []; presentedFrame = undefined; presentedSource = undefined;
      // A fulfilled service promise retains its chunk snapshot until released.
      observedService = lastPlan = demandIdentity = coverageIdentity = terrainContext = surfaceIdentity = reportedBudget = undefined;
      epoch = level = undefined;
    },
  });
}
