import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const output =
  process.argv[2] || ".botanical/tree-stump-display-identity-20260908";
const port = Number(process.env.TREE_DISPLAY_DIAGNOSTIC_PORT || 5208);
const url = `http://127.0.0.1:${port}/`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

await mkdir(output, { recursive: true });
const evidence = {
  mode: "focused-real-input-tree-stump-display",
  url,
  scriptSha256: sha256(await readFile("scripts/prove-tree-stump-display.mjs")),
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
  const project = (cell) =>
    page.evaluate(
      ([x, z, level]) => window.__GOBLIN.project(x, z, 0, level),
      [cell.x, cell.z, cell.level ?? 0],
    );
  const waitState = (predicate, value = null, timeout = 45_000) =>
    page.waitForFunction(predicate, value, { timeout });
  const inspectTree = async (tree) => {
    const point = await project(tree);
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
      if ((await selection()).tree === tree.id) return point;
    }
    throw new Error(`Could not select tree ${tree.id} through the real canvas`);
  };

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__GOBLIN?.artReady === true);
  const oak = (await state()).trees.find((tree) => tree.id === "oak-5");
  assert.ok(oak, "Expected the known screen-overlap tree oak-5");
  await page.locator("#continue").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  for (let count = 0; count < 3; count++) await page.locator("#speed").click();
  await inspectTree(oak);
  await page.locator("#mark-chop").click();
  await waitState(
    (id) =>
      window.__GOBLIN.state.jobs.some(
        (job) => job.kind === "chop" && job.target === id,
      ),
    oak.id,
  );
  await waitState(
    (id) =>
      window.__GOBLIN.state.trees.find((tree) => tree.id === id)?.felledAt !==
      null,
    oak.id,
  );
  await page.locator("#pause").click();
  await waitState(() => window.__GOBLIN.state.paused);
  const point = await project(oak);
  evidence.claims.stump = await page.evaluate((screenPoint) => {
    const candidates = window.__GOBLIN.displayAt({
      x: screenPoint.x,
      y: screenPoint.y - 112,
    });
    return {
      point: screenPoint,
      candidates,
      tree: window.__GOBLIN.state.trees.find((tree) => tree.id === "oak-5"),
    };
  }, point);
  assert.ok(
    evidence.claims.stump.candidates.some(
      (candidate) =>
        candidate.target?.kind === "tree" &&
        candidate.target.id === oak.id &&
        candidate.orientation === "stump",
    ),
    "Expected the actual oak-5 stump sprite at its rendered screen bounds",
  );
  await page.screenshot({ path: `${output}/oak-5-stump.png` });
  evidence.screenshots.push("oak-5-stump.png");
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
