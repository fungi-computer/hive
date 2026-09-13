import "./client.css";
import "@fungi.computer/caps/styles.css";
import "@fungi.computer/stipe/fonts.css";
import { createHiveClient } from "./client.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { Slider } from "@fungi.computer/caps/components/slider";
import { connectBrowserRuntime } from "../runtime/browser-client.js";
import { COLONY_VISUAL_BINDINGS } from "./visual-bindings.js";

const sizes = [64, 128, 256], workerCounts = [4, 8, 16, 32, 50];
const params = new URLSearchParams(location.search);
const size = sizes.includes(Number(params.get("size"))) ? Number(params.get("size")) : 64;
const workers = workerCounts.includes(Number(params.get("workers"))) ? Number(params.get("workers")) : 8;
const root = document.querySelector("#hive-app");
let runtime;
let metrics = { stepCpuMs: null, routeRequests: null, assignmentCost: null, snapshotBytes: null, activeWaterWork: null, activeGasWork: null, wireBytes: 0 };
let woodOutput = 0, lastWood = 0;

function format(value, suffix = "") { return value === null ? "Unavailable" : `${typeof value === "number" ? value.toFixed(value < 10 ? 2 : 0) : value}${suffix}`; }
function setPreset(nextSize, nextWorkers) {
  const next = new URL(location.href);
  next.searchParams.set("size", nextSize); next.searchParams.set("workers", nextWorkers);
  location.href = next.href;
}
function panel(hud) {
  const wrap = document.createElement("section");
  wrap.className = "colony-performance-panel";
  wrap.innerHTML = `<div class="hive-kicker">HIVE / COLONY PERFORMANCE</div><h2>Real Colony workload</h2><p>Finite tree felling and wood output through the current work and libcolony systems.</p>
    <label>World bounds <select id="perf-size">${sizes.map(value => `<option value="${value}" ${value === size ? "selected" : ""}>${value} × ${value}</option>`).join("")}</select></label>
    <label>Workers <span id="perf-workers-slider"></span><output>${workers}</output></label>
    <div class="perf-links">${sizes.map(value => `<a href="?size=${value}&workers=${workers}">${value}×${value}</a>`).join("")}</div>
    <dl><dt>Simulation step CPU</dt><dd id="perf-step">Unavailable</dd><dt>Assignment cost</dt><dd id="perf-assignment">Unavailable</dd><dt>Route requests</dt><dd id="perf-routes">Unavailable</dd><dt>Wood output</dt><dd id="perf-jobs">0</dd><dt>Active water workload</dt><dd id="perf-water">Unavailable</dd><dt>Active gas workload</dt><dd id="perf-gas">Unavailable</dd><dt>Snapshot bytes</dt><dd id="perf-snapshot">Unavailable</dd><dt>Wire / observation bytes</dt><dd id="perf-wire">0 B</dd></dl>
    <p class="perf-boundary">Resident projection: 64×64 columns for every preset. Larger bounds stay generated and authoritative in the kernel; the client never requests the whole surface.</p>`;
  hud.prepend(wrap);
  wrap.querySelector("#perf-size").addEventListener("change", event => setPreset(Number(event.target.value), workers));
  const output = wrap.querySelector("output");
  createRoot(wrap.querySelector("#perf-workers-slider")).render(React.createElement(Slider, {
    type: "range", min: 0, max: 4, step: 1, defaultValue: workerCounts.indexOf(workers),
    onChange: event => { output.value = workerCounts[Number(event.target.value)]; },
    onPointerUp: event => setPreset(size, workerCounts[Number(event.currentTarget.value)]),
    onKeyUp: event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) setPreset(size, workerCounts[Number(event.currentTarget.value)]); },
  }));
  return wrap;
}
function update(wrap) {
  wrap.querySelector("#perf-step").textContent = format(metrics.stepCpuMs, " ms");
  wrap.querySelector("#perf-assignment").textContent = format(metrics.assignmentCost);
  wrap.querySelector("#perf-routes").textContent = format(metrics.routeRequests);
  wrap.querySelector("#perf-jobs").textContent = String(woodOutput);
  wrap.querySelector("#perf-water").textContent = format(metrics.activeWaterWork);
  wrap.querySelector("#perf-gas").textContent = format(metrics.activeGasWork);
  wrap.querySelector("#perf-snapshot").textContent = format(metrics.snapshotBytes, " B");
  wrap.querySelector("#perf-wire").textContent = `${metrics.wireBytes.toLocaleString()} B`;
}
function mount() {
  runtime = connectBrowserRuntime({ worker: new Worker(new URL("../runtime/performance-worker-entry.ts", import.meta.url), {
    type: "module", name: `colony-performance:${size}:${workers}`,
  }) });
  const persistence = { online: false, statusLabel: "Local performance run", save() {}, continue() {}, newWorld(callback) { callback(false); } };
  root.className = "hive-shell";
  createHiveClient({ root, mode: `colony-performance-${size}-${workers}`, title: `${size}×${size} Colony`, subtitle: "Workers fell many finite trees and report measured runtime work.", source: "./source/colony.ts", runtime, persistence, visualBindings: COLONY_VISUAL_BINDINGS, controlHelp: "Select workers and trees to inspect the live workload." });
  const hud = root.querySelector(".hive-hud");
  const rail = document.createElement("div");
  rail.className = "hive-hud-rail";
  hud.replaceWith(rail);
  rail.append(hud);
  const wrap = panel(rail);
  runtime.subscribe(event => {
    metrics.wireBytes += new TextEncoder().encode(JSON.stringify(event)).byteLength;
    if (event.type === "results" && event.metrics) metrics = { ...metrics, ...event.metrics };
    if (event.type === "frame") {
      const wood = event.facts.reduce((sum, fact) => sum + (fact.inventory?.items ?? []).filter(item => item.kind === "wood").reduce((n, item) => n + item.quantity, 0), 0);
      if (wood > lastWood) woodOutput += wood - lastWood;
      lastWood = wood;
    }
    update(wrap);
  });
}
mount();
