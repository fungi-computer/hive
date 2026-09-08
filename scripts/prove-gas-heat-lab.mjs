import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:5198/";
const output = process.argv[3] || ".botanical/gas-heat-lab-local-20260908";
const distRoot = process.argv[4] || "dist";
const paths = [
  "gas-heat-lab.html",
  "study-evidence/gas-heat/manifest.json",
  "study-evidence/gas-heat/sealed.json",
  "study-evidence/gas-heat/ports.json",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

await mkdir(output, { recursive: true });
const evidence = {
  mode: "local-served-recorded-playback",
  base,
  errors: [],
  screenshots: [],
  claims: {},
};
let browser;

try {
  const local = Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        path,
        sha256(await readFile(`${distRoot}/${path}`)),
      ]),
    ),
  );
  const served = Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => {
        const response = await fetch(new URL(path, base));
        assert.equal(response.status, 200, `${path} must serve`);
        return [path, sha256(Buffer.from(await response.arrayBuffer()))];
      }),
    ),
  );
  assert.deepEqual(served, local);
  evidence.parity = { local, served, exact: true };

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => evidence.errors.push(`page: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    evidence.errors.push(
      `request: ${request.url()} · ${request.failure()?.errorText || "unknown"}`,
    ),
  );

  const response = await page.goto(new URL("gas-heat-lab.html", base).href, {
    waitUntil: "domcontentloaded",
  });
  assert.equal(response?.status(), 200);
  await page
    .getByRole("heading", { name: "Recorded tracer playback" })
    .waitFor();
  await page.getByRole("link", { name: "Back to the clearing" }).waitFor();
  await page.getByRole("navigation", { name: "Breadcrumb" }).waitFor();

  const slider = page.locator("[data-gas-frame]");
  await slider.waitFor();
  assert.equal(await slider.getAttribute("type"), "range");
  assert.match((await slider.getAttribute("class")) ?? "", /range/);
  assert.equal(await slider.inputValue(), "0");
  assert.equal(await page.locator(".gas-heat-slice > *").count(), 80);
  assert.match(
    await page.locator("body").innerText(),
    /Saved frame 1 of 46 · 0 s/,
  );
  assert.match(
    await page.locator("body").innerText(),
    /Recorded native Node solver · not live/,
  );
  const initialColors = await page
    .locator(".gas-heat-air")
    .evaluateAll((cells) =>
      cells.map((cell) => getComputedStyle(cell).background),
    );

  await slider.focus();
  await slider.press("End");
  await page.waitForFunction(
    () => document.querySelector("[data-gas-frame]")?.value === "45",
  );
  assert.match(
    await page.locator("body").innerText(),
    /Saved frame 46 of 46 · 45 s/,
  );
  const finalColors = await page
    .locator(".gas-heat-air")
    .evaluateAll((cells) =>
      cells.map((cell) => getComputedStyle(cell).background),
    );
  assert.notDeepEqual(finalColors, initialColors);
  evidence.claims.sealed = {
    cells: 80,
    firstSeconds: 0,
    finalSeconds: 45,
    changedDisplay: true,
  };

  await page.locator('[data-gas-case="ports"]').click();
  await page
    .getByText("Exploratory box with two prescribed ambient openings")
    .waitFor();
  assert.equal(await slider.inputValue(), "0");
  await slider.focus();
  await slider.press("ArrowRight");
  assert.equal(await slider.inputValue(), "1");
  await page.locator("[data-gas-play]").click();
  await page.waitForFunction(
    () => Number(document.querySelector("[data-gas-frame]")?.value) >= 2,
  );
  await page.locator("[data-gas-play]").click();
  const pausedFrame = await slider.inputValue();
  await page.waitForTimeout(400);
  assert.equal(await slider.inputValue(), pausedFrame);
  evidence.claims.ports = {
    resetOnSelection: true,
    keyboardFrame: 1,
    playbackAdvanced: Number(pausedFrame) >= 2,
    pauseHeld: true,
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const containment = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    skipLink: (() => {
      const rect = document
        .querySelector(".study-skip")
        .getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    })(),
    slider: (() => {
      const rect = document
        .querySelector("[data-gas-frame]")
        .getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    })(),
  }));
  assert.ok(containment.scrollWidth <= containment.clientWidth);
  assert.ok(containment.slider.left >= 0);
  assert.ok(containment.slider.right <= containment.clientWidth);
  assert.ok(containment.skipLink.bottom <= 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/gas-heat-narrow-top.png` });
  await slider.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/gas-heat-narrow-controls.png` });
  evidence.screenshots.push(
    "gas-heat-narrow-top.png",
    "gas-heat-narrow-controls.png",
  );
  evidence.claims.narrow = containment;
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  evidence.failure = { message: error.message, stack: error.stack };
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
      await page
        .screenshot({ path: `${output}/failure.png`, fullPage: true })
        .catch(() => undefined);
      evidence.screenshots.push("failure.png");
    }
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await writeFile(
    `${output}/proof.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}
