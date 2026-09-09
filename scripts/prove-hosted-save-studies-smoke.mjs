import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2] || "https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/";
const output = process.argv[3] ||
  ".botanical/hosted-save-studies-smoke-20260907T133000Z";
await mkdir(output, { recursive: true });

const evidence = {
  url: base,
  output,
  screenshots: [],
  errors: [],
  redirects: [],
  claims: {},
};

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);
page.on("pageerror", (error) => evidence.errors.push(`pageerror: ${error}`));
page.on("console", (message) => {
  if (message.type() === "error") evidence.errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) =>
  evidence.errors.push(
    `requestfailed: ${request.url()} · ${request.failure()?.errorText}`,
  ),
);

const state = () => page.evaluate(() => window.__GOBLIN.state);
const persistence = () => page.evaluate(() => window.__GOBLIN.persistence);
const selection = () => page.evaluate(() => window.__GOBLIN.selection);
const project = (x, z, height = 0) =>
  page.evaluate(
    ([nextX, nextZ, nextHeight]) =>
      window.__GOBLIN.project(nextX, nextZ, nextHeight),
    [x, z, height],
  );
const waitFor = (predicate, value = null, timeout = 30_000) =>
  page.waitForFunction(predicate, value, { timeout });

async function shot(name, locator = null) {
  const path = `${output}/${name}.png`;
  if (locator) await page.locator(locator).screenshot({ path });
  else await page.screenshot({ path });
  evidence.screenshots.push(`${name}.png`);
}

async function canvasesNonempty(label) {
  const report = await page.evaluate(() =>
    [...document.querySelectorAll("canvas")].map((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const samples = [];
      const context2d = canvas.getContext("2d");
      if (context2d) {
        const image = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < image.length; i += Math.max(4, Math.floor(image.length / 128)))
          samples.push(image[i] || 0, image[i + 1] || 0, image[i + 2] || 0, image[i + 3] || 0);
      } else {
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        if (gl) {
          const pixel = new Uint8Array(4);
          for (const [x, y] of [[0, 0], [canvas.width / 2, canvas.height / 2], [canvas.width - 1, canvas.height - 1]]) {
            gl.readPixels(Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            samples.push(...pixel);
          }
        }
      }
      return {
        id: canvas.id,
        width: canvas.width,
        height: canvas.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        nonempty: samples.some((value) => value > 0),
      };
    }),
  );
  assert.ok(report.length > 0, `${label}: no canvases`);
  assert.ok(report.every((canvas) => canvas.width > 0 && canvas.height > 0), `${label}: invalid canvas`);
  assert.ok(report.some((canvas) => canvas.nonempty), `${label}: canvases are empty`);
  return report;
}

async function visit(path, readyPredicate) {
  const target = new URL(path, base).href;
  const response = await page.goto(target, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, `${path} did not return 200`);
  const finalUrl = page.url();
  evidence.redirects.push({ requested: target, final: finalUrl, status: response.status() });
  await waitFor(readyPredicate, null, 90_000);
  return finalUrl;
}

function assertNoErrors(label) {
  assert.deepEqual(evidence.errors, [], `${label}: page/input errors`);
}

try {
  const mainFinal = await visit("/", () => window.__GOBLIN?.artReady);
  const initial = await state();
  assert.equal(initial.paused, true);
  assert.equal(initial.tick, 0);
  await page.getByRole("region", { name: "Menu", exact: true }).waitFor({ state: "visible" });
  evidence.claims.mainStart = { finalUrl: mainFinal, menu: true, paused: true, tick: 0 };

  await page.locator("#continue").click();
  await waitFor(() => window.__GOBLIN.state.paused === false);
  await waitFor((oldTick) => window.__GOBLIN.state.tick > oldTick, initial.tick);
  await page.locator("#pause").click();
  await waitFor(() => window.__GOBLIN.state.paused === true);
  const pausedTick = (await state()).tick;
  assert.deepEqual((await selection()).selectedIds, []);
  const oak = (await state()).trees.find((tree) => tree.felledAt === null);
  assert.ok(oak, "no standing oak available");
  const oakPoint = await project(oak.x, oak.z, 1.5);
  await page.mouse.click(oakPoint.x, oakPoint.y);
  await page.getByRole("region", { name: "Oak actions", exact: true }).waitFor({ state: "visible" });
  assert.deepEqual((await selection()).selectedIds, []);
  await page.locator("#mark-chop").click();
  await waitFor(
    (tick) =>
      window.__GOBLIN.state.tick === tick &&
      window.__GOBLIN.state.jobs.some(
        (job) => job.kind === "chop" && job.scope.actors === null,
      ),
    pausedTick,
  );
  const applied = await state();
  assert.equal(applied.tick, pausedTick);
  assert.equal(applied.jobs.length, 1);
  evidence.claims.pausedSharedChop = {
    applied: true,
    tick: applied.tick,
    job: applied.jobs[0],
  };
  await waitFor(
    () => window.__GOBLIN.persistence.phase === "saved" && window.__GOBLIN.persistence.revision > 0,
    null,
    30_000,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitFor(() => window.__GOBLIN?.artReady, null, 90_000);
  await page.getByRole("region", { name: "Menu", exact: true }).waitFor({ state: "visible" });
  const reloaded = await state();
  const reloadedSave = await persistence();
  const continueButton = page.locator("#continue");
  assert.equal(await continueButton.count(), 1);
  assert.match(await continueButton.textContent(), /Continue saved clearing/);
  assert.equal(reloaded.paused, true);
  assert.equal(reloadedSave.slot, "valid");
  evidence.claims.reloadSaved = {
    continueSavedClearing: true,
    paused: reloaded.paused,
    tick: reloaded.tick,
    jobs: reloaded.jobs.length,
    revision: reloadedSave.revision,
  };
  await shot("main-normal");
  assertNoErrors("main");

  const studyFinal = await visit("/study", () => window.__STUDY?.ready);
  const studyCanvases = await canvasesNonempty("study");
  const studyBeforePause = await page.evaluate(() => window.__STUDY.state);
  await page.locator("#play").click();
  await waitFor(() => window.__STUDY.state.playing === false);
  const studyPausedFrame = (await page.evaluate(() => window.__STUDY.state)).frame;
  await page.waitForTimeout(250);
  assert.equal((await page.evaluate(() => window.__STUDY.state)).frame, studyPausedFrame);
  await page.locator("#turn").click();
  await waitFor((before) => window.__STUDY.state.direction !== before, studyBeforePause.direction);
  await page.locator('[data-pose="idle"]').click();
  await waitFor(() => window.__STUDY.state.pose === "idle");
  evidence.claims.study = {
    finalUrl: studyFinal,
    canvases: studyCanvases,
    pausedFrameHeld: true,
    turned: true,
    pose: "idle",
  };
  assertNoErrors("study");

  const devilFinal = await visit("/devil-study.html", () => window.__DEVILS?.ready);
  const devilCanvases = await canvasesNonempty("devil study");
  await page.locator("#play").click();
  await waitFor(() => window.__DEVILS.playing === false);
  const devilFrame = await page.evaluate(() => window.__DEVILS.frame);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__DEVILS.frame), devilFrame);
  await page.locator("#pose-walk").click();
  await waitFor(() => window.__DEVILS.pose === "walk");
  const devilFacing = await page.evaluate(() => window.__DEVILS.facing);
  await page.locator("#turn").click();
  await waitFor((before) => window.__DEVILS.facing !== before, devilFacing);
  await shot("devil-intended-scale", "#court");
  evidence.claims.devilStudy = {
    finalUrl: devilFinal,
    canvases: devilCanvases,
    pausedFrameHeld: true,
    pose: "walk",
    turned: true,
  };
  assertNoErrors("devil study");

  const animalFinal = await visit("/animal-study.html", () => window.__ANIMALS?.ready);
  const animalCanvases = await canvasesNonempty("animal study");
  await page.locator("#play").click();
  await waitFor(() => window.__ANIMALS.playing === false);
  const animalFrame = await page.evaluate(() => window.__ANIMALS.frame);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__ANIMALS.frame), animalFrame);
  await page.locator('[data-pose="graze"]').click();
  await waitFor(() => window.__ANIMALS.pose === "graze");
  const animalFacing = await page.evaluate(() => window.__ANIMALS.facing);
  await page.locator("#turn").click();
  await waitFor((before) => window.__ANIMALS.facing !== before, animalFacing);
  await shot("animal-intended-scale", "#pasture");
  evidence.claims.animalStudy = {
    finalUrl: animalFinal,
    canvases: animalCanvases,
    pausedFrameHeld: true,
    pose: "graze",
    turned: true,
  };
  assertNoErrors("animal study");
  evidence.success = true;
} catch (error) {
  evidence.success = false;
  evidence.failure = String(error.stack || error);
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  evidence.screenshots.push("failure.png");
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/proof.json`, JSON.stringify(evidence, null, 2));
  await context.close();
  await browser.close();
  console.log(JSON.stringify(evidence, null, 2));
}
