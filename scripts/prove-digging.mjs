import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// One declared current-main fixture. No debug mutation or direct terrain edits.
const base = process.argv[2] ?? "http://127.0.0.1:5198/";
const output = process.argv[3] ?? ".botanical/goblin-wet/browser";
assert.equal(
  new URL(base).hostname,
  "127.0.0.1",
  "local coordinated preview only",
);
assert(process.env.CHROMIUM_PATH, "CHROMIUM_PATH required");
await mkdir(output, { recursive: true });
const evidence = {
  base,
  fixture: "paused exact [0,14,128], actual pawn cut, save/reload",
  errors: [],
  checks: [],
  browserClosed: false,
};
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, undefined, {
    timeout: 60000,
  });
  await page.locator("#reset").click();
  await page.waitForFunction(
    () => window.__GOBLIN.state.paused && window.__GOBLIN.state.tick === 0,
  );
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator("#dig-tool").click();
  const point = await page.evaluate(() => window.__GOBLIN.project(7, 9, 0, 0));
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() =>
    window.__GOBLIN.state.jobs.some((job) => job.kind === "dig"),
  );
  const admitted = await page.evaluate(() => window.__GOBLIN.state);
  assert.equal(admitted.tick, 0);
  assert.deepEqual(
    admitted.jobs.find((job) => job.kind === "dig").voxel,
    [0, 14, 128],
  );
  assert.equal(admitted.terrain.exports.length, 0);
  await writeFile(
    join(output, "admitted.json"),
    JSON.stringify(admitted, null, 2),
  );
  evidence.checks.push(
    "visible paused input admits exact generated voxel without physical advancement",
  );
  await page.locator("#pause").click();
  await page.waitForFunction(
    () => window.__GOBLIN.state.terrain.exports.length === 1,
    undefined,
    { timeout: 90000 },
  );
  await page.locator("#pause").click();
  await page.waitForFunction(() => window.__GOBLIN.state.paused);
  const completed = await page.evaluate(() => window.__GOBLIN.state);
  assert.equal(
    completed.materials.lots
      .filter((lot) => lot.material === "soil")
      .reduce((sum, lot) => sum + lot.quantity, 0),
    1,
  );
  assert(!completed.jobs.some((job) => job.kind === "dig"));
  assert(
    Math.abs(completed.terrain.soilState.timeS - completed.tick * 0.05) < 1e-8,
  );
  await writeFile(
    join(output, "completed.json"),
    JSON.stringify(completed, null, 2),
  );
  await page.screenshot({ path: join(output, "completed.png") });
  evidence.checks.push(
    "actual pawn completion yields one soil unit and finite wet export with joined clock",
  );
  await page.waitForFunction(
    () => window.__GOBLIN.persistence.phase === "saved",
    undefined,
    { timeout: 30000 },
  );
  await page.reload();
  await page.waitForFunction(() => window.__GOBLIN?.artReady, undefined, {
    timeout: 60000,
  });
  await page.locator("#continue").click();
  await page.waitForFunction(
    () => window.__GOBLIN.state.terrain.exports.length === 1,
  );
  const restored = await page.evaluate(() => window.__GOBLIN.state);
  assert.equal(restored.paused, true);
  assert.equal(restored.tick, completed.tick);
  assert.deepEqual(restored.terrain, completed.terrain);
  assert.deepEqual(restored.materials, completed.materials);
  await page.screenshot({ path: join(output, "restored.png") });
  evidence.checks.push(
    "browser Continue restores exact generated terrain/materials and stays paused",
  );
  assert.deepEqual(evidence.errors, []);
} finally {
  if (browser) {
    await browser.close();
    evidence.browserClosed = true;
  }
  await writeFile(
    join(output, "result.json"),
    JSON.stringify(evidence, null, 2),
  );
}
console.log(JSON.stringify(evidence));
