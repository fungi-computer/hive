import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/work-panel-proof-20260907";
const expected = {
  "dist/index.html":
    "79a28308e7fdc43b101829bbe3de01222a63c513b1e15dba56ffafe0f1f85626",
  "dist/assets/game.css":
    "547d9dc7f256a126e7c8f8248d25ece4625fdb15dcb53b5d8a764fef4b8fd789",
  "dist/assets/game.js":
    "acd25e2f6b02dfbf855519b6b80ada8feb35bb6d09dc4545fee76ad66a44693e",
  "dist/assets/art-CCSP12DF.js":
    "37435e9bf8030f3ec971348825cf416d2451672b6bfbecf8834052e9e3af4211",
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const indexText = await readFile("dist/index.html", "utf8");
const assetRefs = [
  ...indexText.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g),
].map((match) => match[1]);
const gameJs = assetRefs.find((asset) => /^assets\/game-.*\.js$/.test(asset));
const gameCss = assetRefs.find((asset) => /^assets\/game-.*\.css$/.test(asset));
const artJs = assetRefs.find((asset) => /^assets\/art-.*\.js$/.test(asset));
assert.ok(gameJs, "frozen index must reference a game JS bundle");
assert.ok(gameCss, "frozen index must reference a game CSS bundle");
assert.ok(artJs, "frozen index must reference an art JS bundle");
const frozenFiles = {
  "dist/index.html": expected["dist/index.html"],
  [`dist/${gameJs}`]: expected["dist/assets/game.js"],
  [`dist/${gameCss}`]: expected["dist/assets/game.css"],
  [`dist/${artJs}`]: expected["dist/assets/art-CCSP12DF.js"],
};
for (const [file, wanted] of Object.entries(frozenFiles)) {
  const actual = sha256(await readFile(file));
  assert.equal(actual, wanted, `${file} frozen hash drifted`);
}
const scriptSha256 = sha256(await readFile("scripts/prove-work-panel.mjs"));
await mkdir(output, { recursive: true });

const evidence = {
  url,
  output,
  frozenTarget: {
    files: frozenFiles,
    resolvedAssets: { gameJs, gameCss, artJs },
  },
  scriptSha256,
  wrapper: {
    runner:
      "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh",
    scope: "RuntimeMaxSec=10min; one bounded joined Work/Caps proof",
  },
  errors: [],
  screenshots: [],
  claims: {},
};

evidence.servedTarget = {};
for (const [file, wanted] of Object.entries(frozenFiles)) {
  const servedUrl = new URL(file.replace(/^dist\//, ""), url).href;
  const response = await fetch(servedUrl);
  assert.equal(response.status, 200, `${servedUrl} must be served`);
  const actual = sha256(Buffer.from(await response.arrayBuffer()));
  assert.equal(actual, wanted, `${servedUrl} must match frozen dist`);
  evidence.servedTarget[servedUrl] = actual;
}

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
page.setDefaultTimeout(15000);
page.on("pageerror", (error) => evidence.errors.push(`pageerror: ${error}`));
page.on("console", (message) => {
  if (message.type() === "error")
    evidence.errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) =>
  evidence.errors.push(
    `requestfailed: ${request.url()} · ${request.failure()?.errorText}`,
  ),
);

const state = () => page.evaluate(() => window.__GOBLIN.state);
const selection = () => page.evaluate(() => window.__GOBLIN.selection);
const project = (x, z, height = 0) =>
  page.evaluate(
    ([nextX, nextZ, nextHeight]) =>
      window.__GOBLIN.project(nextX, nextZ, nextHeight),
    [x, z, height],
  );
const waitState = (predicate, value) =>
  page.waitForFunction(predicate, value, { timeout: 15000 });
const screenshot = async (name) => {
  await page.screenshot({ path: `${output}/${name}.png` });
  evidence.screenshots.push(`${name}.png`);
};

function frozenModel(next) {
  const actorFrozen = (actor) => ({
    id: actor.id,
    x: actor.x,
    z: actor.z,
    level: actor.level,
    mode: actor.mode,
    path: actor.path,
    leg: actor.leg,
    work: actor.work,
    rest: actor.rest,
    routine: actor.routine,
    task: actor.task,
    assignment: actor.assignment,
    cargo: actor.cargo,
  });
  return {
    tick: next.tick,
    paused: next.paused,
    actors: Object.fromEntries(
      Object.entries(next.actors).map(([id, actor]) => [
        id,
        actorFrozen(actor),
      ]),
    ),
    cat: next.cat,
    trees: next.trees,
    rocks: next.rocks,
    piles: next.piles,
    sites: next.sites,
    jobs: next.jobs,
    claims: next.claims,
    feed: next.feed,
    demand: next.demand,
    felled: next.felled,
    finishedJobs: next.finishedJobs,
    rested: next.rested,
  };
}

function allowedModel(next) {
  return Object.fromEntries(
    Object.entries(next.actors).map(([id, actor]) => [
      id,
      { ...actor.allowedWork },
    ]),
  );
}

try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 90000,
  });
  await page.waitForSelector("#stage canvas");
  assert.deepEqual((await state()).parties.home.members, ["rowan"]);

  const sedge = (await state()).actors.sedge;
  const sedgePoint = await project(sedge.x, sedge.z);
  await page.mouse.click(sedgePoint.x, sedgePoint.y);
  await waitState(() => window.__GOBLIN.selection.inspectedId === "sedge");
  const recruit = page.locator("#recruit");
  assert.equal(await recruit.count(), 1);
  assert.equal(await recruit.evaluate((node) => node.tagName), "BUTTON");
  await recruit.click();
  await waitState(() =>
    window.__GOBLIN.state.parties.home.members.includes("sedge"),
  );
  evidence.claims.recruit = {
    visibleSedge: true,
    homeMembers: (await state()).parties.home.members,
  };

  const pause = page.locator("#pause");
  await pause.click();
  await waitState(() => window.__GOBLIN.state.paused === true);
  const pausedTick = (await state()).tick;
  assert.deepEqual((await selection()).selectedIds, []);

  const workButton = page
    .locator(".command-bar")
    .getByRole("button", { name: "Work", exact: true });
  assert.equal(await workButton.count(), 1);
  await workButton.click();
  const workPanel = page.getByRole("region", { name: "Work", exact: true });
  await workPanel.waitFor({ state: "visible" });
  const workText = await workPanel.textContent();
  assert.match(workText, /Work priorities/);
  assert.match(workText, /Person/);
  assert.match(workText, /Rowan/);
  assert.match(workText, /Sedge/);
  assert.match(workText, /Chop/);
  assert.match(workText, /Haul/);
  assert.match(workText, /Build/);
  const workBox = await workPanel.boundingBox();
  assert.ok(workBox && workBox.width >= 300 && workBox.height >= 180);
  const capsCard = await workPanel.evaluate((node) =>
    node.classList.contains("card"),
  );
  const capsButtons = await workPanel.locator("button.btn").count();
  const capsCheckboxes = await workPanel
    .locator("input.caps-gooey-checkbox")
    .count();
  assert.equal(capsCard, true);
  assert.ok(capsButtons >= 1);
  assert.equal(capsCheckboxes, 6);
  evidence.claims.normalPanel = {
    readable: true,
    workBox,
    capsCard,
    capsButtons,
    capsCheckboxes,
    pausedTick,
  };
  await screenshot("normal-work-panel");

  const beforeWorkToggles = await state();
  const toggle = async (selector, checked) => {
    const checkbox = page.locator(selector);
    assert.equal(await checkbox.count(), 1);
    assert.equal(await checkbox.evaluate((node) => node.tagName), "INPUT");
    assert.equal(await checkbox.isChecked(), !checked);
    if (checked) await checkbox.check();
    else await checkbox.uncheck();
    await waitState(
      ([nextSelector, nextChecked]) =>
        document.querySelector(nextSelector)?.checked === nextChecked,
      [selector, checked],
    );
  };
  await toggle("#work-rowan-build", false);
  const afterRowanBuild = await state();
  assert.equal(afterRowanBuild.actors.rowan.allowedWork.build, false);
  assert.deepEqual(
    frozenModel(afterRowanBuild),
    frozenModel(beforeWorkToggles),
  );
  await toggle("#work-sedge-haul", false);
  const afterSedgeHaul = await state();
  assert.equal(afterSedgeHaul.actors.sedge.allowedWork.haul, false);
  assert.deepEqual(frozenModel(afterSedgeHaul), frozenModel(beforeWorkToggles));
  assert.equal(afterSedgeHaul.tick, pausedTick);
  evidence.claims.pausedWorkToggles = {
    rowanBuild: false,
    sedgeHaul: false,
    tickFrozen: true,
    positionsTasksWorkFeedFrozen: true,
  };
  await screenshot("normal-work-toggles");

  const beforeChopToggles = await state();
  await toggle("#work-rowan-chop", false);
  await toggle("#work-sedge-chop", false);
  await toggle("#work-rowan-chop", true);
  const afterChopToggles = await state();
  assert.equal(afterChopToggles.actors.rowan.allowedWork.chop, true);
  assert.equal(afterChopToggles.actors.sedge.allowedWork.chop, false);
  assert.deepEqual(
    frozenModel(afterChopToggles),
    frozenModel(beforeChopToggles),
  );
  assert.equal(afterChopToggles.tick, pausedTick);

  await page.getByRole("button", { name: "Close Work", exact: true }).click();
  await workPanel.waitFor({ state: "hidden" });
  const oak =
    (await state()).trees.find((tree) => !tree.felledAt) ||
    (await state()).trees[0];
  const oakPoint = await project(oak.x, oak.z, 1.5);
  await page.mouse.click(oakPoint.x, oakPoint.y);
  const oakActions = page.getByRole("region", {
    name: "Oak actions",
    exact: true,
  });
  await oakActions.waitFor({ state: "visible" });
  const noSelection = await selection();
  assert.deepEqual(noSelection.selectedIds, []);
  assert.equal(noSelection.inspectedId, null);
  const markChop = page.locator("#mark-chop");
  assert.equal(await markChop.count(), 1);
  assert.equal(await markChop.evaluate((node) => node.tagName), "BUTTON");
  await markChop.click();
  await waitState(
    () =>
      window.__GOBLIN.state.jobs.length === 1 &&
      window.__GOBLIN.state.jobs[0].kind === "chop" &&
      window.__GOBLIN.state.jobs[0].scope.actors === null,
  );
  const sharedPaused = await state();
  const sharedJob = sharedPaused.jobs[0];
  assert.equal(sharedPaused.tick, pausedTick);
  assert.equal(sharedPaused.commands.at(-1).kind, "chop");
  assert.equal(sharedPaused.commands.at(-1).actors, null);
  evidence.claims.sharedPausedChop = {
    accepted: true,
    jobId: sharedJob.id,
    target: sharedJob.target,
    scopeActors: sharedJob.scope.actors,
    commandTick: sharedPaused.commands.at(-1).tick,
    pausedTick,
    onlyRowanAllowed: true,
  };
  await screenshot("normal-shared-paused");

  await pause.click();
  await waitState(
    (jobId) =>
      window.__GOBLIN.state.paused === false &&
      window.__GOBLIN.state.tick >
        window.__GOBLIN.state.commands.find(
          (command) => command.kind === "chop",
        )?.tick &&
      window.__GOBLIN.state.actors.rowan.task?.job === jobId,
    sharedJob.id,
  );
  const resumed = await state();
  assert.equal(resumed.actors.rowan.task.job, sharedJob.id);
  assert.equal(resumed.actors.rowan.task.kind, "chop");
  assert.equal(resumed.actors.sedge.task, null);
  assert.equal(resumed.actors.sedge.assignment, null);
  evidence.claims.resumedAssignment = {
    rowanJob: resumed.actors.rowan.task.job,
    rowanActivity: resumed.actors.rowan.task.kind,
    sedgeTask: resumed.actors.sedge.task,
    sedgeAssignment: resumed.actors.sedge.assignment,
    onlyAllowedMemberAccepted: true,
  };
  await screenshot("normal-resumed");

  await page.locator('[aria-label="Open game menu"]').click();
  const reset = page.locator("#reset");
  await reset.waitFor({ state: "visible" });
  await reset.click();
  await waitState(
    () =>
      window.__GOBLIN.state.seed === 42 &&
      window.__GOBLIN.state.jobs.length === 0 &&
      window.__GOBLIN.state.sites.length === 0 &&
      window.__GOBLIN.state.commands.length === 0 &&
      Object.values(window.__GOBLIN.state.actors).every((actor) =>
        Object.values(actor.allowedWork).every(Boolean),
      ),
  );
  const resetState = await state();
  assert.deepEqual(resetState.parties.home.members, ["rowan"]);
  assert.deepEqual(allowedModel(resetState), {
    rowan: { chop: true, haul: true, build: true },
    sedge: { chop: true, haul: true, build: true },
  });
  evidence.claims.reset = {
    allThreeSettingsEnabled: true,
    allowedWork: allowedModel(resetState),
    jobs: resetState.jobs.length,
    sites: resetState.sites.length,
    commands: resetState.commands.length,
  };
  await screenshot("normal-reset");

  await page.setViewportSize({ width: 390, height: 844 });
  await waitState(() => window.innerWidth === 390);
  await pause.click();
  await waitState(() => window.__GOBLIN.state.paused === true);
  await page
    .locator(".command-bar")
    .getByRole("button", { name: "Work", exact: true })
    .click();
  const narrowWork = page.getByRole("region", { name: "Work", exact: true });
  await narrowWork.waitFor({ state: "visible" });
  const narrowLayout = await page.evaluate(() => {
    const bar = document.querySelector(".command-bar");
    const barRect = bar.getBoundingClientRect();
    const work = [...document.querySelectorAll(".command-bar button")].find(
      (button) => button.textContent.trim() === "Work",
    );
    const menu = document.querySelector('[aria-label="Open game menu"]');
    const workRect = work.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const style = getComputedStyle(bar);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      bar: {
        left: barRect.left,
        top: barRect.top,
        right: barRect.right,
        bottom: barRect.bottom,
        width: barRect.width,
        height: barRect.height,
        display: style.display,
        rows: style.gridTemplateRows.split(" ").filter(Boolean).length,
      },
      work: {
        visible: !!work && workRect.width > 0 && workRect.height > 0,
        left: workRect.left,
        top: workRect.top,
        right: workRect.right,
        bottom: workRect.bottom,
      },
      menu: {
        visible: !!menu && menuRect.width > 0 && menuRect.height > 0,
        left: menuRect.left,
        top: menuRect.top,
        right: menuRect.right,
        bottom: menuRect.bottom,
      },
      workTable:
        !!document.querySelector(".work-grid") &&
        document.querySelector(".work-grid").getBoundingClientRect().width > 0,
      noOverflow:
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    };
  });
  assert.equal(narrowLayout.viewport.width, 390);
  assert.equal(narrowLayout.bar.display, "grid");
  assert.ok(narrowLayout.bar.rows >= 2);
  assert.equal(narrowLayout.work.visible, true);
  assert.equal(narrowLayout.menu.visible, true);
  assert.equal(narrowLayout.workTable, true);
  assert.equal(narrowLayout.noOverflow, true);
  assert.ok(narrowLayout.bar.left >= 0 && narrowLayout.bar.right <= 390);
  assert.ok(narrowLayout.bar.top >= 0 && narrowLayout.bar.bottom <= 844);
  evidence.claims.narrow390 = narrowLayout;
  await screenshot("narrow-390-work");

  assert.deepEqual(evidence.errors, []);
  evidence.success = true;
} catch (error) {
  evidence.success = false;
  evidence.failure = String(error.stack || error);
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  evidence.screenshots.push("failure.png");
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/proof.json`, JSON.stringify(evidence, null, 2));
  await context.close();
  await browser.close();
  console.log(JSON.stringify(evidence, null, 2));
}
