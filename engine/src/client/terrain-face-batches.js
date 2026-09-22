import { Mesh, MeshGeometry } from "pixi.js";
import { stableKey } from "./draw-record-facts.js";

const MAX_QUADS = 16000;
const MAX_VIEW_QUADS = 131072;
const MAX_ORDINARY_DISPLAYS = 4096;
const MAX_ORDERED_RECORDS = MAX_VIEW_QUADS + MAX_ORDINARY_DISPLAYS;
const MAX_SPARE_MESHES = 16;
const BYTES_PER_QUAD = 76;
const compatible = (a, b) =>
  a.texture.source === b.texture.source &&
  a.blendMode === b.blendMode &&
  a.state === b.state;

/** One input record per step, including ordinary displays and unchanged runs. */
function* planSteps(ordered, maxQuads, limits = {}) {
  const output = [];
  let run,
    runs = 0,
    quads = 0,
    displays = 0;
  for (const record of ordered) {
    yield "record";
    const style = record.terrainBatch;
    if (!style) {
      limits.preparedDisplays = ++displays;
      if (displays > (limits.displays ?? Infinity))
        throw new RangeError(
          "terrain mesh ordinary-display view-budget exceeded (4096)",
        );
      run = undefined;
      output.push({
        kind: "display",
        records: [record],
        display: record.display,
      });
      continue;
    }
    if (
      !style.texture?.source ||
      !Array.isArray(style.uvs) ||
      style.uvs.length !== 8 ||
      !style.uvs.every(Number.isFinite) ||
      record.projected?.length !== 4 ||
      !record.projected.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      )
    )
      throw new Error(
        "terrain batch requires a texture, four UVs and four projected vertices",
      );
    limits.preparedQuads = ++quads;
    if (quads > (limits.quads ?? Infinity))
      throw new Error("terrain mesh quad view-budget exceeded");
    if (
      !run ||
      !compatible(run.style, style) ||
      run.records.length === maxQuads
    ) {
      if (++runs > (limits.meshes ?? Infinity))
        throw new Error("terrain mesh view-budget exceeded");
      run = { kind: "terrain", style, records: [] };
      output.push(run);
    }
    run.records.push(record);
  }
  return output;
}

/** Input is already ordered. This function is deliberately unaware of space. */
export function terrainBatchPlan(ordered, maxQuads = MAX_QUADS) {
  if (!Number.isInteger(maxQuads) || maxQuads < 1 || maxQuads > MAX_QUADS)
    throw new Error("invalid terrain batch index limit");
  const steps = planSteps(ordered, maxQuads);
  let next;
  do {
    next = steps.next();
  } while (!next.done);
  return next.value;
}

function buffers(count) {
  return {
    positions: new Float32Array(count * 8),
    uvs: new Float32Array(count * 8),
    indices: new Uint16Array(count * 6),
  };
}
function pack(values, record, index) {
  for (let vertex = 0; vertex < 4; vertex++) {
    values.positions[index * 8 + vertex * 2] = record.projected[vertex].x;
    values.positions[index * 8 + vertex * 2 + 1] = record.projected[vertex].y;
  }
  values.uvs.set(record.terrainBatch.uvs, index * 8);
  const base = index * 4,
    offset = index * 6;
  values.indices[offset] = base;
  values.indices[offset + 1] = base + 1;
  values.indices[offset + 2] = base + 2;
  values.indices[offset + 3] = base;
  values.indices[offset + 4] = base + 2;
  values.indices[offset + 5] = base + 3;
}
function sameRecord(left, right) {
  // Prepared records are immutable for their lifetime.
  return (
    left === right ||
    (stableKey(left) === stableKey(right) &&
      left.projected.every(
        (point, i) =>
          point.x === right.projected[i].x && point.y === right.projected[i].y,
      ) &&
      left.terrainBatch.uvs.every(
        (value, i) => value === right.terrainBatch.uvs[i],
      ))
  );
}
const runKey = (records) => `${stableKey(records[0])}\u0001${records.length}`;
const quadCount = (entry) => entry.geometry.positions.length / 8;
const bufferBytes = (entry) =>
  entry.geometry.attributes.aPosition.buffer.descriptor.size +
  entry.geometry.attributes.aUV.buffer.descriptor.size +
  entry.geometry.indexBuffer.descriptor.size;
const sum = (entries, measure) =>
  entries.reduce((total, entry) => total + measure(entry), 0);

/** Retained meshes with one detached candidate. Preparation never changes the
 * visible buffers, parenting or order. Publication is a synchronous switch of
 * prepared resources; shared art textures and ordinary displays are borrowed.
 * Active/candidate quads are each bounded, with at most twice one view's mesh
 * and geometry budgets across active, pending and spare allocations. */
export function createTerrainBatchMeshes({
  maxMeshes = 512,
  maxQuads = MAX_VIEW_QUADS,
  parent,
} = {}) {
  if (!Number.isInteger(maxMeshes) || maxMeshes < 1 || maxMeshes > 4096)
    throw new Error("invalid terrain mesh budget");
  if (!Number.isInteger(maxQuads) || maxQuads < 1 || maxQuads > MAX_VIEW_QUADS)
    throw new Error("invalid terrain quad budget");
  let active = [],
    spare = [],
    pending,
    activeDisplays = 0,
    disposed = false;
  function destroy(entry) {
    entry.mesh.removeFromParent();
    entry.mesh.destroy({ texture: false, textureSource: false });
    entry.geometry.destroy(true);
  }
  function retire(entry) {
    entry.mesh.removeFromParent();
    entry.records = [];
    entry.key = undefined;
    entry.mesh.state = entry.defaultState;
    const quads = quadCount(entry),
      spareQuads = sum(spare, quadCount);
    if (
      !disposed &&
      active.length + spare.length < maxMeshes &&
      spare.length < MAX_SPARE_MESHES &&
      spareQuads + quads <= MAX_QUADS &&
      sum(active, quadCount) + spareQuads + quads <= 2 * maxQuads
    )
      spare.push(entry);
    else destroy(entry);
  }
  function reservePacking(current, count) {
    // Packed arrays count toward pending bytes before a Mesh exists. Trim idle
    // storage before allocating, including the transient replacement buffers.
    while (
      spare.length &&
      sum(active, quadCount) +
        sum(current.owned, quadCount) +
        sum(spare, quadCount) +
        count >
        2 * maxQuads
    )
      destroy(spare.pop());
    if (
      sum(active, quadCount) + sum(current.owned, quadCount) + count >
      2 * maxQuads
    )
      throw new Error("terrain mesh preparation byte-budget exceeded");
    current.packingQuads = count;
  }
  function cancel(current) {
    if (current.status === "cancelled" || current.status === "published")
      return;
    current.steps?.return();
    current.steps = undefined;
    current.next = undefined;
    current.status = "cancelled";
    current.input = undefined;
    current.packingQuads = 0;
    for (const entry of current.owned) retire(entry);
    current.owned = [];
    current.entries = [];
    current.displays = [];
    if (pending === current) pending = undefined;
  }
  function* prepareSteps(current) {
    const plan = yield* planSteps(current.input, MAX_QUADS, current.limits);
    current.input = undefined;
    const available = new Map();
    for (const entry of active) {
      yield "record";
      const list = available.get(entry.key) ?? [];
      list.push(entry);
      available.set(entry.key, list);
    }
    for (const batch of plan) {
      if (batch.kind === "display") {
        yield "record";
        current.displays.push({ ...batch, zIndex: current.displays.length });
        continue;
      }
      const key = runKey(batch.records),
        candidates = available.get(key);
      let entry = candidates?.pop(),
        same = Boolean(entry);
      if (same)
        for (let i = 0; i < batch.records.length; i++) {
          yield "record";
          if (!sameRecord(entry.records[i], batch.records[i])) {
            same = false;
            break;
          }
        }
      if (!same) {
        reservePacking(current, batch.records.length);
        const values = buffers(batch.records.length);
        for (let i = 0; i < batch.records.length; i++) {
          yield "record";
          pack(values, batch.records[i], i);
        }
        yield "mesh";
        entry = spare.pop();
        if (entry) {
          current.owned.push(entry);
          entry.geometry.positions = values.positions;
          entry.geometry.uvs = values.uvs;
          entry.geometry.indices = values.indices;
        } else {
          if (
            active.length + current.owned.length + spare.length >=
            2 * maxMeshes
          )
            throw new Error("terrain mesh preparation count-budget exceeded");
          const geometry = new MeshGeometry({
            ...values,
            shrinkBuffersToFit: true,
          });
          let mesh;
          try {
            mesh = new Mesh({ geometry, texture: batch.style.texture });
          } catch (error) {
            geometry.destroy(true);
            throw error;
          }
          mesh.eventMode = "none";
          entry = { mesh, geometry, records: [], defaultState: mesh.state };
          current.owned.push(entry);
        }
        current.packingQuads = 0;
      }
      // Borrowed active entries remain untouched, including their record list.
      current.entries.push({
        entry,
        key,
        records: batch.records,
        style: batch.style,
      });
      current.displays.push({
        ...batch,
        display: entry.mesh,
        zIndex: current.displays.length,
      });
    }
  }
  function prepare(ordered) {
    if (disposed) throw new Error("terrain mesh owner is disposed");
    if (!Array.isArray(ordered) || ordered.length > MAX_ORDERED_RECORDS)
      throw new Error("terrain mesh record view-budget exceeded");
    if (pending) cancel(pending);
    const current = {
      status: "preparing",
      input: ordered,
      entries: [],
      displays: [],
      owned: [],
      packingQuads: 0,
      limits: {
        meshes: maxMeshes,
        quads: maxQuads,
        displays: MAX_ORDINARY_DISPLAYS,
        preparedQuads: 0,
        preparedDisplays: 0,
      },
    };
    pending = current;
    current.steps = prepareSteps(current);
    function next() {
      current.next = current.steps.next();
      if (current.next.done) {
        current.status = "ready";
        current.steps = undefined;
      }
    }
    function assertCurrent() {
      if (disposed) throw new Error("terrain mesh owner is disposed");
      if (current.status === "cancelled")
        throw new Error("terrain mesh preparation is cancelled");
      if (current.status === "published")
        throw new Error("terrain mesh preparation is already published");
    }
    try {
      next();
    } catch (error) {
      cancel(current);
      throw error;
    }
    return Object.freeze({
      advance({ records = 256, meshes = 2 } = {}) {
        assertCurrent();
        if (
          !Number.isSafeInteger(records) ||
          records < 0 ||
          !Number.isSafeInteger(meshes) ||
          meshes < 0
        )
          throw new Error("invalid terrain preparation work budget");
        try {
          while (current.status !== "ready") {
            if (current.next.value === "record") {
              if (!records) break;
              records--;
            } else {
              if (!meshes) break;
              meshes--;
            }
            next();
          }
          return current.status === "ready";
        } catch (error) {
          cancel(current);
          throw error;
        }
      },
      get ready() {
        return current.status === "ready";
      },
      publish() {
        assertCurrent();
        if (current.status !== "ready")
          throw new Error("terrain mesh preparation is not ready");
        const previous = active,
          nextEntries = current.entries.map((item) => item.entry),
          retained = new Set(nextEntries);
        active = nextEntries;
        activeDisplays = current.limits.preparedDisplays;
        while (
          spare.length &&
          (active.length + spare.length > maxMeshes ||
            sum(active, quadCount) + sum(spare, quadCount) > 2 * maxQuads)
        )
          destroy(spare.pop());
        for (const { entry, key, records, style } of current.entries) {
          entry.key = key;
          entry.records = records;
          entry.mesh.texture = style.texture;
          entry.mesh.blendMode = style.blendMode ?? "normal";
          entry.mesh.state = style.state ?? entry.defaultState;
        }
        for (const entry of previous) if (!retained.has(entry)) retire(entry);
        // The caller may now have installed future actor displays. Only this
        // publication boundary is allowed to attach/reorder borrowed displays.
        for (const batch of current.displays)
          if (batch.display) {
            batch.display.zIndex = batch.zIndex;
            if (parent && batch.display.parent !== parent)
              parent.addChild(batch.display);
          }
        const result = current.displays;
        current.status = "published";
        current.entries = [];
        current.owned = [];
        current.displays = [];
        if (pending === current) pending = undefined;
        return result;
      },
      cancel() {
        cancel(current);
      },
    });
  }
  return Object.freeze({
    prepare,
    update(ordered) {
      const task = prepare(ordered);
      while (!task.advance({ records: 4096, meshes: 16 })) {
        /* Synchronous callers drive the same preparation. */
      }
      return task.publish();
    },
    get size() {
      return active.length;
    },
    /** Requested buffer bytes, excluding driver/allocator overhead. */
    metrics() {
      const owned = pending?.owned ?? [],
        packingQuads = pending?.packingQuads ?? 0;
      const activeRecords = sum(active, (entry) => entry.records.length),
        pendingRecords = pending?.limits.preparedQuads ?? 0;
      return Object.freeze({
        limits: Object.freeze({
          meshes: maxMeshes,
          quads: maxQuads,
          pendingMeshes: maxMeshes,
          retainedMeshes: 2 * maxMeshes,
          retainedQuads: 2 * maxQuads,
          orderedRecords: MAX_ORDERED_RECORDS,
          ordinaryDisplays: MAX_ORDINARY_DISPLAYS,
          spareMeshes: Math.min(MAX_SPARE_MESHES, maxMeshes),
          spareQuads: MAX_QUADS,
        }),
        activeDisplays,
        pendingDisplays: pending?.limits.preparedDisplays ?? 0,
        activeMeshes: active.length,
        spareMeshes: spare.length,
        pendingMeshes: owned.length,
        activeQuads: sum(active, quadCount),
        spareQuads: sum(spare, quadCount),
        pendingQuads: sum(owned, quadCount) + packingQuads,
        activeBufferBytes: sum(active, bufferBytes),
        spareBufferBytes: sum(spare, bufferBytes),
        pendingBufferBytes:
          sum(owned, bufferBytes) + packingQuads * BYTES_PER_QUAD,
        activeRecords,
        spareRecords: 0,
        pendingRecords,
        retainedRecords: activeRecords + pendingRecords,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pending) cancel(pending);
      for (const entry of [...active, ...spare]) destroy(entry);
      active = [];
      spare = [];
      activeDisplays = 0;
    },
  });
}
