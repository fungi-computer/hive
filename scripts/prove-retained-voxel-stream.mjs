import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:5187/engine/colony.html?game=colony&runtime=local&diagnostics=draw";
const output = process.argv[3] ?? ".botanical/retained-voxel-stream";
await mkdir(output, { recursive: true });
const errors = [], badResponses = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });

const percentile = (values, quantile) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * quantile))];
};

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => errors.push(String(error)));
  page.on("requestfailed", request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", response => { if (response.status() >= 400 && !response.url().endsWith("favicon.ico"))
    badResponses.push(`${response.status()} ${response.url()}`); });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__HIVE_DRAW_DIAGNOSTICS?.().visibleDrawRecords === 5774,
    { timeout: 120_000 });
  await page.waitForTimeout(5_000);
  const diagnostics = await page.evaluate(() => window.__HIVE_DRAW_DIAGNOSTICS());
  const dynamic = diagnostics.voxelDraw.samples.dynamicInsertMs.slice(-120);
  assert(dynamic.length >= 30, "need at least 30 retained-frame samples");
  assert.equal(diagnostics.visibleDrawRecords, 5774, "the accepted scene must not reduce its record count");
  assert(diagnostics.voxelDraw.counts.staticRebuild <= 2, "animation must not rebuild static terrain");
  assert(diagnostics.voxelDraw.counts.applyOrder <= 2, "unchanged animation frames must not repack terrain");
  assert.deepEqual(errors, []);
  assert.deepEqual(badResponses, []);
  const receipt = Object.freeze({ url, viewport: Object.freeze({ width: 1440, height: 1000 }),
    recordCount: diagnostics.visibleDrawRecords, counts: diagnostics.voxelDraw.counts,
    totalsMs: diagnostics.voxelDraw.times, dynamicInsert: Object.freeze({ samples: dynamic.length,
      p50Ms: percentile(dynamic, 0.50), p95Ms: percentile(dynamic, 0.95), maxMs: Math.max(...dynamic) }),
    errors, badResponses });
  await page.screenshot({ path: `${output}/playable.png`, fullPage: true });
  await writeFile(`${output}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
}
