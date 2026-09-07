// Real browser proof against a built or hosted site. All player actions use input.
// Supply CHROMIUM_PATH / LD_LIBRARY_PATH when reusing a host browser installation.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/play-proof";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1120, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1120, height: 900 } },
});
const page = await context.newPage(),
  errors = [],
  failed = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) =>
  failed.push({ url: r.url(), error: r.failure()?.errorText }),
);
const state = () => page.evaluate(() => window.__GOBLIN.state);
const wait = (fn) => page.waitForFunction(fn, undefined, { timeout: 30000 });
async function clickWorld(x, z, y = 0, up = 20) {
  const point = await page.evaluate(
    ({ x, z, y }) => window.__GOBLIN.project(x, z, y),
    { x, z, y },
  );
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.click(
    box.x + (point.x * box.width) / 480,
    box.y + ((point.y - up) * box.height) / 320,
  );
}
const served = [];
try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, undefined, {
    timeout: 60000,
  });
  await page.screenshot({ path: `${output}/01-inn.png` });
  assert.equal(await page.locator("#task").isEnabled(), false);
  await clickWorld(3, 4);
  for (let order = 1; order <= 2; order++) {
    await wait(() => window.__GOBLIN.state.guest?.mode === "waiting");
    const guest = (await state()).guest;
    await page.screenshot({ path: `${output}/order-${order}-request.png` });
    assert.equal((await state()).served, order - 1);
    if (order === 1) await clickWorld(1, 0.65, 1.45, 0);
    else await page.getByRole("button", { name: "Prepare soup" }).click();
    await wait(() => window.__GOBLIN.state.keeper.mode === "work");
    if (order === 1) {
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      const paused = await state();
      await page.waitForTimeout(800);
      assert.deepEqual(
        await state(),
        paused,
        "pause must freeze feed, walking and work",
      );
      await page.screenshot({ path: `${output}/02-paused.png` });
      await page.getByRole("button", { name: "Resume", exact: true }).click();
    }
    await wait(() => window.__GOBLIN.state.keeper.carrying);
    await page.screenshot({ path: `${output}/order-${order}-prepared.png` });
    assert.equal((await state()).guest.mode, "waiting");
    if (order === 1) await clickWorld(guest.x, guest.z);
    else
      await page
        .getByRole("button", { name: `Deliver to ${guest.name}` })
        .click();
    await wait(() => window.__GOBLIN.state.guest?.mode === "eating");
    await page.screenshot({ path: `${output}/order-${order}-delivered.png` });
    await wait(() => window.__GOBLIN.state.guest?.mode === "happy");
    assert.equal((await state()).satisfied, order);
    await page.screenshot({ path: `${output}/order-${order}-happy.png` });
    served.push({ id: guest.id, name: guest.name, order });
    await page.waitForFunction(
      (n) => window.__GOBLIN.state.departed === n,
      order,
      { timeout: 30000 },
    );
  }
  const completed = await state();
  assert.equal(completed.prepared, 2);
  assert.equal(completed.served, 2);
  assert.equal(completed.satisfied, 2);
  assert.deepEqual(
    completed.commands.map((c) => c.kind),
    ["prepare", "deliver", "prepare", "deliver"],
  );
  await page.getByRole("button", { name: "Reset inn" }).click();
  const reset = await state();
  assert.equal(reset.satisfied, 0);
  assert.equal(reset.prepared, 0);
  assert.equal(reset.feed.sequence, 0);
  assert.equal(reset.guest, null);
  assert.equal(await page.locator("#task").isEnabled(), false);
  await page.screenshot({ path: `${output}/03-reset.png` });
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  await writeFile(
    `${output}/proof.json`,
    JSON.stringify({ url, served, completed, reset, errors, failed }, null, 2),
  );
  console.log(
    JSON.stringify({
      url,
      served,
      completed: {
        prepared: completed.prepared,
        served: completed.served,
        satisfied: completed.satisfied,
        departed: completed.departed,
      },
      errors,
      failed,
    }),
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  console.error(
    JSON.stringify({
      errors,
      failed,
      state: await page.evaluate(() => window.__GOBLIN?.state),
    }),
  );
  throw error;
} finally {
  const video = await page.video().path();
  await context.close();
  await browser.close();
  console.log(`Recording: ${video}`);
}
