import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.env.HIVE_DEPTH_ACCEPTANCE_BASE ?? "http://127.0.0.1:5187/depth-feasibility-acceptance.html";
const output = resolve(process.env.HIVE_DEPTH_ACCEPTANCE_OUTPUT ?? ".botanical/depth-acceptance-prep-20260914");
const MAX_VISIBLE_ITEMS = 256;
const MAX_ESTIMATED_BYTES = 64 * 1024 * 1024;
const sourceFiles = [
  "scripts/prove-world-depth-acceptance.mjs",
  "src/studies/depth-feasibility/acceptance-page.js",
  "src/studies/depth-feasibility/world-depth-acceptance.js",
  "engine/src/client/world-depth-layer.js",
  "engine/src/client/world-depth.js",
  "engine/src/client/world-depth-items.js",
  "engine/src/client/terrain-layer.js",
  "engine/src/client/client.js",
  "engine/src/client/placement-preview.js",
  "src/art/static-pack.js",
  "public/generated-art/goblin-static-art-v4/manifest.json",
];

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
try {
  const browserStats = {
    readPixels: 0,
    sortCalls: 0,
    sortLengths: [],
    drawCalls: 0,
    animationFrames: 0,
  };
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  await page.addInitScript((initial) => {
    globalThis.__HIVE_DEPTH_BROWSER_STATS__ = initial;
    const stats = globalThis.__HIVE_DEPTH_BROWSER_STATS__;
    const sort = Array.prototype.sort;
    Array.prototype.sort = function (...args) {
      stats.sortCalls += 1;
      stats.sortLengths.push(this.length);
      return sort.apply(this, args);
    };
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === "function") {
      globalThis.requestAnimationFrame = (callback) => raf.call(globalThis, (time) => {
        stats.animationFrames += 1;
        callback(time);
      });
    }
    for (const name of ["WebGLRenderingContext", "WebGL2RenderingContext"]) {
      const ctor = globalThis[name];
      if (!ctor?.prototype) continue;
      const readPixels = ctor.prototype.readPixels;
      if (typeof readPixels === "function") {
        ctor.prototype.readPixels = function (...args) {
          stats.readPixels += 1;
          return readPixels.apply(this, args);
        };
      }
      for (const method of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
        const draw = ctor.prototype[method];
        if (typeof draw !== "function") continue;
        ctor.prototype[method] = function (...args) {
          stats.drawCalls += 1;
          return draw.apply(this, args);
        };
      }
    }
  }, browserStats);
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__HIVE_RETAINED_DEPTH_ACCEPTANCE__?.status === "rendered" || globalThis.__HIVE_RETAINED_DEPTH_ACCEPTANCE__?.status === "FAIL", null, { timeout: 120000 });
  const result = await page.evaluate(() => globalThis.__HIVE_RETAINED_DEPTH_ACCEPTANCE__);
  const required = result?.pointPicks;
  assert.equal(result?.status, "rendered");
  assert.equal(result.permutationStable, true);
  assert.equal(required?.bed?.entityId, "bed");
  assert.equal(required?.person?.entityId, "person-front");
  assert.equal(required?.bottom?.entityId, "stair-bottom");
  assert.equal(required?.mid?.entityId, "stair-mid");
  assert.equal(required?.landing?.entityId, "stair-landing");
  assert.equal(required?.opaque?.entityId, "opaque-wall");
  assert.equal(required?.opaque?.target, null);
  assert(result.waterFrontChanged > result.waterBehindChanged, "water depth ordering was not visible");

  const clientSource = readFileSync(resolve("engine/src/client/client.js"), "utf8");
  const depthRenderAt = clientSource.indexOf("worldDepthLayer.render(app.renderer)");
  const previewDrawAt = clientSource.indexOf("placementGraphic.visible =");
  const pickerAt = clientSource.indexOf("worldDepthLayer?.picker.pick");
  assert(depthRenderAt >= 0 && previewDrawAt > depthRenderAt, "placement preview is not composed after opaque depth");
  assert(pickerAt > depthRenderAt, "world picking does not use the shared depth owner");

  const browserFacts = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2");
    const stats = globalThis.__HIVE_DEPTH_BROWSER_STATS__;
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      bytes: entry.decodedBodySize || entry.encodedBodySize || entry.transferSize || 0,
    }));
    return {
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      webgl2: Boolean(gl),
      stats: {
        readPixels: stats?.readPixels ?? 0,
        sortCalls: stats?.sortCalls ?? 0,
        sortLengths: stats?.sortLengths ?? [],
        drawCalls: stats?.drawCalls ?? 0,
        animationFrames: stats?.animationFrames ?? 0,
      },
      resources,
      heap: performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
      } : null,
    };
  });
  assert.equal(browserFacts.webgl2, true, "D2-D5 requires WebGL2");
  assert.deepEqual(browserFacts.canvas, { width: 640, height: 400 });
  assert(result.candidates <= MAX_VISIBLE_ITEMS, "visible draw list exceeded bounded world-depth input");
  const maxSortLength = Math.max(0, ...browserFacts.stats.sortLengths);
  assert(maxSortLength <= MAX_VISIBLE_ITEMS, "sort input exceeded bounded visible draw list");
  const renderTargetBytes = 640 * 400 * 4 * 2;
  const estimatedOwnedBytes = result.atlasBytes + renderTargetBytes + result.candidates * 4096;
  assert(estimatedOwnedBytes <= MAX_ESTIMATED_BYTES, "owned depth resources exceeded acceptance bound");
  const receipt = {
    base,
    scope: "D2-D5 existing retained depth acceptance page and Pixi world-depth owner",
    webgl2: browserFacts.webgl2,
    result,
    counters: {
      ...browserFacts.stats,
      maxSortLength,
      readbackPolicy: "GPU readPixels count is reported; fixture readback is bounded and explicit",
    },
    memory: {
      atlasBytes: result.atlasBytes,
      renderTargetBytes,
      estimatedOwnedBytes,
      maxEstimatedBytes: MAX_ESTIMATED_BYTES,
      heap: browserFacts.heap,
      resourceBytes: browserFacts.resources.reduce((sum, resource) => sum + resource.bytes, 0),
    },
    previewOverlay: {
      sourceOwned: true,
      composedAfterOpaqueDepth: true,
      pickerRemainsDepthOwned: true,
    },
    resources: browserFacts.resources,
    sourceInventory: Object.fromEntries(sourceFiles.map((file) => [file, createHash("sha256").update(readFileSync(resolve(file))).digest("hex")])),
  };
  await page.screenshot({ path: resolve(output, "d2-d5.png"), fullPage: true });
  await writeFile(resolve(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
}
