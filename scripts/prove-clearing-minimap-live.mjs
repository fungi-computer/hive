import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [
  url = "http://127.0.0.1:5188/",
  output = ".botanical/clearing-minimap-live",
] = process.argv.slice(2);
const distRoot = process.env.HIVE_DIST_ROOT || null;
const runner =
  "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assetRefs = (html) =>
  [...html.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g)].map(
    (match) => match[1],
  );
const state = () => page.evaluate(() => structuredClone(window.__GOBLIN.state));
const selection = () =>
  page.evaluate(() => structuredClone(window.__GOBLIN.selection));
const waitState = (predicate, value = null, timeout = 45_000) =>
  page.waitForFunction(predicate, value, { timeout });

function simulationSnapshot(current) {
  return structuredClone(current);
}

function clearGroundCell(current) {
  const key = (cell) => `${cell.x},${cell.z},${cell.level ?? 0}`;
  const blocked = new Set(
    [
      ...current.trees,
      ...current.rocks,
      current.watcher,
      ...current.herbs,
      ...current.sites,
      ...Object.values(current.actors),
      ...current.materials.lots
        .filter((lot) => lot.location.kind === "ground")
        .map((lot) => lot.location),
    ].map(key),
  );
  for (let z = 2; z <= 12; z++)
    for (let x = 2; x <= 12; x++) {
      const cell = { x, z, level: 0 };
      if (!blocked.has(key(cell))) return cell;
    }
  throw new Error("no clear ground cell for the Wall preview");
}

function visibleArea() {
  return page
    .locator(".clearing-minimap-footprint polygon")
    .getAttribute("points");
}

function assertVisibleArea(points) {
  assert.ok(points, "Visible area polygon must have points");
  const values = points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number));
  assert.ok(values.length >= 3, "Visible area needs a polygon, not an extent");
  assert.ok(
    values.every(
      ([x, z]) =>
        Number.isFinite(x) &&
        Number.isFinite(z) &&
        x >= 0 &&
        x <= 15 &&
        z >= 0 &&
        z <= 15,
    ),
    "Visible area points must be clipped to local 15×15 cell edges",
  );
}

function polygonArea(points) {
  const values = points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number));
  return Math.abs(
    values.reduce((area, [x, z], index) => {
      const [nextX, nextZ] = values[(index + 1) % values.length];
      return area + x * nextZ - z * nextX;
    }, 0) / 2,
  );
}

async function cursorCell() {
  return page.locator(".clearing-minimap-cell.cursor").evaluate((node) => {
    const cells = [...node.parentElement.children];
    const index = cells.indexOf(node);
    return { x: index % 15, z: Math.floor(index / 15) };
  });
}

async function servedParity() {
  const indexResponse = await fetch(url);
  assert.equal(indexResponse.status, 200, "served index must return 200");
  const indexUrl = indexResponse.url || url;
  const index = Buffer.from(await indexResponse.arrayBuffer());
  const refs = assetRefs(index.toString("utf8"));
  const servedAssets = Object.fromEntries(
    await Promise.all(
      refs.map(async (ref) => {
        const response = await fetch(new URL(ref, indexUrl));
        assert.equal(
          response.status,
          200,
          `served asset must return 200: ${ref}`,
        );
        return [ref, sha256(Buffer.from(await response.arrayBuffer()))];
      }),
    ),
  );
  const served = { index: sha256(index), assets: servedAssets };
  if (!distRoot)
    return {
      served,
      local: null,
      exact: null,
      limitation:
        "HIVE_DIST_ROOT unset; served hashes recorded without local byte parity.",
    };
  const localIndex = await readFile(join(distRoot, "index.html"));
  const localRefs = assetRefs(localIndex.toString("utf8"));
  assert.deepEqual(
    localRefs,
    refs,
    "served asset graph differs from HIVE_DIST_ROOT",
  );
  const local = {
    index: sha256(localIndex),
    assets: Object.fromEntries(
      await Promise.all(
        localRefs.map(async (ref) => [
          ref,
          sha256(await readFile(join(distRoot, ref))),
        ]),
      ),
    ),
  };
  assert.deepEqual(served, local, "served bytes differ from HIVE_DIST_ROOT");
  return { served, local, exact: true };
}

async function clickMapCell(x, z) {
  const surface = page.getByTestId("clearing-minimap-control");
  const box = await surface.boundingBox();
  assert.ok(box, "minimap surface requires screen bounds");
  await page.mouse.click(
    box.x + ((x + 0.5) / 15) * box.width,
    box.y + ((z + 0.5) / 15) * box.height,
  );
}

async function openMenu() {
  const menu = page.getByRole("region", { name: "Menu", exact: true });
  if (!(await menu.count()))
    await page
      .getByRole("button", { name: "Open game menu", exact: true })
      .click();
  await menu.waitFor({ state: "visible" });
  await page
    .getByTestId("clearing-minimap-control")
    .waitFor({ state: "visible" });
  return menu;
}

async function closeMenu() {
  const close = page.getByRole("button", { name: "Close Menu", exact: true });
  if (await close.count()) await close.click();
}

async function pause() {
  if (!(await state()).paused) {
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused === true);
  }
}

async function project(cell, height = 0) {
  return page.evaluate(
    ([x, z, nextHeight, level]) =>
      window.__GOBLIN.project(x, z, nextHeight, level),
    [cell.x, cell.z, height, cell.level ?? 0],
  );
}

async function inspectTree(tree) {
  const point = await project(tree, 0.5);
  const canvas = await page.locator("#stage canvas").boundingBox();
  assert.ok(canvas, "canvas bounds required for physical tree inspection");
  const zoom = canvas.width >= 900 ? 2 : 1;
  const attempts = [];
  for (const [x, y] of [
    [0, 0],
    [0, -8 * zoom],
    [-12 * zoom, -8 * zoom],
    [12 * zoom, -8 * zoom],
    [0, -18 * zoom],
  ]) {
    const at = { x: point.x + x, y: point.y + y };
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(80);
    const current = await selection();
    attempts.push({ at, tree: current.tree ?? null });
    if (current.tree === tree.id) return attempts;
    const close = page.locator(".target-window button.close");
    if (await close.count()) await close.first().click();
  }
  throw new Error(
    `could not select tree ${tree.id} through its rendered body: ${JSON.stringify(attempts)}`,
  );
}

async function screenshot(name) {
  await page.screenshot({ path: `${output}/${name}.png` });
  evidence.screenshots.push(`${name}.png`);
}

await mkdir(output, { recursive: true });
const evidence = {
  url,
  output,
  scriptSha256: sha256(
    await readFile("scripts/prove-clearing-minimap-live.mjs"),
  ),
  wrapper: {
    runner,
    scope:
      "RuntimeMaxSec=10min; one focused live minimap, input ownership, and stump-local-goods trace",
  },
  parity: null,
  errors: { page: [], console: [], request: [] },
  screenshots: [],
  claims: {},
  limits: [
    "One fresh paused Clearing and one oak only; no house, storage transfer, persistence, or upper-stair fixture is claimed.",
    "The quantized Visible area is a clipped grid-space outline, not a continuous camera frustum.",
    "The stump trace proves the local-goods handoff into existing Material lot actions; it does not execute Store without a shelf.",
  ],
};

let browser;
let page;
let failure = null;

try {
  evidence.parity = await servedParity();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
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
  assert.equal(response?.status(), 200, "main must return 200");
  await waitState(() => window.__GOBLIN?.artReady, null, 90_000);
  await page.waitForSelector("#stage canvas");
  const initial = await state();
  assert.equal(initial.paused, true, "fresh context must open paused");
  const menu = await openMenu();
  assert.ok(await page.locator(".clearing-minimap-cell.actor").count());
  assert.ok(await page.locator(".clearing-minimap-cell.tree").count());
  const initialPolygon = await visibleArea();
  assertVisibleArea(initialPolygon);
  evidence.claims.initialMenu = {
    paused: true,
    actorMarkers: await page.locator(".clearing-minimap-cell.actor").count(),
    treeMarkers: await page.locator(".clearing-minimap-cell.tree").count(),
    visibleArea: initialPolygon,
    visibleAreaCells: polygonArea(initialPolygon),
  };
  await screenshot("normal-minimap-menu");

  await closeMenu();
  let partialPolygon = initialPolygon;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (polygonArea(partialPolygon) < 224.5) break;
    const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
    assert.equal(
      await zoomIn.isDisabled(),
      false,
      "Visible area still covers the full Clearing at maximum zoom",
    );
    await zoomIn.click();
    await openMenu();
    partialPolygon = await visibleArea();
    assertVisibleArea(partialPolygon);
    if (polygonArea(partialPolygon) >= 224.5) await closeMenu();
  }
  assert.ok(
    polygonArea(partialPolygon) < 224.5,
    "keyboard recenter needs a genuinely partial Visible area",
  );
  const beforeMap = simulationSnapshot(await state());
  await clickMapCell(1, 1);
  await page.waitForFunction(
    (before) =>
      document
        .querySelector(".clearing-minimap-footprint polygon")
        ?.getAttribute("points") !== before,
    partialPolygon,
  );
  const afterClickPolygon = await visibleArea();
  assert.deepEqual(
    await state(),
    beforeMap,
    "map pointer must not mutate simulation",
  );

  const surface = page.getByTestId("clearing-minimap-control");
  assert.deepEqual(await cursorCell(), { x: 1, z: 1 });
  await surface.focus();
  for (let step = 0; step < 3; step++) {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
  }
  assert.deepEqual(await cursorCell(), { x: 4, z: 4 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (before) =>
      document
        .querySelector(".clearing-minimap-footprint polygon")
        ?.getAttribute("points") !== before,
    afterClickPolygon,
  );
  const afterKeyboardPolygon = await visibleArea();
  const pausedBeforeSpace = (await state()).paused;
  await page.keyboard.press("Space");
  assert.equal(
    (await state()).paused,
    pausedBeforeSpace,
    "map Space must not toggle pause",
  );
  assert.deepEqual(
    await state(),
    beforeMap,
    "map keys must not mutate simulation",
  );
  evidence.claims.mapRecenter = {
    partialVisibleArea: partialPolygon,
    partialVisibleAreaCells: polygonArea(partialPolygon),
    pointer: { cell: { x: 1, z: 1, level: 0 }, visibleArea: afterClickPolygon },
    keyboard: {
      keys: ["ArrowRight×3", "ArrowDown×3", "Enter"],
      cursor: { x: 4, z: 4 },
      visibleArea: afterKeyboardPolygon,
    },
    spacePaused: pausedBeforeSpace,
    frozenSimulation: true,
  };

  await closeMenu();
  const canvas = page.locator("#stage canvas");
  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox, "canvas bounds required for pan");
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2,
    canvasBox.y + canvasBox.height / 2,
  );
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2 + 45,
    canvasBox.y + canvasBox.height / 2 + 24,
  );
  await page.mouse.up({ button: "middle" });
  await openMenu();
  const afterPanPolygon = await visibleArea();
  assert.notEqual(
    afterPanPolygon,
    afterKeyboardPolygon,
    "paused pan must refresh Visible area",
  );
  await closeMenu();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await openMenu();
  const afterZoomPolygon = await visibleArea();
  assert.notEqual(
    afterZoomPolygon,
    afterPanPolygon,
    "paused zoom must refresh Visible area",
  );
  await page.setViewportSize({ width: 1180, height: 720 });
  await page.waitForFunction(
    (before) =>
      document
        .querySelector(".clearing-minimap-footprint polygon")
        ?.getAttribute("points") !== before,
    afterZoomPolygon,
  );
  const afterResizePolygon = await visibleArea();
  assert.deepEqual(
    await state(),
    beforeMap,
    "paused camera changes must not mutate simulation",
  );
  evidence.claims.pausedCameraFreshness = {
    pan: afterPanPolygon,
    zoom: afterZoomPolygon,
    resize: afterResizePolygon,
    frozenSimulation: true,
  };

  await closeMenu();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator('[data-build="wall"]').click();
  await waitState(() => window.__GOBLIN.selection.tool === "wall");
  const beforeArmedMap = simulationSnapshot(await state());
  await openMenu();
  assert.equal(
    (await selection()).tool,
    "wall",
    "opening the minimap must not disarm a compatible Wall tool",
  );
  await clickMapCell(4, 5);
  assert.equal(
    (await selection()).tool,
    "wall",
    "map recenter keeps Wall armed",
  );
  assert.deepEqual(
    await state(),
    beforeArmedMap,
    "armed map click must not commit site or job",
  );
  const previewCell = clearGroundCell(await state());
  const previewPoint = await project(previewCell);
  await page.mouse.move(previewPoint.x, previewPoint.y);
  await page.mouse.down();
  await page.mouse.move(previewPoint.x + 3, previewPoint.y + 2);
  await waitState(
    () =>
      window.__GOBLIN.selection.tool === "wall" &&
      window.__GOBLIN.selection.phase === "dragging" &&
      window.__GOBLIN.selection.gesture === "tool",
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(
    await state(),
    beforeArmedMap,
    "preview cancellation must leave no site or job",
  );
  evidence.claims.armedWallMap = {
    tool: "wall",
    noSiteOrJobCommit: true,
    nextCanvasStroke: "tool placement preview",
  };

  await closeMenu();
  const oak = (await state()).trees.find((tree) => tree.felledAt === null);
  assert.ok(oak, "fresh clearing requires a standing oak");
  await inspectTree(oak);
  await page.locator("#mark-chop").click();
  await waitState(
    (id) =>
      window.__GOBLIN.state.jobs.some(
        (job) => job.kind === "chop" && job.target === id,
      ),
    oak.id,
  );
  await page.locator("#speed").click();
  await waitState(() => document.querySelector("#speed")?.textContent === "4×");
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused === false);
  await waitState(
    (id) =>
      window.__GOBLIN.state.trees.find((tree) => tree.id === id)?.felledAt !==
      null,
    oak.id,
    60_000,
  );
  await pause();
  const afterChop = await state();
  const wood = afterChop.materials.lots.find(
    (lot) =>
      lot.material === "wood" &&
      lot.location.kind === "ground" &&
      lot.location.x === oak.x &&
      lot.location.z === oak.z &&
      lot.location.level === oak.level,
  );
  assert.ok(wood, "felled oak must leave a co-located loose wood lot");
  await inspectTree({ ...oak, felledAt: afterChop.tick });
  const localGoods = page.getByRole("button", {
    name: `Wood ×${wood.quantity}`,
    exact: true,
  });
  assert.equal(
    await localGoods.count(),
    1,
    "stump inspector needs one exact Wood row",
  );
  await localGoods.click();
  await page
    .getByRole("region", { name: "Material lot actions", exact: true })
    .waitFor();
  assert.equal(
    (await selection()).lot,
    wood.id,
    "local-goods row must inspect its semantic lot",
  );
  const storeControls = await page
    .locator(`[data-action="store"][data-lot="${wood.id}"]`)
    .count();
  evidence.claims.stumpLocalGoods = {
    oak: oak.id,
    lot: wood.id,
    amount: wood.quantity,
    materialActions: true,
    storeControls,
    limitation:
      "No shelf is built in this focused trace; Store availability remains the existing material panel policy.",
  };
  await screenshot("normal-stump-local-goods");

  await page.setViewportSize({ width: 390, height: 844 });
  await openMenu();
  await screenshot("narrow-menu-map");
  const narrow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(narrow.width, 390, "narrow viewport must be 390px");
  assert.equal(
    narrow.scrollWidth,
    narrow.width,
    "narrow HUD must not overflow horizontally",
  );
  const closeBox = await page
    .getByRole("button", { name: "Close Menu", exact: true })
    .boundingBox();
  const groundBox = await page.locator('[data-level="0"]').boundingBox();
  const upperBox = await page.locator('[data-level="1"]').boundingBox();
  assert.ok(
    closeBox && groundBox && upperBox,
    "narrow map close and Ground/Upper controls must remain reachable",
  );
  evidence.claims.narrow390 = {
    ...narrow,
    closeReachable: true,
    groundUpperReachable: true,
  };

  assert.deepEqual(
    evidence.errors,
    { page: [], console: [], request: [] },
    "page/input/request errors",
  );
  evidence.passed = true;
} catch (error) {
  failure = String(error);
  evidence.passed = false;
  evidence.failure = failure;
  throw error;
} finally {
  if (browser) await browser.close();
  await writeFile(
    `${output}/proof.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}
