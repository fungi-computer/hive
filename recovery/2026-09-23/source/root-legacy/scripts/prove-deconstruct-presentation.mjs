import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5187/";
const output = process.argv[3] || ".botanical/deconstruct-presentation-proof";
await mkdir(output, { recursive: true });

const evidence = { url, output, screenshots: [], errors: [] };
let browser = null;
let context = null;
let page = null;

const state = () => page.evaluate(() => window.__GOBLIN.state);
const project = (cell, height = 0) =>
  page.evaluate(
    ([x, z, nextHeight]) => window.__GOBLIN.project(x, z, nextHeight),
    [cell.x, cell.z, height],
  );
const clickCell = async (cell, height = 0) => {
  const point = await project(cell, height);
  await page.mouse.click(point.x, point.y);
};
const screenshot = async (name) => {
  await page.screenshot({ path: `${output}/${name}.png` });
  evidence.screenshots.push(`${name}.png`);
};
const waitState = (predicate, arg = null) =>
  page.waitForFunction(predicate, arg, { timeout: 45_000 });

function clearWallCell(snapshot) {
  const occupied = new Set(
    [
      ...snapshot.rocks,
      snapshot.watcher,
      ...snapshot.trees.filter((tree) => tree.felledAt === null),
      ...Object.values(snapshot.actors),
    ].map((cell) => `${cell.x},${cell.z},${cell.level ?? 0}`),
  );
  for (let x = 1; x < 14; x++)
    for (let z = 1; z < 14; z++)
      if (!occupied.has(`${x},${z},0`)) return { x, z, level: 0 };
  throw new Error("no clear wall cell");
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.on("pageerror", (error) => evidence.errors.push(`pageerror: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error") evidence.errors.push(`console: ${message.text()}`);
  });
  assert.equal((await page.goto(url, { waitUntil: "domcontentloaded" }))?.status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 45_000,
  });
  await page.waitForSelector("#stage canvas");
  await page.locator("#continue").click();
  await waitState(() => window.__GOBLIN.state.paused === false);

  const sedge = (await state()).actors.sedge;
  await clickCell(sedge, 1.5);
  await page.getByRole("region", { name: "Character", exact: true }).waitFor();
  await page.locator("#recruit").click();
  await waitState(() => window.__GOBLIN.state.parties.home.members.includes("sedge"));

  const oak = (await state()).trees.find((tree) => tree.felledAt === null);
  assert.ok(oak);
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused === true);
  await clickCell(oak, 1.5);
  await page.locator("#mark-chop").click();
  await waitState((oakId) => window.__GOBLIN.state.jobs.some((job) => job.target === oakId), oak.id);
  await page.locator("#pause").click();
  await page.locator("#speed").click();
  await waitState(() => window.__GOBLIN.state.paused === false);
  await waitState((oakId) => window.__GOBLIN.state.trees.find((tree) => tree.id === oakId)?.felledAt !== null, oak.id);
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused === true);

  await page.getByRole("button", { name: /^Build/ }).click();
  await page.locator('[data-build="wall"]').click();
  const wallCell = clearWallCell(await state());
  await clickCell(wallCell);
  await waitState(
    (cell) => window.__GOBLIN.state.sites.some((site) => site.x === cell.x && site.z === cell.z),
    wallCell,
  );
  await page.locator("#task").click();
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused === false);
  const wall = (await state()).sites.find((site) => site.x === wallCell.x && site.z === wallCell.z);
  assert.ok(wall);
  await waitState((siteId) => window.__GOBLIN.state.sites.find((site) => site.id === siteId)?.finishedAt !== null, wall.id);
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused === true);

  await clickCell(wall);
  const structure = page.getByRole("region", { name: "Structure actions", exact: true });
  await structure.waitFor();
  const action = structure.locator(`[data-action="deconstruct"][data-site="${wall.id}"]`);
  assert.equal(await action.isDisabled(), false);
  await action.click();
  await waitState((siteId) => window.__GOBLIN.state.jobs.some((job) => job.kind === "deconstruct" && job.target === siteId), wall.id);
  await page.waitForFunction(
    () => document.querySelector('[data-action="deconstruct"]')?.disabled === true,
    null,
    { timeout: 45_000 },
  );
  assert.equal(await action.isDisabled(), true);
  assert.equal(await action.textContent(), "Deconstruction queued");
  assert.match(await structure.locator('[data-status="deconstruct"]').textContent(), /already in the work queue/);
  evidence.queued = { disabled: true, label: "Deconstruction queued", duplicateAction: true };
  await screenshot("normal-deconstruct-queued");

  await page.setViewportSize({ width: 390, height: 844 });
  await waitState(() => innerWidth === 390);
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    const story = rect(".story");
    const roster = [...document.querySelectorAll(".roster button")].map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    return {
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      roster,
      story,
      separated: roster.every((box) => box.right <= story.left || story.right <= box.left),
    };
  });
  assert.equal(layout.viewport, 390);
  assert.ok(layout.scrollWidth <= 390);
  assert.equal(layout.roster.length, 2);
  assert.equal(layout.separated, true);
  evidence.narrow = layout;
  await screenshot("narrow-roster-story");
  assert.deepEqual(evidence.errors, []);
  evidence.success = true;
} catch (error) {
  evidence.success = false;
  evidence.failure = String(error.stack || error);
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/proof.json`, JSON.stringify(evidence, null, 2));
  await context?.close();
  await browser?.close();
  console.log(JSON.stringify(evidence, null, 2));
}
