import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const out = ".botanical/renderer-audit-20260919";
await mkdir(out, { recursive: true });
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
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/engine/src/client/mixed-render-*.js*", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("mixed-render-fixture.js"))
      body = body.replace(
        'actorRecord("fixture:goblin", { x: 1, y: VERTICAL_METRES / 2, z: -1 }',
        'actorRecord("fixture:goblin", { x: .6, y: VERTICAL_METRES / 2, z: .6 }',
      );
    if (path.endsWith("mixed-render-review-owner.js"))
      body = body.replace(
        "fixture.input.map(record =>",
        'fixture.input.filter(record=>record.id==="fixture:goblin" || record.id==="terrain:1,0,1:top").map(record =>',
      );
    if (path.endsWith("mixed-render-review-page.js"))
      body += "\nwindow.fixtureAudit={app,owner};app.stop();\n";
    await route.fulfill({ response, body });
  });
  await page.goto("http://127.0.0.1:5187/engine/mixed-render-review.html", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.fixtureAudit);
  const result = await page.evaluate(async () => {
    const { app, owner } = fixtureAudit;
    const actual = await app.renderer.extract.base64({
      target: owner.container,
    });
    const a = app.renderer.extract.pixels({ target: owner.container });
    const order = owner.compiled.records.map((r) => ({
      id: r.id,
      attachment: r.attachment,
    }));
    const actor = owner.compiled.records.find(
      (r) => r.id === "fixture:goblin",
    ).display;
    // Independent expected relation: a standing actor is in front of its own supporting top.
    actor.zIndex = 1000;
    owner.container.sortChildren();
    const expected = await app.renderer.extract.base64({
      target: owner.container,
    });
    const b = app.renderer.extract.pixels({ target: owner.container });
    let differentPixels = 0;
    for (let i = 0; i < a.pixels.length; i += 4)
      if (a.pixels.slice(i, i + 4).some((v, k) => v !== b.pixels[i + k]))
        differentPixels++;
    return {
      order,
      actual,
      expected,
      differentPixels,
      width: a.width,
      height: a.height,
    };
  });
  for (const name of ["actual", "expected"]) {
    await writeFile(
      `${out}/own-top-${name}.png`,
      Buffer.from(result[name].split(",")[1], "base64"),
    );
    delete result[name];
  }
  await writeFile(
    `${out}/own-top.json`,
    JSON.stringify({ ...result, errors }, null, 2),
  );
  console.log(JSON.stringify({ ...result, errors }));
} finally {
  await browser.close();
}
