import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [
  url = "http://127.0.0.1:5188/",
  output = ".botanical/clearing-minimap-narrow",
] = process.argv.slice(2);
const distRoot = process.env.HIVE_DIST_ROOT;
const runner =
  "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assetRefs = (html) =>
  [...html.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g)].map(
    (match) => match[1],
  );

let page;
const state = () => page.evaluate(() => structuredClone(window.__GOBLIN.state));
const waitState = (predicate, value = null, timeout = 45_000) =>
  page.waitForFunction(predicate, value, { timeout });

async function cursorCell() {
  return page.locator(".clearing-minimap-cell.cursor").evaluate((node) => {
    const cells = [...node.parentElement.children];
    const index = cells.indexOf(node);
    return { x: index % 15, z: Math.floor(index / 15) };
  });
}

async function servedParity() {
  assert.ok(distRoot, "HIVE_DIST_ROOT is required for local byte parity");
  const indexResponse = await fetch(url);
  assert.equal(indexResponse.status, 200, "served index must return 200");
  const indexUrl = indexResponse.url || url;
  const index = Buffer.from(await indexResponse.arrayBuffer());
  const refs = assetRefs(index.toString("utf8"));
  const served = {
    index: sha256(index),
    assets: Object.fromEntries(
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
    ),
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
}

function assertReachable(box, name) {
  assert.ok(box, `${name} requires screen bounds`);
  assert.ok(
    box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= 390 &&
      box.y + box.height <= 844,
    `${name} must remain reachable at 390×844`,
  );
}

await mkdir(output, { recursive: true });
const evidence = {
  url,
  output,
  scriptSha256: sha256(
    await readFile("scripts/prove-clearing-minimap-narrow.mjs"),
  ),
  wrapper: {
    runner,
    scope:
      "RuntimeMaxSec=10min; fresh 390px Clearing minimap/menu/command-rail input trace",
  },
  parity: null,
  errors: { page: [], console: [], request: [] },
  screenshots: [],
  claims: {},
  limits: [
    "This is a fresh 390px presentation/input trace only; local-57c0423 retains the completed normal recenter, camera freshness, Wall gesture, and stump-local-goods evidence.",
    "No oak, construction, storage, persistence, or upper-stair flow is rerun here.",
    "This follow-up does not claim a meaningful camera recenter from narrow viewport polygon strings.",
  ],
};

let browser;
let failure = null;

try {
  evidence.parity = await servedParity();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
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
  assert.equal((await state()).paused, true, "fresh Clearing must open paused");
  await openMenu();

  await page.screenshot({ path: `${output}/narrow-menu-map.png` });
  evidence.screenshots.push("narrow-menu-map.png");
  const narrow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.deepEqual(narrow, { width: 390, scrollWidth: 390 });
  assertReachable(
    await page
      .getByRole("button", { name: "Close Menu", exact: true })
      .boundingBox(),
    "Menu close",
  );
  assertReachable(
    await page.locator('[data-level="0"]').boundingBox(),
    "Ground",
  );
  assertReachable(
    await page.locator('[data-level="1"]').boundingBox(),
    "Upper",
  );

  const before = await state();
  const surface = page.getByTestId("clearing-minimap-control");
  await surface.focus();
  const initialCursor = await cursorCell();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const movedCursor = await cursorCell();
  assert.deepEqual(movedCursor, {
    x: Math.min(14, initialCursor.x + 1),
    z: Math.min(14, initialCursor.z + 1),
  });
  const pausedBeforeSpace = (await state()).paused;
  await page.keyboard.press("Space");
  assert.equal(
    (await state()).paused,
    pausedBeforeSpace,
    "map Space must not pause",
  );
  assert.deepEqual(
    await state(),
    before,
    "minimap input must not mutate simulation",
  );
  await page.locator('[data-level="1"]').click();
  await waitState(() => window.__GOBLIN.selection.level === 1);
  const upper = {
    selectionLevel: await page.evaluate(() => window.__GOBLIN.selection.level),
    pressed: await page
      .locator('[data-level="1"]')
      .getAttribute("aria-pressed"),
    minimapLabel: await page.locator(".clearing-minimap h2").textContent(),
  };
  assert.deepEqual(upper, {
    selectionLevel: 1,
    pressed: "true",
    minimapLabel: "Upper · 15×15",
  });
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator(".level-readout").waitFor({ state: "visible" });
  assert.match(
    await page.locator(".level-readout").textContent(),
    /Working level:\s*Upper/,
    "Build readout must reflect the selected Upper level",
  );
  await page.locator('[data-level="0"]').click();
  await waitState(() => window.__GOBLIN.selection.level === 0);
  const ground = {
    selectionLevel: await page.evaluate(() => window.__GOBLIN.selection.level),
    pressed: await page
      .locator('[data-level="0"]')
      .getAttribute("aria-pressed"),
    readout: await page.locator(".level-readout").textContent(),
  };
  assert.equal(ground.selectionLevel, 0);
  assert.equal(ground.pressed, "true");
  assert.match(ground.readout, /Working level:\s*Ground/);
  evidence.claims.narrow390 = {
    ...narrow,
    closeReachable: true,
    groundUpperReachable: true,
    keyboard: { initialCursor, movedCursor },
    spacePaused: pausedBeforeSpace,
    frozenSimulation: true,
    levels: { upper, ground },
  };

  assert.deepEqual(
    evidence.errors,
    { page: [], console: [], request: [] },
    "page/input/request errors",
  );
  evidence.passed = true;
} catch (error) {
  failure = error;
  evidence.passed = false;
  evidence.failure = error?.stack || String(error);
} finally {
  if (browser) await browser.close();
  await writeFile(
    join(output, "proof.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}

if (failure) throw failure;
