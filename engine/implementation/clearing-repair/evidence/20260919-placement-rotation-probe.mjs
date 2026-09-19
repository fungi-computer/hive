import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const output = process.argv[2] ?? ".botanical/renderer-implementation-20260919/placement-rotation";
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
      window.placementRotationProbe = { get state(){return state}, get target(){return terrainTarget.getSnapshot()},
        get records(){return orderedSprites}, get turn(){return cameraGeometry.turn}, get coverage(){return terrainLayer.coverage} };
      return {\n    state,`);
    await route.fulfill({ response, body });
  });
  await page.goto("http://127.0.0.1:5187/engine/colony.html?game=colony&runtime=local&diagnostics=draw",
    { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.placementRotationProbe?.coverage.demandComplete, null, { timeout: 120000 });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Build floor", exact: true }).click();
  await page.mouse.move(650, 600);
  await page.waitForFunction(() => window.placementRotationProbe?.records.some(record => record.role === "preview"),
    null, { timeout: 120000 });
  const sample = () => page.evaluate(() => {
    const probe = window.placementRotationProbe;
    return { turn: probe.turn, planeY: probe.target.context.planeY,
      hover: probe.target.context.hover,
      previews: probe.records.filter(record => record.role === "preview").map(record => ({ id: record.id,
        world: record.attachment.feet, inWorld: Boolean(record.display.parent), zIndex: record.display.zIndex })),
      guides: probe.records.filter(record => record.role === "build-guide").length,
      unknown: probe.coverage.coverage.filter(value => value.status !== "ready").length };
  });
  const before = await sample();
  await page.getByRole("button", { name: "Rotate camera right" }).click();
  await page.waitForFunction(() => window.placementRotationProbe?.turn === 1 && window.placementRotationProbe.coverage.demandComplete,
    null, { timeout: 120000 });
  await page.mouse.move(680, 590);
  await page.waitForFunction(() => window.placementRotationProbe?.records.some(record => record.role === "preview"),
    null, { timeout: 120000 });
  const after = await sample();
  await page.getByRole("button", { name: "Reset world", exact: true }).click();
  await page.waitForFunction(() => window.placementRotationProbe?.coverage.demandComplete &&
    window.placementRotationProbe.records.length > 100 && window.placementRotationProbe.target.value !== "armed",
    null, { timeout: 120000 });
  const reset = await sample();
  const result = { before, after, reset, errors };
  await writeFile(`${output}/receipt.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ before: { turn: before.turn, planeY: before.planeY, ghosts: before.previews.length },
    after: { turn: after.turn, planeY: after.planeY, ghosts: after.previews.length },
    reset: { turn: reset.turn, ghosts: reset.previews.length }, errors }));
  if (errors.length || before.turn !== 0 || after.turn !== 1 || before.planeY !== after.planeY ||
    !before.previews.length || !after.previews.length || !before.previews.every(value => value.inWorld) ||
    !after.previews.every(value => value.inWorld) || before.unknown || after.unknown || reset.previews.length || reset.unknown)
    throw new Error("placement rotation proof failed");
} finally { await browser.close(); }
