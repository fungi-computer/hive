#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = path.resolve(
  process.argv[3] || ".botanical/structure-hit-go-local",
);
const runner =
  "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh";
const expectedNames = {
  gameJs: "game-Da9L3nkd.js",
  gameCss: "game-CvQe2sTu.css",
  artJs: "art-Nx9QtN6s.js",
};
const expectedHashes = {
  index: "7e663e596bce790a4d1f0a4975a5bcbf4220e2e2840051e718f7f1d79f9841fb",
  gameJs: "ccb6dd72dd1034d01256c7d33eeff835cb7b2e9cd426930e2c3332868440ece0",
  gameCss: "1321c9548f927b8ee60b36a6168e35b61a89f6b9e753362987bd7676ecc9a175",
  artJs: "4b1fd019e9478a70544c935cdd241ab74e92c00dd002164bb1d897d0b768e9a0",
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const refs = (html) =>
  [...html.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g)].map(
    (match) => match[1],
  );
const resolveAssets = (assets) => ({
  gameJs: assets.find((asset) => /^assets\/game-.*\.js$/.test(asset)),
  gameCss: assets.find((asset) => /^assets\/game-.*\.css$/.test(asset)),
  artJs: assets.find((asset) => /^assets\/art-.*\.js$/.test(asset)),
});
const cellKey = (cell) => `${cell.x},${cell.z},${cell.level ?? 0}`;
const clone = (value) => structuredClone(value);

const evidence = {
  url,
  output,
  frozenTarget: {
    sourceCommit: "32cd423",
    expectedNames,
    expectedHashes,
  },
  localHashes: {},
  servedHashes: {},
  scriptSha256: null,
  wrapper: {
    runner,
    expectedDuration: "short focused run; no upstairs fixture",
    scope:
      "one ground wall silhouette/padding proof plus armed right-click cancellation",
  },
  screenshots: [],
  errors: { page: [], console: [], request: [] },
  claims: {},
  success: false,
  failure: null,
};

let browser;
let context;
let page;
let failure;

const state = () => page.evaluate(() => structuredClone(window.__GOBLIN.state));
const selection = () =>
  page.evaluate(() => structuredClone(window.__GOBLIN.selection));
const waitFor = (predicate, value = null, timeout = 45_000) =>
  page.waitForFunction(predicate, value, { timeout });
const screenshot = async (name) => {
  await page.screenshot({ path: path.join(output, name), fullPage: true });
  evidence.screenshots.push(name);
};
const project = (cell, height = 0) =>
  page.evaluate(
    ({ cell: { x, z, level }, height: nextHeight }) =>
      window.__GOBLIN.project(x, z, nextHeight, level ?? 0),
    { cell, height },
  );
const clickCell = async (cell, height = 0, button = "left") => {
  const point = await project(cell, height);
  await page.mouse.click(point.x, point.y, { button });
  return point;
};

function selectedSiteId(current) {
  if (current.inspectedTarget?.kind === "site")
    return current.inspectedTarget.id;
  return current.site ?? null;
}

function occupiedGround(state, cell) {
  const same = (other) =>
    other.x === cell.x &&
    other.z === cell.z &&
    (other.level ?? 0) === (cell.level ?? 0);
  if (
    state.rocks.some(same) ||
    state.trees.some((tree) => tree.felledAt === null && same(tree))
  )
    return true;
  if (same(state.watcher) || same(state.cat)) return true;
  if (Object.values(state.actors).some(same)) return true;
  if (state.piles.some((pile) => pile.amount > 0 && same(pile))) return true;
  if (
    state.herbBundles.some(
      (bundle) => bundle.location.kind === "ground" && same(bundle.location),
    )
  )
    return true;
  return state.sites.some((site) =>
    site.type === "wall" || site.type === "door"
      ? same(site)
      : site.x === cell.x &&
        site.z === cell.z &&
        (site.level ?? 0) === (cell.level ?? 0),
  );
}

function clearCell(state, avoid = []) {
  const forbidden = new Set(avoid.map(cellKey));
  const preferred = [];
  for (const person of Object.values(state.actors)) {
    const origin = {
      x: Math.round(person.x),
      z: Math.round(person.z),
      level: person.level ?? 0,
    };
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [2, 0],
      [0, 2],
      [-2, 0],
      [0, -2],
    ])
      preferred.push({
        x: origin.x + dx,
        z: origin.z + dz,
        level: origin.level,
      });
  }
  for (let x = 1; x < 14; x++)
    for (let z = 1; z < 14; z++) preferred.push({ x, z, level: 0 });
  const result = preferred.find(
    (cell) =>
      cell.x >= 0 &&
      cell.z >= 0 &&
      cell.x < 15 &&
      cell.z < 15 &&
      !forbidden.has(cellKey(cell)) &&
      !occupiedGround(state, cell),
  );
  assert.ok(result, "A clear ground cell is required");
  return result;
}

async function setSpeed4() {
  while ((await page.locator("#speed").textContent()) !== "4×")
    await page.locator("#speed").click();
}

async function pause() {
  if (!(await state()).paused) {
    await page.locator("#pause").click();
    await waitFor(() => window.__GOBLIN.state.paused === true);
  }
}

async function resume() {
  if ((await state()).paused) {
    await page.locator("#pause").click();
    await waitFor(() => window.__GOBLIN.state.paused === false);
  }
}

async function openBuild() {
  const panel = page.getByRole("region", { name: "Build", exact: true });
  if (!(await panel.count()))
    await page.getByRole("button", { name: "Build", exact: true }).click();
  await panel.waitFor({ state: "visible" });
}

try {
  await mkdir(output, { recursive: true });
  evidence.scriptSha256 = sha256(
    await readFile("scripts/prove-structure-hit-go.mjs"),
  );

  const localIndex = await readFile("dist/index.html");
  const localAssets = resolveAssets(refs(localIndex.toString("utf8")));
  assert.deepEqual(
    localAssets,
    {
      gameJs: `assets/${expectedNames.gameJs}`,
      gameCss: `assets/${expectedNames.gameCss}`,
      artJs: `assets/${expectedNames.artJs}`,
    },
    "frozen dist asset names drifted",
  );
  evidence.localHashes = {
    index: sha256(localIndex),
    gameJs: sha256(await readFile(`dist/${localAssets.gameJs}`)),
    gameCss: sha256(await readFile(`dist/${localAssets.gameCss}`)),
    artJs: sha256(await readFile(`dist/${localAssets.artJs}`)),
  };
  assert.deepEqual(
    evidence.localHashes,
    expectedHashes,
    "frozen dist hashes drifted",
  );

  const servedIndexResponse = await fetch(url);
  assert.equal(servedIndexResponse.status, 200, "served index must return 200");
  const servedIndexUrl = servedIndexResponse.url || url;
  const servedIndex = Buffer.from(await servedIndexResponse.arrayBuffer());
  const servedAssets = resolveAssets(refs(servedIndex.toString("utf8")));
  assert.deepEqual(servedAssets, localAssets, "served asset names drifted");
  const fetchAssetHash = async (asset) => {
    const response = await fetch(new URL(asset, servedIndexUrl));
    assert.equal(
      response.status,
      200,
      `served asset must return 200: ${asset}`,
    );
    return sha256(Buffer.from(await response.arrayBuffer()));
  };
  evidence.servedHashes = {
    index: sha256(servedIndex),
    gameJs: await fetchAssetHash(servedAssets.gameJs),
    gameCss: await fetchAssetHash(servedAssets.gameCss),
    artJs: await fetchAssetHash(servedAssets.artJs),
  };
  assert.deepEqual(
    evidence.servedHashes,
    expectedHashes,
    "served hashes drifted",
  );

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
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => evidence.errors.page.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.console.push(message.text());
  });
  page.on("requestfailed", (request) =>
    evidence.errors.request.push(
      `${request.url()} · ${request.failure()?.errorText || "unknown"}`,
    ),
  );

  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 45_000,
  });
  await page.waitForSelector("#stage canvas");
  await page.locator("#reset").click();
  await waitFor(
    () => window.__GOBLIN.state.tick === 0 && window.__GOBLIN.state.paused,
  );
  await waitFor(() => window.__GOBLIN.persistence.phase === "saved");

  let current = await selection();
  if (!current.selectedIds.includes("rowan")) {
    await page.locator("#select-rowan").click();
    await waitFor(() =>
      window.__GOBLIN.selection.selectedIds.includes("rowan"),
    );
  }
  const first = await state();
  const oak = first.trees.find((tree) => tree.felledAt === null);
  assert.ok(oak, "one standing oak is required for the wall fixture");
  await clickCell(oak, 1.5);
  await page
    .getByRole("region", { name: "Oak actions", exact: true })
    .waitFor({ state: "visible" });
  await page.locator("#chop-now").click();
  await waitFor(
    (oakId) =>
      window.__GOBLIN.state.jobs.some(
        (job) =>
          job.kind === "chop" &&
          job.target === oakId &&
          job.scope.actors?.includes("rowan"),
      ),
    oak.id,
  );
  await setSpeed4();
  await resume();
  await waitFor(
    () =>
      window.__GOBLIN.state.felled >= 1 &&
      window.__GOBLIN.state.piles.some((pile) => pile.amount > 0),
  );
  await pause();

  current = await state();
  const wallCell = clearCell(current);
  await openBuild();
  await page.locator('[data-build="wall"]').click();
  await waitFor(() => window.__GOBLIN.selection.tool === "wall");
  const beforeSites = current.sites.length;
  await clickCell(wallCell);
  await waitFor(
    (before) => window.__GOBLIN.state.sites.length > before,
    beforeSites,
  );
  const placed = (await state()).sites.find(
    (site) =>
      site.type === "wall" &&
      site.x === wallCell.x &&
      site.z === wallCell.z &&
      (site.level ?? 0) === 0,
  );
  assert.ok(placed, "real Wall placement must create the ground site");
  await page.locator("#task").click();
  await waitFor(() => window.__GOBLIN.selection.tool === null);
  await resume();
  await waitFor(
    (wallId) =>
      window.__GOBLIN.state.sites.some(
        (site) => site.id === wallId && site.finishedAt !== null,
      ),
    placed.id,
  );
  await pause();

  const wallBodyPoint = await project(wallCell, 1.1);
  await page.mouse.click(wallBodyPoint.x, wallBodyPoint.y);
  await waitFor(
    (wallId) => window.__GOBLIN.selection.inspectedTarget?.id === wallId,
    placed.id,
  );
  current = await selection();
  assert.equal(selectedSiteId(current), placed.id);
  await screenshot("01-visible-wall-body-selected.png");
  evidence.claims.visibleWall = {
    site: clone(placed),
    point: wallBodyPoint,
    selectedSite: selectedSiteId(current),
  };

  const negativeCell = clearCell(await state(), [wallCell]);
  const wallAnchorPoint = await project(wallCell);
  const paddingPoint = await project(negativeCell);
  const paddingLocal = {
    x: paddingPoint.x - wallAnchorPoint.x,
    y: paddingPoint.y - wallAnchorPoint.y,
  };
  assert.ok(
    Math.abs(paddingLocal.x) >= 24 &&
      Math.abs(paddingLocal.x) < 56 &&
      paddingLocal.y > -78 &&
      paddingLocal.y < 35,
    "the empty-ground click must lie inside the wall sprite's old 112px bounds",
  );
  await page.mouse.click(paddingPoint.x, paddingPoint.y);
  await waitFor(() => window.__GOBLIN.selection.inspectedTarget === null);
  current = await selection();
  assert.equal(selectedSiteId(current), null);
  await screenshot("02-transparent-padding-does-not-select.png");

  evidence.claims.paddingAndGround = {
    negativeCell,
    paddingPoint,
    wallAnchorPoint,
    paddingLocal,
    paddingSelection: clone(current),
  };

  await openBuild();
  await page.locator('[data-build="wall"]').click();
  await waitFor(() => window.__GOBLIN.selection.tool === "wall");
  const beforeCancel = await state();
  const goBefore = clone(beforeCancel.actors.rowan);
  const cancelPoint = paddingPoint;
  await page.mouse.click(cancelPoint.x, cancelPoint.y, { button: "right" });
  await waitFor(() => window.__GOBLIN.selection.tool === null);
  const afterCancel = await state();
  assert.equal(afterCancel.sites.length, beforeCancel.sites.length);
  assert.equal(afterCancel.jobs.length, beforeCancel.jobs.length);
  assert.deepEqual(
    [
      afterCancel.actors.rowan.x,
      afterCancel.actors.rowan.z,
      afterCancel.actors.rowan.level,
    ],
    [goBefore.x, goBefore.z, goBefore.level],
  );
  await screenshot("03-armed-wall-rightclick-consumed.png");
  evidence.claims.armedRightClick = {
    toolAfter: (await selection()).tool,
    siteCountUnchanged: afterCancel.sites.length === beforeCancel.sites.length,
    jobCountUnchanged: afterCancel.jobs.length === beforeCancel.jobs.length,
    rowanDidNotGo: true,
    point: cancelPoint,
  };

  assert.deepEqual(evidence.errors, { page: [], console: [], request: [] });
  evidence.success = true;
} catch (error) {
  failure = error;
  evidence.failure = String(error?.stack || error);
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await writeFile(
    path.join(output, "proof.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
}

if (failure) throw failure;
