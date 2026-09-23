import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const output = process.argv[2] || ".botanical/live-display-identity-20260908";
const port = Number(process.env.DISPLAY_DIAGNOSTIC_PORT || 5207);
const url = `http://127.0.0.1:${port}/`;
const point = { x: 678, y: 194 };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

await mkdir(output, { recursive: true });
const evidence = {
  mode: "read-only-live-display-identity",
  url,
  scriptSha256: sha256(
    await readFile("scripts/prove-live-display-identity.mjs"),
  ),
  point,
  errors: [],
  displayCandidates: [],
  domCandidates: [],
  canvases: [],
  screenshots: [],
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
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__GOBLIN?.artReady === true);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  evidence.displayCandidates = await page.evaluate(
    (screenPoint) => window.__GOBLIN.displayAt(screenPoint),
    point,
  );
  const dom = await page.evaluate((screenPoint) => {
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
      atPoint: document
        .elementsFromPoint(screenPoint.x, screenPoint.y)
        .map(describe),
      canvases: [...document.querySelectorAll("canvas")].map(describe),
    };
  }, point);
  evidence.domCandidates = dom.atPoint;
  evidence.canvases = dom.canvases;
  assert.ok(
    evidence.displayCandidates.length,
    "Expected a display candidate at the black-square center",
  );
  await page.screenshot({ path: `${output}/fresh-display-point.png` });
  evidence.screenshots.push("fresh-display-point.png");
  assert.deepEqual(evidence.errors, [], "Unexpected page or console error");
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
