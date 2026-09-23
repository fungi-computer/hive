import { createCameraGeometryOwner } from "./camera-geometry-owner.js";
import { createWorldView, projectWorldFact } from "./world-view.js";
import { Container } from "pixi.js";
import { createCutTerrainLayer } from "./cut-terrain-layer.js";
import { createActorPresentationOwner } from "./actor-presentation-owner.js";
import { createPlacementGuideOwner } from "./placement-guide-owner.js";
import { createPlacementGhostOwner } from "./placement-ghost-owner.js";
import { resolveStaticVisual } from "./visual-resolver.js";
import { createStructuralDrawOrderOwner } from "./structural-draw-order-owner.js";
import { edgeWallJunctionSubjects } from "./edge-wall-presentation.js";

/** The client supplies facts and UI intent. This owner prepares one successor,
 * keeps the displayed picture interactive, and publishes geometry, sprites,
 * picking and the displayed view together. Animation coalesces behind a pending
 * snapshot; it cannot restart terrain work. No operation advances simulation. */
export function createWorldViewOwner({ runtime, bindings, root, effectClock, onCoverage, initialView,
  onViewPublished, screenLayers = [], viewport = () => ({ width: 640, height: 400 }), clock = () => performance.now() }) {
  let geometry = createCameraGeometryOwner(), view = createWorldView(initialView), wantedTurn = 0;
  let sourceFrame, sourceEpoch, displayedEpoch, disposed = false, pending, continuation, backgroundError, latestInput;
  let subjects = Object.freeze([]), terrainRevision, previousProduced;
  let paintedCamera;
  const cameraState = { x: 0, y: 0, zoom: 1 };
  const project = (x, y, z) => geometry.project(x, y, z);
  const terrain = createCutTerrainLayer({ runtime, projection: geometry.projection, onCoverage });
  const actors = createActorPresentationOwner({ parent: terrain.container, project, bindings, root, effectClock });
  const previewLayer = new Container();
  previewLayer.eventMode = "none"; previewLayer.zIndex = Number.MAX_SAFE_INTEGER;
  terrain.container.addChild(previewLayer);
  const guides = createPlacementGuideOwner({ parent: previewLayer, project });
  const ghosts = createPlacementGhostOwner({ parent: previewLayer, project, bindings, resolve: resolveStaticVisual });
  let ordering = createStructuralDrawOrderOwner({ direction: geometry.projection.direction, clock });
  const retiredOrdering = {};
  const work = { frames: 0, started: 0, published: 0, cancelled: 0, preparationMs: 0, publicationMs: 0, maxFrameWorkMs: 0 };

  function transform() {
    terrain.transform(cameraState);
    if (!paintedCamera) return;
    const scale = cameraState.zoom / paintedCamera.zoom;
    for (const layer of screenLayers) {
      layer.scale.set(scale);
      layer.position.set(cameraState.x - paintedCamera.x * scale, cameraState.y - paintedCamera.y * scale);
    }
  }
  const camera = Object.freeze({
    get x() { return cameraState.x; }, get y() { return cameraState.y; },
    get zoom() { return cameraState.zoom; }, get turn() { return geometry.turn; },
    move(dx, dy) { cameraState.x += dx; cameraState.y += dy; transform(); },
    zoomBy(delta, point = { x: viewport().width / 2, y: viewport().height / 2 }) {
      const x = (point.x - cameraState.x) / cameraState.zoom, y = (point.y - cameraState.y) / cameraState.zoom;
      cameraState.zoom = Math.max(1, Math.min(4, cameraState.zoom + delta));
      cameraState.x = point.x - x * cameraState.zoom; cameraState.y = point.y - y * cameraState.zoom; transform();
    },
    reset() {
      const { width, height } = viewport(); cameraState.zoom = width >= 600 ? 2 : 1;
      cameraState.x = (width - 640 * cameraState.zoom) / 2; cameraState.y = (height - 400 * cameraState.zoom) / 2; transform();
    },
    focus(target) {
      if (!target) return;
      const at = project(target.x, target.y, target.z), { width, height } = viewport();
      cameraState.x = width / 2 - at.x * cameraState.zoom; cameraState.y = height / 2 - at.y * cameraState.zoom; transform();
    },
    rotate(delta) {
      if (!Number.isSafeInteger(delta)) throw new Error("camera turn must be an integer");
      wantedTurn = ((wantedTurn + delta) % 4 + 4) % 4;
    },
  });
  function cameraFor(nextGeometry, screen) {
    if (nextGeometry === geometry) return { ...cameraState };
    const center = { x: screen.width / 2, y: screen.height / 2 };
    const local = { x: (center.x - cameraState.x) / cameraState.zoom, y: (center.y - cameraState.y) / cameraState.zoom };
    const height = (view.level + .5) * (terrain.presentedTerrain?.verticalMetres ?? sourceFrame?.verticalMetres ?? .54);
    const focus = geometry.planePoint(local.x, local.y, height), at = nextGeometry.project(focus.x, focus.y, focus.z);
    return { x: center.x - at.x * cameraState.zoom, y: center.y - at.y * cameraState.zoom, zoom: cameraState.zoom };
  }
  function cancelPending() {
    const job = pending; if (!job) return;
    pending = undefined; work.cancelled++;
    job.iterator.return(); job.order?.cancel(); job.actor?.cancel(); job.terrain?.cancel();
    if (job.ordering !== ordering) job.ordering.dispose();
    if (job.geometry !== geometry) job.geometry.dispose();
  }
  function start(input, nextGeometry, terrainTask = terrain.prepare()) {
    const job = { epoch: sourceEpoch, view: createWorldView(input.view), turn: wantedTurn, geometry: nextGeometry,
      deadline: Infinity, screen: Object.freeze({ width: input.screen.width, height: input.screen.height }),
      ordering: nextGeometry === geometry ? ordering : createStructuralDrawOrderOwner({ direction: nextGeometry.projection.direction, clock }),
      terrain: terrainTask, phase: "terrain", preparedSubjects: 0, done: false };
    function* prepare() {
      while (!job.terrain.terrainReady) { job.terrain.advance({ maxOperations: 8192, deadline: job.deadline }); yield; }
      job.phase = "subjects";
      const terrainResult = job.terrain.result;
      const preparedSubjects = [];
      for (const fact of input.facts ?? []) {
        const policy = projectWorldFact(fact, job.view, terrainResult.terrainFrame?.verticalMetres);
        if (policy.visible && fact.pose?.position && fact.visual) preparedSubjects.push({
          id: fact.id, name: fact.label || fact.id, ...fact.pose.position, facing: fact.pose.facing,
          visual: fact.visual, motion: bindings[fact.visual]?.motion, local: fact.local, support: fact.support,
          surface: fact.surface, projectile: fact.projectile, inventory: fact.inventory, activity: fact.activity,
          pose: fact.pose, placement: fact.placement, pickable: policy.pickable, hitZoom: cameraState.zoom,
        });
        job.preparedSubjects = preparedSubjects.length;
        yield;
      }
      if (terrainResult.terrainFrame) preparedSubjects.push(...edgeWallJunctionSubjects(preparedSubjects, bindings, terrainResult.terrainFrame.verticalMetres));
      job.phase = "actors";
      job.actor = actors.prepare({ subjects: preparedSubjects, selectedIds: input.selectedIds ?? [], art: input.art,
        terrainFrame: terrainResult.terrainFrame, paused: input.paused, frameSequence: input.frameSequence,
        cameraTurn: job.turn, projection: job.geometry.projection, project: job.geometry.project });
      while (!job.actor.ready) { job.actor.advance({ maxActors: 1, maxParts: 1 }); yield; }
      const produced = job.actor.records;
      if (job.ordering === ordering && terrainRevision === terrainResult.revision && produced === previousProduced) {
        job.orderUnchanged = true;
        job.phase = "paint";
        job.terrain.stagePaint(null);
        return;
      }
      job.phase = "order";
      job.order = job.ordering.prepare({ terrainRevision: terrainResult.revision,
        terrainRegions: terrainResult.terrainRegions, waterRecords: terrainResult.waterRecords,
        subjectRecords: produced });
      while (job.order.status === "pending") { job.order.advance({ maxOperations: 32768, deadline: job.deadline }); yield; }
      job.phase = "paint";
      if (job.order.result.paintRequired) {
        job.terrain.stagePaint(job.order.result.paintLeaves);
      } else job.terrain.stagePaint(null);
      while (!job.terrain.ready) { job.terrain.advance({ batchRecords: 8192, batchMeshes: 64, deadline: job.deadline }); yield; }
    }
    job.iterator = prepare(); pending = job; work.started++;
  }
  function startTerrainSuccessor() {
    if (pending || backgroundError || !latestInput?.art || geometry.turn !== wantedTurn) return false;
    const successor = terrain.prepareSuccessor();
    if (!successor) return false;
    start(latestInput, geometry, successor);
    return true;
  }
  function advancePending(deadline) {
    const job = pending;
    if (!job) return;
    const started = clock(), publicationBefore = work.publicationMs;
    job.deadline = deadline;
    try {
      while (pending === job && clock() < deadline) {
        const step = job.iterator.next();
        if (step.done) { publish(job, job.screen); break; }
      }
    } catch (error) {
      if (pending === job) cancelPending();
      throw error;
    } finally {
      const elapsed = Math.max(0, clock() - started);
      work.preparationMs += Math.max(0, elapsed - (work.publicationMs - publicationBefore));
      work.maxFrameWorkMs = Math.max(work.maxFrameWorkMs, elapsed);
    }
  }
  function scheduleContinuation() {
    if (disposed || !pending || continuation !== undefined || typeof window === "undefined") return;
    continuation = globalThis.setTimeout(() => {
      continuation = undefined;
      if (disposed || !pending) return;
      if (pending.epoch !== sourceEpoch || pending.turn !== wantedTurn ||
          pending.view.level !== latestInput?.view.level || pending.view.cutaway !== latestInput?.view.cutaway)
        cancelPending();
      try { advancePending(clock() + 6); }
      catch (error) { backgroundError = error; }
      startTerrainSuccessor();
      if (pending && !backgroundError) scheduleContinuation();
    }, 0);
  }
  function publish(job, screen) {
    const started = clock(), nextCamera = cameraFor(job.geometry, screen);
    const viewChanged = view.level !== job.view.level || view.cutaway !== job.view.cutaway || geometry.turn !== job.turn;
    job.actor.publish(); job.terrain.publish();
    if (job.order) {
      job.ordering.publish(job.order);
    }
    if (job.ordering !== ordering) {
      const old = ordering.metrics();
      for (const [key, value] of Object.entries(old)) if (typeof value === "number")
        retiredOrdering[key] = key === "maxAdvanceMs" ? Math.max(retiredOrdering[key] ?? 0, value) : (retiredOrdering[key] ?? 0) + value;
      ordering.dispose(); ordering = job.ordering;
    }
    if (job.geometry !== geometry) { geometry.dispose(); geometry = job.geometry; }
    Object.assign(cameraState, nextCamera);
    view = job.view; displayedEpoch = job.epoch; subjects = job.actor.subjects;
    previousProduced = job.actor.records; terrainRevision = job.terrain.result.revision;
    actors.syncOverlays(); transform(); pending = undefined;
    work.published++; work.publicationMs += Math.max(0, clock() - started);
    if (viewChanged) { guides.clear(); ghosts.clear(); onViewPublished?.(view); }
  }
  function frame(input) {
    if (disposed) return;
    latestInput = input;
    if (backgroundError) { const error = backgroundError; backgroundError = undefined; throw error; }
    const budget = input.budgetMs ?? 6;
    if (!(budget > 0) || !Number.isFinite(budget)) throw new Error("invalid world view frame budget");
    const started = clock(), deadline = started + budget; work.frames++;
    if (pending && (pending.epoch !== sourceEpoch || pending.turn !== wantedTurn ||
      pending.view.level !== input.view.level || pending.view.cutaway !== input.view.cutaway)) cancelPending();
    let nextGeometry = pending?.geometry ?? geometry;
    if (!pending && geometry.turn !== wantedTurn) { nextGeometry = createCameraGeometryOwner(); nextGeometry.rotate(wantedTurn); }
    terrain.request({ frame: sourceFrame, epoch: sourceEpoch, camera: cameraFor(nextGeometry, input.screen),
      view: input.view, screen: input.screen, projection: nextGeometry.projection, turn: wantedTurn });
    if (pending?.terrain.superseded) {
      cancelPending();
      nextGeometry = geometry.turn === wantedTurn ? geometry : createCameraGeometryOwner();
      if (nextGeometry !== geometry) nextGeometry.rotate(wantedTurn);
    }
    if (!input.art) { if (nextGeometry !== geometry && !pending) nextGeometry.dispose(); return; }
    try {
      if (!pending) start(input, nextGeometry);
      advancePending(deadline);
      startTerrainSuccessor();
    } catch (error) {
      if (pending) cancelPending();
      else if (nextGeometry !== geometry) nextGeometry.dispose();
      throw error;
    }
    scheduleContinuation();
    // Client UI geometry is painted against the displayed camera after frame().
    for (const layer of screenLayers) { layer.scale.set(1); layer.position.set(0, 0); }
    paintedCamera = { ...cameraState };
  }
  return Object.freeze({
    container: terrain.container, camera, project, frame,
    get view() { return view; }, get subjects() { return subjects; },
    get records() { return ordering.records; }, get recordOrder() { return ordering.recordOrder; },
    updateTerrain(next, epoch) { sourceFrame = next; sourceEpoch = epoch; },
    groundPoint: (...args) => geometry.groundPoint(...args), surfacePoint: (...args) => geometry.surfacePoint(...args),
    terrainPlaneCell: (...args) => geometry.terrainPlaneCell(...args),
    terrainHit: (x, y, displayed) => geometry.hit(x, y, displayed, displayedEpoch),
    terrainPoint: (x, y, displayed) => geometry.point(x, y, displayed, displayedEpoch),
    presentedTerrain: () => terrain.presentedTerrain, installTerrainArt: terrain.installArt,
    preview({ guide, ghost, art, placementStatus }) {
      guides.update(guide);
      if (ghost && terrain.presentedTerrain) ghosts.update(ghost, { art, verticalMetres: terrain.presentedTerrain.verticalMetres, status: placementStatus, cameraTurn: geometry.turn });
      else ghosts.clear();
    },
    clear() {
      cancelPending(); sourceFrame = undefined; sourceEpoch = displayedEpoch = undefined;
      wantedTurn = geometry.turn;
      terrain.clear(); actors.clear(); guides.clear(); ghosts.clear(); ordering.reset();
      geometry.reset(); subjects = Object.freeze([]); previousProduced = terrainRevision = undefined;
    },
    resetTimeline() { cancelPending(); actors.resetTimeline(); }, react: actors.react,
    pick: point => ordering.pick(point),
    metrics() {
      const coverage = terrain.coverage;
      const current = ordering.metrics();
      const accumulated = Object.fromEntries(Object.entries(current).map(([key, value]) => [key,
        typeof value !== "number" ? value : key === "maxAdvanceMs" ? Math.max(value, retiredOrdering[key] ?? 0) : value + (retiredOrdering[key] ?? 0)]));
      return { ...accumulated,
        meshes: terrain.meshMetrics, pictures: terrain.pictureMetrics,
        preparation: { ...work, pending: Boolean(pending), phase: pending?.phase ?? null,
          preparedSubjects: pending?.preparedSubjects ?? 0,
          orderStatus: pending?.order?.status ?? null,
          terrainStatus: pending?.terrain?.status ?? null },
        cameraCoverage: terrain.cameraCoverage,
        coverage: { capacity:coverage.capacity, maxBytes:coverage.maxBytes, retainedBytes:coverage.retainedBytes,
          epoch:coverage.epoch, terrainRevision:coverage.terrainRevision, level:coverage.level,
          receivedComplete:coverage.receivedComplete, receivedVisibleComplete:coverage.receivedVisibleComplete,
          visibleComplete:coverage.visibleComplete, demandComplete:coverage.demandComplete, viewBudget:coverage.viewBudget, error:coverage.error,
          visibleRegions:coverage.coverage.filter(item=>item.visible).length,
          readyVisibleRegions:coverage.coverage.filter(item=>item.visible && item.status==="ready").length,
          requestedRegions:coverage.coverage.length, readyRegions:coverage.patches.length,
          cachedRegions:coverage.cachedRegions, pending:coverage.pending, loading:coverage.loading }, primitives: ordering.recordOrder.count };
    },
    snapshot: () => ordering.records.map(({ id, part, screenBounds, orderGeometry, support, cell, pickable, role }) =>
      ({ id, part, screenBounds, orderGeometry, support, cell, pickable, role })),
    dispose() {
      if (disposed) return; disposed = true;
      if (continuation !== undefined) globalThis.clearTimeout(continuation);
      continuation = undefined; cancelPending(); geometry.dispose(); actors.dispose(); guides.dispose(); ghosts.dispose();
      previewLayer.destroy(); terrain.dispose(); ordering.dispose(); subjects = Object.freeze([]); sourceFrame = latestInput = undefined;
    },
  });
}
