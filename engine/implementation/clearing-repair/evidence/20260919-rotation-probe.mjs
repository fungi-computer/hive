import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const output = process.argv[2] ?? ".botanical/renderer-implementation-20260919/rotation";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: "/home/levi/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.route("**/engine/src/client/client.js*", async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace("  return {\n    state,", `
      window.rotationProbe = {
        get state(){return state}, get camera(){return camera}, get app(){return app},
        get turn(){return cameraGeometry.turn}, get geometry(){return cameraGeometry},
        get records(){return orderedSprites}, get coverage(){return terrainLayer.coverage}, get art(){return art}
      };
      return {\n    state,`);
    await route.fulfill({ response, body });
  });
  await page.goto("http://127.0.0.1:5187/engine/colony.html?game=colony&runtime=local&diagnostics=draw", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.rotationProbe?.records.length > 100 && window.rotationProbe.coverage.demandComplete,
    null, { timeout: 120000 });
  const samples = [];
  for (let step = 0; step < 5; step++) {
    if (step) {
      await page.getByRole("button", { name: "Rotate camera right" }).click();
      await page.waitForFunction(turn => window.rotationProbe?.turn === turn && window.rotationProbe.coverage.demandComplete &&
        window.rotationProbe.records.length > 100, step % 4, { timeout: 120000 });
    }
    const sample = await page.evaluate(() => {
      const { state, camera, geometry, records, coverage, turn, app, art } = window.rotationProbe;
      const subject = state.subjects.find(value => value.id === "party:1.person.1");
      const center = geometry.planePoint((app.screen.width / 2 - camera.x) / camera.zoom,
        (app.screen.height / 2 - camera.y) / camera.zoom,
        (state.view.level + 0.5) * 0.54);
      const record = records.find(value => value.id === subject.id);
      let click = null;
      for (let y = Math.floor(record.screenBounds.top); y <= Math.ceil(record.screenBounds.bottom) && !click; y++)
        for (let x = Math.floor(record.screenBounds.left); x <= Math.ceil(record.screenBounds.right); x++) {
          const point = { x: x + 0.5, y: y + 0.5 };
          if (!record.contains?.(point)) continue;
          const foremost = [...records].reverse().find(value => value.contains?.(point) === true);
          if (foremost === record) { click = point; break; }
        }
      const rect = app.canvas.getBoundingClientRect();
      return { turn, center, world: { x: subject.x, y: subject.y, z: subject.z }, click,
        constructionViews: Object.fromEntries(["bed", "roof", "shelf", "brew-station"].map(type =>
          [type, art?.buildings?.[type]?.finished?.map(texture => Boolean(texture))])),
        brewAnimationViews: art?.buildings?.["brew-station"]?.profiles?.["ferment-burning"]?.map(frames =>
          frames.length === 8 && frames.every(Boolean)),
        screen: click && { x: click.x * camera.zoom + camera.x + rect.left,
          y: click.y * camera.zoom + camera.y + rect.top },
        records: records.length, unknown: coverage.coverage.filter(value => value.status !== "ready").length,
        demandComplete: coverage.demandComplete };
    });
    if (!sample.click) throw new Error(`Sedge has no visible alpha point in view ${sample.turn}`);
    if (process.env.CAPTURE_ROTATION === "1" && step < 4) {
      const image = await page.evaluate(async () => {
        const app = window.rotationProbe.app;
        app.stop();
        try { return await app.renderer.extract.base64({ target: app.stage }); }
        finally { app.start(); }
      });
      await writeFile(`${output}/view-${sample.turn}.png`, Buffer.from(image.split(",")[1], "base64"));
    }
    await page.mouse.click(sample.screen.x, sample.screen.y);
    sample.selected = await page.evaluate(() => window.rotationProbe.state.selectedIds);
    samples.push(sample);
  }
  const result = { samples, errors };
  await writeFile(`${output}/receipt.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ turns: samples.map(sample => sample.turn),
    selected: samples.map(sample => sample.selected), unknown: samples.map(sample => sample.unknown), errors }));
  const start = samples[0];
  const unchanged = samples.every(sample => ["x", "y", "z"].every(axis => Math.abs(sample.world[axis] - start.world[axis]) < 1e-7)
    && ["x", "z"].every(axis => Math.abs(sample.center[axis] - start.center[axis]) < 1e-6));
  if (errors.length || !unchanged || samples.some(sample => sample.selected[0] !== "party:1.person.1" || sample.unknown !== 0 ||
    Object.values(sample.constructionViews).some(views => views?.length !== 4 || views.some(value => !value)) ||
    sample.brewAnimationViews?.length !== 4 || sample.brewAnimationViews.some(value => !value)))
    throw new Error("rotation interaction proof failed");
} finally {
  await browser.close();
}
