import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/play-proof";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1120, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1120, height: 900 } },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("requestfailed", (r) =>
  errors.push(`${r.url()}: ${r.failure()?.errorText}`),
);
const state = () => page.evaluate(() => window.__GOBLIN.state);
const wait = (condition) =>
  page.waitForFunction(condition, null, { timeout: 30000 });
async function worldPoint(x, z, y = 0) {
  const p = await page.evaluate(
    ([x, z, y]) => window.__GOBLIN.project(x, z, y),
    [x, z, y],
  );
  const b = await page.locator("canvas").boundingBox();
  return { x: b.x + (p.x * b.width) / 480, y: b.y + (p.y * b.height) / 320 };
}
async function clickWorld(x, z, y = 0) {
  const p = await worldPoint(x, z, y);
  await page.mouse.click(p.x, p.y);
}
async function hoverWorld(x, z) {
  const p = await worldPoint(x, z);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(150);
}
const screenshot = (name) => page.screenshot({ path: `${output}/${name}.png` });
try {
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 60000,
  });
  await wait(() => !!window.__GOBLIN.state.demand);
  const initial = await state();
  assert.equal(initial.wood, 0);
  assert.deepEqual(initial.shelters, []);
  assert.equal(initial.pawn.mode, "idle");
  assert.equal(await page.locator("#task").isDisabled(), true);
  await screenshot("01-clearing");
  await clickWorld(3, 4, 0.7);
  // Preview is inspectable with no resources, but cannot mint a shelter.
  await page.locator("#build").click();
  await hoverWorld(2, 2);
  assert.match(await page.locator("#hint").textContent(), /Needs 6 wood/);
  await screenshot("02-needs-wood");
  await clickWorld(2, 2);
  assert.equal((await state()).shelters.length, 0);
  assert.equal((await state()).wood, 0);
  await page.locator("#task").click(); // Cancel the placement.
  const iterations = [];
  let orderPaused;
  for (const [index, tree, x, z, bx, bz] of [
    [1, "oak-1", 1, 1, 2, 3],
    [2, "oak-2", 5, 1, 4, 3],
  ]) {
    await clickWorld(x, z, 1.8);
    assert.equal(await page.locator("#task").isDisabled(), false);
    if (index === 1) {
      // Exercise Sol's actual pause-boundary defect through DOM button clicks.
      // No state mutation or direct simulation call is used by this proof.
      await page.locator("#task").evaluate((button) => {
        button.click();
        document.querySelector("#pause").click();
      });
      const pausedOrder = await state();
      orderPaused = pausedOrder;
      assert.equal(pausedOrder.paused, true);
      assert.equal(pausedOrder.commands.length, 0);
      await page.waitForTimeout(600);
      assert.deepEqual(await state(), pausedOrder);
      await screenshot("03-order-paused");
      await page.locator("#pause").click();
    } else await page.locator("#task").click();
    await wait(() => window.__GOBLIN.state.pawn.mode === "chop");
    const chopAssignment = await state();
    assert.equal(chopAssignment.assignment.task, `chop-${tree}`);
    await page.waitForTimeout(1700);
    await screenshot(`cycle-${index}-chop`);
    await wait(() => window.__GOBLIN.state.wood === 6);
    const harvested = await state();
    assert.equal(harvested.felled, index);
    assert.notEqual(harvested.trees.find((t) => t.id === tree).felledAt, null);
    await screenshot(`cycle-${index}-wood`);
    await page.locator("#build").click();
    if (index === 1) {
      await hoverWorld(1, 1);
      await screenshot("04-blocked-footprint");
      await clickWorld(1, 1);
      assert.equal((await state()).wood, 6);
      assert.equal((await state()).shelters.length, 0);
    }
    await hoverWorld(bx, bz);
    await screenshot(`cycle-${index}-preview`);
    // Inspect/cancel is free. Re-enter and confirm using the actual ground click.
    await page.locator("#task").click();
    assert.equal((await state()).wood, 6);
    await page.locator("#build").click();
    await hoverWorld(bx, bz);
    await clickWorld(bx, bz);
    await page.waitForFunction(
      (n) => window.__GOBLIN.state.shelters.length === n,
      index,
    );
    const committed = await state();
    assert.equal(committed.wood, 0);
    assert.equal(committed.completed, index - 1);
    assert.equal(committed.assignment.task, `build-shelter-${index}`);
    await screenshot(`cycle-${index}-committed`);
    await wait(() => window.__GOBLIN.state.pawn.mode === "build");
    await wait(() => window.__GOBLIN.state.pawn.work >= 35);
    await screenshot(`cycle-${index}-frame`);
    let constructionPaused = null;
    if (index === 1) {
      await page.locator("#pause").click();
      const frozen = await state();
      constructionPaused = frozen;
      assert.equal(frozen.pawn.mode, "build");
      await page.waitForTimeout(800);
      assert.deepEqual(await state(), frozen);
      await screenshot("05-construction-paused");
      await page.locator("#pause").click();
    }
    await page.waitForFunction(
      (n) => window.__GOBLIN.state.completed === n,
      index,
    );
    const finished = await state();
    assert.equal(finished.shelters[index - 1].work, 100);
    assert.notEqual(finished.shelters[index - 1].finishedAt, null);
    assert.equal(finished.wood, 0);
    assert.equal(finished.demand.kind, "approval");
    await screenshot(`cycle-${index}-shelter`);
    await page.waitForTimeout(650);
    iterations.push({
      chopAssignment,
      harvested,
      committed,
      constructionPaused,
      finished,
    });
  }
  const completed = await state();
  assert.equal(completed.felled, 2);
  assert.equal(completed.completed, 2);
  assert.deepEqual(
    completed.commands.map((c) => c.kind),
    ["chop", "build", "chop", "build"],
  );
  assert.equal(completed.feed.sequence, 2);
  assert.equal(completed.trees[2].felledAt, null);
  await page.locator("#reset").click();
  await page.locator("#pause").click();
  const reset = await state();
  assert.equal(reset.wood, 0);
  assert.equal(reset.completed, 0);
  assert.deepEqual(reset.shelters, []);
  assert.deepEqual(reset.commands, []);
  assert.equal(reset.feed.sequence, 0);
  assert.equal(reset.demand, null);
  assert.equal(reset.pawn.mode, "idle");
  assert.equal(
    reset.trees.every((t) => t.felledAt === null),
    true,
  );
  assert.equal(await page.locator("#task").isDisabled(), true);
  await screenshot("06-reset");
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/proof.json`,
    JSON.stringify(
      {
        url,
        viewport: { width: 1120, height: 900 },
        canvas: { width: 480, height: 320, display: "960×640" },
        initial,
        orderPaused,
        iterations,
        completed,
        reset,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      output,
      felled: completed.felled,
      wood: completed.wood,
      shelters: completed.completed,
      commands: completed.commands,
      errors,
    }),
  );
} catch (error) {
  await screenshot("failure");
  await writeFile(
    `${output}/failure.json`,
    JSON.stringify(
      { state: await state().catch(() => null), errors, error: String(error) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
