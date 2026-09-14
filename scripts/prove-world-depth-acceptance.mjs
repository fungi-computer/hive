import { chromium } from "playwright";

const base = process.env.HIVE_DEPTH_ACCEPTANCE_BASE ?? "http://127.0.0.1:5187/depth-feasibility-acceptance.html";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__HIVE_RETAINED_DEPTH_ACCEPTANCE__?.status === "rendered" || globalThis.__HIVE_RETAINED_DEPTH_ACCEPTANCE__?.status === "FAIL", null, { timeout: 120000 });
  const result = await page.evaluate(() => globalThis.__HIVE_RETAINED_DEPTH_ACCEPTANCE__);
  const required = result?.pointPicks;
  if (!result || result.status !== "rendered" || !result.permutationStable ||
      required?.bed?.entityId !== "bed" || required?.person?.entityId !== "person-front" ||
      required?.bottom?.entityId !== "stair-bottom" || required?.mid?.entityId !== "stair-mid" ||
      required?.landing?.entityId !== "stair-landing" || required?.opaque?.entityId !== "opaque-wall" ||
      required?.opaque?.target !== null || result.waterFrontChanged <= result.waterBehindChanged)
    throw new Error(`retained-depth-acceptance-failed:${JSON.stringify(result)}`);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
