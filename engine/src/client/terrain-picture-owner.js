import { terrainPatchExposureSteps } from "../runtime/terrain-region-exposure.js";
import { terrainFaceRecordSteps, terrainCoverRecordSteps } from "./terrain-visibility.js";

const EMPTY = Object.freeze([]);
const emptyPicture = () => Object.freeze({ records: EMPTY, exposedFaces: EMPTY, surfaces: EMPTY });
const columnKey = cell => `${cell[0]},${cell[2]}`;
const rootKey = point => `${point.x - .5},${point.z - .5}`;
const coverFact = (surface, level) => surface.cover && surface.cell[1] <= level
  ? `${surface.cell[1]}\u0000${surface.cover.kind}\u0000${surface.cover.condition}\u0000${surface.cover.height}` : "";
const sameMap = (left, right) => left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
const entryRecordCount = entry => entry.body.length + entry.cover.length;

/** Owns derived terrain pictures, bounded recently-left chunk derivatives and
 * one unpublished successor. View membership decides which retained chunks are
 * published; camera-plan identity and viewport culling never enter a chunk's
 * derivative key. Material facts remain owned by the residency cache. */
export function createTerrainPictureOwner({
  clock = () => performance.now(),
  maxRecords = 131072,
  maxRetainedEntries = 256,
  maxRetainedRecords = maxRecords,
} = {}) {
  for (const [name, value] of [["terrain record", maxRecords], ["retained terrain entry", maxRetainedEntries],
    ["retained terrain record", maxRetainedRecords]])
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} budget must be a positive safe integer`);
  let entries = new Map(), pending, disposed = false, published = emptyPicture();
  const patchTokens = new WeakMap();
  let nextPatchToken = 0;
  const patchToken = patch => {
    let token = patchTokens.get(patch);
    if (token === undefined) { token = ++nextPatchToken; patchTokens.set(patch, token); }
    return token;
  };
  const metrics = {
    started: 0, published: 0, cancelled: 0, failed: 0, operations: 0, preparationMs: 0, maxAdvanceMs: 0,
    bodyBuilds: 0, bodyReuses: 0, faceRecordsBuilt: 0, coverBuilds: 0, coverReuses: 0,
    coverRecordsBuilt: 0, coverRootsRebuilt: 0, retentionEvictions: 0,
  };

  function prepare(input) {
    if (disposed) throw new Error("terrain picture owner is disposed");
    pending?.cancel();
    let status = "pending", prepared, iterator = build();
    metrics.started++;

    function* build() {
      const { snapshot, surfaces: observations, level, projection, appearance } = input;
      const baseline = snapshot.baseline;
      const overrides = new Map();
      for (const surface of observations) { overrides.set(columnKey(surface.cell), surface); yield; }
      const paletteSignature = JSON.stringify(baseline.materials);
      // Clone before touching LRU order so cancellation cannot mutate the
      // published derivative cache.
      const nextEntries = new Map(entries), activeIds = new Set();
      let evicted = 0;
      // Retention is one bounded current-view cache, not a history of cuts,
      // quadrants or art conventions.
      for (const [id, entry] of nextEntries) {
        if (entry.level === level && entry.projection === projection && entry.appearance === appearance &&
            entry.paletteSignature === paletteSignature && entry.verticalMetres === baseline.verticalMetres &&
            entry.variantSeed === baseline.variantSeed) continue;
        nextEntries.delete(id);
        evicted++;
        yield;
      }
      const records = [], exposedFaces = [], surfaces = [];
      for (const patch of snapshot.patches) {
        const id = patch.key.join(","), materialToken = patchToken(patch), previous = nextEntries.get(id);
        activeIds.add(id);
        nextEntries.delete(id);
        const tops = new Map(), coverSurfaces = [], coverFacts = new Map();
        for (const source of patch.surfaces) {
          const column = columnKey(source.cell), surface = overrides.get(column) ?? source;
          tops.set(column, source.generatedTop);
          coverSurfaces.push(surface);
          coverFacts.set(column, coverFact(surface, level));
          yield;
        }
        const sameBody = previous?.materialToken === materialToken && previous.level === level && previous.projection === projection &&
          previous.paletteSignature === paletteSignature && previous.verticalMetres === baseline.verticalMetres &&
          previous.variantSeed === baseline.variantSeed && previous.appearance === appearance;
        let body, bodySurfaces;
        if (sameBody) {
          body = previous.body;
          bodySurfaces = previous.bodySurfaces;
          metrics.bodyReuses++;
        } else {
          metrics.bodyBuilds++;
          body = [];
          bodySurfaces = [];
          for (const faces of terrainPatchExposureSteps({ patch, baseline, level })) {
            yield; // Empty columns are also bounded work.
            for (const record of terrainFaceRecordSteps({ faces, palette: baseline.materials,
              verticalMetres: baseline.verticalMetres, variantSeed: baseline.variantSeed },
            { projection, appearance, generatedTops: tops })) {
              if (record) {
                body.push(record);
                metrics.faceRecordsBuilt++;
                if (record.face === "top") bodySurfaces.push({ cell: record.cell, material: record.material,
                  generatedTop: tops.get(columnKey(record.cell)) });
              }
              yield;
            }
          }
          body = Object.freeze(body);
          bodySurfaces = Object.freeze(bodySurfaces);
        }

        let cover;
        if (sameBody && sameMap(previous.coverFacts, coverFacts)) {
          cover = previous.cover;
          metrics.coverReuses++;
        } else {
          metrics.coverBuilds++;
          const bounds = patch.bounds, world = baseline.bounds;
          const minX = bounds.minX - Number(bounds.minX === world.minX), minZ = bounds.minZ - Number(bounds.minZ === world.minZ);
          const ownedRoot = key => {
            const [x, z] = key.split(",").map(Number);
            return x >= minX && x < bounds.maxX && z >= minZ && z < bounds.maxZ;
          };
          let affectedRoots;
          if (sameBody) {
            const changed = new Set();
            for (const key of new Set([...previous.coverFacts.keys(), ...coverFacts.keys()]))
              if (previous.coverFacts.get(key) !== coverFacts.get(key)) changed.add(key);
            affectedRoots = new Set();
            for (const key of changed) {
              const [x, z] = key.split(",").map(Number);
              for (const [dx, dz] of [[0, 0], [-1, 0], [-1, -1], [0, -1]]) affectedRoots.add(`${x + dx},${z + dz}`);
            }
          }
          const oldCover = new Map((sameBody ? previous.cover : []).map(record => [record.id, record]));
          const nextCover = new Map();
          if (affectedRoots) for (const record of previous.cover)
            if (!affectedRoots.has(rootKey(record.attachment.point))) nextCover.set(record.id, record);
          const sourceSurfaces = affectedRoots ? (() => {
            const supportCells = new Set();
            for (const key of affectedRoots) {
              const [x, z] = key.split(",").map(Number);
              for (const [dx, dz] of [[0, 0], [1, 0], [1, 1], [0, 1]]) supportCells.add(`${x + dx},${z + dz}`);
            }
            return coverSurfaces.filter(surface => supportCells.has(columnKey(surface.cell)));
          })() : coverSurfaces;
          metrics.coverRootsRebuilt += affectedRoots
            ? [...affectedRoots].filter(ownedRoot).length
            : new Set(sourceSurfaces.map(surface => columnKey(surface.cell))).size;
          for (const record of terrainCoverRecordSteps(sourceSurfaces, { level, projection, appearance,
            verticalMetres: baseline.verticalMetres, variantSeed: baseline.variantSeed })) {
            if (record) {
              const key = rootKey(record.attachment.point);
              if ((!affectedRoots || affectedRoots.has(key)) && record.storeyBand >= bounds.minY &&
                  record.storeyBand < bounds.maxY && ownedRoot(key)) {
                metrics.coverRecordsBuilt++;
                const old = oldCover.get(record.id);
                nextCover.set(record.id, old?.mask === record.mask && old.terrainBatch === record.terrainBatch ? old : record);
              }
            }
            yield;
          }
          cover = Object.freeze([...nextCover.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        }
        // Keep only the weak identity token and derived picture facts. The raw
        // material patch remains exclusively resident in terrain-region-cache.
        const entry = { materialToken, level, projection, appearance, body, bodySurfaces, cover, coverFacts, paletteSignature,
          verticalMetres: baseline.verticalMetres, variantSeed: baseline.variantSeed };
        nextEntries.set(id, entry);
        for (const record of body) {
          if (records.length === maxRecords) throw new RangeError("terrain picture record budget exceeded");
          records.push(record); exposedFaces.push(record); yield;
        }
        for (const record of cover) {
          if (records.length === maxRecords) throw new RangeError("terrain picture record budget exceeded");
          records.push(record); yield;
        }
        for (const surface of bodySurfaces) { surfaces.push(surface); yield; }
      }

      let retainedRecords = [...nextEntries.values()].reduce((total, entry) => total + entryRecordCount(entry), 0);
      for (const [id, entry] of nextEntries) {
        if (nextEntries.size <= maxRetainedEntries && retainedRecords <= maxRetainedRecords) break;
        if (activeIds.has(id)) continue;
        nextEntries.delete(id);
        retainedRecords -= entryRecordCount(entry);
        evicted++;
        yield;
      }
      if (nextEntries.size > maxRetainedEntries || retainedRecords > maxRetainedRecords)
        throw new RangeError("retained terrain picture budget exceeded");

      let sameRecords = records.length === published.records.length, sameFaces = exposedFaces.length === published.exposedFaces.length;
      let sameSurfaces = surfaces.length === published.surfaces.length;
      for (let i = 0; i < records.length && sameRecords; i++) { sameRecords = records[i] === published.records[i]; yield; }
      for (let i = 0; i < exposedFaces.length && sameFaces; i++) { sameFaces = exposedFaces[i] === published.exposedFaces[i]; yield; }
      for (let i = 0; i < surfaces.length && sameSurfaces; i++) { sameSurfaces = surfaces[i] === published.surfaces[i]; yield; }
      return { entries: nextEntries, evicted, result: Object.freeze({
        records: sameRecords ? published.records : Object.freeze(records),
        exposedFaces: sameFaces ? published.exposedFaces : Object.freeze(exposedFaces),
        surfaces: sameSurfaces ? published.surfaces : Object.freeze(surfaces),
      }) };
    }
    function release() { iterator?.return(); iterator = undefined; input = undefined; if (pending === task) pending = undefined; }
    const task = Object.freeze({
      get status() { return status; },
      get result() { return prepared?.result; },
      advance({ maxOperations = 128, deadline = Infinity } = {}) {
        if (!Number.isSafeInteger(maxOperations) || maxOperations < 1 || !(Number.isFinite(deadline) || deadline === Infinity))
          throw new Error("invalid terrain preparation budget");
        if (status !== "pending") return status;
        const started = clock(); let operations = 0;
        try {
          while (operations < maxOperations && clock() < deadline) {
            const next = iterator.next();
            if (next.done) { prepared = next.value; status = "ready"; iterator = undefined; break; }
            operations++;
          }
        } catch (error) { status = "failed"; metrics.failed++; prepared = undefined; release(); throw error; }
        finally {
          const elapsed = Math.max(0, clock() - started);
          metrics.operations += operations; metrics.preparationMs += elapsed; metrics.maxAdvanceMs = Math.max(metrics.maxAdvanceMs, elapsed);
        }
        return status;
      },
      publish() {
        if (status !== "ready" || pending !== task) throw new Error("terrain preparation is not ready or is stale");
        entries = prepared.entries; metrics.retentionEvictions += prepared.evicted; published = prepared.result; prepared = { result: published };
        status = "published"; metrics.published++; release(); return published;
      },
      cancel() {
        if (status !== "pending" && status !== "ready") return;
        status = "cancelled"; metrics.cancelled++; prepared = undefined; release();
      },
    });
    pending = task;
    return task;
  }
  function clear() { pending?.cancel(); entries = new Map(); published = emptyPicture(); }
  return Object.freeze({ prepare, get published() { return published; },
    metrics: () => ({ ...metrics, retainedEntries: entries.size,
      retainedRecords: [...entries.values()].reduce((total, entry) => total + entryRecordCount(entry), 0),
      retainedMaterialPatches: 0, retainedMaterialBytes: 0 }),
    clear, dispose() { if (!disposed) { clear(); disposed = true; } } });
}
