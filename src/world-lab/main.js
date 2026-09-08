import {
  WORLD_LAB_NON_CLAIMS,
  createResidency,
  createWorldSpec,
  floorDiv,
  localViewport,
  namedFeatures,
  overviewRectForViewport,
  overviewPixelToWorldCell,
  renderChunkBuffer,
  sampleCell,
  sampleOverview,
  sampleTerrain,
  worldCellToOverviewPixel,
} from "./terrain.js";
import "./styles.css";

const spec = createWorldSpec();
const output = document.querySelector("#world-lab-output");
const overviewCanvas = document.querySelector("#world-lab-overview");
const overviewMarkerCanvas = document.querySelector("#world-lab-overview-marker");
const localCanvas = document.querySelector("#world-lab-local");
const localGridCanvas = document.querySelector("#world-lab-local-grid");
const overviewContext = overviewCanvas.getContext("2d");
const overviewMarkerContext = overviewMarkerCanvas.getContext("2d");
const localContext = localCanvas.getContext("2d");
const localGridContext = localGridCanvas.getContext("2d");
const residency = createResidency(spec);
const features = namedFeatures(spec);
const overview = sampleOverview(spec);
const featureButtons = [
  { label: "Origin", x: 0, z: 0 },
  { label: "Northwater Coast", ...features.coast },
  { label: "Lantern Ridge", ...features.ridge },
  { label: "Signed cell", x: -1, z: 0 },
];
let focus = featureButtons[0];
let center = { chunkX: floorDiv(focus.x, spec.chunkSize), chunkZ: floorDiv(focus.z, spec.chunkSize) };

const terrainPalette = [
  [38, 91, 132],
  [197, 168, 104],
  [111, 96, 71],
  [75, 132, 82],
];

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
    const [red, green, blue] = colorForCell(samples.pixels ? samples.pixels[index] : samples.terrain[index], samples.elevation[index], samples.moisture[index]);
    image.data[index * 4] = red;
    image.data[index * 4 + 1] = green;
    image.data[index * 4 + 2] = blue;
    image.data[index * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function drawOverview() {
  drawSamples(overviewContext, overview);
}

function drawViewportMarker(viewport) {
  const rect = overviewRectForViewport(overview, viewport);
  overviewMarkerContext.clearRect(0, 0, overviewMarkerCanvas.width, overviewMarkerCanvas.height);
  overviewMarkerContext.fillStyle = "rgba(255, 245, 170, 0.18)";
  overviewMarkerContext.strokeStyle = "#fff2a8";
  overviewMarkerContext.lineWidth = 2;
  overviewMarkerContext.fillRect(rect.left, rect.top, rect.width, rect.height);
  overviewMarkerContext.strokeRect(rect.left, rect.top, rect.width, rect.height);
  const x = ((focus.x - overview.bounds.minX) / overview.bounds.spanX) * overview.width;
  const z = ((focus.z - overview.bounds.minZ) / overview.bounds.spanZ) * overview.height;
  overviewMarkerContext.strokeStyle = "#ffffff";
  overviewMarkerContext.beginPath();
  overviewMarkerContext.moveTo(x - 5, z);
  overviewMarkerContext.lineTo(x + 5, z);
  overviewMarkerContext.moveTo(x, z - 5);
  overviewMarkerContext.lineTo(x, z + 5);
  overviewMarkerContext.stroke();
}

function drawLocalGrid(viewport) {
  localGridContext.clearRect(0, 0, localGridCanvas.width, localGridCanvas.height);
  localGridContext.strokeStyle = "rgba(255, 248, 205, 0.26)";
  localGridContext.lineWidth = 1;
  for (let cell = spec.chunkSize; cell < localGridCanvas.width; cell += spec.chunkSize) {
    localGridContext.beginPath();
    localGridContext.moveTo(cell + 0.5, 0);
    localGridContext.lineTo(cell + 0.5, localGridCanvas.height);
    localGridContext.moveTo(0, cell + 0.5);
    localGridContext.lineTo(localGridCanvas.width, cell + 0.5);
    localGridContext.stroke();
  }
  const localX = focus.x - viewport.minX;
  const localZ = focus.z - viewport.minZ;
  if (localX >= 0 && localX < viewport.width && localZ >= 0 && localZ < viewport.height) {
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

function render() {
  const local = drawLocal();
  drawViewportMarker(local.viewport);
  const selectedLocal = sampleCell(spec, focus.x, focus.z);
  const selectedOverview = sampleTerrain(spec, focus.x, focus.z, overview.footprint);
  const selectedShared = sampleTerrain(spec, focus.x, focus.z, 1);
  const selectedPixel = worldCellToOverviewPixel(overview, focus.x, focus.z);
  const localX = focus.x - local.viewport.minX;
  const localZ = focus.z - local.viewport.minZ;
  const localIndex = localZ * local.buffer.width + localX;
  output.querySelector("[data-field=selection]").textContent = JSON.stringify({
    focus: { label: focus.label, x: focus.x, z: focus.z },
    overviewPixel: selectedPixel,
    overviewSampler: {
      footprint: overview.footprint,
      elevation: selectedOverview.elevation,
      moisture: selectedOverview.moisture,
      terrain: selectedOverview.terrain,
    },
    sharedSampler: {
      footprint: selectedShared.footprint,
      elevation: selectedShared.elevation,
      moisture: selectedShared.moisture,
      terrain: selectedShared.terrain,
    },
    sharedLocalSampler: {
      footprint: selectedLocal.footprint,
      elevation: selectedLocal.elevation,
      moisture: selectedLocal.moisture,
      terrain: selectedLocal.terrain,
    },
    localRenderCell: {
      x: localX,
      z: localZ,
      elevationByte: local.buffer.elevation[localIndex],
      moistureByte: local.buffer.moisture[localIndex],
      matchesSampler: local.buffer.elevation[localIndex] === Math.round(selectedLocal.elevation * 255) && local.buffer.moisture[localIndex] === Math.round(selectedLocal.moisture * 255),
    },
  }, null, 2);
  output.querySelector("[data-field=local]").textContent = JSON.stringify({
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
  }, null, 2);
  output.querySelector("[data-field=claims]").textContent = JSON.stringify({
    generatedLocalRenderResidency: true,
    chunkKeysAreCacheOnly: true,
    overview: `${overview.bounds.spanX}x${overview.bounds.spanZ} world cells over ${overview.width}x${overview.height} pixels`,
    caravan: false,
    simulation: false,
    nonClaims: WORLD_LAB_NON_CLAIMS,
  }, null, 2);
}

drawOverview();
const overviewMeasurement = {
  sampleCount: overview.sampleCount,
  checksum: overview.checksum,
  visualChecksum: overview.visualChecksum,
  footprint: overview.footprint,
  featureCounts: overview.featureCounts,
};
output.querySelector("[data-field=contract]").textContent = JSON.stringify({
  seed: spec.seed,
  generatorVersion: spec.generatorVersion,
  chunkSize: spec.chunkSize,
  bounds: overview.bounds,
  span: { x: overview.bounds.spanX, z: overview.bounds.spanZ },
  overviewSamples: overview.sampleCount,
  cellsPerPixel: overview.footprint,
  localScale: "80x80 pixels; one pixel = one world cell",
  source: overview.source,
  filtering: overview.filtering,
  namedFeatures: overview.featureCounts,
  visualChecksum: overviewMeasurement.visualChecksum,
  lifecycle: "synchronous main-thread provisional caller",
  identity: spec.identity,
}, null, 2);

for (const button of document.querySelectorAll("[data-cell]")) {
  button.addEventListener("click", () => {
    const [x, z] = button.dataset.cell.split(",").map(Number);
    focus = { label: button.dataset.label, x, z };
    center = { chunkX: floorDiv(x, spec.chunkSize), chunkZ: floorDiv(z, spec.chunkSize) };
    render();
  });
}

overviewCanvas.addEventListener("click", (event) => {
  const bounds = overviewCanvas.getBoundingClientRect();
  const column = Math.max(0, Math.min(overview.width - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * overview.width)));
  const row = Math.max(0, Math.min(overview.height - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * overview.height)));
  const cell = overviewPixelToWorldCell(overview, column, row);
  focus = { label: "Overview cell", x: cell.x, z: cell.z };
  center = { chunkX: floorDiv(cell.x, spec.chunkSize), chunkZ: floorDiv(cell.z, spec.chunkSize) };
  render();
});

render();
