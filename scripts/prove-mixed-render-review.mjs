import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:5187/engine/mixed-render-review.html";
const output = process.argv[3] ?? ".botanical/mixed-render-review";
await mkdir(output, { recursive: true });
const errors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => errors.push(String(error)));
  page.on("requestfailed", request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  const response = await page.goto(url, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  let snapshot = await page.evaluate(() => window.__MIXED_RENDER_REVIEW.snapshot());
  assert.equal(snapshot.camera, "north");
  assert.ok(snapshot.recordCount > 100);
  assert.ok(snapshot.alphaHitRecords >= 10);
  for (const role of ["actor", "structure", "terrain", "terrain-cover", "water", "build-guide"])
    assert.ok(snapshot.roles.includes(role), `missing ${role}`);
  await page.screenshot({ path: `${output}/north.png`, fullPage: true });
  await page.selectOption("#focus", "bed");
  await page.screenshot({ path: `${output}/bed.png`, fullPage: true });
  await page.selectOption("#focus", "stair");
  for (const orientation of ["east", "west"]) {
    await page.selectOption("#object", orientation);
    await page.waitForTimeout(200);
    snapshot = await page.evaluate(() => window.__MIXED_RENDER_REVIEW.snapshot());
    assert.equal(snapshot.object, orientation);
    assert.equal(snapshot.recordCount, 162);
    await page.screenshot({ path: `${output}/object-${orientation}-stair.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ url, ...snapshot, errors }));
} finally {
  await browser.close();
}
