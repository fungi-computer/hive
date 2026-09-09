import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/paused-shared-dist-proof";
const pinnedFiles = {
  "dist/index.html":
    "315cae936af6d8dd9c02b455523edba67bc258119ee2be1a9f638ed500bd511a",
  "dist/assets/game-_NNMygzq.js":
    "583844ffc82343ff74dea96678186f590e4fe246fc98f9efab5880f9e04006a6",
  "dist/assets/art-CCSP12DF.js":
    "37435e9bf8030f3ec971348825cf416d2451672b6bfbecf8834052e9e3af4211",
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const distHashes = Object.fromEntries(
  await Promise.all(
    Object.keys(pinnedFiles).map(async (file) => [
      file,
      sha256(await readFile(file)),
    ]),
  ),
);
for (const [file, expected] of Object.entries(pinnedFiles))
  assert.equal(distHashes[file], expected, `${file} drifted`);
const scriptSha256 = sha256(
  await readFile(new URL("./prove-paused-work.mjs", import.meta.url)),
);
await mkdir(output, { recursive: true });

const evidence = {
  url,
  frozenTarget: { url, distSha256: distHashes },
  scriptSha256,
  wrapper: {
    runner:
      "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh",
    scope: "RuntimeMaxSec=10min; focused paused/shared input proof only",
    exit: 0,
  },
  errors: [],
  screenshots: [],
  capsButtons: [],
  traces: {},
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const servedHashes = Object.fromEntries(
  await Promise.all(
    Object.entries(pinnedFiles).map(async ([file, expected]) => {
      const path = file === "dist/index.html" ? "/" : file.slice("dist".length);
      const response = await context.request.get(new URL(path, url).href);
      assert.equal(response.ok(), true, `${path} was not served`);
      const actual = sha256(await response.body());
      assert.equal(actual, expected, `${path} does not match local dist`);
      return [path, actual];
    }),
  ),
);
evidence.frozenTarget.servedSha256 = servedHashes;
const page = await context.newPage();
page.setDefaultTimeout(15_000);
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
  page.waitForFunction(condition, null, { timeout: 30_000 });
const project = (x, z, height = 0) =>
  page.evaluate(
    ([px, pz, ph]) => window.__GOBLIN.project(px, pz, ph),
    [x, z, height],
  );
async function clickCell(x, z, height = 0) {
  const point = await project(x, z, height);
  await page.mouse.click(point.x, point.y);
}
async function screenshot(name, locator = null) {
  evidence.screenshots.push(`${name}.png`);
  if (locator)
    await page.locator(locator).screenshot({ path: `${output}/${name}.png` });
  else await page.screenshot({ path: `${output}/${name}.png` });
}
async function capsButton(selector) {
  const button = page.locator(selector);
  assert.equal(await button.count(), 1, `${selector} exists once`);
  assert.equal(
    await button.evaluate((node) => node.tagName),
    "BUTTON",
    `${selector} is a real Caps button caller`,
  );
  assert.ok(await button.isVisible(), `${selector} is visible`);
  if (!evidence.capsButtons.includes(selector))
    evidence.capsButtons.push(selector);
  return button;
}
const timeOwned = (value) => ({
  tick: value.tick,
  actors: value.actors,
  cat: value.cat,
  trees: value.trees,
  piles: value.piles,
  felled: value.felled,
  finishedJobs: value.finishedJobs,
  rested: value.rested,
  feed: value.feed,
  demand: value.demand,
});
const resetActor = ({ rest, ...actor }) => actor;

async function resetAndVerify(seed) {
  const menu = page.locator('[aria-label="Open game menu"]');
  assert.equal(await menu.evaluate((node) => node.tagName), "BUTTON");
  if (!(await page.locator("#reset").count())) await menu.click();
  await page.locator("#reset").waitFor({ state: "visible" });
  await (await capsButton("#reset")).click();
  await wait(
    () =>
      window.__GOBLIN.state.seed === 42 &&
      !window.__GOBLIN.state.paused &&
      window.__GOBLIN.state.commands.length === 0 &&
      window.__GOBLIN.state.jobs.length === 0 &&
      window.__GOBLIN.state.sites.length === 0,
  );
  const reset = await state();
  const resetUi = await ui();
  assert.ok(reset.tick < 20, `reset was observed late at tick ${reset.tick}`);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(reset.actors).map(([id, actor]) => [
        id,
        resetActor(actor),
      ]),
    ),
    Object.fromEntries(
      Object.entries(seed.actors).map(([id, actor]) => [id, resetActor(actor)]),
    ),
  );
  assert.ok(reset.actors.rowan.rest <= seed.actors.rowan.rest);
  assert.ok(reset.actors.rowan.rest > seed.actors.rowan.rest - 1);
  assert.deepEqual(reset.cat, seed.cat);
  assert.deepEqual(reset.trees, seed.trees);
  assert.deepEqual(reset.feed, seed.feed);
  assert.equal(reset.seed, seed.seed);
  assert.deepEqual(
    {
      selectedIds: resetUi.selectedIds,
      inspectedId: resetUi.inspectedId,
      tree: resetUi.tree,
      context: resetUi.context,
      designationTargetIds: resetUi.designationTargetIds,
      tool: resetUi.tool,
    },
    {
      selectedIds: [],
      inspectedId: null,
      tree: null,
      context: null,
      designationTargetIds: [],
      tool: null,
    },
  );
  return reset;
}

async function runPausedScenario(label, seed) {
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  assert.ok(viewport.width === 1440 || viewport.width === 390);
  assert.deepEqual((await ui()).selectedIds, []);
  await capsButton("#pause");
  await page.locator("#pause").click();
  await wait(() => window.__GOBLIN.state.paused);
  const paused = await state();
  const frozen = timeOwned(paused);

  await clickCell(3, 4, 1.5);
  await page.getByRole("region", { name: "Oak actions" }).waitFor();
  assert.deepEqual((await ui()).selectedIds, []);
  await capsButton("#mark-chop");
  assert.equal(await page.locator("#mark-chop").isEnabled(), true);
  assert.equal(await page.locator("#chop-now").isDisabled(), true);
  await capsButton("#chop-now");
  await page.locator("#mark-chop").click();
  await wait(() => window.__GOBLIN.state.jobs.length === 1);
  const marked = await state();
  assert.equal(marked.jobs[0].kind, "chop");
  assert.equal(marked.jobs[0].target, "oak-1");
  assert.equal(marked.jobs[0].scope.actors, null);
  assert.equal(marked.commands[0].tick, paused.tick);
  assert.deepEqual(timeOwned(marked), frozen);
  await screenshot(`${label}-paused-oak`, ".target-window");

  const buildButton = page.getByRole("button", { name: /^Build/ });
  assert.equal(await buildButton.evaluate((node) => node.tagName), "BUTTON");
  await buildButton.click();
  await capsButton('[data-build="wall"]');
  await page.locator('[data-build="wall"]').click();
  const wall = await project(7, 5);
  await page.mouse.move(wall.x, wall.y);
  await page.mouse.click(wall.x, wall.y);
  await wait(() => window.__GOBLIN.state.sites.length === 1);
  const built = await state();
  const buildJob = built.jobs.find((job) => job.kind === "build");
  assert.equal(built.sites[0].type, "wall");
  assert.equal(buildJob.scope.actors, null);
  assert.equal(built.jobs.length, 2);
  assert.equal(built.commands.at(-1).tick, paused.tick);
  assert.deepEqual(timeOwned(built), frozen);
  await screenshot(`${label}-paused-build`, ".build-window");

  await capsButton("#task");
  await page.locator("#task").click();
  const ordersButton = page.getByRole("button", { name: /^Orders/ });
  assert.equal(await ordersButton.evaluate((node) => node.tagName), "BUTTON");
  await ordersButton.click();
  const cancelSelector = `[data-action="cancel"][data-job="${buildJob.id}"]`;
  await capsButton(cancelSelector);
  await page.locator(cancelSelector).click();
  await wait(() => window.__GOBLIN.state.sites.length === 0);
  const canceled = await state();
  assert.equal(canceled.jobs.length, 1);
  assert.equal(canceled.commands.at(-1).kind, "cancel");
  assert.equal(canceled.commands.at(-1).tick, paused.tick);
  assert.deepEqual(timeOwned(canceled), frozen);
  await screenshot(`${label}-paused-canceled`, ".orders-window");

  await capsButton("#pause");
  await page.locator("#pause").click();
  await page.waitForFunction(
    (pausedTick) =>
      !window.__GOBLIN.state.paused &&
      window.__GOBLIN.state.tick > pausedTick &&
      window.__GOBLIN.state.actors.rowan.assignment?.task ===
        window.__GOBLIN.state.jobs[0]?.id,
    paused.tick,
    { timeout: 30_000 },
  );
  const resumed = await state();
  assert.equal(resumed.paused, false);
  assert.ok(resumed.tick > paused.tick);
  assert.equal(resumed.actors.rowan.assignment.character, "rowan");
  assert.equal(resumed.jobs[0].scope.actors, null);
  await screenshot(`${label}-resumed`, "#stage");

  const reset = await resetAndVerify(seed);
  evidence.traces[label] = {
    viewport,
    pausedTick: paused.tick,
    commands: marked.commands.concat(
      built.commands.slice(-1),
      canceled.commands.slice(-1),
    ),
    commandTicks: canceled.commands.map((command) => command.tick),
    sharedJobs: {
      mark: {
        kind: marked.jobs[0].kind,
        target: marked.jobs[0].target,
        actors: marked.jobs[0].scope.actors,
      },
      build: {
        kind: buildJob.kind,
        type: built.sites[0].type,
        actors: buildJob.scope.actors,
      },
    },
    frozenFields: ["actors", "cat", "trees", "piles", "feed", "demand", "tick"],
    frozenAfterMark: true,
    frozenAfterBuild: true,
    frozenAfterCancel: true,
    canceled: { sites: canceled.sites.length, jobs: canceled.jobs.length },
    resumed: {
      tick: resumed.tick,
      paused: resumed.paused,
      assignment: resumed.actors.rowan.assignment,
    },
    reset: {
      tick: reset.tick,
      paused: reset.paused,
      commands: reset.commands.length,
      jobs: reset.jobs.length,
      sites: reset.sites.length,
      tool: (await ui()).tool,
      selection: (await ui()).selectedIds,
      seeded: true,
    },
  };
}

try {
  assert.equal((await page.goto(url))?.status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 90_000,
  });
  const seed = await state();
  assert.equal(seed.seed, 42);
  assert.equal(seed.tick, 0);
  assert.equal(seed.paused, false);
  await capsButton("#pause");
  await runPausedScenario("normal", seed);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => innerWidth), 390);
  await runPausedScenario("narrow-390", seed);
  assert.deepEqual(evidence.errors, []);
  evidence.success = true;
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
