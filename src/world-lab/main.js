import {
  MAX_OVERVIEW_DIMENSION,
  WORLD_LAB_NON_CLAIMS,
  createResidency,
  createWorldSpec,
  floorDiv,
  localViewport,
  namedFeatures,
  overviewPixelToWorldCell,
  overviewRectForViewport,
  renderChunkBuffer,
  sampleCell,
  sampleTerrain,
  terrainCode,
  worldCellToOverviewPixel,
} from "./terrain.js";
import {
  assembleSurfaceSection,
  prepareIsometricSection,
  sampleSectionCells,
} from "./section.js";
import { zoomAvailabilityForBounds } from "./control-state.js";
import { mountWorldLabControls } from "./controls.jsx";
import "./styles.css";

const spec = createWorldSpec();
const output = document.querySelector("#world-lab-output");
const overviewCanvas = document.querySelector("#world-lab-overview");
const overviewMarkerCanvas = document.querySelector(
  "#world-lab-overview-marker",
);
const localCanvas = document.querySelector("#world-lab-local");
const localGridCanvas = document.querySelector("#world-lab-local-grid");
const sectionCanvas = document.querySelector("#world-lab-section");
const overviewContext = overviewCanvas.getContext("2d");
const overviewMarkerContext = overviewMarkerCanvas.getContext("2d");
const localContext = localCanvas.getContext("2d");
const localGridContext = localGridCanvas.getContext("2d");
const sectionContext = sectionCanvas.getContext("2d");
const residency = createResidency(spec);
const features = namedFeatures(spec);
const namedLocations = [
  { id: "origin", label: "Origin", x: 0, z: 0 },
  {
    id: "wetDryBoundary",
    label: "Northwater wet/dry boundary",
    ...features.wetDryBoundary,
  },
  { id: "ridge", label: "Lantern Ridge", ...features.ridge },
  { id: "canyon", label: "Mallowcut Canyon", ...features.canyon },
  { id: "signed", label: "Signed cell", x: -1, z: 0 },
];
let focus = namedLocations[0];
let center = {
  chunkX: floorDiv(focus.x, spec.chunkSize),
  chunkZ: floorDiv(focus.z, spec.chunkSize),
};
let overview = null;
let requestedBounds = { ...spec.overview.bounds };
let overviewGenerationMs = null;
let worker = null;
let activeRequest = null;
let queuedRequest = null;
let latestRequestId = 0;
let staleResults = 0;
let disposed = false;
let workerProblem = null;
let controlsSnapshot = null;
const controlListeners = new Set();
const MIN_ATLAS_SPAN = 512;
const MAX_ATLAS_SPAN = 8192;
const formatNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const terrainPalette = Object.freeze({
  0: [38, 91, 132], // surface-water: bed below sea surface
  1: [197, 168, 104], // sea-level-ground: dry bed exactly at datum
  3: [75, 132, 82], // land: bed above sea surface
});

function channel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function colorForCell(terrain, elevation, moisture) {
  const base = terrainPalette[terrain] || terrainPalette[3];
  const height = elevation / 255;
  const wet = moisture / 255;
  const lift = (height - 0.5) * 42;
  return [
    channel(base[0] + lift - wet * 14),
    channel(base[1] + lift + wet * 18),
    channel(base[2] + lift + wet * 24),
  ];
}

function drawSamples(context, samples) {
  const image = context.createImageData(samples.width, samples.height);
  for (let index = 0; index < samples.sampleCount; index += 1) {
    const [red, green, blue] = colorForCell(
      samples.pixels ? samples.pixels[index] : samples.terrain[index],
      samples.elevation[index],
      samples.moisture[index],
    );
    image.data[index * 4] = red;
    image.data[index * 4 + 1] = green;
    image.data[index * 4 + 2] = blue;
    image.data[index * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function drawOverview() {
  if (overview) drawSamples(overviewContext, overview);
}

function insideOverview(x, z) {
  return (
    overview &&
    x >= overview.bounds.minX &&
    x < overview.bounds.maxXExclusive &&
    z >= overview.bounds.minZ &&
    z < overview.bounds.maxZExclusive
  );
}

function drawViewportMarker(viewport) {
  overviewMarkerContext.clearRect(
    0,
    0,
    overviewMarkerCanvas.width,
    overviewMarkerCanvas.height,
  );
  if (!overview) return;
  const rect = overviewRectForViewport(overview, viewport);
  overviewMarkerContext.fillStyle = "rgba(255, 245, 170, 0.18)";
  overviewMarkerContext.strokeStyle = "#fff2a8";
  overviewMarkerContext.lineWidth = 2;
  overviewMarkerContext.fillRect(rect.left, rect.top, rect.width, rect.height);
  overviewMarkerContext.strokeRect(
    rect.left,
    rect.top,
    rect.width,
    rect.height,
  );
  if (!insideOverview(focus.x, focus.z)) return;
  const x =
    ((focus.x - overview.bounds.minX) / overview.bounds.spanX) * overview.width;
  const z =
    ((focus.z - overview.bounds.minZ) / overview.bounds.spanZ) *
    overview.height;
  overviewMarkerContext.strokeStyle = "#ffffff";
  overviewMarkerContext.beginPath();
  overviewMarkerContext.moveTo(x - 5, z);
  overviewMarkerContext.lineTo(x + 5, z);
  overviewMarkerContext.moveTo(x, z - 5);
  overviewMarkerContext.lineTo(x, z + 5);
  overviewMarkerContext.stroke();
}

function drawLocalGrid(viewport) {
  localGridContext.clearRect(
    0,
    0,
    localGridCanvas.width,
    localGridCanvas.height,
  );
  localGridContext.strokeStyle = "rgba(255, 248, 205, 0.26)";
  localGridContext.lineWidth = 1;
  for (
    let cell = spec.chunkSize;
    cell < localGridCanvas.width;
    cell += spec.chunkSize
  ) {
    localGridContext.beginPath();
    localGridContext.moveTo(cell + 0.5, 0);
    localGridContext.lineTo(cell + 0.5, localGridCanvas.height);
    localGridContext.moveTo(0, cell + 0.5);
    localGridContext.lineTo(localGridCanvas.width, cell + 0.5);
    localGridContext.stroke();
  }
  const localX = focus.x - viewport.minX;
  const localZ = focus.z - viewport.minZ;
  if (
    localX >= 0 &&
    localX < viewport.width &&
    localZ >= 0 &&
    localZ < viewport.height
  ) {
    localGridContext.fillStyle = "rgba(255, 255, 255, 0.25)";
    localGridContext.strokeStyle = "#ffffff";
    localGridContext.fillRect(localX, localZ, 1, 1);
    localGridContext.strokeRect(localX + 0.1, localZ + 0.1, 0.8, 0.8);
  }
}

function drawLocal() {
  const started = performance.now();
  const chunks = residency.loadWindow(center.chunkX, center.chunkZ);
  const buffer = renderChunkBuffer(spec, chunks);
  const viewport = localViewport(spec, center.chunkX, center.chunkZ);
  localContext.imageSmoothingEnabled = false;
  drawSamples(localContext, { ...buffer, pixels: buffer.pixels });
  drawLocalGrid(viewport);
  return { buffer, viewport, renderMs: performance.now() - started };
}

function polygon(context, points) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
}

function shade(color, factor) {
  return color.map((value) => channel(value * factor));
}

function drawSurfaceSection() {
  const sampleStarted = performance.now();
  const sampled = sampleSectionCells(spec, {
    focusX: focus.x,
    focusZ: focus.z,
    width: 24,
    depth: 16,
    halo: 1,
  });
  const sampleMs = performance.now() - sampleStarted;
  const assemblyStarted = performance.now();
  const section = assembleSurfaceSection(sampled);
  const assemblyMs = performance.now() - assemblyStarted;
  const drawPreparationStarted = performance.now();
  const prepared = prepareIsometricSection(section);
  const drawPreparationMs = performance.now() - drawPreparationStarted;
  const drawStarted = performance.now();
  sectionContext.clearRect(0, 0, sectionCanvas.width, sectionCanvas.height);
  sectionContext.save();
  const scale = Math.min(
    sectionCanvas.width / prepared.width,
    sectionCanvas.height / prepared.height,
  );
  sectionContext.translate(
    (sectionCanvas.width - prepared.width * scale) / 2,
    (sectionCanvas.height - prepared.height * scale) / 2,
  );
  sectionContext.scale(scale, scale);
  sectionContext.lineWidth = 0.7 / scale;
  for (const tile of prepared.tiles) {
    const color = colorForCell(
      terrainCode(tile.cell.terrain),
      Math.round(tile.cell.elevation * 255),
      Math.round(tile.cell.moisture * 255),
    );
    if (tile.eastFace) {
      polygon(sectionContext, tile.eastFace);
      sectionContext.fillStyle = `rgb(${shade(color, 0.58).join(",")})`;
      sectionContext.fill();
    }
    if (tile.southFace) {
      polygon(sectionContext, tile.southFace);
      sectionContext.fillStyle = `rgb(${shade(color, 0.72).join(",")})`;
      sectionContext.fill();
    }
    polygon(sectionContext, tile.top);
    sectionContext.fillStyle = `rgb(${color.join(",")})`;
    sectionContext.fill();
    sectionContext.strokeStyle = tile.cell.focused
      ? "#fff2a8"
      : "rgba(20, 30, 25, 0.28)";
    sectionContext.lineWidth = tile.cell.focused ? 2 / scale : 0.7 / scale;
    sectionContext.stroke();
  }
  sectionContext.restore();
  return {
    sampled,
    section,
    prepared,
    timings: {
      sampleMs: Number(sampleMs.toFixed(3)),
      assemblyMs: Number(assemblyMs.toFixed(3)),
      drawPreparationMs: Number(drawPreparationMs.toFixed(3)),
      canvasDrawMs: Number((performance.now() - drawStarted).toFixed(3)),
    },
  };
}

function lifecycleLabel() {
  if (workerProblem) return `worker error: ${workerProblem}`;
  if (activeRequest && queuedRequest)
    return `sampling #${activeRequest.requestId}; queued newest #${queuedRequest.requestId}`;
  if (activeRequest) return `sampling request #${activeRequest.requestId}`;
  return overview
    ? `showing request #${latestRequestId}`
    : "waiting for first bounded overview";
}

function scaleForBounds(bounds) {
  const spanX = bounds.maxXExclusive - bounds.minX;
  const spanZ = bounds.maxZExclusive - bounds.minZ;
  const footprint = Math.max(
    spanX / MAX_OVERVIEW_DIMENSION,
    spanZ / MAX_OVERVIEW_DIMENSION,
  );
  return `${formatNumber.format(spanX)} × ${formatNumber.format(spanZ)} cells · ${formatNumber.format(footprint)} cells/pixel`;
}

function zoomAvailability() {
  return zoomAvailabilityForBounds(
    requestedBounds,
    MIN_ATLAS_SPAN,
    MAX_ATLAS_SPAN,
  );
}

function publishControls(selectedLocal) {
  controlsSnapshot = Object.freeze({
    locations: namedLocations,
    focus: { id: focus.id ?? null, label: focus.label, x: focus.x, z: focus.z },
    requested: {
      bounds: { ...requestedBounds },
      scale: scaleForBounds(requestedBounds),
    },
    displayed: overview
      ? {
          bounds: { ...overview.bounds },
          scale: scaleForBounds(overview.bounds),
        }
      : null,
    lifecycle: lifecycleLabel(),
    zoom: zoomAvailability(),
    exact: {
      x: selectedLocal.x,
      z: selectedLocal.z,
      terrain: selectedLocal.terrain,
      bedLevel: selectedLocal.bedLevel,
      bedMetres: Number(selectedLocal.bedMetres.toFixed(2)),
      seaSurfaceLevel: selectedLocal.seaSurfaceLevel,
    },
  });
  for (const listener of controlListeners) listener();
}

const controls = Object.freeze({
  subscribe(listener) {
    controlListeners.add(listener);
    return () => controlListeners.delete(listener);
  },
  getSnapshot() {
    return controlsSnapshot;
  },
  jump(id) {
    const location = namedLocations.find((candidate) => candidate.id === id);
    if (!location) throw new Error(`unknown World Lab location: ${id}`);
    moveFocus(location.label, location.x, location.z, location.id);
    const span = requestedBounds.maxXExclusive - requestedBounds.minX;
    requestOverview(
      boundsAround(location.x, location.z, span),
      "named-location",
    );
  },
  pan(dx, dz) {
    panAtlas(dx, dz);
  },
  zoom(direction) {
    return zoomAtlas(direction);
  },
});

function render() {
  const local = drawLocal();
  const sectionView = drawSurfaceSection();
  drawViewportMarker(local.viewport);
  const selectedLocal = sampleCell(spec, focus.x, focus.z);
  const selectedShared = sampleTerrain(spec, focus.x, focus.z, 1);
  const selectedOverview = overview
    ? sampleTerrain(spec, focus.x, focus.z, overview.footprint)
    : null;
  const selectedPixel = insideOverview(focus.x, focus.z)
    ? worldCellToOverviewPixel(overview, focus.x, focus.z)
    : null;
  const localX = focus.x - local.viewport.minX;
  const localZ = focus.z - local.viewport.minZ;
  const localIndex = localZ * local.buffer.width + localX;
  output.querySelector("[data-field=selection]").textContent = JSON.stringify(
    {
      focus: { label: focus.label, x: focus.x, z: focus.z },
      displayedOverviewPixel: selectedPixel,
      overviewSampler: selectedOverview
        ? {
            classificationScope: selectedOverview.classificationScope,
            footprint: overview.footprint,
            elevation: selectedOverview.elevation,
            moisture: selectedOverview.moisture,
            terrainLabel: selectedOverview.terrain,
            labelLimit: "footprint approximation; inspect exact cell below",
          }
        : null,
      sharedSampler: {
        footprint: selectedShared.footprint,
        elevation: selectedShared.elevation,
        bedLevel: selectedShared.bedLevel,
        bedMetres: selectedShared.bedMetres,
        seaSurfaceLevel: selectedShared.seaSurfaceLevel,
        seaSurfaceMetres: selectedShared.seaSurfaceMetres,
        surfaceWaterPotentialDepthLevels:
          selectedShared.surfaceWaterPotentialDepthLevels,
        moisture: selectedShared.moisture,
        terrain: selectedShared.terrain,
        feature: selectedShared.feature,
        baseElevation: selectedShared.baseElevation,
        ridgeLift: selectedShared.ridgeLift,
        canyonCarve: selectedShared.canyonCarve,
        coastDistance: selectedShared.coastDistance,
        ridgeDistance: selectedShared.ridgeDistance,
        canyonDistance: selectedShared.canyonDistance,
      },
      sharedLocalSampler: {
        footprint: selectedLocal.footprint,
        elevation: selectedLocal.elevation,
        bedLevel: selectedLocal.bedLevel,
        bedMetres: selectedLocal.bedMetres,
        seaSurfaceLevel: selectedLocal.seaSurfaceLevel,
        surfaceWaterPotentialDepthLevels:
          selectedLocal.surfaceWaterPotentialDepthLevels,
        moisture: selectedLocal.moisture,
        terrainLabel: selectedLocal.terrain,
        wetDryBoundary: selectedLocal.wetDryBoundary,
        wetDryNeighbours: selectedLocal.wetDryNeighbours,
      },
      localRenderCell: {
        x: localX,
        z: localZ,
        elevationByte: local.buffer.elevation[localIndex],
        bedLevel: local.buffer.bedLevels[localIndex],
        moistureByte: local.buffer.moisture[localIndex],
        matchesSampler:
          local.buffer.elevation[localIndex] ===
            Math.round(selectedLocal.elevation * 255) &&
          local.buffer.bedLevels[localIndex] === selectedLocal.bedLevel &&
          local.buffer.moisture[localIndex] ===
            Math.round(selectedLocal.moisture * 255),
      },
    },
    null,
    2,
  );
  output.querySelector("[data-field=local]").textContent = JSON.stringify(
    {
      focus: { label: focus.label, x: focus.x, z: focus.z },
      centerChunk: { x: center.chunkX, z: center.chunkZ },
      extent: {
        minX: local.viewport.minX,
        minZ: local.viewport.minZ,
        maxXExclusive: local.viewport.maxXExclusive,
        maxZExclusive: local.viewport.maxZExclusive,
      },
      scale: "80x80 canvas: one pixel = one world cell",
      generatedLocalRenderChunks: residency.stats().generatedChunks,
      residentLocalRenderChunks: residency.stats().residentChunks,
      renderCells: local.buffer.sampleCount,
      renderChecksum: local.buffer.checksum,
      visualChecksum: local.buffer.visualChecksum,
      renderMs: Number(local.renderMs.toFixed(3)),
    },
    null,
    2,
  );
  output.querySelector("[data-field=section]").textContent = JSON.stringify(
    {
      focus: sectionView.section.focus,
      surfaceOnly: sectionView.section.surfaceOnly,
      bounds: sectionView.section.bounds,
      visibleCells: sectionView.section.visibleCellCount,
      halo: sectionView.section.halo,
      sampledCells: sectionView.section.sampleCount,
      sampleBudget: "24x16 visible cells + one-cell halo",
      focusBedLevel: sectionView.section.cells.find((cell) => cell.focused)
        ?.bedLevel,
      voxelPixelHeight: sectionView.prepared.voxelPixelHeight,
      exposedStepFaces: sectionView.prepared.tiles.filter(
        (tile) => tile.eastDropLevels > 0 || tile.southDropLevels > 0,
      ).length,
      preparedPixels: {
        width: sectionView.prepared.width,
        height: sectionView.prepared.height,
      },
      timings: sectionView.timings,
      nonClaims: ["no caves", "no voxel volume", "no live gameplay terrain"],
    },
    null,
    2,
  );
  output.querySelector("[data-field=claims]").textContent = JSON.stringify(
    {
      generatedLocalRenderResidency: true,
      chunkKeysAreCacheOnly: true,
      displayedOverview: overview
        ? `${overview.bounds.spanX}x${overview.bounds.spanZ} world cells over ${overview.width}x${overview.height} pixels`
        : null,
      requestedBounds,
      atlasLifecycle: lifecycleLabel(),
      staleResultsRejected: staleResults,
      caravan: false,
      simulation: false,
      nonClaims: WORLD_LAB_NON_CLAIMS,
    },
    null,
    2,
  );
  publishControls(selectedLocal);
}

function contractReport() {
  output.querySelector("[data-field=contract]").textContent = JSON.stringify(
    {
      seed: spec.seed,
      generatorVersion: spec.generatorVersion,
      chunkSize: spec.chunkSize,
      bounds: overview?.bounds ?? requestedBounds,
      span: overview
        ? { x: overview.bounds.spanX, z: overview.bounds.spanZ }
        : null,
      overviewSamples: overview?.sampleCount ?? null,
      cellsPerPixel: overview?.footprint ?? null,
      overviewCap: `${MAX_OVERVIEW_DIMENSION}x${MAX_OVERVIEW_DIMENSION}`,
      localScale: "80x80 pixels; one pixel = one world cell",
      heightSeaDefinition: spec.terrain,
      overviewElevation:
        "continuous footprint-aware elevation; exact local/section bed levels are quantized by the versioned terrain definition",
      terrainLabels:
        "surface-water: bed below datum; sea-level-ground: dry bed equal datum; land: bed above datum; wet/dry boundary needs exact cardinal neighbors",
      source:
        overview?.source ??
        "same versioned sampler requested in one lazy worker",
      filtering: overview?.filtering ?? "footprint-aware sampling pending",
      namedFeatures: overview?.featureCounts ?? null,
      landformComponents: ["baseElevation", "ridgeLift", "canyonCarve"],
      visualChecksum: overview?.visualChecksum ?? null,
      generationMs: overviewGenerationMs,
      lifecycle:
        "one lazy worker; one active request; one replaceable queued intent; stale results rejected",
      identity: spec.identity,
    },
    null,
    2,
  );
}

function workerSpec() {
  return {
    seed: spec.seed,
    generatorVersion: spec.generatorVersion,
    chunkSize: spec.chunkSize,
    overview: spec.overview,
    local: spec.local,
  };
}

function startQueuedRequest() {
  if (disposed || activeRequest || !queuedRequest) return;
  if (!worker) {
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", receiveOverview);
    worker.addEventListener("error", (event) => {
      workerProblem = event.message;
      activeRequest = null;
      worker.terminate();
      worker = null;
      render();
      startQueuedRequest();
    });
  }
  activeRequest = queuedRequest;
  queuedRequest = null;
  worker.postMessage({
    type: "sample",
    requestId: activeRequest.requestId,
    spec: workerSpec(),
    options: activeRequest.options,
  });
  render();
}

function receiveOverview(event) {
  const message = event.data;
  if (!activeRequest || message.requestId !== activeRequest.requestId) {
    staleResults += 1;
    return;
  }
  const completed = activeRequest;
  activeRequest = null;
  if (
    message.type === "result" &&
    completed.requestId === latestRequestId &&
    !queuedRequest
  ) {
    overview = message.overview;
    overviewGenerationMs = Number(message.generationMs.toFixed(3));
    drawOverview();
  } else if (message.type === "result") {
    staleResults += 1;
  } else if (
    message.type === "error" &&
    completed.requestId === latestRequestId
  ) {
    workerProblem = `request failed: ${message.message}`;
  }
  contractReport();
  render();
  startQueuedRequest();
}

function requestOverview(bounds, reason) {
  requestedBounds = { ...bounds };
  workerProblem = null;
  const requestId = ++latestRequestId;
  queuedRequest = {
    requestId,
    options: {
      width: MAX_OVERVIEW_DIMENSION,
      height: MAX_OVERVIEW_DIMENSION,
      bounds: requestedBounds,
    },
    reason,
  };
  if (activeRequest)
    worker.postMessage({ type: "cancel", requestId: activeRequest.requestId });
  else startQueuedRequest();
  contractReport();
  render();
}

function boundsAround(x, z, spanX, spanZ = spanX) {
  const minX = Math.floor(x - spanX / 2);
  const minZ = Math.floor(z - spanZ / 2);
  return {
    minX,
    minZ,
    maxXExclusive: minX + spanX,
    maxZExclusive: minZ + spanZ,
  };
}

function moveFocus(label, x, z, id = null) {
  focus = { label, x, z, id };
  center = {
    chunkX: floorDiv(x, spec.chunkSize),
    chunkZ: floorDiv(z, spec.chunkSize),
  };
}

function panAtlas(dx, dz) {
  const spanX = requestedBounds.maxXExclusive - requestedBounds.minX;
  const spanZ = requestedBounds.maxZExclusive - requestedBounds.minZ;
  const shiftX = Math.round(spanX * dx);
  const shiftZ = Math.round(spanZ * dz);
  const bounds = {
    minX: requestedBounds.minX + shiftX,
    minZ: requestedBounds.minZ + shiftZ,
    maxXExclusive: requestedBounds.maxXExclusive + shiftX,
    maxZExclusive: requestedBounds.maxZExclusive + shiftZ,
  };
  moveFocus(
    "Atlas center",
    Math.floor((bounds.minX + bounds.maxXExclusive) / 2),
    Math.floor((bounds.minZ + bounds.maxZExclusive) / 2),
  );
  requestOverview(bounds, "pan");
}

function zoomAtlas(direction) {
  const currentSpan = requestedBounds.maxXExclusive - requestedBounds.minX;
  const scale = direction === "in" ? 0.5 : 2;
  const nextSpan = Math.max(
    MIN_ATLAS_SPAN,
    Math.min(MAX_ATLAS_SPAN, Math.round(currentSpan * scale)),
  );
  if (nextSpan === currentSpan) {
    render();
    return false;
  }
  requestOverview(
    boundsAround(focus.x, focus.z, nextSpan),
    direction === "in" ? "zoom-in" : "zoom-out",
  );
  return true;
}

overviewCanvas.addEventListener("click", (event) => {
  if (!overview) return;
  const bounds = overviewCanvas.getBoundingClientRect();
  const column = Math.max(
    0,
    Math.min(
      overview.width - 1,
      Math.floor(
        ((event.clientX - bounds.left) / bounds.width) * overview.width,
      ),
    ),
  );
  const row = Math.max(
    0,
    Math.min(
      overview.height - 1,
      Math.floor(
        ((event.clientY - bounds.top) / bounds.height) * overview.height,
      ),
    ),
  );
  const cell = overviewPixelToWorldCell(overview, column, row);
  moveFocus("Overview cell", cell.x, cell.z);
  render();
});

function dispose() {
  disposed = true;
  queuedRequest = null;
  if (worker) worker.terminate();
  worker = null;
  activeRequest = null;
}

globalThis.addEventListener("pagehide", dispose, { once: true });
contractReport();
render();
mountWorldLabControls(document.querySelector("#world-lab-controls"), controls);
requestOverview(requestedBounds, "initial");
