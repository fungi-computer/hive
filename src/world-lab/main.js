import {
  WORLD_LAB_NON_CLAIMS,
  createResidency,
  createWorldSpec,
  renderChunkBuffer,
  sampleOverview,
} from "./terrain.js";
import "./styles.css";

const spec = createWorldSpec();
const output = document.querySelector("#world-lab-output");
const overviewCanvas = document.querySelector("#world-lab-overview");
const localCanvas = document.querySelector("#world-lab-local");
const overviewContext = overviewCanvas.getContext("2d");
const localContext = localCanvas.getContext("2d");
const residency = createResidency(spec);
let center = { chunkX: 0, chunkZ: 0 };
let overviewMeasurement;

const colors = ["#31536a", "#809060", "#8a8770", "#789153"];
function drawOverview(overview) {
  const image = overviewContext.createImageData(overview.width, overview.height);
  for (let index = 0; index < overview.terrain.length; index += 1) {
    const color = colors[overview.terrain[index]].slice(1);
    image.data[index * 4] = parseInt(color.slice(0, 2), 16);
    image.data[index * 4 + 1] = parseInt(color.slice(2, 4), 16);
    image.data[index * 4 + 2] = parseInt(color.slice(4, 6), 16);
    image.data[index * 4 + 3] = 255;
  }
  overviewContext.putImageData(image, 0, 0);
}

function drawLocal() {
  const started = performance.now();
  const chunks = residency.loadWindow(center.chunkX, center.chunkZ);
  const buffer = renderChunkBuffer(spec, chunks);
  const image = localContext.createImageData(buffer.width, buffer.height);
  for (let index = 0; index < buffer.pixels.length; index += 1) {
    const color = colors[buffer.pixels[index]].slice(1);
    image.data[index * 4] = parseInt(color.slice(0, 2), 16);
    image.data[index * 4 + 1] = parseInt(color.slice(2, 4), 16);
    image.data[index * 4 + 2] = parseInt(color.slice(4, 6), 16);
    image.data[index * 4 + 3] = 255;
  }
  localContext.imageSmoothingEnabled = false;
  localContext.putImageData(image, 0, 0);
  return { chunks, buffer, renderMs: performance.now() - started };
}

function render() {
  const local = drawLocal();
  output.querySelector("[data-field=local]").textContent = JSON.stringify({
    center,
    generatedLocalRenderChunks: residency.stats().generatedChunks,
    residentLocalRenderChunks: residency.stats().residentChunks,
    renderCells: local.buffer.sampleCount,
    renderChecksum: local.buffer.checksum,
    renderMs: Number(local.renderMs.toFixed(3)),
  }, null, 2);
  output.querySelector("[data-field=claims]").textContent = JSON.stringify({
    generatedLocalRenderResidency: true,
    chunkKeysAreCacheOnly: true,
    caravan: false,
    simulation: false,
    nonClaims: WORLD_LAB_NON_CLAIMS,
  }, null, 2);
}

const overviewStart = performance.now();
const overview = sampleOverview(spec);
drawOverview(overview);
overviewMeasurement = { sampleCount: overview.sampleCount, checksum: overview.checksum, footprint: overview.footprint, featureCounts: overview.featureCounts, ms: performance.now() - overviewStart };
output.querySelector("[data-field=contract]").textContent = JSON.stringify({
  seed: spec.seed,
  generatorVersion: spec.generatorVersion,
  chunkSize: spec.chunkSize,
  bounds: overview.bounds,
  overviewSamples: overview.sampleCount,
  outputIndependentBounds: true,
  geographicFootprintPerPixel: overview.footprint,
  source: overview.source,
  filtering: overview.filtering,
  namedFeatures: overview.featureCounts,
  overviewMs: Number(overviewMeasurement.ms.toFixed(3)),
  lifecycle: "synchronous main-thread provisional caller",
  identity: spec.identity,
}, null, 2);

for (const button of document.querySelectorAll("[data-jump]")) {
  button.addEventListener("click", () => {
    const [chunkX, chunkZ] = button.dataset.jump.split(",").map(Number);
    center = { chunkX, chunkZ };
    render();
  });
}

document.querySelector("#world-lab-diagnostic").addEventListener("click", () => {
  const diagnostic = sampleOverview(spec, { width: 1024, height: 1024 });
  output.querySelector("[data-field=diagnostic]").textContent = JSON.stringify({
    status: "diagnostic-after-512",
    sampleCount: diagnostic.sampleCount,
    checksum: diagnostic.checksum,
    ms: "measured-on-demand",
  }, null, 2);
});

render();
