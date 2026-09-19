import { Mesh, MeshGeometry } from "pixi.js";
import { stableKey } from "./isometric-sorter.js";

const MAX_QUADS = 16000;
const compatible = (a, b) => a.texture.source === b.texture.source && a.blendMode === b.blendMode && a.state === b.state;

/** Input is already ordered. This function is deliberately unaware of space. */
export function terrainBatchPlan(ordered, maxQuads = MAX_QUADS) {
  if (!Number.isInteger(maxQuads) || maxQuads < 1 || maxQuads > MAX_QUADS) throw new Error("invalid terrain batch index limit");
  const output = [];
  let run;
  for (const record of ordered) {
    const style = record.terrainBatch;
    if (!style) {
      run = undefined;
      output.push({ kind: "display", records: [record], display: record.display });
      continue;
    }
    if (!style.texture?.source || !Array.isArray(style.uvs) || style.uvs.length !== 8 || !style.uvs.every(Number.isFinite) || record.projected?.length !== 4)
      throw new Error("terrain batch requires a texture, four UVs and four projected vertices");
    if (!run || !compatible(run.style, style) || run.records.length === maxQuads) {
      run = { kind: "terrain", style, records: [] };
      output.push(run);
    }
    run.records.push(record);
  }
  return output;
}

function buffers(records) {
  const positions = new Float32Array(records.length * 8), uvs = new Float32Array(records.length * 8), indices = new Uint16Array(records.length * 6);
  records.forEach((record, index) => {
    record.projected.forEach((point, vertex) => { positions[index*8+vertex*2] = point.x; positions[index*8+vertex*2+1] = point.y; });
    uvs.set(record.terrainBatch.uvs, index*8);
    indices.set([0,1,2,0,2,3].map(value => value + index*4), index*6);
  });
  return { positions, uvs, indices };
}

const signature = records => JSON.stringify(records.map(record => [stableKey(record), record.projected, record.terrainBatch.uvs]));
const sameRecords = (left, right) => left?.length === right.length && left.every((record, index) => record === right[index]);

/** Retained ordinary meshes. Textures remain owned by the original art bank.
 * Unchanged runs retain buffers. At most maxMeshes mesh/buffer pairs survive;
 * callers may set one common parent transform for pan/zoom without repacking.
 */
export function createTerrainBatchMeshes({ maxMeshes = 512, parent } = {}) {
  if (!Number.isInteger(maxMeshes) || maxMeshes < 1 || maxMeshes > 4096) throw new Error("invalid terrain mesh budget");
  let active = [], spare = [], disposed = false;
  function destroy(entry) {
    entry.mesh.removeFromParent();
    // Atlas textures remain owned by the checked art pack and are shared by
    // replacement batches and review orientations.
    entry.mesh.destroy({ texture: false, textureSource: false });
    entry.geometry.destroy(true);
  }
  return {
    update(ordered) {
      if (disposed) throw new Error("terrain mesh owner is disposed");
      const plan = terrainBatchPlan(ordered);
      if (plan.filter(batch => batch.kind === "terrain").length > maxMeshes) throw new Error("terrain mesh view-budget exceeded");
      const available = new Map(active.map(entry => [entry.key, entry]));
      const wanted = new Set(plan.filter(batch => batch.kind === "terrain").map(batch => batch.records.map(stableKey).join("\u0001")));
      const reusable = [...spare, ...active.filter(entry => !wanted.has(entry.key))];
      for (const entry of reusable) available.delete(entry.key);
      spare = [];
      const next = [], displays = [];
      for (const batch of plan) {
        if (batch.kind === "display") { displays.push({ ...batch, zIndex: displays.length }); continue; }
        const key = batch.records.map(stableKey).join("\u0001");
        let entry = available.get(key);
        if (entry) available.delete(key);
        else entry = reusable.pop();
        if (!entry) {
          const geometry = new MeshGeometry(buffers(batch.records));
          const mesh = new Mesh({ geometry, texture: batch.style.texture });
          mesh.eventMode = "none";
          entry = { key, mesh, geometry, stamp: signature(batch.records), records: [...batch.records], defaultState: mesh.state };
        }
        entry.key = key;
        // Prepared geometry records are immutable for their lifetime. A camera
        // transform or an insertion elsewhere cannot change this run's bytes.
        if (!sameRecords(entry.records, batch.records)) {
          const stamp = signature(batch.records);
          if (entry.stamp !== stamp) {
            const values = buffers(batch.records);
            entry.geometry.uvs = values.uvs;
            entry.geometry.positions = values.positions;
            entry.geometry.indices = values.indices;
            entry.stamp = stamp;
          }
          entry.records = [...batch.records];
        }
        entry.mesh.texture = batch.style.texture;
        entry.mesh.blendMode = batch.style.blendMode ?? "normal";
        entry.mesh.state = batch.style.state ?? entry.defaultState;
        entry.mesh.zIndex = displays.length;
        next.push(entry);
        displays.push({ ...batch, display: entry.mesh, zIndex: displays.length });
      }
      for (const entry of [...available.values(), ...reusable]) {
        entry.mesh.removeFromParent();
        if (next.length + spare.length < maxMeshes) spare.push(entry);
        else destroy(entry);
      }
      active = next;
      for (const batch of displays) if (batch.display) {
        batch.display.zIndex = batch.zIndex;
        if (parent && batch.display.parent !== parent) parent.addChild(batch.display);
      }
      return displays;
    },
    get size() { return active.length; },
    dispose() { if (disposed) return; for (const entry of [...active, ...spare]) destroy(entry); active = []; spare = []; disposed = true; },
  };
}
