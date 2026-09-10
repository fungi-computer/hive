import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base =
  process.argv[2] || "https://71274300-fungi-goblin-bnb.levi-fe0.workers.dev/";
const output =
  process.argv[3] || ".botanical/clearing-performance/hosted-measure";
const startupLimitMs = 60_000;
const measureLimitMs = 36_000;
const viewport = { width: 1280, height: 800 };

await mkdir(output, { recursive: true });
const evidence = {
  mode: "hosted-fresh-clearing-performance",
  url: new URL("?measure=1", base).href,
  viewport,
  startupLimitMs,
  measureLimitMs,
  errors: [],
  screenshot: null,
  frontier: "launch",
  claims: {
    workload:
      "One fresh browser context opens the deployed clearing, uses the public Continue button, and observes the existing 30-second measure=1 cost window.",
    scope:
      "Measures fresh water, simulation, and rendering behavior in the live clearing; it does not establish an enclosed smoking-room workload.",
    mutation: "No __GOBLIN state is written and no game state is injected.",
  },
};

let browser;
let context;
let page;
const startedAt = Date.now();
const remainingStartupMs = () =>
  Math.max(1, startupLimitMs - (Date.now() - startedAt));

function recordError(prefix, error) {
  evidence.errors.push(
    `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

try {
  assert.ok(process.env.CHROMIUM_PATH, "CHROMIUM_PATH is required");
  evidence.frontier = "launching-browser";
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    timeout: remainingStartupMs(),
  });
  context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.setDefaultTimeout(startupLimitMs);
  page.on("pageerror", (error) => recordError("pageerror", error));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    evidence.errors.push(
      `requestfailed: ${request.url()} · ${request.failure()?.errorText}`,
    ),
  );

  evidence.frontier = "opening-fresh-context";
  const response = await page.goto(evidence.url, {
    waitUntil: "domcontentloaded",
    timeout: remainingStartupMs(),
  });
  evidence.response = {
    status: response?.status() ?? null,
    finalUrl: page.url(),
  };
  assert.equal(response?.status(), 200, "host did not return HTTP 200");

  evidence.frontier = "waiting-for-public-game-ready";
  await page.waitForFunction(() => window.__GOBLIN?.artReady === true, null, {
    timeout: remainingStartupMs(),
  });
  evidence.startup = await page.evaluate(
    () => window.__GOBLIN.cost?.startup ?? null,
  );
  evidence.frontier = "public-game-ready-paused";

  const continueButton = page.locator("#continue");
  await continueButton.waitFor({
    state: "visible",
    timeout: remainingStartupMs(),
  });
  evidence.controls = {
    selector: "#continue",
    label: await continueButton.textContent(),
  };
  await continueButton.click();
  await page.waitForFunction(
    () => window.__GOBLIN.state.paused === false,
    null,
    {
      timeout: remainingStartupMs(),
    },
  );
  evidence.frontier = "measuring-existing-cost-window";
  await page.waitForFunction(
    () => window.__GOBLIN.cost?.phase === "stopped",
    null,
    { timeout: measureLimitMs },
  );
  evidence.cost = await page.evaluate(() => window.__GOBLIN.cost);

  evidence.frontier = "capturing-final-screenshot";
  const screenshot = "hosted-clearing-final.png";
  await page.screenshot({ path: `${output}/${screenshot}`, fullPage: false });
  evidence.screenshot = screenshot;
  evidence.frontier = "complete";
} catch (error) {
  recordError("failure", error);
} finally {
  if (page && evidence.screenshot === null) {
    try {
      const screenshot = "hosted-clearing-frontier.png";
      await page.screenshot({
        path: `${output}/${screenshot}`,
        fullPage: false,
      });
      evidence.screenshot = screenshot;
    } catch (error) {
      recordError("frontier screenshot", error);
    }
  }
  evidence.elapsedMs = Date.now() - startedAt;
  await writeFile(
    `${output}/proof.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  await context?.close();
  await browser?.close();
}

if (evidence.frontier !== "complete") process.exitCode = 1;
