import "./client.css";
import "@fungi.computer/caps/styles.css";
import "@fungi.computer/stipe/styles.css";
import { createHiveClient } from "./client.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { Slider } from "@fungi.computer/caps/components/slider";
import { connectRemoteRuntime } from "../runtime/remote-client.ts";
import { createConnectionChoice } from "./connection-choice.js";
import { createPerformanceObserver } from "./performance-observer.js";
import { colonyPlacement } from "../games/colony-placement.ts";
import { colonyPlacementCandidates } from "../games/colony-building.ts";
import { COLONY_VISUAL_BINDINGS } from "./visual-bindings.js";
import { colonyPack } from "../games/colony.ts";
import { colonyPerformanceGameId, colonyPerformanceSizes, colonyPerformanceWorkerCounts } from "../games/colony-performance-config.ts";


const sizes = colonyPerformanceSizes, workerCounts = colonyPerformanceWorkerCounts;
const params = new URLSearchParams(location.search);
const size = sizes.includes(Number(params.get("size"))) ? Number(params.get("size")) : 64;
const workers = workerCounts.includes(Number(params.get("workers"))) ? Number(params.get("workers")) : 8;
const root = document.querySelector("#hive-app");
const observer = createPerformanceObserver();
function format(value, suffix = "") { return value === null || value === undefined ? "Waiting for data" : `${Number(value).toFixed(1)}${suffix}`; }
function timing(value) { return value ? `${format(value.median, " ms")} median · ${format(value.p95, " ms")} p95 (${value.samples} samples)` : "Waiting for data"; }
function setPreset(nextSize, nextWorkers) {
  const next = new URL(location.href);
  next.searchParams.set("size", nextSize); next.searchParams.set("workers", nextWorkers);
  location.href = next.href;
}
function panel(hud) {
  const wrap = document.createElement("section");
  wrap.className = "colony-performance-panel";
  wrap.innerHTML = `<div class="hive-kicker">HIVE / COLONY PERFORMANCE</div><h2>Durable Object workload</h2><p>Server-owned Colony simulation, durable transactions and the shared game renderer. Each preset has its own private world.</p>
    <label>World bounds <select id="perf-size">${sizes.map(value => `<option value="${value}" ${value === size ? "selected" : ""}>${value} × ${value}</option>`).join("")}</select></label>
    <label>Workers <span id="perf-workers-slider"></span><output>${workers}</output></label>
    <div class="perf-links">${sizes.map(value => `<a href="?size=${value}&workers=${workers}">${value}×${value}</a>`).join("")}</div>
    <dl>
      <dt>Simulation / real time</dt><dd id="perf-rate">Waiting for data</dd>
      <dt>Observed server revision</dt><dd id="perf-sequence">Waiting for data</dd>
      <dt>Observation interval</dt><dd id="perf-observation">Waiting for data</dd>
      <dt>HTTP round trip</dt><dd id="perf-http">Waiting for data</dd>
      <dt>Terrain stream</dt><dd id="perf-terrain">Waiting for data</dd>
      <dt>Received payload</dt><dd id="perf-wire">0 B</dd>
      <dt>Workers observed / moving</dt><dd id="perf-workers">Waiting for data</dd>
      <dt>Felled trees observed</dt><dd id="perf-stumps">0</dd>
      <dt>Observed wood inventory</dt><dd id="perf-jobs">0</dd>
      <dt>Client draw-order work</dt><dd id="perf-render">Waiting for data</dd>
      <dt>Client retained scene</dt><dd id="perf-retained">Waiting for data</dd>
      <dt>DO CPU time</dt><dd>Not available from the page; requires Cloudflare platform telemetry.</dd>
    </dl>
    <p class="perf-boundary">The finite workload has 50 trees in the central 64×64 area. Terrain and grass load around your camera across the selected world bounds. This tests the real DO workload and exploration; it does not establish sustained capacity at the selected worker count.</p>`;
  hud.prepend(wrap);
  wrap.querySelector("#perf-size").addEventListener("change", event => setPreset(Number(event.target.value), workers));
  const output = wrap.querySelector("output");
  createRoot(wrap.querySelector("#perf-workers-slider")).render(React.createElement(Slider, {
    type: "range", min: 0, max: workerCounts.length - 1, step: 1, defaultValue: workerCounts.indexOf(workers),
    onChange: event => { output.value = workerCounts[Number(event.target.value)]; },
    onPointerUp: event => setPreset(size, workerCounts[Number(event.currentTarget.value)]),
    onKeyUp: event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) setPreset(size, workerCounts[Number(event.currentTarget.value)]); },
  }));
  return wrap;
}
function update(wrap, client) {
  const render = client.diagnostics().spatialDraw, data = observer.snapshot(render.coverage);
  wrap.dataset.runtime = "durable-object";
  wrap.querySelector("#perf-rate").textContent = format(data.simulationRate, " simulated seconds / real second");
  wrap.querySelector("#perf-rate").dataset.value = data.simulationRate ?? "";
  wrap.querySelector("#perf-sequence").textContent = data.sequence ?? "Waiting for data";
  wrap.querySelector("#perf-observation").textContent = timing(data.observationGap);
  wrap.querySelector("#perf-http").textContent = timing(data.httpRoundTrip);
  const terrain = data.terrainStream;
  wrap.querySelector("#perf-terrain").textContent = `${format(terrain.firstPatchMs, " ms to first patch")} · ${terrain.receivedPatches} patches · ${terrain.receivedBytes.toLocaleString()} B patch payload · ${terrain.requests} streams${terrain.pending ? " · loading" : ""}${terrain.error ? ` · ${terrain.error}` : ""}`;
  wrap.querySelector("#perf-wire").textContent = `${data.receivedBytes.toLocaleString()} B · ${data.requests} HTTP requests · ${data.failedRequests} failed`;
  wrap.querySelector("#perf-workers").textContent = `${data.observedWorkers} / ${data.movingWorkers}`;
  wrap.querySelector("#perf-jobs").textContent = String(data.wood);
  wrap.querySelector("#perf-stumps").textContent = String(data.stumps);
  const structural = render.latest ?? {};
  wrap.querySelector("#perf-render").textContent = `${render.published} structural publications · ${format(render.preparationMs, " ms total preparation")} · ${structural.sparseCandidates ?? 0} local sparse candidates · ${structural.densePairComparisons ?? 0} dense pair checks`;
  wrap.querySelector("#perf-retained").textContent = `${render.retained.records} records · ${render.retained.denseLayout} dense slots · ${terrain.cachedRegions}/${terrain.capacity} cached regions · ${terrain.readyVisibleRegions}/${terrain.visibleRegions} visible · ${terrain.readyRegions}/${terrain.requestedRegions} with padding · ${terrain.retainedBytes.toLocaleString()}/${terrain.maxBytes.toLocaleString()} B retained payload`;
}
function mount() {
  const gameId = colonyPerformanceGameId(size, workers);
  if (params.get("runtime") === "local") throw new Error("This performance page tests Durable Objects. Remove runtime=local.");
  const connection = createConnectionChoice({ mode: gameId, runtime: "remote",
    publicHost: import.meta.env.VITE_HIVE_PUBLIC_HOST,
    connectRemote: options => connectRemoteRuntime({ ...options, onTransport: sample => observer.transport(sample) }),
  });
  root.className = "hive-shell";
  // Subscribe before starting the shared client so initial state is measured.
  const unsubscribe = connection.runtime.subscribe(event => observer.event(event));
  const client = createHiveClient({ root, mode: gameId, commandDefinitions: colonyPack.commands,
    title: `${size}×${size} Colony · DO`, subtitle: "The server runs the world. Your browser draws it.",
    source: "./source/colony.ts", runtime:connection.runtime, persistence:connection.persistence,
    visualBindings:COLONY_VISUAL_BINDINGS, placementVisuals:colonyPlacement, placementCandidates:colonyPlacementCandidates,
    orderCommand:"go", controlHelp:"Select a worker, choose Draft, then right-click to move. Pause isolates camera work from simulation." });
  const hud = root.querySelector(".hive-hud"), rail = document.createElement("div");
  rail.className = "hive-hud-rail"; hud.replaceWith(rail); rail.append(hud);
  const wrap = panel(rail);
  const timer = setInterval(() => update(wrap, client), 1000);
  update(wrap, client);
  if (params.get("diagnostics") === "draw") {
    window.__HIVE_DRAW_DIAGNOSTICS = query => client.diagnostics(query);
    window.__HIVE_PERFORMANCE_DIAGNOSTICS = () => observer.snapshot(client.diagnostics().spatialDraw.coverage);
  }
  window.addEventListener("pagehide", () => { clearInterval(timer); unsubscribe(); client.dispose(); }, { once:true });
}
try { mount(); }
catch (error) {
  root.textContent = `DO performance unavailable: ${error.message}`;
}
