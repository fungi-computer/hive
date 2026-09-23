import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5187/";
const output = process.argv[3] || "/tmp/hive-caps-style-proof";
await mkdir(output, { recursive: true });
const evidence = { url, output, errors: [] };
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on("pageerror", (error) => evidence.errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") evidence.errors.push(message.text());
});
page.setDefaultTimeout(15000);
const state = () => page.evaluate(() => window.__GOBLIN.state);
const point = (x, z, height = 0) =>
  page.evaluate(
    ([nextX, nextZ, nextHeight]) =>
      window.__GOBLIN.project(nextX, nextZ, nextHeight),
    [x, z, height],
  );

try {
  assert.equal((await page.goto(url)).status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 90000,
  });
  await page.waitForSelector('body[data-theme="mocha"] #hud .btn');
  assert.equal(
    await page
      .locator("#hud")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );

  const build = page
    .locator(".command-bar button")
    .filter({ hasText: /^Build/ });
  await build.click();
  assert.match(await build.getAttribute("class"), /btn-(secondary|outline)/);
  assert.equal(await build.getAttribute("aria-pressed"), "true");
  const rotate = page.locator("#rotate");
  assert.equal(await rotate.isDisabled(), true);
  const directionBeforeDisabled = (
    await page.evaluate(() => window.__GOBLIN.selection)
  ).direction;
  await rotate.evaluate((node) => {
    window.__disabledRotateClicks = 0;
    node.addEventListener("click", () => {
      window.__disabledRotateClicks += 1;
    });
  });
  await rotate.click({ force: true });
  assert.equal(await page.evaluate(() => window.__disabledRotateClicks), 0);
  assert.equal(
    (await page.evaluate(() => window.__GOBLIN.selection)).direction,
    directionBeforeDisabled,
  );
  evidence.disabled = "handler did not fire and direction did not change";

  await page.locator("#select-rowan").click();
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "select-rowan",
  );
  await page.locator("#routine").focus();
  const beforeRoutine = await state();
  await page.keyboard.press("Space");
  await page.waitForFunction(
    (wasRoutine) => window.__GOBLIN.state.actors.rowan.routine !== wasRoutine,
    beforeRoutine.actors.rowan.routine,
  );
  assert.equal((await state()).paused, beforeRoutine.paused);
  evidence.checkbox = "native focus and Space toggled routine without pausing";

  const tree = await point(3, 4, 1.5);
  await page.mouse.click(tree.x, tree.y);
  await page
    .getByRole("region", { name: "Oak actions", exact: true })
    .waitFor();
  const now = page.locator("#chop-now");
  const queued = page.locator("#chop-queued");
  assert.match(await now.getAttribute("class"), /btn-primary/);
  assert.match(await queued.getAttribute("class"), /btn-outline/);
  assert.equal(await now.isDisabled(), false);
  assert.equal(await queued.isDisabled(), false);
  await now.click();
  await page.waitForFunction(() => window.__GOBLIN.state.jobs.length > 0);
  evidence.command = "primary Chop action fired a command and created a job";
  await page.screenshot({ path: `${output}/normal.png` });

  await page.reload();
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 90000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForSelector('body[data-theme="mocha"] #hud .btn');
  const fits = await page.evaluate(
    () =>
      document.documentElement.scrollWidth <= innerWidth &&
      document.documentElement.scrollHeight <= innerHeight,
  );
  assert.equal(fits, true);
  assert.equal(await page.locator("#hud .caps-gooey-checkbox").count(), 1);
  await page.screenshot({ path: `${output}/narrow-390.png` });
  evidence.narrow = "390px viewport fits with live Caps Button and Checkbox";
  assert.deepEqual(evidence.errors, []);
  evidence.success = true;
} catch (error) {
  evidence.success = false;
  evidence.failure = String(error.stack || error);
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/proof.json`, JSON.stringify(evidence, null, 2));
  await context.close();
  await browser.close();
  console.log(JSON.stringify(evidence, null, 2));
}
