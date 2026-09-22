import { createTerrainPictureOwner } from "./terrain-picture-owner.js";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { createCameraCoverageOwner } from "./camera-coverage-owner.js";
import {
  createTerrainRegionCache,
  TERRAIN_REGION_CACHE_CAPACITY,
} from "./terrain-region-cache.js";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";
import { createTerrainBatchMeshes } from "./terrain-face-batches.js";
import {
  visibleTerrainRegions,
  prioritizeTerrainRegions,
} from "./terrain-visibility.js";
import {
  waterSpriteReconciliationSteps,
  waterCellKey,
} from "./water-sprite-reconciler.js";
import { project } from "./geometry.js";

const WATER_WIDTH = 32,
  WATER_HEIGHT = 16;

export function createWaterSurfaceTexture() {
  const pixels = new Uint8Array(WATER_WIDTH * WATER_HEIGHT * 4);
  for (let y = 0; y < WATER_HEIGHT; y++)
    for (let x = 0; x < WATER_WIDTH; x++) {
      const dx = x + 0.5 - WATER_WIDTH / 2,
        dy = y + 0.5 - WATER_HEIGHT / 2;
      if (
        Math.abs(dx / (WATER_WIDTH / 2)) + Math.abs(dy / (WATER_HEIGHT / 2)) >
        1
      )
        continue;
      pixels.set([73, 125, 136, 178], (y * WATER_WIDTH + x) * 4);
    }
  return new Texture({
    source: new BufferImageSource({
      resource: pixels,
      width: WATER_WIDTH,
      height: WATER_HEIGHT,
      format: "rgba8unorm",
      alphaMode: "no-premultiply-alpha",
      scaleMode: "nearest",
    }),
  });
}

/** One authoritative world-space presentation record for a visible liquid cell. */
export function waterDrawRecord(
  cell,
  { verticalMetres, projection = project, display } = {},
) {
  if (
    !cell ||
    !Array.isArray(cell.at) ||
    cell.at.length !== 3 ||
    !cell.at.every(Number.isFinite) ||
    !Number.isFinite(cell.level) ||
    !(verticalMetres > 0) ||
    typeof projection !== "function"
  )
    throw new Error("invalid water draw cell");
  const [x, y, z] = cell.at;
  const top = (y - 0.5) * verticalMetres + (cell.level / 7) * verticalMetres;
  const at = projection(x, top, z);
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y))
    throw new Error("invalid projected water cell");
  return Object.freeze({
    id: `water:${x}:${y}:${z}`,
    part: "surface",
    role: "water",
    renderPass: "transparent",
    attachment: Object.freeze({
      kind: "liquid-surface",
      point: Object.freeze({ x, y: top, z }),
    }),
    orderingKind: "compact",
    ...(display ? { display } : {}),
    footprint: Object.freeze([{ x, y: top, z }]),
    orderGeometry: {
      kind: "face",
      points: [
        [-0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
        [0.5, -0.5],
      ].map(([dx, dz]) => ({ x: x + dx, y: top, z: z + dz })),
    },
    surfaceOrder: 1,
    displayPoint: Object.freeze({ x: at.x, y: at.y }),
    screenBounds: Object.freeze({
      left: at.x - 16,
      right: at.x + 16,
      top: at.y - 8,
      bottom: at.y + 8,
    }),
    storeyBand: y,
    pickable: false,
    visible: true,
  });
}

const EMPTY = Object.freeze([]);
const EMPTY_PICTURE = Object.freeze({
  records: EMPTY,
  surfaces: EMPTY,
  exposedFaces: EMPTY,
});
const EMPTY_PLAN = Object.freeze({ kind: "ready", regions: EMPTY });
const MAX_WATER_CELLS = 2048;

/** One owner for desired material coverage and a separately published terrain
 * view. Requests never change displayed pictures, water, projection or picking. */
export function createCutTerrainLayer({
  runtime,
  projection: initialProjection,
  onCoverage,
  clock = () => performance.now(),
} = {}) {
  if (!initialProjection?.project || !initialProjection?.ray)
    throw new Error("cut terrain layer requires the canonical projection");
  const container = new Container();
  // The world owns this shared parent: actors can exist without terrain.
  // Terrain emptiness removes owned resources; it never hides sibling actors.
  container.eventMode = "none";
  container.sortableChildren = true;
  let disposed = false,
    coverageQueued = false,
    coverageAnimation,
    terrainArt,
    pending,
    desired,
    reportedBudget;
  let requestProjection = initialProjection,
    projectionGeneration = 0;
  const appearances = new Map(),
    cameraCoverage = createCameraCoverageOwner(),
    pictures = createTerrainPictureOwner({ clock });
  const batches = createTerrainBatchMeshes({ parent: container }),
    waterTexture = createWaterSurfaceTexture();
  const cache = createTerrainRegionCache({
    runtime,
    onChange() {
      if (coverageQueued) return;
      coverageQueued = true;
      const notify = () => {
        coverageQueued = false;
        coverageAnimation = undefined;
        if (!disposed) onCoverage?.({ kind: "ready" });
      };
      if (globalThis.requestAnimationFrame)
        coverageAnimation = globalThis.requestAnimationFrame(notify);
      else queueMicrotask(notify);
    },
  });
  let published = {
    records: EMPTY,
    revision: 0,
    picture: EMPTY_PICTURE,
    waterRecords: EMPTY,
    waterEntries: new Map(),
    structureSurfaces: EMPTY,
  };

  function appearance(turn) {
    if (!terrainArt) return undefined;
    if (!appearances.has(turn))
      appearances.set(
        turn,
        createTerrainFaceAppearance({ pack: terrainArt, turn }),
      );
    return appearances.get(turn);
  }
  function installArt(pack) {
    if (disposed || terrainArt)
      throw new Error("terrain art can only be installed once");
    // Validate before transferring the pack into the owner.
    const first = createTerrainFaceAppearance({ pack, turn: 0 });
    terrainArt = pack;
    appearances.set(0, first);
  }
  function transform(camera) {
    if (disposed) return;
    container.position.set(camera.x, camera.y);
    container.scale.set(camera.zoom);
  }
  function request(input) {
    if (disposed) throw new Error("cut terrain layer is disposed");
    const {
        frame,
        epoch,
        camera,
        screen,
        projection = initialProjection,
        turn = 0,
      } = input,
      view = Object.freeze({ ...input.view });
    if (
      !projection?.project ||
      !projection?.ray ||
      !Number.isSafeInteger(turn) ||
      turn < 0 ||
      turn > 3
    )
      throw new Error("invalid terrain view projection");
    if (
      !(camera?.zoom > 0) ||
      ![camera.zoom, camera.x, camera.y, screen?.width, screen?.height].every(
        Number.isFinite,
      )
    )
      throw new Error("invalid terrain camera demand");
    const level = view.cutaway
      ? view.level
      : frame?.baseline
        ? frame.baseline.bounds.maxY - 1
        : undefined;
    if (frame?.baseline && !Number.isSafeInteger(level))
      throw new Error("invalid terrain cut level");
    const viewport = {
      left: -camera.x / camera.zoom,
      right: (screen.width - camera.x) / camera.zoom,
      top: -camera.y / camera.zoom,
      bottom: (screen.height - camera.y) / camera.zoom,
    };
    cache.updateFrame({ epoch, terrain: frame });
    if (requestProjection !== projection) {
      requestProjection = projection;
      projectionGeneration++;
    }
    let plan = EMPTY_PLAN,
      prepared = viewport;
    if (frame?.baseline) {
      plan = cameraCoverage.update(
        viewport,
        `${epoch}:${level}:${turn}:${projectionGeneration}`,
        (area) =>
          visibleTerrainRegions({
            bounds: frame.baseline.bounds,
            level,
            verticalMetres: frame.baseline.verticalMetres,
            projection,
            viewport: area,
            limit: TERRAIN_REGION_CACHE_CAPACITY,
          }),
      );
      prepared = cameraCoverage.snapshot().prepared;
      if (plan.kind === "view-budget") {
        cache.updateDemand({ regions: [], level });
        const id = `${epoch}:${level}:${turn}:${viewport.left}:${viewport.right}:${viewport.top}:${viewport.bottom}`;
        if (id !== reportedBudget) {
          reportedBudget = id;
          queueMicrotask(() => {
            if (!disposed)
              onCoverage?.({ kind: "view-budget", limit: plan.limit });
          });
        }
      } else {
        reportedBudget = undefined;
        cache.updateDemand({
          ...prioritizeTerrainRegions(plan, viewport),
          level,
        });
      }
    } else {
      cameraCoverage.reset();
      reportedBudget = undefined;
    }
    desired = Object.freeze({
      frame,
      epoch,
      view,
      projection,
      turn,
      level,
      plan,
      prepared: Object.freeze({ ...prepared }),
    });
  }
  function samePicture(input) {
    const previous = published.input;
    return (
      previous &&
      previous.epoch === input.epoch &&
      previous.snapshot.publication === input.snapshot.publication &&
      previous.frame?.surfaces === input.frame?.surfaces &&
      previous.plan === input.plan &&
      previous.level === input.level &&
      previous.projection === input.projection &&
      previous.appearance === input.appearance &&
      previous.paintable === input.paintable
    );
  }
  function prepare() {
    if (disposed) throw new Error("cut terrain layer is disposed");
    if (!desired) throw new Error("terrain preparation requires a request");
    pending?.cancel();
    const snapshot = cache.snapshot(),
      style = appearance(desired.turn);
    let input = {
      ...desired,
      snapshot,
      appearance: style,
      paintable: Boolean(
        desired.frame?.baseline &&
        style &&
        desired.plan.kind === "ready" &&
        !snapshot.viewBudget,
      ),
    };
    let status = "pending",
      result,
      pictureProduct,
      pictureTask,
      meshTask,
      iterator,
      waterEntries,
      waterRecords,
      structureSurfaces;
    const ownedWater = new Set();
    if (samePicture(input)) pictureProduct = published.picture;
    else if (input.paintable)
      pictureTask = pictures.prepare({
        snapshot,
        plan: input.plan,
        viewport: input.prepared,
        surfaces: input.frame.surfaces,
        level: input.level,
        projection: input.projection,
        appearance: style,
      });
    else pictureProduct = EMPTY_PICTURE;

    function* build() {
      const { frame, epoch, level, projection, view, paintable } = input;
      if (
        frame &&
        (!Array.isArray(frame.water) || frame.water.length > MAX_WATER_CELLS)
      )
        throw new RangeError("terrain water view-budget exceeded (2048)");
      const previous = published.input;
      const sameWater =
        paintable &&
        previous?.paintable &&
        previous.epoch === epoch &&
        previous.frame.water === frame.water &&
        previous.level === level &&
        previous.projection === projection &&
        previous.frame.verticalMetres === frame.verticalMetres;
      if (sameWater) {
        waterEntries = published.waterEntries;
        waterRecords = published.waterRecords;
      } else {
        const shown = [],
          eligible = new Map(),
          descriptions = new Map(),
          createdRecords = new Map();
        if (paintable)
          for (const cell of frame.water) {
            yield;
            if (cell.liquidVolumeM3 <= 0 || cell.at[1] > level) continue;
            const key = waterCellKey(cell),
              signature = `${key}:${cell.level}:${frame.verticalMetres}`;
            if (descriptions.has(key))
              throw new Error("duplicate terrain water cell");
            descriptions.set(key, signature);
            shown.push(cell);
            const old = published.waterEntries.get(key);
            if (
              old?.signature === signature &&
              old.projection === projection &&
              old.epoch === epoch
            )
              eligible.set(key, old);
          }
        const reconciled = yield* waterSpriteReconciliationSteps(
          eligible,
          shown,
          {
            key: waterCellKey,
            create: () => {
              const sprite = new Sprite(waterTexture);
              sprite.anchor.set(0.5);
              sprite.eventMode = "none";
              ownedWater.add(sprite);
              return sprite;
            },
            update: (sprite, cell, existing) => {
              if (existing) return;
              const record = waterDrawRecord(cell, {
                verticalMetres: frame.verticalMetres,
                projection: (x, y, z) => projection.project({ x, y, z }),
                display: sprite,
              });
              sprite.position.set(record.displayPoint.x, record.displayPoint.y);
              createdRecords.set(waterCellKey(cell), record);
            },
            dispose: () => {
              throw new Error("prepared water reuse contained a removed entry");
            },
          },
        );
        waterEntries = new Map();
        const nextRecords = [];
        let unchanged = reconciled.size === published.waterRecords.length,
          index = 0;
        for (const [key, entry] of reconciled) {
          yield;
          const record = eligible.get(key)?.record ?? createdRecords.get(key);
          waterEntries.set(key, {
            sprite: entry.sprite,
            record,
            signature: descriptions.get(key),
            projection,
            epoch,
          });
          nextRecords.push(record);
          unchanged &&= record === published.waterRecords[index++];
        }
        waterRecords = unchanged
          ? published.waterRecords
          : Object.freeze(nextRecords);
      }
      if (!frame) structureSurfaces = EMPTY;
      else if (
        previous?.frame?.structureSurfaces === frame.structureSurfaces &&
        previous.level === level &&
        previous.view.cutaway === view.cutaway
      )
        structureSurfaces = published.structureSurfaces;
      else if (!view.cutaway) structureSurfaces = frame.structureSurfaces;
      else {
        const shown = [];
        for (const surface of frame.structureSurfaces) {
          yield;
          if (surface.cell[1] <= level) shown.push(surface);
        }
        structureSurfaces =
          shown.length === frame.structureSurfaces.length
            ? frame.structureSurfaces
            : Object.freeze(shown);
      }
      let records = published.records;
      if (
        pictureProduct.records !== published.picture.records ||
        waterRecords !== published.waterRecords
      ) {
        const next = [];
        for (const list of [pictureProduct.records, waterRecords])
          for (const record of list) {
            yield;
            next.push(record);
          }
        records = next.length ? Object.freeze(next) : EMPTY;
      }
      let terrainFrame;
      if (frame) {
        if (
          published.input?.frame === frame &&
          published.picture.surfaces === pictureProduct.surfaces &&
          published.picture.exposedFaces === pictureProduct.exposedFaces &&
          published.structureSurfaces === structureSurfaces &&
          published.input.level === level &&
          published.input.view.cutaway === view.cutaway
        )
          terrainFrame = published.terrainFrame;
        else {
          const water = [];
          if (paintable)
            for (const cell of frame.water) {
              yield;
              if (cell.liquidVolumeM3 > 0 && cell.at[1] <= level)
                water.push(cell);
            }
          terrainFrame = Object.freeze({
            ...frame,
            surfaces: pictureProduct.surfaces,
            exposedFaces: pictureProduct.exposedFaces,
            structureSurfaces,
            water:
              water.length === frame.water.length
                ? frame.water
                : Object.freeze(water),
          });
        }
      }
      return Object.freeze({
        records,
        revision: published.revision + Number(records !== published.records),
        terrainFrame,
        view,
        projection,
        turn: input.turn,
        epoch,
        level,
        prepared: input.prepared,
        paintable,
        viewBudget: input.plan.kind === "view-budget" || snapshot.viewBudget,
      });
    }
    function release() {
      iterator?.return();
      iterator = undefined;
      if (pending === task) pending = undefined;
      input = undefined;
    }
    function cancel() {
      if (status !== "pending" && status !== "ready") return;
      status = "cancelled";
      pictureTask?.cancel();
      meshTask?.cancel();
      for (const sprite of ownedWater) sprite.destroy();
      ownedWater.clear();
      result = undefined;
      release();
    }
    const task = Object.freeze({
      get status() {
        return status;
      },
      get ready() {
        return status === "ready";
      },
      get result() {
        return result;
      },
      advance({ maxOperations = 128, deadline = Infinity } = {}) {
        if (
          !Number.isSafeInteger(maxOperations) ||
          maxOperations < 1 ||
          !(Number.isFinite(deadline) || deadline === Infinity)
        )
          throw new Error("invalid terrain preparation budget");
        if (status !== "pending") return status;
        try {
          if (pictureTask && !pictureProduct) {
            pictureTask.advance({ maxOperations, deadline });
            if (pictureTask.status === "ready")
              pictureProduct = pictureTask.result;
            return status;
          }
          iterator ??= build();
          let operations = 0;
          while (operations < maxOperations && clock() < deadline) {
            const next = iterator.next();
            if (next.done) {
              result = next.value;
              status = "ready";
              iterator = undefined;
              break;
            }
            operations++;
          }
          return status;
        } catch (error) {
          cancel();
          status = "failed";
          throw error;
        }
      },
      prepareOrder(ordered) {
        if (status !== "ready" || pending !== task)
          throw new Error("terrain preparation is not ready or is stale");
        meshTask?.cancel();
        meshTask = batches.prepare(ordered);
        return meshTask;
      },
      publish() {
        if (status !== "ready" || pending !== task)
          throw new Error("terrain preparation is not ready or is stale");
        if (
          (meshTask && !meshTask.ready) ||
          (!meshTask && result.records !== published.records)
        )
          throw new Error("terrain order preparation is not ready");
        if (pictureTask) pictureTask.publish();
        for (const [key, entry] of published.waterEntries)
          if (waterEntries.get(key)?.sprite !== entry.sprite)
            entry.sprite.destroy();
        meshTask?.publish();
        ownedWater.clear();
        published = {
          ...result,
          input,
          picture: pictureProduct,
          waterEntries,
          waterRecords,
          structureSurfaces,
        };
        status = "published";
        release();
        return result;
      },
      cancel,
    });
    pending = task;
    return task;
  }
  function coverage() {
    const received = cache.snapshot(),
      same = Boolean(
        desired &&
        published.input &&
        published.input.paintable &&
        published.input.epoch === desired.epoch &&
        published.input.frame?.revision === desired.frame?.revision &&
        published.input.level === desired.level &&
        published.input.turn === desired.turn &&
        published.input.projection === desired.projection &&
        published.input.plan === desired.plan,
      );
    const ready = new Set(
      same
        ? published.input.snapshot.patches.map((patch) => patch.key.join(","))
        : [],
    );
    const rows = received.coverage.map((row) =>
      Object.freeze({
        ...row,
        receivedStatus: row.status,
        status:
          same && ready.has(row.key.join(","))
            ? "ready"
            : row.status === "unknown"
              ? "unknown"
              : "loading",
      }),
    );
    const viewBudget =
      desired?.plan.kind === "view-budget" || received.viewBudget;
    return Object.freeze({
      ...received,
      viewBudget,
      receivedComplete: !viewBudget && received.demandComplete,
      receivedVisibleComplete: !viewBudget && received.visibleComplete,
      visibleComplete:
        same &&
        !viewBudget &&
        rows
          .filter((row) => row.visible)
          .every((row) => row.status === "ready"),
      demandComplete:
        same && !viewBudget && rows.every((row) => row.status === "ready"),
      displayedRegions: rows.filter((row) => row.status === "ready").length,
      coverage: Object.freeze(rows),
    });
  }
  function clear() {
    if (disposed) return;
    pending?.cancel();
    cache.clear();
    cameraCoverage.reset();
    pictures.clear();
    batches.update([]);
    for (const entry of published.waterEntries.values()) entry.sprite.destroy();
    const revision = published.revision + Number(published.records !== EMPTY);
    published = {
      records: EMPTY,
      revision,
      picture: EMPTY_PICTURE,
      waterRecords: EMPTY,
      waterEntries: new Map(),
      structureSurfaces: EMPTY,
    };
    desired = undefined;
    reportedBudget = undefined;
  }
  return Object.freeze({
    container,
    installArt,
    request,
    prepare,
    transform,
    clear,
    get sortableItems() {
      return published.records;
    },
    get retainedRecords() {
      return Object.freeze({
        revision: published.revision,
        records: published.records,
      });
    },
    get coverage() {
      return coverage();
    },
    get meshMetrics() {
      return batches.metrics();
    },
    get pictureMetrics() {
      return pictures.metrics();
    },
    get cameraCoverage() {
      return cameraCoverage.snapshot();
    },
    get presentedTerrain() {
      return published.terrainFrame;
    },
    dispose() {
      if (disposed) return;
      clear();
      disposed = true;
      if (coverageAnimation !== undefined)
        globalThis.cancelAnimationFrame?.(coverageAnimation);
      coverageAnimation = undefined;
      coverageQueued = false;
      cache.dispose();
      batches.dispose();
      pictures.dispose();
      terrainArt?.dispose();
      terrainArt = undefined;
      appearances.clear();
      waterTexture.destroy(true);
    },
  });
}
