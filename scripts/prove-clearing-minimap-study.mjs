import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const [base, output = ".botanical/clearing-minimap-study-20260908"] =
  process.argv.slice(2);
const expectedClearingSha = process.env.EXPECTED_CLEARING_SHA256;
const executablePath = process.env.CHROMIUM_PATH;
if (!base) throw new Error("pass the clean-worktree Vite base URL");
if (!expectedClearingSha)
  throw new Error(
    "EXPECTED_CLEARING_SHA256 is required for the frozen baseline",
  );
if (!executablePath)
  throw new Error("CHROMIUM_PATH is required for the isolated browser proof");
const clearingSource = await readFile("src/clearing.ts");
const clearingSha = createHash("sha256").update(clearingSource).digest("hex");
if (clearingSha !== expectedClearingSha)
  throw new Error(
    `refusing non-baseline clearing.ts: expected ${expectedClearingSha}, got ${clearingSha}`,
  );
const url = new URL("/clearing-minimap-study.html", base).toString();
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath });
const errors = { page: [], console: [] };
let page;
try {
  page = await browser.newPage({ viewport: { width: 1024, height: 760 } });
  page.on("pageerror", (error) => errors.page.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__CLEARING_MINIMAP_STUDY?.ready);
  const before = await page.evaluate(
    () => window.__CLEARING_MINIMAP_STUDY.snapshot,
  );
  await page.locator('[data-cell="2,3,0"]').click();
  const afterClick = await page.evaluate(
    () => window.__CLEARING_MINIMAP_STUDY.snapshot,
  );
  if (
    afterClick.requestedCenter?.x !== 2 ||
    afterClick.requestedCenter?.z !== 3
  )
    throw new Error("minimap did not emit the requested Ground center cell");
  if (afterClick.tick !== before.tick || afterClick.jobs !== before.jobs)
    throw new Error("minimap request mutated the frozen Clearing state");
  await page.screenshot({
    path: `${output}/normal-ground.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Upper", exact: true }).click();
  const upper = await page.evaluate(
    () => window.__CLEARING_MINIMAP_STUDY.snapshot,
  );
  if (
    upper.level !== 1 ||
    upper.tick !== before.tick ||
    upper.jobs !== before.jobs
  )
    throw new Error(
      "Upper map selection mutated state or did not change logical level",
    );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const narrow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    snapshot: window.__CLEARING_MINIMAP_STUDY.snapshot,
  }));
  if (narrow.width !== narrow.scrollWidth)
    throw new Error("390px study overflow");
  await page.screenshot({ path: `${output}/narrow-upper.png`, fullPage: true });
  const proof = {
    passed: errors.page.length === 0 && errors.console.length === 0,
    url,
    baseline: { clearingSha },
    before,
    afterClick,
    upper,
    narrow,
    errors,
    screenshots: ["normal-ground.png", "narrow-upper.png"],
    claims: {
      standaloneLocalStudy: true,
      mapRequestOnly: true,
      frozenTickAndJobs: true,
      groundAndUpper: true,
      narrowContainment: true,
    },
  };
  await writeFile(
    `${output}/proof.json`,
    `${JSON.stringify(proof, null, 2)}\n`,
  );
  if (!proof.passed) throw new Error("study reported browser errors");
  console.log(
    JSON.stringify({ output, proof: `${output}/proof.json`, status: "passed" }),
  );
} catch (error) {
  const failure = { url, error: String(error), errors };
  await writeFile(
    `${output}/failure.json`,
    `${JSON.stringify(failure, null, 2)}\n`,
  );
  throw error;
} finally {
  await browser.close();
}
