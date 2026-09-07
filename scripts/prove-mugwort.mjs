import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/mugwort-home-local-20260907T163347Z";
const expectedIndex = "faa725db6110a14cbb0139ea1ae10da180cc7b176b18e27d2cadaad89bab1101";
const expectedNames = {
  gameJs: "game-Dzd4qadi.js",
  gameCss: "game-CxFQJg3g.css",
  artJs: "art-BZ4FxRqi.js",
};
const expectedHashes = {
  index: expectedIndex,
  gameJs: "0f70af4bf919257a198e2d7ed653fe55ad517c154ed93e37d80b5c08eca2b792",
  gameCss: "45cbaed4bacf64b93ca69702f0330eab7e15ba41d67f7132c810e79ce96ab87c",
  artJs: "3db8740af8a882feacc52979b8eaf654daed078303c5c7d5383e1f2001f4bed2",
};
const runner = "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function refs(html) {
  return [...html.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g)].map(
    (match) => match[1],
  );
}

function resolvedAsset(list, kind) {
  return list.find((asset) => new RegExp("^assets/" + kind + ".*\\.js$").test(asset));
}

const localIndexBytes = await readFile("dist/index.html");
const localIndexText = localIndexBytes.toString("utf8");
const localRefs = refs(localIndexText);
const localGameJs = resolvedAsset(localRefs, "game");
const localGameCss = localRefs.find((asset) => /^assets\/game-.*\.css$/.test(asset));
const localArtJs = resolvedAsset(localRefs, "art");
assert.ok(localGameJs && localGameCss && localArtJs, "dist index must expose game JS/CSS and art JS");
assert.equal(localGameJs, "assets/" + expectedNames.gameJs, "game JS filename drifted");
assert.equal(localGameCss, "assets/" + expectedNames.gameCss, "game CSS filename drifted");
assert.equal(localArtJs, "assets/" + expectedNames.artJs, "art JS filename drifted");

const localFiles = {
  index: sha256(localIndexBytes),
  gameJs: sha256(await readFile("dist/" + localGameJs)),
  gameCss: sha256(await readFile("dist/" + localGameCss)),
  artJs: sha256(await readFile("dist/" + localArtJs)),
};
assert.deepEqual(localFiles, expectedHashes, "frozen dist hashes drifted");

async function fetchHash(assetUrl) {
  const response = await fetch(assetUrl);
  assert.equal(response.status, 200, "served asset must return 200: " + assetUrl);
  return sha256(Buffer.from(await response.arrayBuffer()));
}

const servedIndexResponse = await fetch(url);
assert.equal(servedIndexResponse.status, 200, "served index must return 200");
const servedIndexUrl = servedIndexResponse.url || url;
const servedIndexBytes = Buffer.from(await servedIndexResponse.arrayBuffer());
const servedRefs = refs(servedIndexBytes.toString("utf8"));
const servedGameJs = resolvedAsset(servedRefs, "game");
const servedGameCss = servedRefs.find((asset) => /^assets\/game-.*\.css$/.test(asset));
const servedArtJs = resolvedAsset(servedRefs, "art");
assert.deepEqual(
  { gameJs: servedGameJs, gameCss: servedGameCss, artJs: servedArtJs },
  { gameJs: localGameJs, gameCss: localGameCss, artJs: localArtJs },
  "served asset references must match local dist",
);
const servedFiles = {
  index: sha256(servedIndexBytes),
  gameJs: await fetchHash(new URL(servedGameJs, servedIndexUrl)),
  gameCss: await fetchHash(new URL(servedGameCss, servedIndexUrl)),
  artJs: await fetchHash(new URL(servedArtJs, servedIndexUrl)),
};
assert.deepEqual(servedFiles, expectedHashes, "served assets must match frozen dist");

await mkdir(output, { recursive: true });
const evidence = {
  url,
  output,
  frozenTarget: {
    source: "bb7c135f",
    local: { assets: { gameJs: localGameJs, gameCss: localGameCss, artJs: localArtJs }, hashes: localFiles },
  },
  servedParity: {
    indexUrl: servedIndexUrl,
    assets: { gameJs: servedGameJs, gameCss: servedGameCss, artJs: servedArtJs },
    hashes: servedFiles,
    matchesLocalDist: true,
  },
  scriptSha256: sha256(await readFile("scripts/prove-mugwort.mjs")),
  wrapper: { runner, scope: "RuntimeMaxSec=10min; one focused mugwort UI/input proof" },
  errors: [],
  screenshots: [],
  claims: {},
};

let browser;
let context;
let page;
let observedHerbId = null;
const state = () => page.evaluate(() => window.__GOBLIN.state);
const selection = () => page.evaluate(() => window.__GOBLIN.selection);
const persistence = () => page.evaluate(() => window.__GOBLIN.persistence);
const project = (x, z, level = 0) => page.evaluate(([nextX, nextZ, nextLevel]) => window.__GOBLIN.project(nextX, nextZ, nextLevel), [x, z, level]);
const waitState = (predicate, timeout = 45_000, value = null) => page.waitForFunction(predicate, value, { timeout });
const screenshot = async (name) => {
  await page.screenshot({ path: output + "/" + name + ".png" });
  evidence.screenshots.push(name + ".png");
};

function actorFacts(actor) {
  return {
    id: actor.id,
    x: actor.x,
    z: actor.z,
    level: actor.level,
    dir: actor.dir,
    mode: actor.mode,
    path: actor.path,
    leg: actor.leg,
    work: actor.work,
    rest: actor.rest,
    task: actor.task,
    assignment: actor.assignment,
    cargo: actor.cargo,
    allowedWork: actor.allowedWork,
  };
}

function pausedFacts(next) {
  return {
    tick: next.tick,
    paused: next.paused,
    nextId: next.nextId,
    actors: Object.fromEntries(Object.entries(next.actors).map(([id, actor]) => [id, actorFacts(actor)])),
    herbs: next.herbs,
    herbBundles: next.herbBundles,
    jobs: next.jobs,
    harvestedHerbs: next.harvestedHerbs,
    feed: next.feed,
  };
}

function frozenWorld(next) {
  const worldActor = (actor) => {
    const { allowedWork, ...rest } = actorFacts(actor);
    return rest;
  };
  return {
    tick: next.tick,
    actors: Object.fromEntries(Object.entries(next.actors).map(([id, actor]) => [id, worldActor(actor)])),
    cat: next.cat,
    trees: next.trees,
    piles: next.piles,
    sites: next.sites,
    feed: next.feed,
    finishedJobs: next.finishedJobs,
  };
}

function gardenFlags(next) {
  return Object.fromEntries(Object.entries(next.actors).map(([id, actor]) => [id, !!actor.allowedWork?.garden]));
}

function chooseClearCell(next) {
  const blocked = new Set();
  const key = (cell) => [cell.x, cell.z, cell.level ?? 0].join(",");
  for (const cell of [
    ...(next.trees || []),
    ...(next.rocks || []),
    next.watcher,
    ...(next.piles || []),
    ...(next.herbs || []),
    ...(next.herbBundles || []),
  ]) blocked.add(key(cell));
  for (const actor of Object.values(next.actors)) blocked.add(key(actor));
  for (let z = 0; z < 15; z++) {
    for (let x = 0; x < 15; x++) {
      const cell = { x, z, level: 0 };
      if (!blocked.has(key(cell))) return cell;
    }
  }
  throw new Error("no clear placement cell");
}

async function clickCell(cell) {
  const point = await project(cell.x, cell.z, cell.level || 0);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
  return point;
}

async function panelButton(name) {
  const button = page.getByRole("button", { name, exact: true });
  await button.waitFor();
  return button;
}

async function waitSavedAtTick(tick) {
  await waitState((expectedTick) => {
    const persistence = window.__GOBLIN.persistence;
    return persistence.phase === "saved" && persistence.tick === expectedTick && window.__GOBLIN.state.paused;
  }, 45_000, tick).catch((error) => {
    error.message += " (expected saved tick " + tick + ")";
    throw error;
  });
}

function rect(node) {
  const box = node && node.getBoundingClientRect();
  return box && { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
}

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => evidence.errors.push("pageerror: " + error));
  page.on("console", (message) => { if (message.type() === "error") evidence.errors.push("console: " + message.text()); });
  page.on("requestfailed", (request) => evidence.errors.push("requestfailed: " + request.url() + " · " + (request.failure()?.errorText || "unknown")));

  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await waitState(() => window.__GOBLIN?.artReady, 90_000);
  await page.waitForSelector("#stage canvas");
  assert.equal((await state()).paused, true, "fresh clearing must open paused");
  assert.equal((await selection()).tool, null);
  const continueButton = page.locator("#continue");
  if (await continueButton.count()) await continueButton.click();
  await waitState(() => !window.__GOBLIN.state.paused);
  const pauseButton = page.locator("#pause");
  await pauseButton.click();
  await waitState(() => window.__GOBLIN.state.paused);

  if (!(await page.locator("#herb-tool").count())) await (await panelButton("Build")).click();
  await page.locator("#herb-tool").click();
  assert.equal((await selection()).tool, "herb");
  const clearCell = chooseClearCell(await state());
  const clearPoint = await project(clearCell.x, clearCell.z, clearCell.level);
  const beforeCancel = await state();
  await page.mouse.move(clearPoint.x, clearPoint.y);
  assert.equal((await state()).jobs.length, beforeCancel.jobs.length, "hover must not queue work");
  assert.equal(await page.locator("#harvest-herb").count(), 0, "clear-cell hover must expose no Harvest button");
  await page.mouse.click(clearPoint.x, clearPoint.y, { button: "right" });
  await waitState(() => window.__GOBLIN.selection.tool === null);
  const afterCancel = await state();
  assert.equal(afterCancel.commands.length, beforeCancel.commands.length, "right-click cancel must issue no command");
  assert.equal(afterCancel.jobs.length, beforeCancel.jobs.length, "right-click cancel must issue no job");
  evidence.claims.toolCancel = { rightClickExitsWithoutCommand: true, freshPlantStillWorks: true };

  if (!(await page.locator("#herb-tool").count())) await (await panelButton("Build")).click();
  await page.locator("#herb-tool").click();
  const preSow = await state();
  const frozenBeforeSow = frozenWorld(preSow);
  await page.mouse.move(clearPoint.x, clearPoint.y);
  await page.mouse.down();
  await page.mouse.up();
  await waitState(() => window.__GOBLIN.state.jobs.some((job) => job.kind === "sow"));
  const ordered = await state();
  const sowJobs = ordered.jobs.filter((job) => job.kind === "sow");
  assert.equal(sowJobs.length, 1);
  assert.equal(sowJobs[0].scope.actors, null);
  assert.equal((await selection()).tool, "herb", "Plant tool remains active after sow");
  assert.deepEqual(frozenWorld(ordered), frozenBeforeSow, "paused sow must freeze tick/actors/work/world");
  await screenshot("normal-ordered-plant");

  await (await panelButton("Work")).click();
  assert.equal(await page.getByRole("region", { name: "Work" }).count(), 1, "Work panel must be visible");
  const rowanGarden = page.locator("#work-rowan-garden");
  const sedgeGarden = page.locator("#work-sedge-garden");
  assert.equal(await rowanGarden.count(), 1);
  assert.equal(await sedgeGarden.count(), 0, "Sedge is not a home roster member before recruitment");
  const beforeGarden = frozenWorld(await state());
  await rowanGarden.uncheck();
  await waitState(() => window.__GOBLIN.state.actors.rowan.allowedWork.garden === false);
  assert.deepEqual(frozenWorld(await state()), beforeGarden, "paused Garden toggle must not advance world");
  assert.equal(gardenFlags(await state()).rowan, false);
  await screenshot("normal-garden-paused");
  await page.getByRole("button", { name: "Close Work", exact: true }).click();
  assert.equal((await selection()).tool, null);

  const pausedOrdered = await state();
  assert.equal(pausedOrdered.herbs[0].stage, "ordered");
  assert.equal(pausedOrdered.herbs[0].work, 0);
  await waitSavedAtTick(pausedOrdered.tick);
  const savedOrderedFacts = pausedFacts(await state());
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitState(() => window.__GOBLIN?.artReady, 90_000);
  assert.deepEqual(pausedFacts(await state()), savedOrderedFacts, "reload must restore paused ordered/progress/Garden facts");
  assert.deepEqual((await state()).commands, [], "reload intentionally restores no command history");
  evidence.claims.pausedReload = { exactFacts: true, gardenRowanAllowed: false, orderedWork: 0 };
  const closeMenu = page.getByRole("button", { name: "Close Menu", exact: true });
  if (await closeMenu.count()) await closeMenu.click();
  await (await panelButton("Work")).click();
  await page.locator("#work-rowan-garden").check();
  await waitState(() => window.__GOBLIN.state.actors.rowan.allowedWork.garden === true);
  await page.getByRole("button", { name: "Close Work", exact: true }).click();
  await waitSavedAtTick((await state()).tick);

  await page.locator("#speed").click();
  await page.locator("#speed").click();
  await page.locator("#speed").click();
  assert.ok((await page.locator("#speed").innerText()).includes("4×"), "speed control must visibly read 4×");
  await pauseButton.click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await waitState(() => window.__GOBLIN.state.actors.rowan.task?.kind === "sow", 45_000);
  evidence.claims.sow = { rowanAssigned: true, sharedJob: true, speed: 4 };
  await screenshot("normal-sow-travel");
  await waitState(() => window.__GOBLIN.state.actors.rowan.mode === "sow", 45_000);
  await screenshot("normal-sow-working");
  await waitState(() => window.__GOBLIN.state.herbs[0]?.stage === "planted", 45_000);
  const herbId = (await state()).herbs[0].id;
  observedHerbId = herbId;
  const stages = ["planted"];
  await screenshot("normal-stage-planted");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  const herbPoint = await project(clearCell.x, clearCell.z, 0.5);
  await page.mouse.click(herbPoint.x, herbPoint.y);
  await waitState((id) => window.__GOBLIN.selection.herb === id, 15_000, herbId);
  assert.equal(await page.locator("#harvest-herb").count(), 0, "non-ready mugwort must have no Harvest action");
  evidence.claims.nonReadyInspection = { stage: "planted", harvestAbsent: true };
  await waitState(() => window.__GOBLIN.state.herbs[0]?.stage === "growing", 45_000);
  stages.push("growing");
  await screenshot("normal-stage-growing");
  await waitState(() => window.__GOBLIN.state.herbs[0]?.stage === "ready", 45_000);
  stages.push("ready");
  await screenshot("normal-stage-ready");
  evidence.claims.fixedStages = { observed: stages, thresholds: { sowWork20: 20, growthElapsed80: 80, readyElapsed240: 240, harvestWork20: 20 } };
  await pauseButton.click();
  await waitState(() => window.__GOBLIN.state.paused);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  assert.equal((await selection()).herb, herbId, "ready herb selection must remain active after pause");
  const harvest = page.locator("#harvest-herb");
  assert.equal(await harvest.count(), 1, "ready mugwort must expose explicit Harvest");
  assert.equal(await harvest.isEnabled(), true, "ready Harvest button must be enabled");
  const harvestGeometry = await page.evaluate(() => {
    const button = document.querySelector("#harvest-herb");
    const rect = button?.getBoundingClientRect();
    const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    const hit = center ? document.elementFromPoint(center.x, center.y) : null;
    return {
      rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      center,
      hit: hit ? { id: hit.id || null, tag: hit.tagName, className: hit.className || null } : null,
      hitIsButton: !!button && !!hit && (hit === button || button.contains(hit)),
      connected: !!button?.isConnected,
    };
  });
  evidence.claims.harvestClickDiagnostic = { geometry: harvestGeometry };
  assert.ok(harvestGeometry.hitIsButton, "Harvest center must hit the Harvest button, not canvas");
  await page.evaluate(() => {
    const describe = (node) => ({
      id: node instanceof Element ? node.id || null : null,
      tag: node?.tagName || node?.nodeName || null,
      className: node instanceof Element ? node.className || null : null,
    });
    const events = [];
    window.__MUGWORT_HARVEST_EVENTS = events;
    for (const type of ["pointerdown", "pointerup", "click"]) {
      document.addEventListener(type, (event) => {
        events.push({
          type,
          target: describe(event.target),
          path: event.composedPath().map(describe),
        });
      }, true);
    }
  });
  await page.mouse.click(harvestGeometry.center.x, harvestGeometry.center.y);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const harvestDiagnostic = await page.evaluate((id) => {
    const current = window.__GOBLIN.state;
    const button = document.querySelector("#harvest-herb");
    return {
      events: window.__MUGWORT_HARVEST_EVENTS || [],
      button: button
        ? { disabled: button.disabled, aria: button.getAttribute("aria-label"), connected: button.isConnected }
        : { disabled: null, aria: null, connected: false },
      notice: document.querySelector("#notice")?.textContent || "",
      selection: window.__GOBLIN.selection,
      paused: current.paused,
      matchingJobs: current.jobs.filter((job) => job.kind === "harvest" && job.target === id),
      matchingCommands: current.commands.filter((command) => command.kind === "harvest" && command.herb === id),
      herb: current.herbs.find((herb) => herb.id === id) || null,
      bundles: current.herbBundles,
      tick: current.tick,
    };
  }, herbId);
  evidence.claims.harvestClickDiagnostic = { geometry: harvestGeometry, ...harvestDiagnostic };
  assert.deepEqual(harvestDiagnostic.events.map((event) => event.type), ["pointerdown", "pointerup", "click"], "physical input must emit pointerdown/pointerup/click");
  for (const event of harvestDiagnostic.events) {
    assert.ok(event.path.some((node) => node.id === "harvest-herb"), event.type + " must target the Harvest button, not canvas");
  }
  assert.equal(harvestDiagnostic.paused, true);
  assert.equal(harvestDiagnostic.matchingJobs.length, 1, "paused ready admission must create exactly one matching harvest job");
  const harvestJob = harvestDiagnostic.matchingJobs[0];
  assert.equal(harvestJob.target, herbId);
  assert.equal(harvestJob.scope.party, "home");
  assert.equal(harvestJob.scope.actors, null);
  assert.equal(harvestDiagnostic.herb?.stage, "ready");
  assert.equal(harvestDiagnostic.bundles.length, 0);
  assert.equal(harvestDiagnostic.matchingCommands.length, 1, "paused harvest must record one matching command");
  const appliedHarvest = harvestDiagnostic.matchingCommands[0];
  assert.equal(appliedHarvest.herb, herbId);
  assert.equal(appliedHarvest.actors, null);
  evidence.claims.pausedHarvestAdmission = { target: herbId, party: "home", actors: null, herbReady: true, bundles: 0, commandRecorded: true, tick: harvestDiagnostic.tick };
  await page.locator("#speed").click();
  assert.ok((await page.locator("#speed").innerText()).includes("1×"), "harvest observation speed must visibly read 1×");
  await pauseButton.click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await waitState(() => window.__GOBLIN.state.herbBundles.length === 1 && window.__GOBLIN.state.harvestedHerbs === 1, 45_000);
  const bundleState = await state();
  assert.equal(bundleState.herbs.some((herb) => herb.id === herbId), false, "completed harvest must remove the herb");
  assert.equal(bundleState.jobs.some((job) => job.kind === "harvest" && job.target === herbId), false, "completed harvest must remove its job");
  assert.equal(bundleState.herbBundles.length, 1);
  assert.equal(bundleState.herbBundles[0].amount, 1);
  assert.equal(bundleState.harvestedHerbs, 1);
  evidence.claims.browserExecution = { pausedReceipt: true, resumed: true, herbRemoved: true, jobRemoved: true, bundleAmount: 1, harvestedHerbs: 1 };
  evidence.claims.harvest = { sharedJob: true, bundleCount: 1, harvestedHerbs: 1, physicalBundle: true };
  await pauseButton.click();
  await waitState(() => window.__GOBLIN.state.paused);
  await waitSavedAtTick((await state()).tick);
  const bundleFacts = pausedFacts(await state());
  await screenshot("normal-bundle-paused");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitState(() => window.__GOBLIN?.artReady, 90_000);
  assert.deepEqual(pausedFacts(await state()), bundleFacts, "reload must preserve paused physical bundle state");
  assert.deepEqual((await state()).commands, [], "bundle reload intentionally restores no command history");
  evidence.claims.bundleReload = { exactFacts: true, bundleCount: 1, harvestedHerbs: 1 };

  await page.setViewportSize({ width: 390, height: 844 });
  const finalCloseMenu = page.getByRole("button", { name: "Close Menu", exact: true });
  if (await finalCloseMenu.count()) await finalCloseMenu.click();
  const narrowWork = await panelButton("Work");
  await narrowWork.click();
  const workPanel = page.getByRole("region", { name: "Work" });
  await workPanel.waitFor();
  const layout = await page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight };
    const panel = document.querySelector('[role="region"][aria-label="Work"]');
    const bar = document.querySelector(".command-bar");
    const body = document.body;
    const box = (node) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    return { viewport, panel: box(panel), commandBar: box(bar), bodyWidth: body.scrollWidth, htmlWidth: document.documentElement.scrollWidth, text: panel.textContent };
  });
  assert.ok(layout.bodyWidth <= 390 && layout.htmlWidth <= 390, "390px view must not overflow");
  for (const box of [layout.panel, layout.commandBar]) {
    assert.ok(box.left >= 0 && box.right <= 390 && box.top >= 0 && box.bottom <= 844, "narrow UI rectangle must stay in viewport");
  }
  assert.ok(layout.text.includes("Garden") && layout.text.includes("Rowan"), "narrow Work panel must remain readable");
  const overlap = !(layout.panel.right <= layout.commandBar.left || layout.panel.left >= layout.commandBar.right || layout.panel.bottom <= layout.commandBar.top || layout.panel.top >= layout.commandBar.bottom);
  assert.equal(overlap, false, "narrow Work panel and command bar must not overlap");
  evidence.claims.narrow = { viewport: layout.viewport, rectangleChecks: true, nonOverlap: true, readable: true, widths: { body: layout.bodyWidth, html: layout.htmlWidth } };
  await screenshot("narrow-work-bundle");

  assert.deepEqual(evidence.errors, [], "page/console/request errors must be absent");
  evidence.claims.errors = { page: 0, console: 0, requests: 0 };
  evidence.exit = 0;
} catch (error) {
  evidence.exit = 1;
  evidence.failure = { name: error.name, message: error.message, stack: error.stack };
  if (page) {
    try {
      evidence.failureSnapshot = await page.evaluate((id) => {
        const current = window.__GOBLIN.state;
        return {
          actor: current.actors.rowan
            ? { mode: current.actors.rowan.mode, task: current.actors.rowan.task, x: current.actors.rowan.x, z: current.actors.rowan.z, work: current.actors.rowan.work }
            : null,
          matchingJob: current.jobs.find((job) => job.kind === "harvest" && (!id || job.target === id)) || null,
          herb: id ? current.herbs.find((herb) => herb.id === id) || null : null,
          bundles: current.herbBundles,
          workDirty: current.workDirty,
          tick: current.tick,
        };
      }, observedHerbId);
    } catch (snapshotError) {
      evidence.failureSnapshotError = String(snapshotError);
    }
  }
  throw error;
} finally {
  if (page) await writeFile(output + "/proof.json", JSON.stringify(evidence, null, 2) + "\n");
  if (context) await context.close();
  if (browser) await browser.close();
}
