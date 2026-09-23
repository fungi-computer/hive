import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = process.argv[2] || ".botanical/station-profile-pixi-diagnostic";
const port = 5191;
mkdirSync(output, { recursive: true });

const server = await createServer({
  logLevel: "error",
  server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 520, height: 330 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));

try {
  await page.route("**/station-profile-probe.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><style>body{margin:0;background:repeating-conic-gradient(#7a7a7a 0 25%,#bdbdbd 0 50%) 0/16px 16px}</style>`,
    }),
  );
  await page.goto(`http://127.0.0.1:${port}/station-profile-probe.html`);
  const profiles = await page.evaluate(async () => {
    const { renderStationProfiles } =
      await import("/src/station-profile-pixi.test-entry.js");
    return renderStationProfiles();
  });
  await page.screenshot({ path: `${output}/profiles.png` });
  for (const [profile, fact] of Object.entries(profiles)) {
    assert.deepEqual(fact.source.corner, [0, 0, 0, 0], `${profile} source`);
    assert.deepEqual(fact.pixi.corner, [0, 0, 0, 0], `${profile} Pixi`);
    assert.ok(fact.pixi.opaque > 0, `${profile} has a visible silhouette`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${output}/proof.json`,
    JSON.stringify({ profiles, errors, passed: true }, null, 2),
  );
} catch (error) {
  writeFileSync(
    `${output}/proof.json`,
    JSON.stringify({ errors, failure: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
