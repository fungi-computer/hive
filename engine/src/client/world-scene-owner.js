import { Container } from "pixi.js";
import { createCutTerrainLayer } from "./cut-terrain-layer.js";
import { createActorPresentationOwner } from "./actor-presentation-owner.js";
import { createPlacementGuideOwner } from "./placement-guide-owner.js";
import { createPlacementGhostOwner } from "./placement-ghost-owner.js";
import { resolveStaticVisual } from "./visual-resolver.js";
import { createSpatialSceneOwner } from "./spatial-scene-owner.js";

const staticIdentity = record => JSON.stringify([record.id, record.part, record.orderGeometry,
  record.supportY, record.compositePartition, record.contactSurface, record.surfaceOrder]);

/** One client scene owns visual lifetime, coverage/camera invalidation, compiled
 * order and the matching picker. Inputs are world facts and local UI choices;
 * no operation here advances the world or grants physical support. */
export function createWorldSceneOwner({ runtime, projection: initialProjection, project, bindings, root, effectClock, onCoverage }) {
  let projection = initialProjection, cameraTurn = 0, frame, disposed = false;
  const terrain = createCutTerrainLayer({ runtime, projection, onCoverage });
  const actors = createActorPresentationOwner({ parent: terrain.container, project, bindings, root, effectClock });
  // Placement is a translucent UI preview: it may intentionally intersect the world.
  const previewLayer = new Container();
  previewLayer.eventMode = "none";
  previewLayer.zIndex = Number.MAX_SAFE_INTEGER;
  terrain.container.addChild(previewLayer);
  const guides = createPlacementGuideOwner({ parent: previewLayer, project });
  const ghosts = createPlacementGhostOwner({ parent: previewLayer, project, bindings, resolve: resolveStaticVisual });
  let ordering = createSpatialSceneOwner({ projection }), records = [];
  let buildMs = 0, frames = 0;

  function render({ subjects, selectedIds, art, paused, frameSequence, guide, ghost, placementStatus }) {
    if (disposed) throw new Error("world scene is disposed");
    const start = performance.now();
    const produced = actors.update({ subjects, selectedIds, art, terrainFrame: frame, paused, frameSequence, cameraTurn, projection });
    guides.update(guide);
    if (ghost && frame) ghosts.update(ghost, { art, verticalMetres: frame.verticalMetres, status: placementStatus, cameraTurn });
    else ghosts.clear();
    const retained = terrain.retainedRecords;
    const statics = produced.filter(record => record.moving !== true);
    const contacts = new Map();
    for (const record of statics) if (record.contactSurface) {
      if (contacts.has(String(record.id))) throw new Error("world visual owner has ambiguous support surface");
      contacts.set(String(record.id), record);
    }
    const dynamics = produced.filter(record => record.moving === true).map(record => {
      if (record.attachment?.support == null) return record;
      const surface = contacts.get(String(record.attachment.support));
      if (!surface) throw new Error(`world visual support is missing: ${record.attachment.support}`);
      return { ...record, support: { id: surface.id, part: surface.part, point: record.attachment.feet } };
    });
    buildMs += performance.now() - start; frames++;
    const compiled = ordering.update({ revision: `${retained.revision}:${statics.map(staticIdentity).join("|")}`,
      staticRecords: () => [...retained.records, ...statics], currentStaticRecords: statics, dynamicRecords: dynamics });
    records = compiled.records;
    if (compiled.applyOrderRequired) ordering.measureApplyOrder(() => terrain.applyOrder(records));
    actors.syncOverlays();
    return records;
  }

  return Object.freeze({
    container: terrain.container,
    render,
    updateTerrain(next, epoch) { frame = next; terrain.update(next, epoch); },
    position: terrain.position,
    installTerrainArt: terrain.installArt,
    setProjection(next, turn) {
      projection = next; cameraTurn = turn;
      terrain.setProjection(next, turn); guides.clear(); ghosts.clear();
      ordering.reset(); ordering = createSpatialSceneOwner({ projection }); records = [];
    },
    clear() { frame = undefined; terrain.update(undefined, undefined); actors.clear(); guides.clear(); ghosts.clear(); ordering.reset(); records = []; },
    resetTimeline: actors.resetTimeline,
    react: actors.react,
    pick: point => ordering.pick(point),
    metrics() {
      const coverage = terrain.coverage;
      return { ...ordering.metrics(), visualBuild: { frames, totalMs: buildMs },
        coverage: { epoch: coverage.epoch, terrainRevision: coverage.terrainRevision,
          demandComplete: coverage.demandComplete, viewBudget: coverage.viewBudget,
          requestedChunks: coverage.coverage.length, readyChunks: coverage.coverage.filter(item => item.status === "ready").length,
          retainedChunks: coverage.chunks.length, cachedChunks: coverage.cachedChunks, pending: coverage.pending }, primitives: records.length };
    },
    snapshot: () => records.map(({ id, part, screenBounds, orderGeometry, support, cell, pickable, role }) =>
      ({ id, part, screenBounds, orderGeometry, support, cell, pickable, role })),
    dispose() {
      if (disposed) return;
      disposed = true; actors.dispose(); guides.dispose(); ghosts.dispose(); previewLayer.destroy(); terrain.dispose(); ordering.reset(); records = [];
    },
  });
}
