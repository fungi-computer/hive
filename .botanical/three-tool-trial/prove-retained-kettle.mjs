import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = "http://127.0.0.1:5193/.botanical/three-tool-trial/retained-kettle.html";
const output = new URL("./output/", import.meta.url);
const failures = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    failures.push(`request: ${request.url()} ${request.failure()?.errorText || "failed"}`),
  );
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const trial = window.__HIVE_THREE_TOOL_TRIAL__;
    return !!trial && trial.renderer.info.render.calls > 0;
  });
  const facts = await page.evaluate(() => {
    const trial = window.__HIVE_THREE_TOOL_TRIAL__;
    let retainedNodes = 0;
    trial.scene.traverse(() => retainedNodes++);
    return {
      three: trial.three,
      originalNodes: trial.originalNodes,
      retainedNodes,
      cameraName: trial.camera.name,
      renderer: {
        calls: trial.renderer.info.render.calls,
        triangles: trial.renderer.info.render.triangles,
        geometries: trial.renderer.info.memory.geometries,
        textures: trial.renderer.info.memory.textures,
        canvas: [trial.renderer.domElement.width, trial.renderer.domElement.height],
      },
      errors: [...trial.errors],
    };
  });
  await page.screenshot({ path: new URL("./output/retained-kettle.png", import.meta.url).pathname });
  const report = { url: base, facts, errors: failures };
  await writeFile(
    new URL("./output/retained-kettle-browser-proof.json", import.meta.url),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (
    facts.three !== "185" ||
    facts.originalNodes !== 42 ||
    facts.retainedNodes !== 43 ||
    facts.renderer.calls < 1 ||
    facts.errors.length ||
    failures.length
  )
    throw new Error(`Retained kettle proof failed: ${JSON.stringify(report)}`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
