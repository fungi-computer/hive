import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5187/";
const output = process.argv[3] || ".botanical/build-hover";
await mkdir(output, { recursive: true });
const result = { url, errors: [] };
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => result.errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") result.errors.push(message.text());
});
const project = (x, z) =>
  page.evaluate(([px, pz]) => window.__GOBLIN.project(px, pz), [x, z]);

try {
  assert.equal((await page.goto(url))?.status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 90_000,
  });
  await page.getByRole("button", { name: /^Build/ }).click();
  await page.locator('[data-build="wall"]').click();
  const first = await project(4, 5);
  result.first = first;
  result.beforeHover = await page.evaluate(() => window.__GOBLIN.selection);
  await page.mouse.move(first.x, first.y);
  result.afterHover = await page.evaluate(() => window.__GOBLIN.selection);
  assert.deepEqual(
    await page.evaluate(() => window.__GOBLIN.selection.hoverCell),
    { x: 4, z: 5, level: 0 },
  );
  await page.screenshot({ path: `${output}/01-hover-buttons-zero.png` });

  const panel = await page.getByRole("region", { name: "Build" }).boundingBox();
  await page.mouse.move(panel.x + 20, panel.y + 20);
  assert.deepEqual(
    await page.evaluate(() => window.__GOBLIN.selection.hoverCell),
    { x: 4, z: 5, level: 0 },
  );
  const returned = await project(5, 5);
  await page.mouse.move(returned.x, returned.y);
  assert.deepEqual(
    await page.evaluate(() => window.__GOBLIN.selection.hoverCell),
    { x: 5, z: 5, level: 0 },
  );

  await page.locator("#rotate").click();
  assert.equal(
    await page.evaluate(() => window.__GOBLIN.selection.direction),
    1,
  );
  assert.deepEqual(
    await page.evaluate(() => window.__GOBLIN.selection.hoverCell),
    { x: 5, z: 5, level: 0 },
  );
  await page.mouse.click(returned.x, returned.y);
  await page.waitForFunction(() => window.__GOBLIN.state.sites.length === 1);
  assert.deepEqual(
    await page.evaluate(() => {
      const { x, z, level, direction } = window.__GOBLIN.state.sites[0];
      return { x, z, level, direction };
    }),
    { x: 5, z: 5, level: 0, direction: 1 },
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const selection = window.__GOBLIN.selection;
      return {
        tool: selection.tool,
        phase: selection.phase,
        direction: selection.direction,
        hoverCell: selection.hoverCell,
      };
    }),
    {
      tool: "wall",
      phase: "ready",
      direction: 1,
      hoverCell: { x: 5, z: 5, level: 0 },
    },
  );

  for (const x of [6, 7, 8]) {
    const next = await project(x, 5);
    await page.mouse.move(next.x, next.y);
    assert.deepEqual(
      await page.evaluate(() => window.__GOBLIN.selection.hoverCell),
      { x, z: 5, level: 0 },
    );
    await page.mouse.click(next.x, next.y);
    await page.waitForFunction(
      (count) => window.__GOBLIN.state.sites.length === count,
      x - 4,
    );
    assert.equal(
      await page.evaluate(() => window.__GOBLIN.selection.tool),
      "wall",
    );
    assert.equal(
      await page.evaluate(() => window.__GOBLIN.selection.direction),
      1,
    );
  }
  await page.waitForFunction(() => window.__GOBLIN.state.sites.length === 4);
  assert.deepEqual(
    await page.evaluate(() =>
      window.__GOBLIN.state.sites.slice(1).map(({ x, z }) => [x, z]),
    ),
    [
      [6, 5],
      [7, 5],
      [8, 5],
    ],
  );

  const duplicate = await project(8, 5);
  await page.mouse.click(duplicate.x, duplicate.y);
  await page.waitForTimeout(250);
  assert.equal((await page.evaluate(() => window.__GOBLIN.state.sites.length)), 4);
  assert.equal(
    await page.evaluate(() => window.__GOBLIN.selection.tool),
    "wall",
  );
  assert.match(await page.locator("#notice").innerText(), /already|occupied/i);

  await page.locator("#task").click();
  assert.equal(
    await page.evaluate(() => window.__GOBLIN.selection.phase),
    "idle",
  );
  assert.equal(await page.evaluate(() => window.__GOBLIN.selection.tool), null);

  await page.locator('[data-build="wall"]').click();
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => window.__GOBLIN.selection.tool), null);

  await page.locator('[data-build="wall"]').click();
  const cancelAt = await project(10, 5);
  await page.mouse.click(cancelAt.x, cancelAt.y, { button: "right" });
  assert.equal(await page.evaluate(() => window.__GOBLIN.selection.tool), null);
  assert.equal(await page.evaluate(() => window.__GOBLIN.state.sites.length), 4);
  assert.deepEqual(result.errors, []);
  result.success = true;
} catch (error) {
  result.success = false;
  result.failure = String(error.stack || error);
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    `${output}/proof.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result));
}
