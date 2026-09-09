import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:5198/";
const output = process.argv[3] || ".botanical/digging-local-20260909";
const executablePath = process.env.CHROMIUM_PATH;
assert.ok(executablePath, "CHROMIUM_PATH is required");
await mkdir(output, { recursive: true });

const evidence = {
  mode:
    new URL(base).hostname === "127.0.0.1"
      ? "local-served-digging-acceptance"
      : "hosted-digging-acceptance",
  base,
  errors: [],
  screenshots: [],
  claims: {},
};
let browser;
let page;
let browserClosed = false;
const timeout = 30_000;

const cellKey = (cell) => `${cell.x},${cell.z},${cell.level ?? 0}`;
const cellsEqual = (a, b) => cellKey(a) === cellKey(b);
const soilQuantity = (state) =>
  state.materials.lots.reduce(
    (total, lot) => total + (lot.material === "soil" ? lot.quantity : 0),
    0,
  );
const state = () => page.evaluate(() => window.__GOBLIN.state);
const selection = () => page.evaluate(() => window.__GOBLIN.selection);
const persistence = () => page.evaluate(() => window.__GOBLIN.persistence);
const project = (cell) =>
  page.evaluate(
    ({ x, z, level }) => window.__GOBLIN.project(x, z, 0, level ?? 0),
    cell,
  );
const waitFor = (predicate, value = undefined) =>
  page.waitForFunction(predicate, value, { timeout });

function blockedCells(current) {
  const blocked = new Set();
  const add = (cell) => blocked.add(cellKey(cell));
  for (const cell of [
    ...current.trees,
    ...current.rocks,
    ...current.sources,
    current.watcher,
    ...Object.values(current.actors),
    current.cat,
    ...current.herbs,
    ...current.sites,
    ...current.materials.lots
      .filter((lot) => lot.location.kind === "ground")
      .map((lot) => lot.location),
  ])
    add(cell);
  return blocked;
}

function safePair(current) {
  const blocked = blockedCells(current);
  const edits = new Set(current.terrain.edits.map(cellKey));
  const neighbors = (cell) =>
    [
      { x: cell.x + 1, z: cell.z, level: 0 },
      { x: cell.x - 1, z: cell.z, level: 0 },
      { x: cell.x, z: cell.z + 1, level: 0 },
      { x: cell.x, z: cell.z - 1, level: 0 },
    ].filter(({ x, z }) => x >= 0 && z >= 0 && x < 15 && z < 15);
  const usable = (cell) => {
    if (blocked.has(cellKey(cell)) || edits.has(cellKey(cell))) return false;
    return neighbors(cell).some((rim) => !blocked.has(cellKey(rim)));
  };
  for (let z = 2; z < 13; z++) {
    for (let x = 2; x < 13; x++) {
      const first = { x, z, level: 0 };
      for (const second of [
        { x: x + 1, z, level: 0 },
        { x, z: z + 1, level: 0 },
      ]) {
        if (second.x >= 13 || second.z >= 13) continue;
        if (usable(first) && usable(second)) return [first, second];
      }
    }
  }
  throw new Error("could not find two adjacent clear shallow cells");
}

async function visibleCanvasPoint(cell) {
  const point = await project(cell);
  assert.ok(
    await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element?.tagName === "CANVAS";
    }, point),
    `projected cell ${cellKey(cell)} is covered by a control`,
  );
  return point;
}

async function dragCells(first, second) {
  const from = await visibleCanvasPoint(first);
  const to = await visibleCanvasPoint(second);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function assertControlContainment(label, file) {
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      };
    };
    const command = rect(".command-bar");
    const hud = rect("#hud");
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      command,
      hud,
      paletteOverflow: [
        ...document.querySelectorAll("#palette button"),
      ].flatMap((button) => {
        const box = button.getBoundingClientRect();
        return [...button.querySelectorAll("span,small")]
          .filter((label) => {
            const text = label.getBoundingClientRect();
            return (
              text.top < box.top - 1 ||
              text.bottom > box.bottom + 1 ||
              text.left < box.left - 1 ||
              text.right > box.right + 1
            );
          })
          .map((label) => label.textContent);
      }),
    };
  });
  assert.ok(layout.command, `${label} command controls are missing`);
  assert.deepEqual(
    layout.paletteOverflow,
    [],
    `${label} palette text must fit its own button`,
  );
  assert.ok(
    layout.scrollWidth <= layout.width,
    `${label} has horizontal overflow`,
  );
  assert.ok(
    layout.command.left >= -1,
    `${label} controls extend left of viewport`,
  );
  assert.ok(
    layout.command.right <= layout.width + 1,
    `${label} controls extend right of viewport`,
  );
  assert.ok(
    layout.command.top >= -1,
    `${label} controls extend above viewport`,
  );
  assert.ok(
    layout.command.bottom <= layout.height + 1,
    `${label} controls extend below viewport`,
  );
  await page.screenshot({ path: join(output, file), fullPage: false });
  evidence.screenshots.push(file);
  evidence.claims[`${label}Controls`] = layout;
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (error) => evidence.errors.push(`page: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    evidence.errors.push(`request: ${request.url()}`),
  );

  const response = await page.goto(base, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await waitFor(() => window.__GOBLIN?.artReady === true);
  const artReadyAt = Date.now();

  // Start from a fresh clearing through the visible menu control.
  await page.locator("#reset").click();
  await waitFor(
    () =>
      window.__GOBLIN.state.tick === 0 &&
      window.__GOBLIN.state.paused === true &&
      window.__GOBLIN.state.terrain.edits.length === 0,
  );
  if (!(await state()).paused) await page.locator("#pause").click();
  await waitFor(() => window.__GOBLIN.state.paused === true);
  assert.deepEqual((await selection()).selectedIds, []);
  await waitFor(() => window.__GOBLIN.persistence.phase === "saved");

  const pair = safePair(await state());
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator("#dig-tool").click();
  assert.equal((await selection()).tool, "dig");
  await dragCells(pair[0], pair[1]);
  await waitFor(
    (expected) =>
      window.__GOBLIN.state.jobs.filter((job) => job.kind === "dig").length ===
        2 && window.__GOBLIN.state.tick === expected,
    0,
  );
  const admitted = await state();
  assert.deepEqual(
    admitted.jobs
      .filter((job) => job.kind === "dig")
      .map((job) => ({ x: job.x, z: job.z, level: job.level })),
    pair,
  );
  assert.ok(
    admitted.jobs
      .filter((job) => job.kind === "dig")
      .every((job) => job.scope.actors === null),
    "dig designation must use shared workers",
  );
  assert.equal(
    (await selection()).tool,
    "dig",
    "terrain tool persists after placement",
  );
  assert.equal(
    (await state()).tick,
    0,
    "paused admission must not advance time",
  );
  const jobsBeforeCancel = (await state()).jobs.map((job) => job.id);
  const cancelPoint = await project(pair[0]);
  await page.mouse.click(cancelPoint.x, cancelPoint.y, { button: "right" });
  await waitFor(() => window.__GOBLIN.selection.tool === null);
  assert.deepEqual(
    (await state()).jobs.map((job) => job.id),
    jobsBeforeCancel,
  );
  assert.equal((await state()).tick, 0);
  evidence.claims.pausedSharedDigAdmission = {
    cells: pair,
    jobs: jobsBeforeCancel,
    tick: 0,
    toolPersistedUntilRightClick: true,
    rightClickCancelledWithoutNewJob: true,
  };

  await page.locator("#speed").click();
  await page.locator("#pause").click();
  await waitFor(() =>
    Object.values(window.__GOBLIN.state.actors).some(
      (actor) => actor.mode === "dig" || actor.task?.kind === "dig",
    ),
  );
  await waitFor(
    () =>
      window.__GOBLIN.state.terrain.edits.length === 2 &&
      window.__GOBLIN.state.materials.lots
        .filter((lot) => lot.material === "soil")
        .reduce((total, lot) => total + lot.quantity, 0) === 2,
  );
  await page.locator("#pause").click();
  await waitFor(() => window.__GOBLIN.state.paused === true);
  const dug = await state();
  const dugTick = dug.tick;
  const dugSoil = soilQuantity(dug);
  assert.equal(dug.terrain.edits.length, 2);
  assert.equal(dugSoil, 2);
  await waitFor(
    (expected) =>
      window.__GOBLIN.state.paused &&
      window.__GOBLIN.state.tick === expected &&
      window.__GOBLIN.persistence.phase === "saved" &&
      window.__GOBLIN.persistence.tick === expected,
    dugTick,
  );
  evidence.claims.realActorDig = {
    tick: dugTick,
    edits: dug.terrain.edits,
    soilQuantity: dugSoil,
    save: await persistence(),
  };

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitFor(() => window.__GOBLIN?.artReady === true);
  await waitFor(
    (expected) =>
      window.__GOBLIN.state.paused &&
      window.__GOBLIN.state.tick === expected &&
      window.__GOBLIN.state.terrain.edits.length === 2 &&
      window.__GOBLIN.state.materials.lots
        .filter((lot) => lot.material === "soil")
        .reduce((total, lot) => total + lot.quantity, 0) === 2,
    dugTick,
  );
  const restored = await state();
  assert.deepEqual(restored.terrain, dug.terrain);
  assert.deepEqual(restored.materials, dug.materials);
  assert.deepEqual(restored.actors, dug.actors);
  assert.equal(soilQuantity(restored), 2);
  assert.equal(restored.tick, dugTick);
  evidence.claims.exactSaveReload = {
    tick: restored.tick,
    edits: restored.terrain.edits,
    soilQuantity: soilQuantity(restored),
    save: await persistence(),
  };

  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator("#backfill-tool").click();
  assert.equal((await selection()).tool, "backfill");
  const pit = pair[0];
  const pitPoint = await visibleCanvasPoint(pit);
  await page.mouse.click(pitPoint.x, pitPoint.y);
  await waitFor(
    ({ cell, tick }) =>
      window.__GOBLIN.state.jobs.some(
        (job) =>
          job.kind === "backfill" && job.x === cell.x && job.z === cell.z,
      ) && window.__GOBLIN.state.tick === tick,
    { cell: pit, tick: dugTick },
  );
  const backfillQueued = await state();
  const backfillJob = backfillQueued.jobs.find(
    (job) => job.kind === "backfill",
  );
  assert.ok(backfillJob);
  assert.equal(backfillJob.scope.actors, null);
  assert.equal(backfillQueued.tick, dugTick);
  const backfillSoilBefore = soilQuantity(backfillQueued);
  assert.equal(backfillSoilBefore, 2);
  await page.locator("#speed").click();
  await page.locator("#pause").click();
  await waitFor(
    (jobId) =>
      window.__GOBLIN.state.materials.transfers.some(
        (transfer) =>
          transfer.owner.kind === "job" &&
          transfer.owner.job === jobId &&
          transfer.phase.kind === "carrying",
      ),
    backfillJob.id,
  );
  await waitFor(
    (cell) =>
      window.__GOBLIN.state.terrain.edits.length === 1 &&
      window.__GOBLIN.state.terrain.edits.every(
        (edit) =>
          !(
            edit.x === cell.x &&
            edit.z === cell.z &&
            edit.level === cell.level
          ),
      ) &&
      window.__GOBLIN.state.materials.lots
        .filter((lot) => lot.material === "soil")
        .reduce((total, lot) => total + lot.quantity, 0) === 1,
    pit,
  );
  await page.locator("#pause").click();
  await waitFor(() => window.__GOBLIN.state.paused === true);
  const backfilled = await state();
  assert.equal(backfilled.terrain.edits.length, 1);
  assert.equal(soilQuantity(backfilled), backfillSoilBefore - 1);
  assert.equal(
    backfilled.terrain.edits.some((edit) => cellsEqual(edit, pair[1])),
    true,
  );
  evidence.claims.backfill = {
    job: backfillJob.id,
    restoredCell: pit,
    remainingCell: pair[1],
    soilBefore: backfillSoilBefore,
    soilAfter: soilQuantity(backfilled),
    exactDecrease: 1,
  };

  await assertControlContainment("normal", "digging-controls-normal.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await waitFor(() => window.innerWidth === 390);
  await assertControlContainment("narrow390", "digging-controls-narrow390.png");
  assert.ok(
    Date.now() - artReadyAt <= 60_000,
    "gameplay exceeded the 60 second acceptance budget",
  );
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  evidence.failure = { message: error.message, stack: error.stack };
  if (page) {
    evidence.failure.state = await page
      .evaluate(() => window.__GOBLIN?.state ?? null)
      .catch(() => null);
  }
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
    browserClosed = true;
  }
  evidence.closedBrowserFinally = browserClosed;
  await writeFile(
    join(output, "proof.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}
