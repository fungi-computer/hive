import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// One declared current-main fixture. No debug mutation or direct terrain edits.
const base = process.argv[2] ?? "http://127.0.0.1:5198/";
const output = process.argv[3] ?? ".botanical/goblin-wet/browser";
assert.equal(
  new URL(base).hostname,
  "127.0.0.1",
  "local coordinated preview only",
);
assert(process.env.CHROMIUM_PATH, "CHROMIUM_PATH required");
await mkdir(output, { recursive: true });
const evidence = {
  base,
  fixture: "paused exact [0,14,128], actual pawn cut, save/reload",
  errors: [],
  consoleErrors: [],
  failedRequests: [],
  moduleResponses: [],
  diagnosticsLimit: {
    entriesPerKind: 20,
    textChars: 2048,
    readTimeoutMs: 2000,
    startupTextChars: 4096,
  },
  checks: [],
  browserClosed: false,
};
const bounded = (value) => String(value ?? "").slice(0, 2048);
function retain(list, value) {
  if (list.length < 20) list.push(value);
}
async function ready(page, phase) {
  try {
    await page.waitForFunction(() => window.__GOBLIN?.artReady, undefined, {
      timeout: 60000,
    });
  } catch (error) {
    let timer;
    try {
      evidence.readinessFailure = {
        phase,
        ...(await Promise.race([
          page.evaluate(() => ({
            loadingText:
              document.querySelector("#loading")?.textContent?.slice(0, 2048) ??
              null,
            mainEntered:
              document.querySelector("#loading")?.dataset.startupMain ===
              "entered",
            startupStages:
              document
                .querySelector("#loading")
                ?.dataset.startup?.slice(0, 4096) ?? null,
            visibilityState: document.visibilityState,
            documentReadyState: document.readyState,
            goblinPresent: "__GOBLIN" in window,
            artReady: window.__GOBLIN?.artReady === true,
            canvasCount: document.querySelectorAll("canvas").length,
          })),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Diagnostic read timed out")),
              2000,
            );
          }),
        ])),
      };
    } catch (diagnosticError) {
      evidence.readinessFailure = {
        phase,
        collectionError: bounded(diagnosticError.message),
      };
    } finally {
      clearTimeout(timer);
    }
    throw error;
  }
}
let browser, primaryError;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("pageerror", (error) =>
    retain(evidence.errors, bounded(error.message)),
  );
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const at = message.location();
    retain(evidence.consoleErrors, {
      text: bounded(message.text()),
      url: bounded(at.url),
      line: at.lineNumber,
      column: at.columnNumber,
    });
  });
  page.on("requestfailed", (request) =>
    retain(evidence.failedRequests, {
      url: bounded(request.url()),
      type: request.resourceType(),
      failure: bounded(request.failure()?.errorText),
    }),
  );
  page.on("response", (response) => {
    const url = response.url(),
      type = response.request().resourceType();
    if (
      !response.ok() &&
      (type === "script" || /\.[cm]?[jt]sx?(?:[?#]|$)/.test(url))
    )
      retain(evidence.moduleResponses, {
        url: bounded(url),
        status: response.status(),
        type,
      });
  });
  await page.goto(base);
  await ready(page, "initial");
  await page.locator("#reset").click();
  await page.waitForFunction(
    () => window.__GOBLIN.state.paused && window.__GOBLIN.state.tick === 0,
  );
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator("#dig-tool").click();
  const point = await page.evaluate(() => window.__GOBLIN.project(7, 9, 0, 0));
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() =>
    window.__GOBLIN.state.jobs.some((job) => job.kind === "dig"),
  );
  const admitted = await page.evaluate(() => window.__GOBLIN.state);
  assert.equal(admitted.tick, 0);
  assert.deepEqual(
    admitted.jobs.find((job) => job.kind === "dig").voxel,
    [0, 14, 128],
  );
  assert.equal(admitted.terrain.exports.length, 0);
  await writeFile(
    join(output, "admitted.json"),
    JSON.stringify(admitted, null, 2),
  );
  evidence.checks.push(
    "visible paused input admits exact generated voxel without physical advancement",
  );
  await page.locator("#pause").click();
  await page.waitForFunction(
    () => window.__GOBLIN.state.terrain.exports.length === 1,
    undefined,
    { timeout: 90000 },
  );
  await page.locator("#pause").click();
  await page.waitForFunction(() => window.__GOBLIN.state.paused);
  const completed = await page.evaluate(() => window.__GOBLIN.state);
  assert.equal(
    completed.materials.lots
      .filter((lot) => lot.material === "soil")
      .reduce((sum, lot) => sum + lot.quantity, 0),
    1,
  );
  assert(!completed.jobs.some((job) => job.kind === "dig"));
  assert(
    Math.abs(completed.terrain.soilState.timeS - completed.tick * 0.05) < 1e-8,
  );
  await writeFile(
    join(output, "completed.json"),
    JSON.stringify(completed, null, 2),
  );
  await page.screenshot({ path: join(output, "completed.png") });
  evidence.checks.push(
    "actual pawn completion yields one soil unit and finite wet export with joined clock",
  );
  await page.waitForFunction(
    () => window.__GOBLIN.persistence.phase === "saved",
    undefined,
    { timeout: 30000 },
  );
  await page.reload();
  await ready(page, "reload");
  await page.waitForFunction(
    () => window.__GOBLIN.state.terrain.exports.length === 1,
  );
  const restored = await page.evaluate(() => window.__GOBLIN.state);
  assert.equal(restored.paused, true);
  assert.equal(restored.tick, completed.tick);
  assert.deepEqual(restored.terrain, completed.terrain);
  assert.deepEqual(restored.materials, completed.materials);
  await page.screenshot({ path: join(output, "restored.png") });
  evidence.checks.push(
    "browser reload restores exact generated terrain/materials paused before Continue",
  );
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  primaryError = error;
  evidence.primaryError = {
    name: bounded(error.name),
    message: bounded(error.message),
  };
} finally {
  if (browser) {
    try {
      await browser.close();
      evidence.browserClosed = true;
    } catch (error) {
      evidence.cleanupError = bounded(error.message);
      primaryError ??= error;
    }
  }
  try {
    await writeFile(
      join(output, "result.json"),
      JSON.stringify(evidence, null, 2),
    );
  } catch (error) {
    console.error("Evidence write failed:", bounded(error.message));
    primaryError ??= error;
  }
}
if (primaryError) throw primaryError;
console.log(JSON.stringify(evidence));
