import {
  WORLD_LAB_NON_CLAIMS,
  createResidency,
  createWorldSpec,
  floorDiv,
  localViewport,
  namedFeatures,
  overviewRectForViewport,
  renderChunkBuffer,
  sampleOverview,
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

function drawLocalGrid() {
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
}

function drawLocal() {
  const started = performance.now();
  const chunks = residency.loadWindow(center.chunkX, center.chunkZ);
  const buffer = renderChunkBuffer(spec, chunks);
  localContext.imageSmoothingEnabled = false;
  drawSamples(localContext, { ...buffer, pixels: buffer.pixels });
  drawLocalGrid();
  return { buffer, viewport: localViewport(spec, center.chunkX, center.chunkZ), renderMs: performance.now() - started };
}

function render() {
  const local = drawLocal();
  drawViewportMarker(local.viewport);
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

render();
