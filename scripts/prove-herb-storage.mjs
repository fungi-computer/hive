import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/herb-storage-final-20260907";
const expected = {
  index: "66f02a9959a7ece661131fd22ca070d8a34620c18518758538ca0bd6344e59a8",
  gameJs: "568125734189a30f7379359469081d65772f72b49d64d7ec8508f967c1e0fd6e",
  gameCss: "45cbaed4bacf64b93ca69702f0330eab7e15ba41d67f7132c810e79ce96ab87c",
  artJs: "2c1a4b8112e7cd7eee8a627d34c20dc43923e02933e2440aafec9ce423dc6a99",
};
const names = {
  gameJs: "game-Bw8dvOJd.js",
  gameCss: "game-CxFQJg3g.css",
  artJs: "art-CdVqsH0V.js",
};
const runner =
  "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function assetRefs(html) {
  return [...html.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g)].map(
    (m) => m[1],
  );
}
function asset(list, kind, ext = "js") {
  return list.find((value) =>
    new RegExp("^assets/" + kind + ".*\\." + ext + "$").test(value),
  );
}

const localIndex = await readFile("dist/index.html");
const localRefs = assetRefs(localIndex.toString("utf8"));
const localAssets = {
  gameJs: asset(localRefs, "game"),
  gameCss: asset(localRefs, "game", "css"),
  artJs: asset(localRefs, "art"),
};
assert.deepEqual(localAssets, {
  gameJs: "assets/" + names.gameJs,
  gameCss: "assets/" + names.gameCss,
  artJs: "assets/" + names.artJs,
});
const localHashes = {
  index: sha256(localIndex),
  gameJs: sha256(await readFile("dist/" + localAssets.gameJs)),
  gameCss: sha256(await readFile("dist/" + localAssets.gameCss)),
  artJs: sha256(await readFile("dist/" + localAssets.artJs)),
};
assert.deepEqual(localHashes, expected, "frozen dist hash gate failed");

async function servedHash(assetUrl) {
  const response = await fetch(assetUrl);
  assert.equal(
    response.status,
    200,
    "served asset must return 200: " + assetUrl,
  );
  return sha256(Buffer.from(await response.arrayBuffer()));
}
const servedIndexResponse = await fetch(url);
assert.equal(servedIndexResponse.status, 200, "served index must return 200");
const servedIndexUrl = servedIndexResponse.url || url;
const servedIndex = Buffer.from(await servedIndexResponse.arrayBuffer());
const servedRefs = assetRefs(servedIndex.toString("utf8"));
const servedAssets = {
  gameJs: asset(servedRefs, "game"),
  gameCss: asset(servedRefs, "game", "css"),
  artJs: asset(servedRefs, "art"),
};
assert.deepEqual(servedAssets, localAssets, "served asset references drifted");
const servedHashes = {
  index: sha256(servedIndex),
  gameJs: await servedHash(new URL(servedAssets.gameJs, servedIndexUrl)),
  gameCss: await servedHash(new URL(servedAssets.gameCss, servedIndexUrl)),
  artJs: await servedHash(new URL(servedAssets.artJs, servedIndexUrl)),
};
assert.deepEqual(servedHashes, expected, "served dist parity failed");

await mkdir(output, { recursive: true });
const evidence = {
  url,
  output,
  frozenTarget: {
    source: "edf86ad5bda86fa05656ee91cc070bc17667fed8",
    assets: localAssets,
    hashes: localHashes,
  },
  servedParity: {
    indexUrl: servedIndexUrl,
    assets: servedAssets,
    hashes: servedHashes,
    matchesLocalDist: true,
  },
  scriptSha256: sha256(await readFile("scripts/prove-herb-storage.mjs")),
  wrapper: {
    runner,
    scope: "RuntimeMaxSec=10min; one focused herb storage browser proof",
  },
  errors: [],
  screenshots: [],
  claims: {},
};

let browser;
let context;
let page;
let observedBundleId = null;
const state = () => page.evaluate(() => window.__GOBLIN.state);
const selection = () => page.evaluate(() => window.__GOBLIN.selection);
const persistence = () => page.evaluate(() => window.__GOBLIN.persistence);
const project = (x, z, height = 0) =>
  page.evaluate(
    ([nextX, nextZ, nextHeight]) =>
      window.__GOBLIN.project(nextX, nextZ, nextHeight),
    [x, z, height],
  );
const waitState = (predicate, timeout = 45_000, value = null) =>
  page.waitForFunction(predicate, value, { timeout });
async function screenshot(name) {
  await page.screenshot({ path: output + "/" + name + ".png" });
  evidence.screenshots.push(name + ".png");
}
async function screenshotClip(name, clip) {
  await page.screenshot({ path: output + "/" + name + ".png", clip });
  evidence.screenshots.push(name + ".png");
}
async function clickPoint(point) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
}
async function clickCell(cell, height = 0.5) {
  const point = await project(cell.x, cell.z, height);
  await clickPoint(point);
  return point;
}
async function inspectWorld(kind, id, cell, height = 0.5) {
  const point = await project(cell.x, cell.z, height);
  const zoom = page.viewportSize().width >= 900 ? 2 : 1;
  const offsets = [
    [0, 0],
    [0, -8 * zoom],
    [-12 * zoom, -8 * zoom],
    [12 * zoom, -8 * zoom],
    [0, -18 * zoom],
    [-12 * zoom, -18 * zoom],
    [12 * zoom, -18 * zoom],
  ];
  const attempts = [];
  for (const [dx, dy] of offsets) {
    const at = { x: point.x + dx, y: point.y + dy };
    const owner = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element
        ? {
            tag: element.tagName,
            id: element.id || null,
            className:
              typeof element.className === "string" ? element.className : null,
          }
        : null;
    }, at);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(120);
    const current = await selection();
    attempts.push({ at, owner, selected: current[kind] ?? null });
    if (current[kind] === id) return attempts;
    for (const selector of [
      ".target-window button.close",
      ".character-window button.close",
    ]) {
      const close = page.locator(selector);
      if (await close.count()) await close.first().click();
    }
  }
  throw new Error(
    `could not inspect ${kind} ${id} with physical canvas clicks: ${JSON.stringify(attempts)}`,
  );
}
async function clickPanel(name) {
  const button = page.getByRole("button", { name, exact: true });
  await button.waitFor();
  await button.click();
}
async function waitSavedAtTick(tick, afterRevision) {
  await waitState(
    ({ expectedTick, previousRevision }) => {
      const save = window.__GOBLIN.persistence;
      return (
        save.phase === "saved" &&
        save.tick === expectedTick &&
        save.revision > previousRevision &&
        window.__GOBLIN.state.paused
      );
    },
    45_000,
    { expectedTick: tick, previousRevision: afterRevision },
  );
}
function actorFacts(actor) {
  return {
    id: actor.id,
    x: actor.x,
    z: actor.z,
    level: actor.level,
    mode: actor.mode,
    work: actor.work,
    path: actor.path,
    leg: actor.leg,
    task: actor.task,
    assignment: actor.assignment,
    cargo: actor.cargo,
    drafted: actor.drafted,
  };
}
function frozenWorld(next) {
  return {
    tick: next.tick,
    feed: next.feed,
    actors: Object.fromEntries(
      Object.entries(next.actors).map(([id, actor]) => [
        id,
        {
          x: actor.x,
          z: actor.z,
          level: actor.level,
          work: actor.work,
        },
      ]),
    ),
  };
}
function storageFacts(next, shelfId, bundleId) {
  return {
    tick: next.tick,
    paused: next.paused,
    actor: actorFacts(next.actors.rowan),
    bundle:
      next.herbBundles.find((candidate) => candidate.id === bundleId) || null,
    shelf: next.sites.find((site) => site.id === shelfId) || null,
    jobs: next.jobs.filter(
      (job) =>
        job.kind === "store-herb" &&
        (job.bundle === bundleId || job.shelf === shelfId),
    ),
    claim: next.herbStorageClaims.rowan || null,
    piles: next.piles,
    consumedWood: next.consumedWood,
    harvestedHerbs: next.harvestedHerbs,
  };
}
function clearCell(next, awayFrom = null) {
  const blocked = new Set();
  const key = (cell) => [cell.x, cell.z, cell.level ?? 0].join(",");
  for (const cell of [
    ...(next.trees || []),
    ...(next.rocks || []),
    next.watcher,
    ...(next.piles || []),
    ...(next.herbs || []),
    ...(next.herbBundles || []),
    ...(next.sites || []),
  ])
    blocked.add(key(cell));
  for (const actor of Object.values(next.actors)) blocked.add(key(actor));
  const candidates = [];
  for (let z = 1; z < 14; z++) {
    for (let x = 1; x < 14; x++) {
      const cell = { x, z, level: 0 };
      if (!blocked.has(key(cell))) candidates.push(cell);
    }
  }
  if (awayFrom)
    candidates.sort(
      (left, right) =>
        Math.abs(right.x - awayFrom.x) +
        Math.abs(right.z - awayFrom.z) -
        (Math.abs(left.x - awayFrom.x) + Math.abs(left.z - awayFrom.z)),
    );
  if (candidates.length) return candidates[0];
  throw new Error("no clear cell");
}
function visibleTextureClaim() {
  return {
    available: false,
    reason:
      "__GOBLIN exposes state/project only; no stable runtime texture identity hook",
  };
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => evidence.errors.push("pageerror: " + error));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.push("console: " + message.text());
  });
  page.on("requestfailed", (request) =>
    evidence.errors.push(
      "requestfailed: " +
        request.url() +
        " · " +
        (request.failure()?.errorText || "unknown"),
    ),
  );

  assert.equal(
    (await page.goto(url, { waitUntil: "domcontentloaded" }))?.status(),
    200,
  );
  await waitState(() => window.__GOBLIN?.artReady, 90_000);
  await page.waitForSelector("#stage canvas");
  assert.equal((await state()).paused, true);
  assert.equal((await selection()).bundle, null);
  await page.locator("#continue").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);

  const oak = (await state()).trees.find((tree) => tree.felledAt === null);
  assert.ok(oak, "fresh clearing must contain a standing oak");
  await clickCell(oak, 1.5);
  await waitState(
    (id) => window.__GOBLIN.selection.tree === id,
    15_000,
    oak.id,
  );
  await page.locator("#mark-chop").click();
  await waitState(
    (id) =>
      window.__GOBLIN.state.jobs.some(
        (job) => job.kind === "chop" && job.target === id,
      ),
    15_000,
    oak.id,
  );
  await page.locator("#speed").click();
  assert.ok((await page.locator("#speed").innerText()).includes("4×"));
  await page.locator("#pause").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await waitState(
    (id) =>
      window.__GOBLIN.state.trees.find((tree) => tree.id === id)?.felledAt !==
      null,
    45_000,
    oak.id,
  );
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);

  if (!(await page.locator('[data-build="shelf"]').count()))
    await clickPanel("Build");
  await page.locator('[data-build="shelf"]').click();
  const shelfCell = clearCell(await state());
  const oldSiteIds = (await state()).sites.map((site) => site.id);
  await clickCell(shelfCell, 0);
  await waitState(
    (ids) =>
      window.__GOBLIN.state.sites.some(
        (site) => site.type === "shelf" && !ids.includes(site.id),
      ),
    15_000,
    oldSiteIds,
  );
  if (await page.locator("#task").count()) await page.locator("#task").click();
  const shelf = (await state()).sites.find(
    (site) => site.type === "shelf" && !oldSiteIds.includes(site.id),
  );
  assert.ok(shelf);
  assert.deepEqual(
    { x: shelf.x, z: shelf.z, level: shelf.level },
    shelfCell,
    "shelf click and admitted footprint must use the same ground cell",
  );
  await page.locator("#pause").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await waitState(
    (id) =>
      window.__GOBLIN.state.sites.find((site) => site.id === id)?.finishedAt !==
      null,
    45_000,
    shelf.id,
  );
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);

  if (!(await page.locator("#herb-tool").count())) await clickPanel("Build");
  await page.locator("#herb-tool").click();
  const herbCell = clearCell(await state(), shelf);
  await clickCell(herbCell, 0);
  await waitState(
    () =>
      window.__GOBLIN.state.herbs.length === 1 &&
      window.__GOBLIN.state.jobs.some((job) => job.kind === "sow"),
  );
  const herbId = (await state()).herbs[0].id;
  if (await page.locator("#cancel-herb").count())
    await page.locator("#cancel-herb").click();
  const closeBuild = page.getByRole("button", {
    name: "Close Build",
    exact: true,
  });
  if (await closeBuild.count()) await closeBuild.click();
  await page.locator("#pause").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await waitState(
    (id) =>
      window.__GOBLIN.state.herbs.find((herb) => herb.id === id)?.stage ===
      "planted",
    45_000,
    herbId,
  );
  const plantedHerb = (await state()).herbs.find((herb) => herb.id === herbId);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  evidence.claims.herbInspection = await inspectWorld(
    "herb",
    herbId,
    plantedHerb,
    0.5,
  );
  await waitState(
    (id) =>
      window.__GOBLIN.state.herbs.find((herb) => herb.id === id)?.stage ===
      "ready",
    45_000,
    herbId,
  );
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  const harvest = page.locator("#harvest-herb");
  assert.equal(await harvest.count(), 1);
  await harvest.click();
  await waitState(
    (id) =>
      window.__GOBLIN.state.jobs.some(
        (job) => job.kind === "harvest" && job.target === id,
      ),
    15_000,
    herbId,
  );
  const harvestReceipt = await state();
  assert.equal(
    harvestReceipt.jobs.find((job) => job.kind === "harvest")?.scope.actors,
    null,
  );
  await page.locator("#pause").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await waitState(
    () =>
      window.__GOBLIN.state.herbBundles.length === 1 &&
      window.__GOBLIN.state.harvestedHerbs === 1,
    45_000,
  );
  const harvested = await state();
  const bundle = harvested.herbBundles[0];
  observedBundleId = bundle.id;
  assert.equal(bundle.amount, 1);
  assert.equal(bundle.location.kind, "ground");
  assert.equal(harvested.herbs.length, 0);
  evidence.claims.harvest = {
    bundleId: bundle.id,
    amount: 1,
    harvestedHerbs: 1,
    location: bundle.location,
  };

  evidence.claims.bundleInspection = await inspectWorld(
    "bundle",
    bundle.id,
    bundle.location,
    0.5,
  );
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  await page.getByRole("region", { name: "Mugwort bundle actions" }).waitFor();
  const storeButton = page.locator(
    '[data-action="store-herb"][data-bundle="' +
      bundle.id +
      '"][data-site="' +
      shelf.id +
      '"]',
  );
  assert.equal(await storeButton.count(), 1);
  const beforeStore = await state();
  const beforeStoreFrozen = frozenWorld(beforeStore);
  await storeButton.click();
  await waitState(
    (id) =>
      window.__GOBLIN.state.jobs.some(
        (job) => job.kind === "store-herb" && job.bundle === id,
      ),
    15_000,
    bundle.id,
  );
  const storeAdmission = await state();
  assert.deepEqual(
    frozenWorld(storeAdmission),
    beforeStoreFrozen,
    "paused Store admission must freeze tick/actor positions/work/feed",
  );
  const storeJob = storeAdmission.jobs.find(
    (job) => job.kind === "store-herb" && job.bundle === bundle.id,
  );
  assert.ok(storeJob);
  assert.equal(storeJob.scope.party, "home");
  assert.equal(storeJob.scope.actors, null);
  const storeCommand = storeAdmission.commands.find(
    (command) =>
      command.kind === "store-herb" &&
      command.bundle === bundle.id &&
      command.shelf === shelf.id,
  );
  assert.ok(storeCommand);
  assert.equal(storeCommand.actors, null);
  evidence.claims.pausedStoreAdmission = {
    tick: storeAdmission.tick,
    bundleId: bundle.id,
    shelfId: shelf.id,
    actors: null,
    frozenWorld: true,
    appliedCommand: true,
  };
  await page.locator("#speed").click();
  assert.ok(
    (await page.locator("#speed").innerText()).includes("1×"),
    "storage pickup observation runs at normal speed",
  );
  await page.locator("#pause").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await waitState(
    (id) => window.__GOBLIN.state.herbStorageClaims.rowan?.bundle === id,
    45_000,
    bundle.id,
  );
  await waitState(
    (id) =>
      window.__GOBLIN.state.herbBundles.find((candidate) => candidate.id === id)
        ?.location.kind === "carried",
    45_000,
    bundle.id,
  );
  const carried = await state();
  assert.equal(
    carried.herbBundles.find((candidate) => candidate.id === bundle.id)
      ?.location.actor,
    "rowan",
  );
  evidence.claims.carryHerb = {
    bundleId: bundle.id,
    claim: carried.herbStorageClaims.rowan,
    location: carried.herbBundles.find(
      (candidate) => candidate.id === bundle.id,
    ).location,
    textureIdentity: visibleTextureClaim(),
  };
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  const pausedCarry = await state();
  const pausedBundle = pausedCarry.herbBundles.find(
    (candidate) => candidate.id === bundle.id,
  );
  assert.equal(pausedBundle.location.kind, "carried");
  const actorPoint = await project(
    pausedCarry.actors.rowan.x,
    pausedCarry.actors.rowan.z,
    0,
  );
  const actorClip = {
    x: Math.max(0, actorPoint.x - 55),
    y: Math.max(0, actorPoint.y - 100),
    width: 110,
    height: 110,
  };
  await screenshot("normal-carried-paused");
  await screenshotClip("carried-actor-paused-a", actorClip);
  await page.waitForTimeout(250);
  const pausedCarryLater = await state();
  assert.equal(pausedCarryLater.tick, pausedCarry.tick);
  assert.equal(
    pausedCarryLater.herbBundles.find((candidate) => candidate.id === bundle.id)
      .location.kind,
    "carried",
  );
  await screenshotClip("carried-actor-paused-b", actorClip);
  const carryA = sha256(await readFile(output + "/carried-actor-paused-a.png"));
  const carryB = sha256(await readFile(output + "/carried-actor-paused-b.png"));
  assert.equal(
    carryA,
    carryB,
    "paused carried render must remain visually stationary",
  );

  await page.locator("#select-rowan").click();
  const draft = page.locator("#draft");
  assert.equal(await draft.count(), 1);
  const beforeDraft = await state();
  const beforeDraftFrozen = frozenWorld(beforeDraft);
  const beforeDraftRevision = (await persistence()).revision ?? -1;
  await draft.click();
  await waitState(() => window.__GOBLIN.state.actors.rowan.drafted === true);
  const afterDraft = await state();
  const dropped = afterDraft.herbBundles.find(
    (candidate) => candidate.id === bundle.id,
  );
  assert.deepEqual(
    frozenWorld(afterDraft),
    beforeDraftFrozen,
    "paused Draft interruption must freeze tick/position/work/feed",
  );
  assert.equal(dropped.location.kind, "ground");
  assert.deepEqual(
    {
      x: dropped.location.x,
      z: dropped.location.z,
      level: dropped.location.level,
    },
    {
      x: afterDraft.actors.rowan.x,
      z: afterDraft.actors.rowan.z,
      level: afterDraft.actors.rowan.level,
    },
  );
  assert.equal(afterDraft.herbStorageClaims.rowan, undefined);
  assert.ok(
    afterDraft.jobs.some(
      (job) =>
        job.kind === "store-herb" &&
        job.bundle === bundle.id &&
        job.shelf === shelf.id,
    ),
  );
  evidence.claims.draftDrop = {
    sameBundleId: true,
    sameCell: true,
    claimReleased: true,
    storeJobRetained: true,
    tickFrozen: true,
  };
  await waitSavedAtTick(afterDraft.tick, beforeDraftRevision);
  const draftFacts = storageFacts(await state(), shelf.id, bundle.id);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitState(() => window.__GOBLIN?.artReady, 90_000);
  assert.deepEqual(
    storageFacts(await state(), shelf.id, bundle.id),
    draftFacts,
    "reload must restore paused v5 storage snapshot",
  );
  assert.deepEqual(
    (await state()).commands,
    [],
    "reload restores no command history",
  );
  evidence.claims.draftReload = {
    exactPausedSnapshot: true,
    bundleId: bundle.id,
    tick: draftFacts.tick,
    jobRetained: true,
  };
  const closeMenu = page.getByRole("button", {
    name: "Close Menu",
    exact: true,
  });
  if (await closeMenu.count()) await closeMenu.click();
  await page.locator("#select-rowan").click();
  await page.locator("#draft").click();
  await waitState(() => window.__GOBLIN.state.actors.rowan.drafted === false);
  await page.locator("#speed").click();
  assert.ok((await page.locator("#speed").innerText()).includes("4×"));
  await page.locator("#pause").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await waitState(
    (target) => {
      const candidate = window.__GOBLIN.state.herbBundles.find(
        (bundle) => bundle.id === target.bundleId,
      );
      return (
        candidate?.location.kind === "stored" &&
        candidate.location.site === target.shelfId
      );
    },
    45_000,
    { bundleId: bundle.id, shelfId: shelf.id },
  );
  const stored = await state();
  const storedBundle = stored.herbBundles.find(
    (candidate) => candidate.id === bundle.id,
  );
  const storedShelf = stored.sites.find((site) => site.id === shelf.id);
  assert.equal(storedBundle.location.kind, "stored");
  assert.equal(storedBundle.location.site, shelf.id);
  assert.equal(
    storedShelf &&
      stored.herbBundles.filter(
        (candidate) =>
          candidate.location.kind === "stored" &&
          candidate.location.site === shelf.id,
      ).length,
    1,
  );
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  const closeCharacter = page.getByRole("button", {
    name: "Close Character",
    exact: true,
  });
  if (await closeCharacter.count()) await closeCharacter.click();
  evidence.claims.shelfInspection = await inspectWorld(
    "site",
    shelf.id,
    shelf,
    0.5,
  );
  const shelfRegion = page.getByRole("region", { name: "Structure actions" });
  await shelfRegion.waitFor();
  assert.match(await shelfRegion.textContent(), /Mugwort 1\/1/);
  await screenshot("normal-shelf-filled");
  evidence.claims.stored = {
    bundleId: bundle.id,
    shelfId: shelf.id,
    shelfCard: "1/1",
    storedLocation: storedBundle.location,
  };

  const consumedBeforeDeconstruct = (await state()).consumedWood;
  await page.locator("#deconstruct").click();
  await waitState(
    (id) =>
      window.__GOBLIN.state.jobs.some(
        (job) => job.kind === "deconstruct" && job.target === id,
      ),
    15_000,
    shelf.id,
  );
  await page.locator("#pause").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await waitState(
    (target) => {
      const current = window.__GOBLIN.state;
      const candidate = current.herbBundles.find(
        (bundle) => bundle.id === target.bundleId,
      );
      return (
        !current.sites.some((site) => site.id === target.shelfId) &&
        candidate?.location.kind === "ground" &&
        candidate.location.x === target.x &&
        candidate.location.z === target.z
      );
    },
    45_000,
    { shelfId: shelf.id, bundleId: bundle.id, x: shelf.x, z: shelf.z },
  );
  const deconstructed = await state();
  const ejected = deconstructed.herbBundles.find(
    (candidate) => candidate.id === bundle.id,
  );
  const salvage = deconstructed.piles.find(
    (pile) => pile.x === shelf.x && pile.z === shelf.z && pile.amount === 1,
  );
  assert.equal(ejected.location.kind, "ground");
  assert.deepEqual(
    {
      x: ejected.location.x,
      z: ejected.location.z,
      level: ejected.location.level,
    },
    { x: shelf.x, z: shelf.z, level: shelf.level },
  );
  assert.ok(
    salvage,
    "shelf deconstruction must eject one wood at the vacated cell",
  );
  assert.equal(deconstructed.consumedWood, consumedBeforeDeconstruct);
  assert.equal(deconstructed.herbBundles.length, 1);
  assert.equal(deconstructed.harvestedHerbs, 1);
  evidence.claims.deconstruct = {
    shelfGone: true,
    sameBundleId: true,
    bundleLocation: ejected.location,
    salvageWood: 1,
    consumedWoodUnchanged: true,
    herbConserved: true,
  };
  const beforeFinalSaveRevision = (await persistence()).revision ?? -1;
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  const finalPaused = await state();
  await waitSavedAtTick(finalPaused.tick, beforeFinalSaveRevision);
  const finalFacts = storageFacts(await state(), shelf.id, bundle.id);
  await screenshot("normal-deconstructed-paused");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitState(() => window.__GOBLIN?.artReady, 90_000);
  assert.deepEqual(
    storageFacts(await state(), shelf.id, bundle.id),
    finalFacts,
    "reload must preserve deconstructed paused state",
  );
  assert.deepEqual(
    (await state()).commands,
    [],
    "final reload restores no command history",
  );
  evidence.claims.deconstructReload = {
    exactPausedState: true,
    bundleId: bundle.id,
    tick: finalFacts.tick,
  };

  await page.setViewportSize({ width: 390, height: 844 });
  const finalMenu = page.getByRole("button", {
    name: "Close Menu",
    exact: true,
  });
  if (await finalMenu.count()) await finalMenu.click();
  const finalBundle = (await state()).herbBundles.find(
    (candidate) => candidate.id === bundle.id,
  );
  evidence.claims.narrowBundleInspection = await inspectWorld(
    "bundle",
    bundle.id,
    finalBundle.location,
    0.5,
  );
  const narrowCard = page.getByRole("region", {
    name: "Mugwort bundle actions",
  });
  await narrowCard.waitFor();
  const layout = await page.evaluate(() => {
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const roster = document.querySelector(".roster");
    const story = document.querySelector(".story");
    const card = document.querySelector(
      '[role="region"][aria-label="Mugwort bundle actions"]',
    );
    return {
      viewport: { width: innerWidth, height: innerHeight },
      bodyWidth: document.body.scrollWidth,
      htmlWidth: document.documentElement.scrollWidth,
      roster: box(roster),
      story: box(story),
      card: box(card),
      text: card.textContent,
    };
  });
  assert.ok(layout.bodyWidth <= 390 && layout.htmlWidth <= 390);
  for (const rect of [layout.roster, layout.story, layout.card])
    assert.ok(
      rect.left >= 0 &&
        rect.right <= 390 &&
        rect.top >= 0 &&
        rect.bottom <= 844,
    );
  assert.ok(layout.text.includes("Loose bundle"));
  evidence.claims.narrow = {
    viewport: layout.viewport,
    rectangleChecks: true,
    readableCard: true,
    bodyWidth: layout.bodyWidth,
    htmlWidth: layout.htmlWidth,
  };
  await screenshot("narrow-roster-story-bundle");

  await page
    .getByRole("button", { name: "Open game menu", exact: true })
    .click();
  await page.getByRole("button", { name: "New clearing", exact: true }).click();
  await waitState(() => {
    const current = window.__GOBLIN.state;
    return (
      current.paused &&
      current.tick === 0 &&
      current.jobs.length === 0 &&
      current.sites.length === 0 &&
      current.herbs.length === 0 &&
      current.herbBundles.length === 0 &&
      current.parties.home.members.length === 1
    );
  });
  evidence.claims.reset = { cleanPausedState: true };
  assert.deepEqual(evidence.errors, []);
  evidence.claims.errors = { page: 0, console: 0, requests: 0 };
  evidence.exit = 0;
} catch (error) {
  evidence.exit = 1;
  evidence.failure = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  if (page) {
    try {
      evidence.failureSnapshot = await page.evaluate((id) => {
        const current = window.__GOBLIN.state;
        return {
          tick: current.tick,
          paused: current.paused,
          actor: current.actors.rowan,
          selection: window.__GOBLIN.selection,
          herbs: current.herbs,
          bundle: id
            ? current.herbBundles.find((candidate) => candidate.id === id) ||
              null
            : null,
          jobs: current.jobs,
          claims: current.herbStorageClaims,
          sites: current.sites,
          piles: current.piles,
          notice: current.notice,
        };
      }, observedBundleId);
    } catch (snapshotError) {
      evidence.failureSnapshotError = String(snapshotError);
    }
  }
  throw error;
} finally {
  if (page)
    await writeFile(
      output + "/proof.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
  if (context) await context.close();
  if (browser) await browser.close();
}
