import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const artifacts = resolve(
  process.argv[2] || ".botanical/asset-mcp/stdio-first-20260909",
);
const output = resolve(
  process.argv[3] || ".botanical/asset-mcp/render-first-20260909",
);
const built = process.argv[4] ? resolve(process.argv[4]) : null;
const executablePath = process.env.CHROMIUM_PATH;
assert(executablePath, "CHROMIUM_PATH required");
assert(
  !relative(process.cwd(), artifacts).startsWith(".."),
  "Artifacts must be under the checkout",
);
await mkdir(output, { recursive: true });
const receipt = {
  artifacts,
  scope: "local MCP export rendered through Three ObjectLoader",
  errors: [],
  views: {},
  screenshots: [],
};
let server, browser;
try {
  server = await createServer({
    configFile: false,
    root: built || process.cwd(),
    server: { host: "127.0.0.1", port: 5197, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 1050 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => receipt.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") receipt.errors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    receipt.errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  const url = new URL(
    built
      ? "http://127.0.0.1:5197/viewer.html"
      : "http://127.0.0.1:5197/tools/asset-mcp/viewer.html",
  );
  if (!built)
    url.searchParams.set(
      "artifacts",
      `/${relative(process.cwd(), artifacts)}/`,
    );
  receipt.url = url.href;
  await page.goto(url.href);
  await page.waitForFunction(() => window.__HIVE_ASSET_VIEWER__?.ready, null, {
    timeout: 25000,
  });
  const rendered = await page.evaluate(() =>
    Object.fromEntries(
      [...window.__HIVE_ASSET_VIEWER__.views].map(([name, facts]) => {
        const canvas = facts.renderer.domElement;
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        const context = copy.getContext("2d");
        context.drawImage(canvas, 0, 0);
        const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
        let opaque = 0,
          minX = 256,
          minY = 256,
          maxX = -1,
          maxY = -1;
        for (let y = 0; y < 256; y++)
          for (let x = 0; x < 256; x++)
            if (pixels[(y * 256 + x) * 4 + 3] > 128) {
              opaque++;
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
        return [
          name,
          {
            sha256: facts.sha256,
            render: { ...facts.renderer.info.render },
            alphaBounds: [minX, minY, maxX, maxY],
            opaque,
            dataURL: canvas.toDataURL(),
          },
        ];
      }),
    ),
  );
  for (const name of ["baseline", "variant"]) {
    const expected = JSON.parse(
      await readFile(resolve(artifacts, `${name}.metadata.json`), "utf8"),
    );
    const actual = rendered[name];
    assert.equal(
      actual.sha256,
      expected.sha256,
      "Browser consumed exact MCP export bytes",
    );
    assert(
      actual.render.calls > 0 && actual.render.triangles > 0,
      "Actual Three geometry rendered",
    );
    assert(actual.opaque > 100, "Visible geometry, not an empty canvas");
    assert(
      actual.alphaBounds[0] > 0 &&
        actual.alphaBounds[1] > 0 &&
        actual.alphaBounds[2] < 255 &&
        actual.alphaBounds[3] < 255,
      "Entire exported scene fits canvas",
    );
    const { dataURL, ...facts } = actual;
    receipt.views[name] = facts;
    await writeFile(
      resolve(output, `${name}-native.png`),
      Buffer.from(dataURL.split(",")[1], "base64"),
    );
  }
  assert.notEqual(
    rendered.baseline.dataURL,
    rendered.variant.dataURL,
    "Changed exported geometry/material is visibly different",
  );
  await page.screenshot({
    path: resolve(output, "normal.png"),
    fullPage: true,
  });
  receipt.screenshots.push("normal.png");
  await page.getByRole("button", { name: "Turn after", exact: true }).click();
  await page.waitForFunction(
    () => window.__HIVE_ASSET_VIEWER__.views.get("variant").turn === 1,
  );
  const turned = await page.evaluate(() =>
    window.__HIVE_ASSET_VIEWER__.views
      .get("variant")
      .renderer.domElement.toDataURL(),
  );
  assert.notEqual(
    turned,
    rendered.variant.dataURL,
    "Real control rotates retained exported geometry",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download Three scene", exact: true })
    .nth(1)
    .click();
  const download = await downloadPromise;
  const downloadPath = resolve(output, "downloaded-variant.three.json");
  await download.saveAs(downloadPath);
  assert.equal(
    await readFile(downloadPath, "utf8"),
    await readFile(resolve(artifacts, "variant.three.json"), "utf8"),
  );
  receipt.downloadExact = true;
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Narrow layout contained",
  );
  await page.screenshot({
    path: resolve(output, "narrow-390.png"),
    fullPage: true,
  });
  receipt.screenshots.push("narrow-390.png");
  assert.deepEqual(receipt.errors, []);
} finally {
  await browser?.close();
  await server?.close();
  await writeFile(
    resolve(output, "proof.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}
console.log(
  JSON.stringify({
    output,
    views: receipt.views,
    exactDownload: receipt.downloadExact,
    errors: receipt.errors,
  }),
);
