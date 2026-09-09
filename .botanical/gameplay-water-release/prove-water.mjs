import { terrainCell, terrainFacts } from "../../src/terrain.ts";
import { FIELD_WATER } from "../../src/field-water-source.ts";
import { fieldInspectionText } from "../../src/field-inspection.ts";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// One declared current-main fixture. No debug mutation or direct terrain edits.
const base = process.argv[2] ?? "http://127.0.0.1:5198/";
const output = process.argv[3] ?? ".botanical/gameplay-water-release/browser";
assert.equal(
  new URL(base).hostname,
  "127.0.0.1",
  "local coordinated preview only",
);
assert(process.env.CHROMIUM_PATH, "CHROMIUM_PATH required");
await mkdir(output); // Fresh evidence only; never overwrite an older browser result.
const evidence = {
  base,
  fixture:
    "initial startup, earned [0,14,128] dig, exact hollow inspection and paused interaction guards",
  runtimePin: "210b85d722e4d074eeff34d3653d109882c02655",
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
  // Existing floor-picking law's interior point, projected by the live camera.
  // No nearest-source lookup or UI-only water raycast is introduced.
  const floorHeight = terrainCell(completed.terrain, 7, 9).height;
  const hollow = await page.evaluate(
    (height) => window.__GOBLIN.project(6.65, 8.65, height, 0),
    floorHeight,
  );
  const card = page.getByRole("region", {
    name: "Field water details",
    exact: true,
  });
  async function inspect(name) {
    await page.mouse.click(hollow.x, hollow.y);
    await card.waitFor({ state: "visible", timeout: 10000 });
    const observed = await page.evaluate(() => ({
      state: window.__GOBLIN.state,
      selection: window.__GOBLIN.selection,
    }));
    assert.equal(observed.state.paused, true);
    assert.equal(observed.state.tick, completed.tick);
    assert.deepEqual(observed.state.terrain, completed.terrain);
    assert.deepEqual(observed.state.materials, completed.materials);
    const selected = observed.selection.inspectedTarget;
    assert.equal(selected.kind, "field-water");
    assert.deepEqual(selected.reference, {
      binding: FIELD_WATER.id,
      nodeId: "reservoir:column-p0-p128",
    });
    const node = terrainFacts(observed.state.terrain).soil.nodes.find(
      (node) => node.nodeId === selected.reference.nodeId,
    );
    assert(node && node.kind === "pit");
    const fact = observed.selection.fieldWater;
    assert.equal(fact.x, 7);
    assert.equal(fact.z, 9);
    assert.equal(
      fact.litres,
      (node.massKg / FIELD_WATER.kgPerUnit) * FIELD_WATER.litresPerUnit,
    );
    assert.equal(
      fact.wholeMeasures,
      Math.floor(node.massKg / FIELD_WATER.kgPerUnit),
    );
    const text = fieldInspectionText(fact);
    assert.equal(
      await card.locator('[data-field-water="litres"]').textContent(),
      text.stock,
    );
    assert.equal(
      await card.locator('[data-field-water="measures"]').textContent(),
      text.measures,
    );
    assert((await card.textContent()).includes(text.access));
    evidence.waterObservation = {
      litres: fact.litres,
      wholeMeasures: fact.wholeMeasures,
      observedStock:
        fact.litres === 0
          ? "dry"
          : fact.litres < 1
            ? "fractional"
            : "whole measures present",
      floorHeight,
      hollow,
      reference: selected.reference,
    };
    await writeFile(
      join(output, `${name}.json`),
      JSON.stringify(observed, null, 2),
    );
    await page.screenshot({ path: join(output, `${name}.png`) });
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__GOBLIN.selection.tool === null);
  await inspect("field-inspected");
  evidence.checks.push(
    "earned hollow click selects exact node and displays real stock/whole measures without advancing time",
  );
  await card
    .getByRole("button", { name: "Close field water details", exact: true })
    .click();
  await card.waitFor({ state: "hidden", timeout: 10000 });
  assert.equal(
    (await page.evaluate(() => window.__GOBLIN.selection)).inspectedTarget,
    null,
  );
  await page.mouse.move(hollow.x, hollow.y);
  await page.mouse.down();
  await page.mouse.move(hollow.x + 60, hollow.y + 25, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__GOBLIN.selection.phase === "idle");
  assert.notEqual(
    (await page.evaluate(() => window.__GOBLIN.selection)).inspectedTarget
      ?.kind,
    "field-water",
  );
  await card.waitFor({ state: "hidden", timeout: 10000 });
  assert.equal(await card.count(), 0);
  evidence.checks.push(
    "close removes the card; moved box gesture does not become field inspection",
  );

  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator("#dig-tool").click();
  const adjacent = await page.evaluate(() =>
    window.__GOBLIN.project(8, 9, 0, 0),
  );
  await page.mouse.click(adjacent.x, adjacent.y);
  await page.waitForFunction(() =>
    window.__GOBLIN.state.jobs.some(
      (job) =>
        job.kind === "dig" &&
        job.voxel[0] === 1 &&
        job.voxel[1] === 14 &&
        job.voxel[2] === 128,
    ),
  );
  const toolState = await page.evaluate(() => ({
    state: window.__GOBLIN.state,
    selection: window.__GOBLIN.selection,
  }));
  assert.equal(toolState.selection.tool, "dig");
  assert.notEqual(toolState.selection.inspectedTarget?.kind, "field-water");
  assert.equal(toolState.state.tick, completed.tick);
  assert.equal(toolState.state.terrain.exports.length, 1);
  await writeFile(
    join(output, "paused-tool-admission.json"),
    JSON.stringify(toolState, null, 2),
  );
  await page.mouse.click(adjacent.x, adjacent.y, { button: "right" });
  await page.waitForFunction(() => window.__GOBLIN.selection.tool === null);
  await card.waitFor({ state: "hidden", timeout: 10000 });
  assert.equal(await card.count(), 0);
  await inspect("field-reinspected");
  evidence.checks.push(
    "armed Dig keeps its actual paused order path; rightclick disarms; exact hollow can be inspected again without another physical cut",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await card.waitFor({ state: "visible", timeout: 10000 });
  const bounds = await card.boundingBox();
  assert(
    bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391,
    "water inspector fits narrow viewport",
  );
  await page.screenshot({ path: join(output, "field-narrow-390.png") });
  evidence.checks.push(
    "same real field inspector remains contained at390 pixels",
  );
  assert.deepEqual(evidence.errors, []);
  assert.deepEqual(evidence.consoleErrors, []);
  assert.deepEqual(evidence.failedRequests, []);
  assert.deepEqual(evidence.moduleResponses, []);
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
