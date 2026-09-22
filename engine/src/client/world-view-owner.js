import { createCameraGeometryOwner } from "./camera-geometry-owner.js";
import { createTerrainProjectionCache, createWorldView } from "./world-view.js";
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
export function createWorldViewOwner({ runtime, bindings, root, effectClock, onCoverage, initialView,
  onViewPublished, screenLayers = [], viewport = () => ({ width: 640, height: 400 }) }) {
  const geometry = createCameraGeometryOwner();
  const { project } = geometry;
  const terrainProjection = createTerrainProjectionCache();
  let projection = geometry.projection, cameraTurn = 0, frame, disposed = false;
  let sourceFrame, sourceEpoch, displayedEpoch, view = createWorldView(initialView), pendingTurns = 0;
  let paintedCamera, viewChanged = false;
  function publishView() {
    if (!viewChanged) return;
    viewChanged = false;
    guides.clear(); ghosts.clear();
    onViewPublished?.(view);
  }
  const cameraState = { x: 0, y: 0, zoom: 1 };
  function transform() {
    terrain.transform(cameraState);
    if (paintedCamera) {
      const scale = cameraState.zoom / paintedCamera.zoom;
      for (const layer of screenLayers) {
        layer.scale.set(scale);
        layer.position.set(cameraState.x - paintedCamera.x * scale, cameraState.y - paintedCamera.y * scale);
      }
    }
  }
  const camera = Object.freeze({
    get x() { return cameraState.x; }, get y() { return cameraState.y; },
    get zoom() { return cameraState.zoom; }, get turn() { return cameraTurn; },
    move(dx, dy) { cameraState.x += dx; cameraState.y += dy; transform(); },
    zoomBy(delta, point = { x: viewport().width / 2, y: viewport().height / 2 }) {
      const x = (point.x - cameraState.x) / cameraState.zoom;
      const y = (point.y - cameraState.y) / cameraState.zoom;
      cameraState.zoom = Math.max(1, Math.min(4, cameraState.zoom + delta));
      cameraState.x = point.x - x * cameraState.zoom;
      cameraState.y = point.y - y * cameraState.zoom;
      transform();
    },
    reset() {
      const { width, height } = viewport();
      cameraState.zoom = width >= 600 ? 2 : 1;
      cameraState.x = (width - 640 * cameraState.zoom) / 2;
      cameraState.y = (height - 400 * cameraState.zoom) / 2;
      transform();
    },
    focus(target) {
      if (!target) return;
      const at = project(target.x, target.y, target.z), { width, height } = viewport();
      cameraState.x = width / 2 - at.x * cameraState.zoom;
      cameraState.y = height / 2 - at.y * cameraState.zoom;
      transform();
    },
    rotate(delta) {
      if (!Number.isSafeInteger(delta)) throw new Error("camera turn must be an integer");
      pendingTurns = (pendingTurns + delta) % 4;
    },
  });
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
  let buildMs = 0, frames = 0, unchangedFrames = 0;
  let previousProduced, previousTerrainRevision;

  function render({ subjects, selectedIds, art, paused, frameSequence, guide, ghost, placementStatus }) {
    if (disposed) throw new Error("world scene is disposed");
    const start = performance.now();
    const produced = actors.update({ subjects, selectedIds, art, terrainFrame: frame, paused, frameSequence, cameraTurn, projection });
    guides.update(guide);
    if (ghost && frame) ghosts.update(ghost, { art, verticalMetres: frame.verticalMetres, status: placementStatus, cameraTurn });
    else ghosts.clear();
    const retained = terrain.retainedRecords;
    if (retained.revision === previousTerrainRevision && previousProduced?.length === produced.length &&
        produced.every((record, index) => record === previousProduced[index])) {
      buildMs += performance.now() - start; frames++; unchangedFrames++;
      publishView();
      return records;
    }
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
    previousProduced = produced; previousTerrainRevision = retained.revision;
    publishView();
    return records;
  }

  return Object.freeze({
    container: terrain.container,
    render,
    updateTerrain(next, epoch) { sourceFrame = next; sourceEpoch = epoch; },
    camera, project,
    groundPoint: geometry.groundPoint, surfacePoint: geometry.surfacePoint, terrainPlaneCell: geometry.terrainPlaneCell,
    terrainHit: (x, y, displayed) => geometry.hit(x, y, displayed, displayedEpoch),
    terrainPoint: (x, y, displayed) => geometry.point(x, y, displayed, displayedEpoch),
    get view() { return view; },
    beginFrame(nextView, screen) {
      viewChanged ||= view.level !== nextView.level || view.cutaway !== nextView.cutaway || pendingTurns !== 0;
      view = nextView;
      displayedEpoch = sourceEpoch;
      if (pendingTurns) {
        const center = { x: screen.width / 2, y: screen.height / 2 };
        const local = { x: (center.x - cameraState.x) / cameraState.zoom, y: (center.y - cameraState.y) / cameraState.zoom };
        const focus = geometry.planePoint(local.x, local.y, (view.level + 0.5) * (frame?.verticalMetres ?? 0.54));
        projection = geometry.rotate(pendingTurns); cameraTurn = geometry.turn; pendingTurns = 0;
        terrain.setProjection(projection, cameraTurn); guides.clear(); ghosts.clear();
        ordering.reset(); ordering = createSpatialSceneOwner({ projection }); records = [];
        previousProduced = undefined; previousTerrainRevision = undefined;
        const at = project(focus.x, focus.y, focus.z);
        cameraState.x = center.x - at.x * cameraState.zoom;
        cameraState.y = center.y - at.y * cameraState.zoom;
      }
      frame = terrainProjection.update(sourceFrame, view, sourceEpoch);
      terrain.update(frame, sourceEpoch);
      terrain.position(cameraState, view, screen);
      for (const layer of screenLayers) { layer.scale.set(1); layer.position.set(0, 0); }
      paintedCamera = { ...cameraState };
    },
    presentedTerrain: () => terrain.presentedTerrain,
    installTerrainArt: terrain.installArt,
    clear() { sourceFrame = undefined; sourceEpoch = undefined; pendingTurns = 0; geometry.reset(); terrainProjection.update(undefined, view, undefined); frame = undefined; terrain.update(undefined, undefined); actors.clear(); guides.clear(); ghosts.clear(); ordering.reset(); records = []; previousProduced = undefined; previousTerrainRevision = undefined; },
    resetTimeline: actors.resetTimeline,
    react: actors.react,
    pick: point => ordering.pick(point),
    metrics() {
      const coverage = terrain.coverage;
      return { ...ordering.metrics(), meshes: terrain.meshMetrics, visualBuild: { frames, unchangedFrames, totalMs: buildMs },
        cameraCoverage: terrain.cameraCoverage,
        coverage: { capacity:coverage.capacity, maxBytes:coverage.maxBytes, retainedBytes:coverage.retainedBytes,
          epoch:coverage.epoch, terrainRevision:coverage.terrainRevision, level:coverage.level,
          visibleComplete:coverage.visibleComplete, demandComplete:coverage.demandComplete, viewBudget:coverage.viewBudget, error:coverage.error,
          visibleRegions:coverage.coverage.filter(item=>item.visible).length,
          readyVisibleRegions:coverage.coverage.filter(item=>item.visible && item.status==="ready").length,
          requestedRegions:coverage.coverage.length, readyRegions:coverage.patches.length,
          cachedRegions:coverage.cachedRegions, pending:coverage.pending, loading:coverage.loading }, primitives: records.length };
    },
    snapshot: () => records.map(({ id, part, screenBounds, orderGeometry, support, cell, pickable, role }) =>
      ({ id, part, screenBounds, orderGeometry, support, cell, pickable, role })),
    dispose() {
      if (disposed) return;
      disposed = true; geometry.dispose(); actors.dispose(); guides.dispose(); ghosts.dispose(); previewLayer.destroy(); terrain.dispose(); ordering.reset(); records = []; frame = undefined; previousProduced = undefined; previousTerrainRevision = undefined;
    },
  });
}
