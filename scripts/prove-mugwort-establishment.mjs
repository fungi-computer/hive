import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:5198/";
const output =
  process.argv[3] || ".botanical/mugwort-establishment-local-20260909";
const executablePath = process.env.CHROMIUM_PATH;
assert.ok(executablePath, "CHROMIUM_PATH is required");
await mkdir(output, { recursive: true });

const evidence = {
  mode: "local-served-mugwort-establishment",
  base,
  errors: [],
  screenshots: [],
  claims: {},
};
let browser;

const key = (cell) => `${cell.x},${cell.z},${cell.level ?? 0}`;

function candidateCells(state) {
  const blocked = new Set();
  for (const cell of [
    ...state.trees,
    ...state.rocks,
    ...state.herbs,
    ...state.sources,
    state.watcher,
    ...Object.values(state.actors),
    ...state.materials.lots
      .filter((lot) => lot.location.kind === "ground")
      .map((lot) => lot.location),
  ])
    blocked.add(key(cell));
  const spring = state.sources.find((source) => source.kind === "spring");
  const cells = [];
  for (let z = 0; z < 15; z++)
    for (let x = 0; x < 15; x++) {
      const cell = { x, z, level: 0 };
      if (!blocked.has(key(cell))) cells.push(cell);
    }
  return cells.sort(
    (left, right) =>
      Math.abs(right.x - spring.x) +
      Math.abs(right.z - spring.z) -
      (Math.abs(left.x - spring.x) + Math.abs(left.z - spring.z)),
  );
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  page.setDefaultTimeout(45_000);
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
  await page.waitForFunction(() => window.__GOBLIN?.artReady);
  const state = () => page.evaluate(() => window.__GOBLIN.state);
  const selection = () => page.evaluate(() => window.__GOBLIN.selection);
  const project = (x, z, height = 0) =>
    page.evaluate(
      ([nextX, nextZ, nextHeight]) =>
        window.__GOBLIN.project(nextX, nextZ, nextHeight),
      [x, z, height],
    );
  const waitState = (predicate, value = null) =>
    page.waitForFunction(predicate, value);

  const continueButton = page.locator("#continue");
  if (await continueButton.count()) {
    await continueButton.click();
    await waitState(() => !window.__GOBLIN.state.paused);
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused);
  }
  assert.equal((await state()).paused, true);
  const pausedAdmissionTick = (await state()).tick;

  if (!(await page.locator("#herb-tool").count()))
    await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator("#herb-tool").click();
  assert.equal((await selection()).tool, "herb");

  let plantedCell = null;
  for (const cell of candidateCells(await state())) {
    const before = (await state()).jobs.filter(
      (job) => job.kind === "sow",
    ).length;
    const point = await project(cell.x, cell.z);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(30);
    const after = (await state()).jobs.filter(
      (job) => job.kind === "sow",
    ).length;
    if (after === before + 1) {
      plantedCell = cell;
      break;
    }
  }
  assert.ok(plantedCell, "a clear mugwort cell must accept one Sow order");
  const sowJob = (await state()).jobs.find((job) => job.kind === "sow");
  assert.equal(sowJob.scope.actors, null);
  assert.equal(
    (await state()).tick,
    pausedAdmissionTick,
    "paused admission must not advance time",
  );

  await page.keyboard.press("Escape");
  await waitState(() => window.__GOBLIN.selection.tool === null);
  await page.locator("#speed").click();
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.herbs[0]?.stage === "planted");
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);

  const planted = (await state()).herbs[0];
  assert.equal(planted.establishment, null);
  for (const height of [0.18, 0.1, 0.3, 0.5]) {
    const herbPoint = await project(planted.x, planted.z, height);
    await page.mouse.click(herbPoint.x, herbPoint.y);
    await page.waitForTimeout(100);
    if ((await selection()).herb === planted.id) break;
  }
  assert.equal(
    (await selection()).herb,
    planted.id,
    "physical herb probe must select the planted target",
  );
  const waterButton = page.locator("#water-mugwort");
  await waterButton.waitFor();
  assert.match(
    await page.locator('[data-status="water-mugwort"]').innerText(),
    /Needs water/,
  );
  await waterButton.click();
  await waitState(
    (id) =>
      window.__GOBLIN.state.jobs.some(
        (job) => job.kind === "water-mugwort" && job.target === id,
      ),
    planted.id,
  );
  const queued = await state();
  const waterJob = queued.jobs.find((job) => job.kind === "water-mugwort");
  assert.equal(waterJob.scope.actors, null);
  assert.equal(queued.paused, true);
  evidence.claims.targetOnlyAdmission = {
    herb: planted.id,
    sharedActors: waterJob.scope.actors,
    tick: queued.tick,
  };

  await page.locator("#speed").click();
  await page.locator("#pause").click();
  await waitState(() => {
    const current = window.__GOBLIN.state;
    const operation = current.operations.find(
      (candidate) => candidate.target.kind === "mugwort",
    );
    if (!operation || operation.phase !== "pour") return false;
    const pail = current.materials.lots.find(
      (lot) => lot.id === operation.pail,
    );
    const water = current.materials.lots.find(
      (lot) => lot.id === operation.water,
    );
    return pail?.location.kind === "hand" && water?.quantity === 2;
  });
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  const carrying = await state();
  const operation = carrying.operations.find(
    (candidate) => candidate.target.kind === "mugwort",
  );
  const pail = carrying.materials.lots.find((lot) => lot.id === operation.pail);
  const water = carrying.materials.lots.find(
    (lot) => lot.id === operation.water,
  );
  assert.equal(pail.location.kind, "hand");
  assert.equal(water.quantity, 2);
  evidence.claims.physicalCarry = {
    phase: operation.phase,
    pail: pail.id,
    water: water.id,
    quantity: water.quantity,
  };

  await page.locator("#pause").click();
  await waitState(
    () => window.__GOBLIN.state.herbs[0]?.establishment?.kind === "water",
  );
  await waitState(() => window.__GOBLIN.state.herbs[0]?.stage === "growing");
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  const established = await state();
  assert.equal(established.operations.length, 0);
  assert.equal(
    established.materials.sinks.find(
      (sink) => sink.id === established.herbs[0].establishment.receipt,
    )?.quantity,
    2,
  );
  assert.equal(await page.locator("#water-mugwort").count(), 0);
  assert.match(
    await page.locator("body").innerText(),
    /Established · Growing normally/,
  );
  evidence.claims.established = {
    stage: established.herbs[0].stage,
    receipt: established.herbs[0].establishment.receipt,
    operationRetired: true,
  };
  await page.screenshot({ path: `${output}/mugwort-established.png` });
  evidence.screenshots.push("mugwort-established.png");
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  evidence.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await writeFile(
    `${output}/proof.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}
