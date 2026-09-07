import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/home-checkpoint";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1320 },
  deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1440, height: 1320 } },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("requestfailed", (r) =>
  errors.push(`${r.url()}: ${r.failure()?.errorText}`),
);
const state = () => page.evaluate(() => window.__GOBLIN.state);
const wait = (condition) =>
  page.waitForFunction(condition, null, { timeout: 120000 });
async function point(x, z, y = 0) {
  return page.evaluate(
    ([x, z, y]) => window.__GOBLIN.project(x, z, y),
    [x, z, y],
  );
}
async function click(x, z, y = 0) {
  const at = await point(x, z, y);
  await page.mouse.click(at.x, at.y);
}
const shot = (name) => page.screenshot({ path: `${output}/${name}.png` });
try {
  assert.equal((await page.goto(url)).status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 90000,
  });
  await wait(() => !!window.__GOBLIN.state.demand);
  const initial = await state();
  assert.equal(initial.piles.length, 0);
  assert.equal(initial.sites.length, 0);
  await shot("01-clearing");
  await click(7, 10, 1); // Select the actual approved Rowan in the scene.
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator('[data-build="wall"]').click();
  const at = await point(7, 5);
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(200);
  await shot("02-wall-ghost");
  await click(7, 5);
  await page.locator("#task").click();
  await wait(() => window.__GOBLIN.state.jobs[0]?.reason?.includes("wood"));
  const waiting = await state();
  assert.equal(waiting.sites[0].delivered, 0);
  assert.equal(waiting.sites[0].work, 0);
  await shot("03-waiting-for-wood");
  await page.getByRole("button", { name: /^Orders\b/ }).click();
  await page.locator('#orders [data-action="cancel"]').click();
  await wait(() => window.__GOBLIN.state.sites.length === 0);
  const canceledBlueprint = await state();
  assert.equal(canceledBlueprint.piles.length, 0);
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator('[data-build="wall"]').click();
  await click(7, 5);
  await page.locator("#task").click();
  await click(3, 4, 1.5);
  await page.locator("#chop").click();
  await wait(() => window.__GOBLIN.state.pawn.mode === "chop");
  await page.waitForTimeout(1100);
  const chopping = await state();
  assert.equal(chopping.assignment.character, "rowan");
  await shot("04-chopping");
  await wait(() => window.__GOBLIN.state.pawn.carry > 0);
  const carrying = await state();
  assert.equal(carrying.felled, 1);
  assert.equal(carrying.sites[0].delivered, 0);
  await shot("05-carrying");
  await wait(
    () =>
      window.__GOBLIN.state.pawn.mode === "build" &&
      window.__GOBLIN.state.sites[0].work > 8,
  );
  const building = await state();
  assert.equal(building.sites[0].delivered, 1);
  await shot("06-building");
  await wait(() => window.__GOBLIN.state.sites[0].finishedAt !== null);
  const finished = await state();
  assert.equal(finished.jobs.length, 0);
  assert.equal(
    finished.piles.reduce((n, p) => n + p.amount, 0),
    5,
  );
  await shot("07-wall-finished");
  // The complete home is laid out through the same visible placement controls.
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator("#reset").click();
  await click(7, 10, 1);
  await page.locator("#speed").click();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  async function row(type, from, to = from) {
    await page.locator(`[data-build="${type}"]`).click();
    const a = await point(...from),
      b = await point(...to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  await row("wall", [6, 5], [9, 5]);
  await row("wall", [6, 8]);
  await row("wall", [8, 8], [9, 8]);
  await page.locator("#rotate").click();
  await row("wall", [6, 6], [6, 7]);
  await row("wall", [9, 6], [9, 7]);
  await page.locator("#rotate").click();
  await row("door", [7, 8]);
  await row("bed", [7, 6]);
  await row("roof", [7, 6], [8, 6]);
  await row("roof", [7, 7], [8, 7]);
  await page.locator("#task").click();
  await wait(() => window.__GOBLIN.state.sites.length === 17);
  const plan = await state();
  assert.equal(
    plan.sites.every((s) => s.delivered === 0 && s.work === 0),
    true,
  );
  await shot("08-home-blueprints");
  for (const [x, z] of [
    [3, 4],
    [10, 3],
    [3, 9],
    [11, 10],
  ]) {
    await click(x, z, 1.9);
    await page.locator("#chop").click();
  }
  await wait(
    () =>
      window.__GOBLIN.state.sites.filter((s) => s.finishedAt !== null).length >=
      3,
  );
  const inProgress = await state();
  await shot("09-home-in-progress");
  await wait(() => window.__GOBLIN.state.jobs.length === 0);
  const home = await state();
  assert.equal(home.felled, 4);
  assert.equal(home.sites.length, 17);
  assert.equal(
    home.sites.every((s) => s.finishedAt !== null),
    true,
  );
  assert.equal(
    home.piles.reduce((n, p) => n + p.amount, 0),
    5,
  );
  assert.equal(home.demand.kind, "approval");
  await page.locator("#cutaway").uncheck();
  await shot("10-home-roof");
  await page.locator("#cutaway").check();
  await shot("11-home-cutaway");
  await page.locator("#select").click();
  await page.locator("#rest").click();
  await wait(() => window.__GOBLIN.state.pawn.mode === "sleep");
  await page.locator("#pause").click();
  const sleeping = await state();
  assert.deepEqual([sleeping.pawn.x, sleeping.pawn.z], [7, 6]);
  await page.waitForTimeout(650);
  assert.deepEqual(await state(), sleeping);
  await shot("12-sleep-paused");
  await page.locator("#pause").click();
  await click(6, 2, 1.9);
  await page.locator("#chop").click();
  await wait(() => window.__GOBLIN.state.rested === 1);
  await wait(() => window.__GOBLIN.state.pawn.mode === "chop");
  const resumed = await state();
  assert.equal(resumed.pawn.task.target, "oak-5");
  await shot("13-work-resumed");
  await wait(
    () =>
      window.__GOBLIN.state.felled === 5 &&
      window.__GOBLIN.state.jobs.length === 0,
  );
  const used = await state();
  assert.equal(
    used.piles.reduce((n, p) => n + p.amount, 0),
    11,
  );
  // The standing schedule is real browser input; the simulation clock reaches night.
  await page.locator("#select").click();
  await page.locator("#routine").check();
  await wait(() => window.__GOBLIN.state.pawn.mode === "sleep");
  await shot("14-night-routine");
  await wait(
    () =>
      window.__GOBLIN.state.rested >= 2 &&
      window.__GOBLIN.state.pawn.mode !== "sleep",
  );
  const morning = await state();
  await shot("15-morning");
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator("#reset").click();
  await page.locator("#pause").click();
  const reset = await state();
  assert.equal(reset.sites.length, 0);
  assert.equal(reset.piles.length, 0);
  assert.equal(reset.jobs.length, 0);
  assert.equal(reset.felled, 0);
  assert.equal(reset.rested, 0);
  assert.equal(reset.routine, false);
  assert.equal(reset.commands.length, 0);
  assert.equal(reset.feed.sequence, 0);
  await shot("16-reset");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await shot("17-mobile");
  for (const sample of [
    waiting,
    carrying,
    building,
    finished,
    plan,
    home,
    sleeping,
    resumed,
    used,
    morning,
  ]) {
    assert.equal(
      sample.piles.reduce((n, pile) => n + pile.amount, 0) +
        sample.pawn.carry +
        sample.sites.reduce((n, site) => n + site.delivered, 0),
      sample.felled * 6,
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/proof.json`,
    JSON.stringify(
      {
        url,
        initial,
        waiting,
        chopping,
        carrying,
        building,
        finished,
        plan,
        inProgress,
        home,
        sleeping,
        resumed,
        used,
        morning,
        reset,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ output, finished: finished.sites[0], wood: 5, errors }),
  );
} catch (error) {
  await shot("failure");
  await writeFile(
    `${output}/failure.json`,
    JSON.stringify(
      { error: String(error), state: await state().catch(() => null), errors },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
