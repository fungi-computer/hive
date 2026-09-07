import { chromium } from "playwright";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const url = process.argv[2] || "http://127.0.0.1:5187/study.html";
const output = process.argv[3] || ".botanical/home-art-proof";
const homeKinds = ["rowan", "witch-runner"];
const homePoses = [
  "idle",
  "walk",
  "chop",
  "build",
  "carry",
  "pickup",
  "deliver",
  "sleep",
];
const expectedFrames = Object.fromEntries(
  homePoses.map((pose) => [pose, pose === "sleep" ? 1 : 8]),
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1440, height: 1100 } },
});
const page = await context.newPage();
const errors = [];
const screenshots = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("requestfailed", (request) =>
  errors.push(`${request.url()}: ${request.failure()?.errorText}`),
);
const shot = async (name, locator = null) => {
  screenshots.push(`${name}.png`);
  if (locator) return locator.screenshot({ path: `${output}/${name}.png` });
  return page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
};
const state = () => page.evaluate(() => window.__STUDY.state);
const homeState = () => page.evaluate(() => window.__STUDY.state.home);
const homeImages = () =>
  page.evaluate(() => {
    const current = window.__STUDY.state.home;
    const image = document.querySelector(
      `#home-sheet img[data-home-frame="${current.frame}"]`,
    );
    return {
      frame: current.frame,
      image: image?.src,
      images: [...document.querySelectorAll("#home-sheet img")].map(
        (node) => node.src,
      ),
    };
  });
const homeSheet = () =>
  page.evaluate(() => ({
    count: document.querySelectorAll("#home-sheet img").length,
    widths: [...document.querySelectorAll("#home-sheet img")].map((node) =>
      Math.round(node.getBoundingClientRect().width),
    ),
    data: {
      actor: document.querySelector("#home-sheet")?.dataset.homeActor,
      pose: document.querySelector("#home-sheet")?.dataset.homePose,
      direction: document.querySelector("#home-sheet")?.dataset.homeDirection,
      scale: document.querySelector("#home-sheet")?.dataset.homeScale,
    },
  }));
const visitorImages = () =>
  page
    .locator(".detail:not([hidden]) img")
    .evaluateAll((images) => images.map((image) => image.src));

async function selectHome({ actor, pose, direction = 0, scale = 1 }) {
  await page.locator(`button[data-home-actor="${actor}"]`).click();
  await page.locator(`button[data-home-pose="${pose}"]`).click();
  await page.locator(`button[data-home-direction="${direction}"]`).click();
  await page.locator(`button[data-home-scale="${scale}"]`).click();
  try {
    await page.waitForFunction(
      ({ expectedActor, expectedPose, expectedDirection, expectedScale }) => {
        const current = window.__STUDY.state.home;
        return (
          current.actor === expectedActor &&
          current.pose === expectedPose &&
          current.direction === expectedDirection &&
          current.scale === expectedScale
        );
      },
      {
        expectedActor: actor,
        expectedPose: pose,
        expectedDirection: direction,
        expectedScale: scale,
      },
    );
  } catch (error) {
    const current = await homeState();
    throw new Error(
      `Home selection mismatch: expected ${actor}/${pose}/${direction}/${scale}, got ${JSON.stringify(current)}; ${error}`,
    );
  }
}
async function setHomePlaying(playing) {
  if ((await homeState()).playing !== playing)
    await page.locator("#home-play").click();
}
async function collectHomeMotion(actor, pose) {
  await selectHome({ actor, pose, scale: 1 });
  await setHomePlaying(true);
  const samples = [];
  const seenFrames = new Set();
  let previous = (await homeState()).frame;
  while (seenFrames.size < expectedFrames[pose]) {
    await page.waitForFunction(
      (frame) => window.__STUDY.state.home.frame !== frame,
      previous,
      { timeout: 10000 },
    );
    const sample = await homeImages();
    previous = sample.frame;
    if (seenFrames.has(sample.frame)) continue;
    seenFrames.add(sample.frame);
    samples.push({ frame: sample.frame, image: sample.image });
  }
  const distinctImages = new Set(samples.map((sample) => sample.image)).size;
  assert.ok(distinctImages > 1, `${actor} ${pose} does not visibly change`);
  return {
    sampledFrames: samples.map((sample) => sample.frame),
    distinctImages,
  };
}

let proof;
try {
  const startedAt = performance.now();
  const response = await page.goto(url);
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__STUDY?.ready, null, {
    timeout: 60000,
  });
  const artReadyMs = Math.round(performance.now() - startedAt);

  const homeMetrics = await page.evaluate(() => window.__STUDY.homeMetrics);
  const homeCounts = {};
  const alpha = {};
  for (const kind of homeKinds) {
    assert.deepEqual(Object.keys(homeMetrics[kind]), homePoses);
    homeCounts[kind] = {};
    alpha[kind] = {};
    for (const pose of homePoses) {
      assert.equal(homeMetrics[kind][pose].length, 4);
      const directions = homeMetrics[kind][pose].map((frames) => frames.length);
      assert.deepEqual(directions, Array(4).fill(expectedFrames[pose]));
      homeCounts[kind][pose] = directions;
      alpha[kind][pose] = homeMetrics[kind][pose].flat().map((frame) => {
        assert.equal(frame.canvasWidth, 80);
        assert.equal(frame.canvasHeight, 80);
        assert.ok(frame.width > 0 && frame.height > 0, `${kind} has alpha`);
        assert.ok(
          frame.left > 0 &&
            frame.top > 0 &&
            frame.right < 79 &&
            frame.bottom < 79,
          `${kind} ${frame.pose}/${frame.direction}/${frame.frame} touches edge`,
        );
        return {
          direction: frame.direction,
          frame: frame.frame,
          bounds: [frame.left, frame.top, frame.right, frame.bottom],
        };
      });
    }
  }
  const pawnAnchor = await page.evaluate(() => window.__STUDY.pawnAnchor);
  assert.ok(pawnAnchor.x > 0 && pawnAnchor.x < 1);
  assert.ok(pawnAnchor.y > 0 && pawnAnchor.y < 1);

  const sheetCoverage = {};
  await setHomePlaying(false);
  for (const actor of homeKinds) {
    sheetCoverage[actor] = {};
    for (const pose of homePoses) {
      sheetCoverage[actor][pose] = [];
      for (let direction = 0; direction < 4; direction++) {
        await selectHome({ actor, pose, direction, scale: 1 });
        const sheet = await homeSheet();
        assert.equal(sheet.count, expectedFrames[pose]);
        assert.deepEqual(sheet.widths, Array(expectedFrames[pose]).fill(80));
        sheetCoverage[actor][pose].push({ direction, count: sheet.count });
      }
    }
  }

  const homeCaptures = [];
  for (const [index, actor] of homeKinds.entries()) {
    await selectHome({ actor, pose: "walk", scale: 1 });
    await shot(
      `0${index * 2 + 1}-home-${actor === "rowan" ? "rowan" : "sedge"}-native`,
      page.locator("#home-review"),
    );
    assert.deepEqual((await homeSheet()).widths, Array(8).fill(80));
    homeCaptures.push({ actor, scale: 1, sheet: await homeSheet() });
    await selectHome({ actor, pose: "walk", scale: 2 });
    await shot(
      `0${index * 2 + 2}-home-${actor === "rowan" ? "rowan" : "sedge"}-game2x`,
      page.locator("#home-review"),
    );
    assert.deepEqual((await homeSheet()).widths, Array(8).fill(160));
    homeCaptures.push({ actor, scale: 2, sheet: await homeSheet() });
  }

  const sleepSingleFrame = {};
  for (const actor of homeKinds) {
    sleepSingleFrame[actor] = {};
    for (const pose of ["sleep"]) {
      await selectHome({ actor, pose });
      const before = await homeState();
      await page.waitForTimeout(500);
      const after = await homeState();
      assert.equal(before.frame, 0);
      assert.equal(after.frame, 0);
      assert.equal((await homeSheet()).count, 1);
      sleepSingleFrame[actor][pose] = { frames: 1, frame: after.frame };
    }
  }

  const motion = {};
  for (const actor of homeKinds) {
    motion[actor] = {};
    for (const pose of [
      "idle",
      "walk",
      "chop",
      "build",
      "carry",
      "pickup",
      "deliver",
    ]) {
      console.log(JSON.stringify({ checkingHomeMotion: { actor, pose } }));
      motion[actor][pose] = await collectHomeMotion(actor, pose);
    }
  }
  await selectHome({ actor: "witch-runner", pose: "idle", scale: 2 });
  await setHomePlaying(true);
  const idleBeforePause = await homeState();
  await page.waitForFunction(
    (frame) => window.__STUDY.state.home.frame !== frame,
    idleBeforePause.frame,
    { timeout: 10000 },
  );
  await setHomePlaying(false);
  const idlePaused = await homeState();
  const idlePausedImages = await homeImages();
  await page.waitForTimeout(500);
  assert.deepEqual(await homeState(), idlePaused);
  assert.deepEqual(await homeImages(), idlePausedImages);
  await setHomePlaying(false);
  await selectHome({ actor: "rowan", pose: "walk", scale: 2 });
  await shot("05-home-rowan-walk-playing", page.locator("#home-review"));
  await selectHome({ actor: "witch-runner", pose: "carry", scale: 2 });
  await setHomePlaying(true);
  await page.waitForTimeout(400);
  await shot("06-home-sedge-carry-playing", page.locator("#home-review"));
  await setHomePlaying(false);

  await page
    .getByRole("button", { name: "Original five", exact: true })
    .click();
  await page.getByRole("button", { name: "Standing", exact: true }).click();
  if (!(await state()).playing)
    await page.getByRole("button", { name: "Play", exact: true }).click();
  const catIdleFrames = new Set();
  const catIdleImages = [];
  let previousCatIdleFrame = (await state()).frame;
  while (catIdleFrames.size < 8) {
    await page.waitForFunction(
      (frame) => window.__STUDY.state.frame !== frame,
      previousCatIdleFrame,
      { timeout: 10000 },
    );
    const current = await state();
    previousCatIdleFrame = current.frame;
    if (catIdleFrames.has(current.frame)) continue;
    const images = await visitorImages();
    assert.equal(images.length, 5);
    catIdleFrames.add(current.frame);
    catIdleImages.push(images[4]);
  }
  assert.deepEqual(
    [...catIdleFrames].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.ok(
    new Set(catIdleImages).size > 1,
    "Bramble idle does not visibly change",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const catIdlePaused = await state();
  const catIdlePausedImages = await visitorImages();
  await page.waitForTimeout(500);
  assert.deepEqual(await state(), catIdlePaused);
  assert.deepEqual(await visitorImages(), catIdlePausedImages);
  await shot("07-bramble-idle-paused", page.locator(".workbench"));

  await page.getByRole("button", { name: "Visitors", exact: true }).click();
  await page.getByRole("button", { name: "Standing", exact: true }).click();
  if ((await state()).playing)
    await page.getByRole("button", { name: "Pause", exact: true }).click();
  const idleFacings = [];
  for (let direction = 0; direction < 4; direction++) {
    const current = await state();
    assert.equal(current.lineup, "visitors");
    assert.equal(current.pose, "idle");
    assert.equal(current.playing, false);
    assert.equal(current.direction, direction);
    idleFacings.push(direction);
    await shot(`visitor-idle-facing-${direction}`, page.locator(".workbench"));
    await page.getByRole("button", { name: "Turn figures" }).click();
  }
  assert.deepEqual(idleFacings, [0, 1, 2, 3]);

  await page.getByRole("button", { name: "Walking", exact: true }).click();
  await page.locator("#play").click();
  const visitorWalk = [];
  const visitorFrames = new Set();
  let previousVisitorFrame = (await state()).frame;
  while (visitorFrames.size < 8) {
    await page.waitForFunction(
      (frame) => window.__STUDY.state.frame !== frame,
      previousVisitorFrame,
      { timeout: 10000 },
    );
    const current = await state();
    previousVisitorFrame = current.frame;
    if (visitorFrames.has(current.frame)) continue;
    const images = await visitorImages();
    assert.equal(current.playing, true);
    assert.equal(images.length, 5);
    visitorFrames.add(current.frame);
    visitorWalk.push({ frame: current.frame, images });
  }
  assert.deepEqual(
    [...visitorFrames].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  const visitorDistinctPerPhase = visitorWalk.map(
    ({ images }) => new Set(images).size,
  );
  assert.ok(visitorDistinctPerPhase.every((count) => count === 5));
  const visitorDistinctPerFigure = Array.from(
    { length: 5 },
    (_, index) => new Set(visitorWalk.map(({ images }) => images[index])).size,
  );
  assert.deepEqual(
    visitorDistinctPerFigure.filter((_, index) => index !== 2),
    [5, 5, 5, 5],
  );
  assert.ok(visitorDistinctPerFigure[2] >= 5);
  const visitorDistinctImages = new Set(
    visitorWalk.flatMap(({ images }) => images),
  ).size;
  assert.ok(visitorDistinctImages >= 5);
  await shot("visitor-walk-playing", page.locator(".workbench"));

  await page.locator("#play").click();
  const paused = await state();
  const pausedImages = await visitorImages();
  await page.waitForTimeout(500);
  assert.deepEqual(await state(), paused);
  assert.deepEqual(await visitorImages(), pausedImages);
  await shot("visitor-paused-image", page.locator(".workbench"));

  await page
    .getByRole("button", { name: "Native pixels", exact: true })
    .click();
  assert.equal(
    Math.round((await page.locator(".workbench canvas").boundingBox()).width),
    640,
  );
  await shot("visitor-normal-640", page.locator(".workbench"));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    Math.round((await page.locator(".workbench canvas").boundingBox()).width),
    640,
  );
  assert.equal(await page.evaluate(() => document.body.scrollWidth), 390);
  await shot("visitor-narrow-390", page.locator(".workbench"));
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  assert.ok(
    (await page.locator(".workbench canvas").boundingBox()).width < 390,
  );
  await shot("visitor-narrow-fit", page.locator(".workbench"));
  await page.setViewportSize({ width: 1440, height: 1100 });

  assert.deepEqual(errors, []);
  proof = {
    url,
    actualArt: {
      artReadyMs,
      frame: [80, 80],
      pawnAnchor,
      poses: homePoses,
      phaseCounts: homeCounts,
      alpha,
    },
    homeReview: {
      sheetCoverage,
      captures: homeCaptures,
      sleepSingleFrame,
      motion,
      idlePause: { state: idlePaused, images: idlePausedImages },
    },
    visitors: {
      catIdle: {
        frames: [...catIdleFrames].sort((a, b) => a - b),
        distinctImages: new Set(catIdleImages).size,
        paused: catIdlePaused,
      },
      idleFacings,
      walkFrames: [...visitorFrames].sort((a, b) => a - b),
      visitorDistinctPerPhase,
      visitorDistinctPerFigure,
      visitorDistinctImages,
      paused,
      pausedImages,
      normalWidth: 640,
      narrowViewport: 390,
    },
    screenshots,
    errors,
  };
  await writeFile(
    `${output}/proof.json`,
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      url,
      actualPhaseCounts: homeCounts,
      homeMotionDistinctImages: Object.fromEntries(
        Object.entries(motion).map(([actor, poses]) => [
          actor,
          Object.fromEntries(
            Object.entries(poses).map(([pose, result]) => [
              pose,
              result.distinctImages,
            ]),
          ),
        ]),
      ),
      visitorWalkFrames: [...visitorFrames].sort((a, b) => a - b),
      visitorDistinctPerPhase,
      visitorDistinctPerFigure,
      screenshots,
      errors,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
const videos = (await readdir(output)).filter((name) => name.endsWith(".webm"));
if (proof) {
  proof.video = videos;
  await writeFile(
    `${output}/proof.json`,
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(JSON.stringify({ evidence: output, videos }));
}
