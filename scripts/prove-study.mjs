import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const url = process.argv[2] || "http://127.0.0.1:5188/study.html";
const output = process.argv[3] || ".botanical/study-proof";
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
page.on("pageerror", (error) => errors.push(String(error)));
page.on("requestfailed", (request) =>
  errors.push(`${request.url()}: ${request.failure()?.errorText}`),
);
const shot = (name) =>
  page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
const state = () => page.evaluate(() => window.__STUDY.state);
try {
  assert.equal((await page.goto(url)).status(), 200);
  await page.waitForFunction(() => window.__STUDY?.ready, null, {
    timeout: 60000,
  });
  const metrics = await page.evaluate(() => window.__STUDY.metrics);
  const silhouettes = Object.fromEntries(
    Object.entries(metrics).map(([kind, frames]) => {
      // Actual alpha bounds of every exported view/pose, including the cat tail,
      // staff and hat. No image is allowed to touch its padded frame boundary.
      for (const frame of frames) {
        assert.ok(
          frame.width > 0 && frame.height > 0,
          `${kind} has visible pixels`,
        );
        assert.ok(
          frame.left > 0 &&
            frame.top > 0 &&
            frame.right < 47 &&
            frame.bottom < 63,
          `${kind} ${frame.pose}/${frame.direction}/${frame.frame} clips`,
        );
      }
      return [
        kind,
        {
          minHeight: Math.min(...frames.map((f) => f.height)),
          maxHeight: Math.max(...frames.map((f) => f.height)),
        },
      ];
    }),
  );
  await page.getByRole("button", { name: "Standing", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await shot("01-standing");
  const facing = [];
  for (let turn = 0; turn < 4; turn++) {
    facing.push(await state());
    await shot(`view-${turn}`);
    await page.getByRole("button", { name: "Turn figures" }).click();
  }
  assert.deepEqual(
    facing.map((s) => s.direction),
    [0, 1, 2, 3],
  );
  assert.equal((await state()).direction, 0);
  await page.getByRole("button", { name: "Walking", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const animation = [];
  for (let i = 0; i < 4; i++) {
    const before = (await state()).frame;
    await page.waitForFunction(
      (frame) => window.__STUDY.state.frame !== frame,
      before,
    );
    animation.push(
      await page
        .locator(".detail img")
        .evaluateAll((images) => images.map((img) => img.src)),
    );
  }
  for (let i = 0; i < 5; i++)
    assert.ok(
      new Set(animation.map((images) => images[i])).size > 1,
      `figure ${i} actually animates`,
    );
  await shot("02-walking");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await state();
  await page.waitForTimeout(500);
  assert.deepEqual(await state(), paused);
  await page
    .getByRole("button", { name: "Native pixels", exact: true })
    .click();
  assert.equal(
    Math.round((await page.locator("canvas").boundingBox()).width),
    640,
  );
  await shot("03-native");
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  await page.getByRole("button", { name: "Standing", exact: true }).click();
  await shot("04-lineup");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Native pixels", exact: true })
    .click();
  assert.equal(
    Math.round((await page.locator("canvas").boundingBox()).width),
    640,
  );
  assert.equal(await page.evaluate(() => document.body.scrollWidth), 390);
  await shot("mobile-native");
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  assert.ok((await page.locator("canvas").boundingBox()).width < 390);
  await shot("mobile-fit");
  await page.setViewportSize({ width: 1440, height: 1100 });

  // Exercise the immediate consumer of the newly shared bake export and the
  // production multi-page bundle through actual game input.
  await page.getByRole("link", { name: "Back to the clearing" }).click();
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 60000,
  });
  await page.locator("#select").click();
  const tree = await page.evaluate(() => window.__GOBLIN.project(3, 4, 1.8));
  const canvas = await page.locator("canvas").boundingBox();
  await page.mouse.click(
    canvas.x + (tree.x * canvas.width) / 640,
    canvas.y + (tree.y * canvas.height) / 400,
  );
  await page.locator("#task").click();
  await page.waitForFunction(
    () => window.__GOBLIN.state.pawn.mode === "chop",
    null,
    { timeout: 30000 },
  );
  const assignment = await page.evaluate(
    () => window.__GOBLIN.state.assignment,
  );
  assert.match(assignment.task, /:chop:oak-1$/);
  await page.waitForFunction(
    () => window.__GOBLIN.state.piles.reduce((n, p) => n + p.amount, 0) === 6,
    null,
    {
      timeout: 30000,
    },
  );
  const game = await page.evaluate(() => window.__GOBLIN.state);
  assert.equal(
    game.piles.reduce((n, p) => n + p.amount, 0),
    6,
  );
  assert.equal(game.assignment, null);
  assert.equal(game.felled, 1);
  await page.locator("#pause").click();
  await shot("05-clearing-still-works");
  assert.deepEqual(errors, []);
  const proof = { url, silhouettes, facing, paused, assignment, game, errors };
  await writeFile(
    `${output}/proof.json`,
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      url,
      silhouettes,
      controls: "four facings, animation, pause and native zoom passed",
      game: "real libcolony chop earned six wood",
      errors,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
