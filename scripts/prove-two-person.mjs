import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5187/";
const output = process.argv[3] || ".botanical/two-person-home";
await mkdir(output, { recursive: true });

const evidence = { url, errors: [], screenshots: [] };
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
page.setDefaultTimeout(20_000);
page.on("pageerror", (error) => evidence.errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") evidence.errors.push(message.text());
});
page.on("requestfailed", (request) =>
  evidence.errors.push(`${request.url()}: ${request.failure()?.errorText}`),
);

const state = () => page.evaluate(() => window.__GOBLIN.state);
const ui = () => page.evaluate(() => window.__GOBLIN.selection);
const wait = (condition) =>
  page.waitForFunction(condition, null, { timeout: 60_000 });
const project = (x, z, height = 0) =>
  page.evaluate(
    ([px, pz, ph]) => window.__GOBLIN.project(px, pz, ph),
    [x, z, height],
  );
async function clickCell(x, z, height = 0) {
  const point = await project(x, z, height);
  await page.mouse.click(point.x, point.y);
}
async function dragCells(from, to) {
  const start = await project(...from);
  const end = await project(...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}
async function screenshot(name) {
  evidence.screenshots.push(`${name}.png`);
  await page.screenshot({ path: `${output}/${name}.png` });
}
async function viewportFits() {
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
    true,
  );
}
async function openBuild() {
  if (!(await page.locator("#chop-tool").isVisible()))
    await page.getByRole("button", { name: /^Build/ }).click();
  await page.locator("#chop-tool").waitFor();
}

try {
  assert.equal((await page.goto(url))?.status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 90_000,
  });
  await viewportFits();
  const initial = await state();
  assert.deepEqual(Object.keys(initial.actors).sort(), ["rowan", "sedge"]);
  assert.deepEqual(initial.parties.home.members, ["rowan"]);
  assert.equal(await page.locator(".roster button").count(), 1);
  await screenshot("01-visible-visitor");

  await clickCell(10, 12, 1);
  await page.getByRole("region", { name: "Character" }).waitFor();
  await page.locator("#recruit").click();
  await wait(() => window.__GOBLIN.state.parties.home.members.length === 2);
  assert.deepEqual((await state()).parties.home.members, ["rowan", "sedge"]);
  assert.equal(await page.locator(".roster button").count(), 2);
  await screenshot("02-sedge-recruited");

  await page.locator("#select-rowan").click();
  await page.locator("#select-sedge").click({ modifiers: ["Shift"] });
  assert.deepEqual((await ui()).selectedIds, ["rowan", "sedge"]);
  await screenshot("03-both-selected");

  await clickCell(12, 6, 1.5);
  assert.deepEqual((await ui()).selectedIds, ["rowan", "sedge"]);
  assert.equal((await ui()).tree, "oak-8");
  await page.evaluate(() => {
    window.__orderClickEvents = [];
    for (const type of ["pointerdown", "pointerup", "click"])
      document.addEventListener(
        type,
        (event) =>
          window.__orderClickEvents.push({
            type,
            target: event.target.id || event.target.tagName,
          }),
        true,
      );
  });
  await page.locator("#chop-queued").click();
  await page.waitForTimeout(1_000);
  evidence.orderClick = await page.evaluate(() => ({
    events: window.__orderClickEvents,
    commands: window.__GOBLIN.state.commands,
    selection: window.__GOBLIN.selection,
  }));
  assert.equal(evidence.orderClick.commands.length, 2);
  const personal = (await state()).jobs.find((job) => job.target === "oak-8");
  assert.deepEqual(personal.scope.actors, ["rowan", "sedge"]);
  await page.getByRole("button", { name: /^Orders/ }).click();
  await page
    .locator(`[data-action="cancel"][data-job="${personal.id}"]`)
    .click();
  await wait(
    () => !window.__GOBLIN.state.jobs.some((job) => job.target === "oak-8"),
  );

  await openBuild();
  await page.locator("#chop-tool").click();
  const designationStart = await project(3, 3);
  const designationEnd = await project(10, 4);
  await page.mouse.move(designationStart.x, designationStart.y);
  await page.mouse.down();
  await page.mouse.move(designationEnd.x, designationEnd.y, { steps: 8 });
  const preview = await ui();
  assert.equal(preview.phase, "dragging");
  assert.deepEqual(preview.designationTargetIds, ["oak-1", "oak-2"]);
  await page.mouse.up();
  const unrelated = await project(12, 10);
  await page.mouse.move(unrelated.x, unrelated.y);
  await wait(
    () =>
      window.__GOBLIN.state.jobs.filter((job) => job.kind === "chop").length ===
      2,
  );
  await page.mouse.up();
  await page.waitForTimeout(250);
  const designated = await state();
  assert.deepEqual(
    designated.jobs
      .filter((job) => job.kind === "chop")
      .map((job) => job.target),
    preview.designationTargetIds,
  );
  assert.equal(
    designated.jobs.filter((job) => job.kind === "chop").length,
    preview.designationTargetIds.length,
  );
  assert.equal((await ui()).phase, "ready");
  assert.equal((await ui()).tool, "chop");
  assert.deepEqual((await ui()).designationTargetIds, []);
  await screenshot("04-shared-rectangle-applied");

  const jobsBeforeArmedOakCancel = (await state()).jobs.length;
  const armedOak = await project(3, 8, 1.5);
  await page.mouse.click(armedOak.x, armedOak.y, { button: "right" });
  await page.waitForTimeout(250);
  assert.equal((await ui()).phase, "idle");
  assert.equal((await ui()).tool, null);
  assert.equal((await state()).jobs.length, jobsBeforeArmedOakCancel);

  await openBuild();
  await page.locator("#chop-tool").click();
  const staleStart = await project(3, 8);
  const staleEnd = await project(4, 10);
  await page.mouse.move(staleStart.x, staleStart.y);
  await page.mouse.down();
  await page.mouse.move(staleEnd.x, staleEnd.y, { steps: 4 });
  await page.keyboard.press("ArrowLeft");
  await page.mouse.up();
  assert.equal((await ui()).phase, "idle");
  assert.deepEqual((await ui()).designationTargetIds, []);

  await openBuild();
  await page.locator("#chop-tool").click();
  const cancelAt = await project(3, 8);
  await page.mouse.click(cancelAt.x, cancelAt.y, { button: "right" });
  assert.equal((await ui()).phase, "idle");
  assert.deepEqual((await ui()).designationTargetIds, []);

  await page.locator("#pause").click();
  const paused = await state();
  const commandsBeforeDisabledRest = paused.commands.length;
  await page.locator("#select-rowan").click();
  await page.getByRole("button", { name: "Rest in bedroll" }).click({
    force: true,
  });
  await page.waitForTimeout(300);
  assert.equal((await state()).commands.length, commandsBeforeDisabledRest);
  await page.waitForTimeout(400);
  assert.deepEqual(await state(), paused);
  evidence.disabledCapsActivationBlocked = true;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await viewportFits();
  assert.equal(await page.locator(".roster button").count(), 2);
  await screenshot("05-narrow-two-person");

  evidence.initial = initial;
  evidence.designated = designated;
  evidence.paused = paused;
  evidence.success = true;
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  evidence.success = false;
  evidence.failure = String(error.stack || error);
  evidence.failureState = await state().catch(() => null);
  evidence.failureUi = await ui().catch(() => null);
  await screenshot("failure").catch(() => {});
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  await writeFile(
    `${output}/proof.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      success: evidence.success,
      failure: evidence.failure,
      errors: evidence.errors,
      output,
    }),
  );
}
