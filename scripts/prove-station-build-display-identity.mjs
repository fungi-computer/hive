import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const output =
  process.argv[2] || ".botanical/station-build-display-identity-20260908";
const port = Number(process.env.STATION_DISPLAY_DIAGNOSTIC_PORT || 5209);
const url = `http://127.0.0.1:${port}/`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const key = (cell) => `${cell.x},${cell.z},${cell.level ?? 0}`;

function stationAnchor(snapshot) {
  const blocked = new Set(
    [
      ...snapshot.trees,
      ...snapshot.rocks,
      ...snapshot.sources,
      ...snapshot.herbs,
      ...snapshot.sites,
      ...Object.values(snapshot.actors),
      ...snapshot.materials.lots
        .filter((lot) => lot.location.kind === "ground")
        .map((lot) => lot.location),
    ].map(key),
  );
  for (let z = 2; z < 12; z++)
    for (let x = 2; x < 12; x++) {
      const cells = [
        { x, z, level: 0 },
        { x: x + 1, z, level: 0 },
        { x, z: z + 1, level: 0 },
        { x: x + 1, z: z + 1, level: 0 },
      ];
      if (cells.every((cell) => !blocked.has(key(cell)))) return cells[0];
    }
  throw new Error("No clear 2×2 station anchor");
}

await mkdir(output, { recursive: true });
const evidence = {
  mode: "focused-real-input-station-build-display-identity",
  url,
  scriptSha256: sha256(
    await readFile("scripts/prove-station-build-display-identity.mjs"),
  ),
  errors: [],
  screenshots: [],
  claims: {},
};
let server;
let browser;

try {
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) break;
    } catch {
      // The local source server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 49)
      throw new Error("Source diagnostic server did not start");
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 760 },
  });
  page.on("pageerror", (error) =>
    evidence.errors.push(`page: ${error.message}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    evidence.errors.push(
      `request: ${request.url()} · ${request.failure()?.errorText || "unknown"}`,
    ),
  );
  const state = () => page.evaluate(() => window.__GOBLIN.state);
  const selection = () => page.evaluate(() => window.__GOBLIN.selection);
  const waitState = (predicate, value = null, timeout = 45_000) =>
    page.waitForFunction(predicate, value, { timeout });
  const project = (cell) =>
    page.evaluate(
      ([x, z, level]) => window.__GOBLIN.project(x, z, 0, level),
      [cell.x, cell.z, cell.level ?? 0],
    );
  const inspect = async (kind, id, cell) => {
    const point = await project(cell);
    for (const [x, y] of [
      [0, -12],
      [0, -24],
      [-12, -18],
      [12, -18],
      [-20, -8],
      [20, -8],
      [0, 0],
    ]) {
      await page.mouse.click(point.x + x, point.y + y);
      await page.waitForTimeout(80);
      if ((await selection())[kind] === id) return point;
    }
    throw new Error(`Could not select ${kind}:${id} through the real canvas`);
  };

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__GOBLIN?.artReady === true);
  await page.locator("#continue").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  for (let count = 0; count < 3; count++) await page.locator("#speed").click();
  const oak = (await state()).trees.find((tree) => tree.felledAt === null);
  assert.ok(oak, "Expected one available oak");
  await inspect("tree", oak.id, oak);
  await page.locator("#mark-chop").click();
  await waitState(
    (id) =>
      window.__GOBLIN.state.trees.find((tree) => tree.id === id)?.felledAt !==
      null,
    oak.id,
  );
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  const anchor = stationAnchor(await state());
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator('[data-build="brew-station"]').click();
  const anchorPoint = await project(anchor);
  await page.mouse.click(anchorPoint.x, anchorPoint.y);
  await page.locator("#task").click();
  await waitState(
    ({ x, z }) =>
      window.__GOBLIN.state.sites.some(
        (site) => site.type === "brew-station" && site.x === x && site.z === z,
      ),
    anchor,
  );
  const station = (await state()).sites.find(
    (site) =>
      site.type === "brew-station" &&
      site.x === anchor.x &&
      site.z === anchor.z,
  );
  assert.ok(station, "Expected the admitted brew-station site");
  await page.locator("#pause").click();
  await waitState(
    (id) =>
      window.__GOBLIN.state.sites.find((site) => site.id === id)?.finishedAt !==
      null,
    station.id,
    60_000,
  );
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  evidence.claims.built = await page.evaluate(
    (site) => ({
      station: window.__GOBLIN.state.sites.find(
        (candidate) => candidate.id === site.id,
      ),
      originalBlackCenter: window.__GOBLIN.displayAt({ x: 678, y: 194 }),
      stationPoint: window.__GOBLIN.project(site.x, site.z, 0, site.level),
    }),
    station,
  );
  await page.screenshot({ path: `${output}/station-built.png` });
  evidence.screenshots.push("station-built.png");
  await page.locator("#pause").click();
  for (let attempt = 0; attempt < 150; attempt++) {
    if ((await state()).tick >= 2520) break;
    await page.waitForTimeout(1_000);
  }
  assert.ok((await state()).tick >= 2520, "Expected the late display tick");
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  await inspect("site", station.id, station);
  evidence.claims.late = await page.evaluate((site) => {
    const describe = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        id: element.id || null,
        className:
          typeof element.className === "string" ? element.className : null,
        width: element instanceof HTMLCanvasElement ? element.width : null,
        height: element instanceof HTMLCanvasElement ? element.height : null,
        bounds: {
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        },
      };
    };
    return {
      tick: window.__GOBLIN.state.tick,
      station: window.__GOBLIN.state.sites.find(
        (candidate) => candidate.id === site.id,
      ),
      originalBlackCenter: window.__GOBLIN.displayAt({ x: 678, y: 194 }),
      domAtOriginalBlackCenter: document
        .elementsFromPoint(678, 194)
        .map(describe),
      canvases: [...document.querySelectorAll("canvas")].map(describe),
      stationPoint: window.__GOBLIN.project(site.x, site.z, 0, site.level),
    };
  }, station);
  await page.screenshot({ path: `${output}/station-late-inspected.png` });
  evidence.screenshots.push("station-late-inspected.png");
  assert.deepEqual(
    evidence.errors,
    [],
    "Unexpected page, console, or request error",
  );
} catch (error) {
  evidence.failure =
    error instanceof Error ? error.stack || error.message : String(error);
  throw error;
} finally {
  await writeFile(
    `${output}/proof.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  await browser?.close();
  server?.kill("SIGTERM");
}
