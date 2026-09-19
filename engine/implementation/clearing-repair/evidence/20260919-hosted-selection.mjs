import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const out = ".botanical/renderer-audit-20260919";
await mkdir(out, { recursive: true });
const url =
  "https://clearing-80e39fd9-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony?game=colony&diagnostics=draw";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/home/levi/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
const receipt = { url, errors: [], phases: [], requests: [] };
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.route("**/assets/*.js", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    const hook = body.match(
      /window\.__HIVE_DRAW_DIAGNOSTICS=\(\)=>(([\w$]+)\.diagnostics\(\))/,
    );
    if (hook) {
      body = body.replace(hook[0], `window.hostedClient=${hook[2]},${hook[0]}`);
      receipt.instrumentation = { ...receipt.instrumentation, client: true };
    }
    if (body.includes("diagnostics(){return Object.freeze({voxelDraw:")) {
      const camera = body.match(/([\w$]+)\.zoomBy\(/)?.[1],
        app = body.match(/([\w$]+)\.canvas\.tabIndex=0/)?.[1];
      if (!camera || !app)
        throw new Error("Cannot identify existing hosted diagnostic bindings");
      body = body.replace(
        "diagnostics(){return Object.freeze({voxelDraw:",
        `diagnostics(){return Object.freeze({auditCamera:${camera},auditApp:${app},voxelDraw:`,
      );
      receipt.instrumentation = {
        ...receipt.instrumentation,
        camera: true,
        app: true,
      };
    }
    await route.fulfill({ response, body });
  });
  page.on("pageerror", (e) => receipt.errors.push(String(e)));
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (u.hostname === "hive-public-engine-demo.levi-fe0.workers.dev")
      receipt.requests.push({
        path: u.pathname.replace(/worlds\/[^/]+/, "worlds/[private]"),
        status: r.status(),
        ...(r.status() >= 400 ? { error: await r.text() } : {}),
      });
  });
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  receipt.status = response.status();
  await page.waitForFunction(
    () => window.__HIVE_DRAW_DIAGNOSTICS?.().visibleDrawRecords > 100,
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(1500);
  for (const name of ["initial", "pan", "zoom"]) {
    if (name === "pan")
      for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowLeft");
    if (name === "zoom")
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, -100);
        await page.waitForTimeout(100);
      }
    const target = await page.evaluate(() => {
      const s = hostedClient.state.subjects.find((s) => s.name === "Sedge"),
        d = __HIVE_DRAW_DIAGNOSTICS(),
        c = d.auditCamera,
        b = d.auditApp.canvas.getBoundingClientRect();
      return {
        id: s.id,
        x: b.x + c.x + s.screen.x * c.zoom,
        y: b.y + c.y + (s.screen.y - 13) * c.zoom,
        camera: { x: c.x, y: c.y, zoom: c.zoom },
      };
    });
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(200);
    receipt.phases.push({
      name,
      target,
      text: await page.locator("body").innerText(),
      selected: await page.evaluate(() => hostedClient.state.selectedIds),
      diagnostics: await page.evaluate(() => {
        const { auditApp, auditCamera, ...rest } = __HIVE_DRAW_DIAGNOSTICS();
        return rest;
      }),
    });
    console.log(
      name,
      receipt.phases
        .at(-1)
        .text.includes("Select a person or object to see its actions")
        ? "unselected"
        : "inspect receipt",
    );
    await writeFile(
      `${out}/hosted-selection.json`,
      JSON.stringify(receipt, null, 2),
    );
  }
  const pixels = await page.evaluate(async () => {
    const app = __HIVE_DRAW_DIAGNOSTICS().auditApp;
    app.stop();
    return app.renderer.extract.base64({ target: app.stage });
  });
  await writeFile(
    `${out}/hosted-selection.png`,
    Buffer.from(pixels.split(",")[1], "base64"),
  );
  receipt.browser = await browser.version();
} catch (e) {
  receipt.error = String(e);
  console.log(receipt.error);
} finally {
  await writeFile(
    `${out}/hosted-selection.json`,
    JSON.stringify(receipt, null, 2),
  );
  await browser.close();
}
