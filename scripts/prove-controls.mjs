import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/controls-first-dist";
await mkdir(output, { recursive: true });
const evidence = {
  url,
  scope: (await readFile("/proc/self/cgroup", "utf8")).trim(),
  errors: [],
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.on("pageerror", (e) => evidence.errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") evidence.errors.push(m.text());
});
page.on("requestfailed", (r) =>
  evidence.errors.push(`${r.url()}: ${r.failure()?.errorText}`),
);
page.setDefaultTimeout(15000);
const state = () => page.evaluate(() => window.__GOBLIN.state);
const wait = (fn) => page.waitForFunction(fn, null, { timeout: 45000 });
const shot = (name) => page.screenshot({ path: `${output}/${name}.png` });
async function point(x, z, height = 0) {
  return page.evaluate(
    ([x, z, height]) => window.__GOBLIN.project(x, z, height),
    [x, z, height],
  );
}
async function click(x, z, height = 0, button = "left") {
  const p = await point(x, z, height);
  await page.mouse.click(p.x, p.y, { button });
}
async function viewportFits() {
  assert.deepEqual(
    await page.locator("#stage canvas").evaluate((canvas) => {
      const r = canvas.getBoundingClientRect();
      return [
        r.x,
        r.y,
        r.width,
        r.height,
        document.documentElement.scrollWidth <= innerWidth,
        document.documentElement.scrollHeight <= innerHeight,
      ];
    }),
    [
      0,
      0,
      (await page.viewportSize()).width,
      (await page.viewportSize()).height,
      true,
      true,
    ],
  );
}
try {
  assert.equal((await page.goto(url)).status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 90000,
  });
  await viewportFits();
  await shot("01-full-viewport");
  await click(7, 10, 1);
  await page.getByRole("region", { name: "Character", exact: true }).waitFor();
  await shot("02-rowan-inspector");
  await page.keyboard.press("b");
  await page.locator('[data-build="wall"]').click();
  const wall = await point(7, 5);
  await page.mouse.move(wall.x, wall.y);
  await shot("03-blueprint-ghost");
  await page.keyboard.press("r");
  assert.equal(
    await page.evaluate(() => window.__GOBLIN.selection.direction),
    1,
  );
  await page.mouse.click(wall.x, wall.y);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await wait(() => window.__GOBLIN.state.jobs[0]?.reason?.includes("wood"));
  await click(3, 4, 1.5, "right");
  await page
    .getByRole("region", { name: "Oak actions", exact: true })
    .waitFor();
  await shot("04-contextual-chop");
  await page.keyboard.press("c");
  await wait(() => window.__GOBLIN.state.pawn.mode === "chop");
  await page.keyboard.press("o");
  const order = page.locator('#orders [data-action="next"]').first();
  await order.focus();
  await page.evaluate(() => {
    window.__focusedOrder = document.activeElement;
  });
  evidence.chopping = await state();
  assert.equal(evidence.chopping.assignment.character, "rowan");
  await shot("05-chopping-orders");
  // The waiting wall becomes active after chopping: the row text really changes.
  await wait(() =>
    document
      .querySelector("#orders li:first-child")
      ?.classList.contains("active-order"),
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.activeElement === window.__focusedOrder &&
        document.activeElement.isConnected,
    ),
    true,
  );
  evidence.focusSurvivedActivityChange = true;
  await page.keyboard.press("Escape");
  await wait(() => document.activeElement === document.querySelector("#game"));
  await page.keyboard.press("b");
  await page.getByRole("region", { name: "Build", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Space");
  await wait(() => window.__GOBLIN.state.paused);
  evidence.paused = await state();
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.__pausedMutations = 0;
    window.__pauseObserver = new MutationObserver((records) => {
      window.__pausedMutations += records.length;
    });
    window.__pauseObserver.observe(document.querySelector("#hud"), {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });
  await page.waitForTimeout(500);
  assert.deepEqual(await state(), evidence.paused);
  evidence.pausedHudMutations = await page.evaluate(() => {
    window.__pauseObserver.disconnect();
    return window.__pausedMutations;
  });
  assert.equal(evidence.pausedHudMutations, 0);
  await shot("06-paused");
  await page.keyboard.press("Space");
  await wait(
    () =>
      window.__GOBLIN.state.sites[0]?.finishedAt !== null &&
      window.__GOBLIN.state.jobs.length === 0,
  );
  evidence.finished = await state();
  assert.equal(evidence.finished.felled, 1);
  assert.equal(
    evidence.finished.piles.reduce((n, p) => n + p.amount, 0),
    5,
  );
  assert.equal(evidence.finished.pawn.carry, 0);
  assert.equal(evidence.finished.assignment, null);
  assert.equal(evidence.finished.sites.length, 1);
  assert.equal(evidence.finished.sites[0].type, "wall");
  assert.ok(evidence.finished.sites[0].finishedAt > 0);
  await shot("07-wall-finished");
  // Holding a toggle key opens once. A camera move cancels pending placement.
  await page.keyboard.down("b");
  await page.keyboard.down("b");
  await page.keyboard.up("b");
  await page.getByRole("region", { name: "Build", exact: true }).waitFor();
  await page.locator('[data-build="wall"]').click();
  const drag = await point(8, 5);
  await page.mouse.move(drag.x, drag.y);
  await page.mouse.down();
  await page.keyboard.press("ArrowLeft");
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.equal((await state()).sites.length, 1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await click(10, 3, 1.5);
  await page
    .getByRole("region", { name: "Oak actions", exact: true })
    .waitFor();
  await page.keyboard.press("f");
  await page
    .getByRole("region", { name: "Oak actions", exact: true })
    .waitFor({ state: "hidden" });
  const beforePan = await point(10, 3, 1.5);
  await page.keyboard.press("ArrowLeft");
  const afterPan = await point(10, 3, 1.5);
  assert.equal(afterPan.x - beforePan.x, 24);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await click(10, 3, 1.5);
  await page.locator("#chop").click();
  await wait(
    () =>
      window.__GOBLIN.state.felled === 2 &&
      window.__GOBLIN.state.jobs.length === 0,
  );
  evidence.second = await state();
  assert.equal(
    evidence.second.piles.reduce((n, p) => n + p.amount, 0),
    11,
  );
  await shot("08-camera-second-chop");
  await page
    .getByRole("button", { name: "Open game menu", exact: true })
    .click();
  await page.locator("#reset").click();
  await page.locator("#pause").click();
  evidence.reset = await state();
  assert.equal(evidence.reset.felled, 0);
  assert.equal(evidence.reset.sites.length, 0);
  assert.equal(evidence.reset.jobs.length, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await viewportFits();
  await shot("09-mobile-native");
  await page.locator("#select").click();
  await shot("10-mobile-inspector");
  // Fresh narrow load exercises its own initial camera, not a resized desktop.
  await page.reload();
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 90000,
  });
  await viewportFits();
  await page.locator("#select").click();
  await shot("11-mobile-fresh-inspector");
  // The real checkbox retains native keyboard behavior and blocks world keys.
  await page.locator("#routine").focus();
  await page.keyboard.press("b");
  assert.equal(
    await page.evaluate(() => window.__GOBLIN.selection.panel),
    "character",
  );
  await page.keyboard.press("Space");
  await wait(() => window.__GOBLIN.state.routine);
  assert.equal((await state()).paused, false);
  evidence.nativeCheckbox = true;
  evidence.heapBytes = await page.evaluate(
    () => window.__GOBLIN.colony.HEAPU8.length,
  );
  assert.equal(evidence.heapBytes, 16777216);
  assert.deepEqual(evidence.errors, []);
  evidence.success = true;
} catch (error) {
  evidence.success = false;
  evidence.failure = String(error.stack || error);
  await shot("failure").catch(() => {});
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  evidence.browserClosed = true;
  await writeFile(`${output}/proof.json`, JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({
      success: evidence.success,
      errors: evidence.errors,
      failure: evidence.failure,
      scope: evidence.scope,
      output,
    }),
  );
}
