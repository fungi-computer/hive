#!/usr/bin/env node
/*
 * Browser proof for the already-built Colony performance page.
 *
 * This driver consumes a URL; it never starts a server, builds the page, or
 * changes game/runtime code. The page owns the workload and its measurements.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const SIZES = [64, 128, 256, 512];
const WORKERS = [4, 8, 16, 32, 50, 100, 200];
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  assert(key?.startsWith("--"), `unexpected argument: ${key}`);
  args.set(key, process.argv[++index]);
}
const baseArgument = args.get("--base-url");
const outputArgument = args.get("--output");
const size = Number(args.get("--size"));
const workers = Number(args.get("--workers"));
assert(baseArgument && outputArgument, "usage: node tools/public-engine-host/performance-browser-proof.mjs --base-url <url> --output <dir> --size <64|128|256|512> --workers <4|8|16|32|50|100|200>");
assert(SIZES.includes(size), `unsupported size preset: ${size}`);
assert(WORKERS.includes(workers), `unsupported worker preset: ${workers}`);

const base = new URL(baseArgument);
const pageUrl = new URL(base);
if (!pageUrl.pathname.endsWith("/engine/colony-performance.html")) {
  pageUrl.pathname = `${pageUrl.pathname.replace(/\/$/, "")}/engine/colony-performance.html`;
}
pageUrl.search = new URLSearchParams({ size: String(size), workers: String(workers), diagnostics:"draw" }).toString();
const output = resolve(outputArgument);
const root = resolve(new URL("../..", import.meta.url).pathname);
const sourcePaths = [
  "tools/public-engine-host/performance-browser-proof.mjs",
  "engine/colony-performance.html",
  "engine/src/client/performance-page.js",
  "engine/src/games/colony-performance.ts",
  "engine/src/runtime/remote-client.ts",
  "engine/src/client/performance-observer.js",
  "tools/public-engine-host/worker.ts",
].sort();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHashes = [];
for (const relativePath of sourcePaths) {
  const bytes = await readFile(resolve(root, relativePath));
  sourceHashes.push({ path: relativePath, sha256: sha256(bytes) });
}

const report = {
  proof: "colony-performance-browser",
  url: pageUrl.toString(),
  selectedPreset: { size, workers },
  workload: {
    kind: "finite-tree-felling",
    trees: 50,
    woodPerTree: 6,
    description: "The Colony performance page queues 50 finite trees for the selected party; observed wood output proves that this workload is live.",
  },
  output,
  sourceHashes,
  screenshot: "performance-browser.png",
  assertions: [],
  errors: [],
  measurements: null,
  success: false,
};
const record = (name, details = {}) => report.assertions.push({ name, ...details });
let browser;
let context;
let page;
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  const browserWorkers = [], sockets = [];
  page.on("worker", worker => browserWorkers.push(worker.url()));
  page.on("websocket", socket => sockets.push(new URL(socket.url()).origin));
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => report.errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") report.errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", (request) => report.errors.push(`request: ${request.url()} · ${request.failure()?.errorText ?? "failed"}`));
  page.on("response", (response) => { if (response.status() >= 400) report.errors.push(`response: ${response.status()} ${response.url()}`); });

  const response = await page.goto(pageUrl.toString(), { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, `performance page returned ${response?.status()}`);
  await page.locator("canvas").first().waitFor({ state: "visible" });
  const canvas = await page.locator("canvas").first().evaluate((element) => ({
    width: element.width, height: element.height, clientWidth: element.clientWidth, clientHeight: element.clientHeight,
  }));
  assert(canvas.width > 0 && canvas.height > 0 && canvas.clientWidth > 0 && canvas.clientHeight > 0, "Pixi canvas has no rendered size");
  record("pixi-canvas", canvas);

  await page.getByText("Online · server saved", { exact:true }).first().waitFor();
  await page.waitForFunction(() => {
    const data = window.__HIVE_PERFORMANCE_DIAGNOSTICS?.();
    return data?.source === "durable-object" && data.stumps > 0 && data.observationGap?.samples >= 30;
  }, null, { timeout: 180_000 });
  const measurements = await page.evaluate(() => window.__HIVE_PERFORMANCE_DIAGNOSTICS());
  assert(measurements.simulationRate > 0, "authoritative simulation did not advance");
  assert(measurements.terrainRoundTrip?.samples > 0, "no remote terrain was requested");
  assert.equal(browserWorkers.length,0,"performance page started a browser Worker");
  assert(sockets.length > 0,"no remote world socket");
  report.measurements = measurements;
  record("server-owned-finite-workload", { felledTrees:measurements.stumps, woodInventory:measurements.wood, browserWorkers, socketOrigins:sockets });
  await page.getByRole("button", { name:"Pause", exact:true }).click();
  record("pause-requested");
  await page.waitForFunction(() => window.__HIVE_PERFORMANCE_DIAGNOSTICS().paused);
  record("pause-acknowledged");
  const paused = await page.evaluate(() => window.__HIVE_PERFORMANCE_DIAGNOSTICS().simulationTime);
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => window.__HIVE_PERFORMANCE_DIAGNOSTICS().simulationTime),paused);
  await page.getByRole("button", { name:"Resume", exact:true }).click();
  record("resume-requested");
  await page.waitForFunction(time => window.__HIVE_PERFORMANCE_DIAGNOSTICS().simulationTime > time,paused);
  record("remote-pause-resume");
  await page.locator(".hive-hud-rail").evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: resolve(output, report.screenshot), fullPage: true });
  assert.equal(report.errors.length, 0, `page/request errors: ${report.errors.join("; ")}`);
  report.success = true;
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
  report.failureState = await page?.evaluate(() => ({body:document.body.innerText, performance:window.__HIVE_PERFORMANCE_DIAGNOSTICS?.()})).catch(()=>null);
} finally {
  if (context) await context.close().catch((error) => report.errors.push(`context close: ${error.message}`));
  if (browser) await browser.close().catch((error) => report.errors.push(`browser close: ${error.message}`));
  await writeFile(resolve(output, "source-hashes.json"), JSON.stringify(sourceHashes, null, 2));
  await writeFile(resolve(output, "REPORT.json"), `${JSON.stringify(report, null, 2)}\n`);
}
if (!report.success) process.exitCode = 1;
