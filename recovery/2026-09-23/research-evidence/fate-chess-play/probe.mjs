import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const output = ".botanical/research/fate-chess-play";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/home/levi/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  env: {
    ...process.env,
    LD_LIBRARY_PATH:
      "/home/levi/src/Botanical-next/.botanical/browser-libs/root/usr/lib/x86_64-linux-gnu",
  },
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const events = [];
page.on("console", (msg) => events.push(`console ${msg.type()}: ${msg.text()}`));
page.on("pageerror", (err) => events.push(`pageerror: ${err.message}`));
await page.goto("https://nulltale.itch.io/chess-of-death", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.screenshot({ path: `${output}/01-page.png`, fullPage: true });
const initial = {
  title: await page.title(),
  frames: page.frames().map((frame) => frame.url()),
  buttons: await page.locator("button, [role=button], a").allTextContents(),
};
const run = page.getByText("Run this Game", { exact: false }).first();
if (await run.count()) await run.click().catch((err) => events.push(`run click: ${err.message}`));
await page.waitForTimeout(7000);
await page.screenshot({ path: `${output}/02-after-run.png`, fullPage: true });
const framesAfter = page.frames().map((frame) => frame.url());
const gameFrames = page.frames().filter((frame) => frame !== page.mainFrame());
let game = gameFrames.at(-1) ?? page;
const frameTexts = [];
for (const frame of page.frames()) {
  frameTexts.push({ url: frame.url(), text: (await frame.locator("body").innerText().catch(() => "")).slice(0, 4000) });
}
await page.screenshot({ path: `${output}/03-game.png`, fullPage: true }).catch(() => {});
const canvas = game.locator("canvas").first();
const canvasBox = await canvas.boundingBox().catch(() => null);
let clickResult = null;
if (canvasBox) {
  await canvas.click({ position: { x: canvasBox.width / 2, y: canvasBox.height / 2 } }).catch((err) => events.push(`canvas click: ${err.message}`));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${output}/04-after-input.png`, fullPage: true }).catch(() => {});
  for (let i = 0; i < 14; i++) {
    await canvas.click({ position: { x: canvasBox.width / 2, y: canvasBox.height / 2 } }).catch((err) => events.push(`canvas step ${i}: ${err.message}`));
    await page.waitForTimeout(450);
  }
  await page.screenshot({ path: `${output}/05-after-narrative-steps.png`, fullPage: true }).catch(() => {});
  await canvas.click({ position: { x: canvasBox.width / 2, y: canvasBox.height * 0.41 } }).catch((err) => events.push(`choice click: ${err.message}`));
  await page.waitForTimeout(700);
  for (let i = 0; i < 18; i++) {
    await canvas.click({ position: { x: canvasBox.width / 2, y: canvasBox.height / 2 } }).catch((err) => events.push(`post-choice ${i}: ${err.message}`));
    await page.waitForTimeout(350);
  }
  await page.screenshot({ path: `${output}/06-after-choice.png`, fullPage: true }).catch(() => {});
  clickResult = { canvasBox, frames: page.frames().map((frame) => frame.url()) };
}
await writeFile(`${output}/observations.json`, JSON.stringify({ initial, framesAfter, frameTexts, clickResult, events }, null, 2));
await browser.close();
