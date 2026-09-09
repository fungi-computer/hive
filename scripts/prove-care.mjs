import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { prepareCareFixture } from "./care-fixture.mjs";

const base = process.argv[2] || "http://127.0.0.1:5198/";
const output = process.argv[3] || ".botanical/needs/care-proof";
const executablePath = process.env.CHROMIUM_PATH;
assert.ok(executablePath, "CHROMIUM_PATH is required");
const timeout = 30_000;
await mkdir(output, { recursive: true });

const evidence = { base, errors: [], screenshots: [], claims: {} };
let browser;
let page;
const state = () => page.evaluate(() => window.__GOBLIN.state);
const selection = () => page.evaluate(() => window.__GOBLIN.selection);
const waitFor = (predicate, value = undefined) =>
  page.waitForFunction(predicate, value, { timeout });

async function seedSnapshot(snapshot) {
  // IndexedDB is origin-scoped. Load the served origin once, overwrite its
  // paused slot, then reload below so startup receives this exact snapshot.
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (saved) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("hive-local-world", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("world"))
          request.result.createObjectStore("world");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("world", "readwrite");
      transaction.objectStore("world").put(saved, "current");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, snapshot);
}

async function assertNeedsPanel(label, file) {
  const layout = await page.evaluate(() => {
    const panel = document.querySelector(".character-window");
    const needs = document.querySelector(".needs-panel");
    const rect = (node) => {
      const box = node?.getBoundingClientRect();
      return (
        box && {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        }
      );
    };
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      panel: rect(panel),
      needs: rect(needs),
      labels: [...document.querySelectorAll(".needs-panel label")].map((node) =>
        node.textContent?.trim(),
      ),
    };
  });
  assert.ok(layout.panel && layout.needs, `${label} needs panel is visible`);
  assert.equal(layout.labels.length, 3, `${label} shows all three needs`);
  for (const need of ["Nourishment", "Hydration", "Rest"])
    assert.ok(
      layout.labels.some((labelText) =>
        new RegExp(`^${need} \\d+%$`).test(labelText),
      ),
      `${label} shows ${need} as a percentage`,
    );
  assert.ok(
    layout.scrollWidth <= layout.width,
    `${label} has no horizontal overflow`,
  );
  for (const box of [layout.panel, layout.needs]) {
    assert.ok(
      box.left >= -1 && box.right <= layout.width + 1,
      `${label} panel fits viewport`,
    );
  }
  await page.screenshot({ path: join(output, file), fullPage: false });
  evidence.screenshots.push(file);
  evidence.claims[`${label}Panel`] = layout;
}

function springWater(state) {
  const spring = state.sources.find((source) => source.kind === "spring");
  if (!spring) return null;
  return state.materials.lots
    .filter(
      (lot) =>
        lot.location.kind === "container" &&
        lot.location.container === `source:${spring.id}` &&
        lot.material === "water",
    )
    .reduce((quantity, lot) => quantity + lot.quantity, 0);
}

function lotQuantity(state, material) {
  return state.materials.lots
    .filter((lot) => lot.material === material)
    .reduce((quantity, lot) => quantity + lot.quantity, 0);
}

function sinkQuantity(state, material) {
  return state.materials.sinks
    .filter((sink) => sink.material === material)
    .reduce((quantity, sink) => quantity + sink.quantity, 0);
}

try {
  const fixture = prepareCareFixture();
  evidence.fixture = {
    schema: fixture.schema,
    tick: fixture.savedState.tick,
    preparedNeeds: {
      rowan: fixture.savedState.actors.rowan.needs,
      sedge: fixture.savedState.actors.sedge.needs,
    },
    stocks: {
      rations: lotQuantity(fixture.savedState, "ration"),
      springWater: springWater(fixture.savedState),
    },
  };
  assert.ok(evidence.fixture.stocks.rations >= 1, "fixture earns a ration");
  assert.ok(
    evidence.fixture.stocks.springWater >= 1,
    "fixture has spring water",
  );
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (error) => evidence.errors.push(`page: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    evidence.errors.push(`request: ${request.url()}`),
  );
  await seedSnapshot(fixture);
  const response = await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await waitFor(() => window.__GOBLIN?.artReady === true);
  await waitFor(() => window.__GOBLIN.state.paused === true);
  await page.locator("#continue").click();
  await waitFor(() => window.__GOBLIN.state.paused === false);
  await waitFor(() => {
    const careTargets = window.__GOBLIN.state.jobs
      .filter((job) => job.kind === "care")
      .map((job) => job.target);
    return careTargets.includes("rowan") && careTargets.includes("sedge");
  });
  await page.locator("#pause").click();
  await waitFor(() => window.__GOBLIN.state.paused === true);

  // Care is now admitted and frozen. Inspect the outsider over her visible body.
  await page.getByRole("button", { name: /Rowan/ }).click();
  await page.locator(".needs-panel").waitFor();
  await assertNeedsPanel("normal", "care-normal.png");
  const sedgePoint = await page.evaluate(() => {
    const actor = window.__GOBLIN.state.actors.sedge;
    return window.__GOBLIN.project(actor.x, actor.z, 0.5, actor.level);
  });
  await page.mouse.click(sedgePoint.x, sedgePoint.y);
  await waitFor(() => window.__GOBLIN.selection?.inspectedTarget?.kind === "actor" && window.__GOBLIN.selection.inspectedTarget.id === "sedge");
  assert.equal((await selection()).inspectedTarget.id, "sedge");
  await page.locator("#recruit").waitFor();
  assert.equal(
    await page.locator("#rest").count(),
    0,
    "outsider gets no care command",
  );

  // The shared care job remains visible, but an outsider gets no home controls.
  await page.getByRole("button", { name: /Rowan/ }).click();
  await page.getByRole("button", { name: /^Work orders\b/ }).click();
  const sedgeCare = page
    .locator('#orders li[data-job-kind="care"]')
    .filter({ hasText: "Care · Sedge" });
  await sedgeCare.waitFor();
  assert.equal(await sedgeCare.locator('[data-action="cancel"]').count(), 0);
  assert.equal(await sedgeCare.locator('[data-action="next"]').count(), 0);

  // Resume once; do not wait for either water outcome before observing food.
  await page.locator("#pause").click();
  await waitFor(() =>
    (() => {
      const current = window.__GOBLIN.state;
      const rowan = current.actors.rowan;
      const task = rowan.task;
      const operation =
        task && current.operations.find((item) => item.job === task.job);
      return (
        operation?.kind === "consume" &&
        task.duration === 40 &&
        rowan.work > 0 &&
        rowan.work < task.duration &&
        current.materials.transfers.some(
          (transfer) =>
            transfer.phase.kind === "carrying" &&
            transfer.actor === "rowan" &&
            transfer.owner.kind === "operation" &&
            transfer.owner.operation === operation.id,
        )
      );
    })(),
  );
  await page.locator("#pause").click();
  await waitFor(() => window.__GOBLIN.state.paused === true);
  const pausedEating = await state();
  assert.equal(pausedEating.actors.rowan.task?.kind, "consume");
  assert.equal(pausedEating.actors.rowan.task?.duration, 40);
  evidence.claims.eating = {
    duration: pausedEating.actors.rowan.task?.duration,
    work: pausedEating.actors.rowan.work,
  };
  assert.equal(
    pausedEating.careOutcomes.filter(
      (outcome) => outcome.actor === "rowan" && outcome.need === "nourishment",
    ).length,
    0,
    "pause before food settlement",
  );
  await waitFor(() => window.__GOBLIN.persistence.phase === "saved");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitFor(
    () =>
      window.__GOBLIN?.artReady === true &&
      window.__GOBLIN.state.paused === true,
  );
  const restored = await state();
  for (const field of [
    "tick",
    "actors",
    "materials",
    "jobs",
    "operations",
    "careOutcomes",
  ])
    assert.deepEqual(
      restored[field],
      pausedEating[field],
      `reload preserves ${field}`,
    );
  await page.locator("#continue").click();
  await waitFor(() => {
    const outcomes = window.__GOBLIN.state.careOutcomes;
    return (
      outcomes.some(
        (outcome) =>
          outcome.actor === "rowan" && outcome.need === "nourishment",
      ) &&
      outcomes.some(
        (outcome) => outcome.actor === "rowan" && outcome.need === "hydration",
      ) &&
      outcomes.some(
        (outcome) => outcome.actor === "sedge" && outcome.need === "hydration",
      )
    );
  });
  const settled = await state();
  const rowanFood = settled.careOutcomes.filter(
    (outcome) => outcome.actor === "rowan" && outcome.need === "nourishment",
  );
  assert.equal(rowanFood.length, 1, "one Rowan food outcome settles");
  const foodSinks = settled.materials.sinks.filter(
    (sink) =>
      sink.material === "ration" &&
      rowanFood.some((outcome) => outcome.receipt === sink.id),
  );
  assert.equal(foodSinks.length, 1, "the food outcome has one ration sink");
  assert.equal(foodSinks[0].quantity, 1, "the food sink consumes one ration");
  assert.equal(
    lotQuantity(settled, "ration") + sinkQuantity(settled, "ration"),
    evidence.fixture.stocks.rations,
    "rations are conserved across food care",
  );
  assert.equal(settled.parties.home.members.includes("sedge"), false);
  assert.ok(settled.actors.rowan.needs.hydration > 30);
  assert.ok(settled.actors.sedge.needs.hydration > 30);
  assert.ok(
    springWater(settled) < evidence.fixture.stocks.springWater,
    "hydration care consumes the fixture spring stock",
  );
  evidence.claims.care = {
    hydrationBefore: 30,
    hydrationAfter: settled.actors.rowan.needs.hydration,
    outsiderHydrationAfter: settled.actors.sedge.needs.hydration,
    nourishmentBefore: 30,
    nourishmentAfter: settled.actors.rowan.needs.nourishment,
    foodOutcome: rowanFood[0],
    foodSink: foodSinks[0],
    outcomes: settled.careOutcomes,
  };

  await page.locator("#pause").click();
  await waitFor(() => window.__GOBLIN.state.paused === true);
  await page.getByRole("button", { name: /Rowan/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await waitFor(() => window.innerWidth === 390);
  await assertNeedsPanel("narrow390", "care-narrow390.png");
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  evidence.failure = { message: error.message, stack: error.stack };
  evidence.failure.state = page
    ? await page
        .evaluate(() => window.__GOBLIN?.state ?? null)
        .catch(() => null)
    : null;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(
    join(output, "proof.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}
