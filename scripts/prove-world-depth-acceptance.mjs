import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.env.HIVE_DEPTH_ACCEPTANCE_BASE ?? "http://127.0.0.1:5187/depth-feasibility-acceptance.html";
const output = resolve(process.env.HIVE_DEPTH_ACCEPTANCE_OUTPUT ?? ".botanical/depth-acceptance-prep-20260914");
const MAX_VISIBLE_ITEMS = 256;
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
let page;
let receipt = {
  status: "RUNNING",
  base,
  scope: "D2-D5 existing retained depth acceptance page and Pixi world-depth owner",
};

try {
  page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
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

  const browserFacts = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2");
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      bytes: entry.decodedBodySize || entry.encodedBodySize || entry.transferSize || 0,
    }));
    return {
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      webgl2: Boolean(gl),
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
  assert.equal(result.diagnostics?.opaque?.active, 0, "opaque records were not released after the empty-scene lifecycle check");
  assert.equal(result.diagnostics?.transparent?.active, 0, "transparent records were not released after the empty-scene lifecycle check");
  assert(result.diagnostics?.opaque?.created <= result.candidates + 1, "opaque resource creation exceeded fixture bound");
  const renderTargetBytes = 640 * 400 * 4 * 2;

  receipt = {
    status: "PASS",
    base,
    scope: "D2-D5 existing retained depth acceptance page and Pixi world-depth owner",
    webgl2: browserFacts.webgl2,
    result,
    ownerBounds: {
      candidates: result.candidates,
      maxVisibleItems: MAX_VISIBLE_ITEMS,
      diagnostics: result.diagnostics,
      evidence: "world-depth-layer diagnostics and the existing fixture's bounded draw list",
    },
    memory: {
      atlasBytes: result.atlasBytes,
      renderTargetBytes,
      knownOwnedBytes: result.atlasBytes + renderTargetBytes,
      limitation: "Mesh, shader, and driver allocations are reported through lifecycle counts and browser heap; no unsupported per-record byte estimate is invented.",
      heap: browserFacts.heap,
      resourceBytes: browserFacts.resources.reduce((sum, resource) => sum + resource.bytes, 0),
    },
    resources: browserFacts.resources,
    sourceInventory: Object.fromEntries(sourceFiles.map((file) => [file, createHash("sha256").update(readFileSync(resolve(file))).digest("hex")])),
  };
  await page.screenshot({ path: resolve(output, "d2-d5.png"), fullPage: true });
  await writeFile(resolve(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} catch (error) {
  receipt = {
    ...receipt,
    status: "FAIL",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
  await writeFile(resolve(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  throw error;
} finally {
  await page?.close();
  await browser.close();
}
