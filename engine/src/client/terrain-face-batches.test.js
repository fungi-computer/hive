import test from "node:test";
import assert from "node:assert/strict";
import { Container, Texture } from "pixi.js";
import { createTerrainBatchMeshes } from "./terrain-face-batches.js";

const BYTES_PER_QUAD = 8 * 4 * 2 + 6 * 2;
function view(region, runs, quads) {
  return Array.from({ length: runs }, (_, run) => [
    ...Array.from({ length: quads }, (_, index) => ({
      id: `${region}:${run}:${index}`, part: "face",
      projected: [{x:region,y:0},{x:region,y:1},{x:region+1,y:1},{x:region+1,y:0}],
      terrainBatch: { texture: Texture.WHITE, uvs: [0,0,0,1,1,1,1,0] },
    })),
    { id: `separator:${run}` },
  ]).flat();
}
function bounded(owner, activeRecords) {
  const metrics = owner.metrics();
  assert(Object.isFrozen(metrics));
  assert(Object.isFrozen(metrics.limits));
  assert(metrics.activeMeshes + metrics.spareMeshes <= metrics.limits.meshes);
  assert(metrics.spareMeshes <= metrics.limits.spareMeshes);
  assert(metrics.spareQuads <= metrics.limits.spareQuads);
  assert(metrics.spareBufferBytes <= 16000 * BYTES_PER_QUAD);
  assert.equal(metrics.activeBufferBytes, metrics.activeQuads * BYTES_PER_QUAD);
  assert.equal(metrics.spareBufferBytes, metrics.spareQuads * BYTES_PER_QUAD);
  assert.equal(metrics.spareRecords, 0, "idle meshes retain no historical world records");
  assert.equal(metrics.activeRecords, activeRecords);
  assert.equal(metrics.retainedRecords, activeRecords);
  return metrics;
}

test("many changed views bound idle buffers and records through large, small, empty and dispose", () => {
  const parent = new Container(), owner = createTerrainBatchMeshes({ parent });
  const texture = Texture.WHITE, source = texture.source;
  for (let region = 0; region < 8; region++) {
    const large = owner.update(view(region, 20, 1200)).filter(batch => batch.kind === "terrain");
    assert.equal(bounded(owner, 24000).activeMeshes, 20);
    assert.equal(parent.children.length, 20);
    const small = owner.update(view(region + 100, 1, 2))[0].display;
    assert(large.some(batch => batch.display === small), "active replacement reuses a mesh");
    assert.equal(small.geometry.positions.length, 16, "large replacement buffers shrink to current geometry");
    for (const buffer of [small.geometry.attributes.aPosition.buffer, small.geometry.attributes.aUV.buffer, small.geometry.indexBuffer]) {
      assert.equal(buffer.shrinkToFit, true);
      assert.equal(buffer.descriptor.size, buffer.data.byteLength, "GPU allocation request also shrinks");
    }
    bounded(owner, 2);
    assert.equal(parent.children.length, 1);
    owner.update([]);
    const empty = bounded(owner, 0);
    assert.equal(empty.activeMeshes, 0);
    assert(empty.spareMeshes > 0);
    assert(large.some(batch => batch.display.destroyed), "excess idle buffers are destroyed");
    assert.equal(parent.children.length, 0);
  }
  owner.dispose();
  owner.dispose();
  assert.deepEqual(owner.metrics(), { limits: { meshes:512, spareMeshes:16, spareQuads:16000 }, activeMeshes:0, spareMeshes:0, activeQuads:0, spareQuads:0,
    activeBufferBytes:0, spareBufferBytes:0, activeRecords:0, spareRecords:0, retainedRecords:0 });
  assert.equal(texture.destroyed, false, "art texture remains owned by the pack");
  assert.equal(source.destroyed, false, "shared atlas source survives mesh disposal");
  assert.throws(() => owner.update([]), /disposed/);
  parent.destroy();
});

test("idle mesh count respects both the fixed cap and a smaller owner budget and can be reused", () => {
  for (const maxMeshes of [4, 32]) {
    const owner = createTerrainBatchMeshes({ maxMeshes });
    const records = view(0, maxMeshes, 1);
    const meshes = owner.update(records).filter(batch => batch.kind === "terrain").map(batch => batch.display);
    owner.update([]);
    const idle = bounded(owner, 0);
    assert.equal(idle.spareMeshes, Math.min(maxMeshes, 16));
    assert.equal(meshes.filter(mesh => !mesh.destroyed).length, idle.spareMeshes);
    const next = owner.update(view(1, 1, 1))[0].display;
    assert(meshes.includes(next), "idle mesh is reused without its retired record identity");
    assert.equal(next.geometry.positions[0], 1, "reused geometry reflects the new region");
    bounded(owner, 1);
    const positions = next.geometry.positions;
    const fresh = view(1, 1, 1);
    assert.equal(owner.update(fresh)[0].display, next);
    assert.strictEqual(next.geometry.positions, positions, "unchanged active geometry retains its buffers");
    owner.dispose();
    assert(meshes.every(mesh => mesh.destroyed));
  }
});
