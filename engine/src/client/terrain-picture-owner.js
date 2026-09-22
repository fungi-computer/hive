import { terrainPatchExposureSteps } from "../runtime/terrain-region-exposure.js";
import { terrainFaceRecordSteps, terrainCoverRecordSteps } from "./terrain-visibility.js";

/** Owns derived terrain pictures and one unpublished successor. Material facts
 * remain in the residency owner; cancellation never invalidates those facts or
 * changes the published pictures. A task pins its input until publication. */
export function createTerrainPictureOwner({ clock = () => performance.now(), maxRecords = 131072 } = {}) {
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new Error("terrain record budget must be a positive safe integer");
  let entries = new Map(), pending, disposed = false;
  let published = Object.freeze({ records: Object.freeze([]), exposedFaces: Object.freeze([]), surfaces: Object.freeze([]) });
  const metrics = { started: 0, published: 0, cancelled: 0, failed: 0, operations: 0, preparationMs: 0, maxAdvanceMs: 0 };

  function prepare(input) {
    if (disposed) throw new Error("terrain picture owner is disposed");
    pending?.cancel();
    let status = "pending", prepared, iterator = build();
    metrics.started++;
    function* build() {
      const { snapshot, plan, viewport, surfaces: observations, level, projection, appearance } = input;
      const baseline = snapshot.baseline;
      const overrides = new Map();
      for (const surface of observations) { overrides.set(`${surface.cell[0]},${surface.cell[2]}`, surface); yield; }
      const paletteSignature = JSON.stringify(baseline.materials);
      const nextEntries = new Map(), records = [], exposedFaces = [], surfaces = [];
      for (const patch of snapshot.patches) {
        const id = patch.key.join(","), previous = entries.get(id);
        const tops = new Map(), coverSurfaces = [];
        for (const surface of patch.surfaces) {
          const column = `${surface.cell[0]},${surface.cell[2]}`;
          tops.set(column, surface.generatedTop);
          coverSurfaces.push(overrides.get(column) ?? surface);
          yield;
        }
        const sameBody = previous?.patch === patch && previous.level === level && previous.projection === projection &&
          previous.paletteSignature === paletteSignature && previous.verticalMetres === baseline.verticalMetres &&
          previous.variantSeed === baseline.variantSeed && previous.appearance === appearance;
        const samePrepared = previous?.plan === plan;
        let body;
        if (sameBody && samePrepared) body = previous.body;
        else {
          body = [];
          const previousBody = new Map();
          if (sameBody) for (const record of previous.body) { previousBody.set(record.id, record); yield; }
          for (const faces of terrainPatchExposureSteps({ patch, baseline, level })) {
            yield; // Empty columns are also bounded work.
            for (const record of terrainFaceRecordSteps({ faces, palette: baseline.materials,
              verticalMetres: baseline.verticalMetres, variantSeed: baseline.variantSeed },
            { projection, appearance, generatedTops: tops, viewport })) {
              if (record) body.push(previousBody.get(record.id) ?? record);
              yield;
            }
          }
        }
        const coverSignature = JSON.stringify(coverSurfaces);
        let cover = sameBody && samePrepared && previous.coverSignature === coverSignature ? previous.cover : undefined;
        if (!cover) {
          cover = [];
          const oldCover = new Map();
          if (sameBody) for (const record of previous.cover) { oldCover.set(record.id, record); yield; }
          const bounds = patch.bounds, world = baseline.bounds;
          const minX = bounds.minX - Number(bounds.minX === world.minX), minZ = bounds.minZ - Number(bounds.minZ === world.minZ);
          for (const record of terrainCoverRecordSteps(coverSurfaces, { level, projection, appearance, viewport,
            verticalMetres: baseline.verticalMetres, variantSeed: baseline.variantSeed })) {
            if (record) {
              const root = record.attachment.point;
              if (record.storeyBand >= bounds.minY && record.storeyBand < bounds.maxY &&
                  root.x - .5 >= minX && root.x - .5 < bounds.maxX && root.z - .5 >= minZ && root.z - .5 < bounds.maxZ) {
                const old = oldCover.get(record.id);
                cover.push(old?.mask === record.mask && old.terrainBatch === record.terrainBatch ? old : record);
              }
            }
            yield;
          }
        }
        nextEntries.set(id, { patch, level, projection, appearance, body, cover, coverSignature, paletteSignature,
          plan, verticalMetres: baseline.verticalMetres, variantSeed: baseline.variantSeed });
        for (const list of [body, cover]) for (const record of list) {
          if (records.length === maxRecords) throw new RangeError("terrain picture record budget exceeded");
          records.push(record);
          if (record.role === "terrain") {
            exposedFaces.push(record);
            if (record.face === "top") surfaces.push({ cell: record.cell, material: record.material,
              generatedTop: tops.get(`${record.cell[0]},${record.cell[2]}`) });
          }
          yield;
        }
      }
      let sameRecords = records.length === published.records.length, sameFaces = exposedFaces.length === published.exposedFaces.length;
      let sameSurfaces = surfaces.length === published.surfaces.length;
      for (let i = 0; i < records.length && sameRecords; i++) { sameRecords = records[i] === published.records[i]; yield; }
      for (let i = 0; i < exposedFaces.length && sameFaces; i++) { sameFaces = exposedFaces[i] === published.exposedFaces[i]; yield; }
      for (let i = 0; i < surfaces.length && sameSurfaces; i++) {
        const next = surfaces[i], old = published.surfaces[i];
        sameSurfaces = next.cell === old.cell && next.material === old.material && next.generatedTop === old.generatedTop;
        yield;
      }
      return { entries: nextEntries, result: Object.freeze({
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
        entries = prepared.entries; published = prepared.result; prepared = { result: published };
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
  function clear() {
    pending?.cancel(); entries = new Map();
    published = Object.freeze({ records: Object.freeze([]), exposedFaces: Object.freeze([]), surfaces: Object.freeze([]) });
  }
  return Object.freeze({ prepare, get published() { return published; }, metrics: () => ({ ...metrics }), clear,
    dispose() { if (!disposed) { clear(); disposed = true; } } });
}
