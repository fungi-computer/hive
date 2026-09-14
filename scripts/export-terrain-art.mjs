import { createServer } from "vite";
import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const output = resolve(process.argv[2] ?? ".botanical/terrain-art/pack");
let server, browser;
try {
  server = await createServer({
    configFile: false,
    cacheDir: ".botanical/terrain-art/vite-cache",
    optimizeDeps: { entries: ["terrain-art-authoring.html"] },
    server: { host: "127.0.0.1", port: 5187, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.goto("http://127.0.0.1:5187/terrain-art-authoring.html");
  await page.waitForFunction(
    () => typeof window.exportTerrainArt === "function",
  );
  const result = await page.evaluate(() => window.exportTerrainArt());
  await mkdir(output, { recursive: true });
  const hashes = {};
  for (const [name, url] of Object.entries(result.files)) {
    const bytes = Buffer.from(url.split(",")[1], "base64");
    await writeFile(resolve(output, name), bytes);
    hashes[name] = createHash("sha256").update(bytes).digest("hex");
  }
  const sources = {};
  for (const file of [
    "src/art/terrain-patches.js",
    "src/art/terrain-patch-authoring.js",
    "src/art/geometry.js",
    "src/art/bake.js",
    "src/art/prop-camera.js",
    "src/art/static-manifest.js",
    "scripts/export-terrain-art.mjs",
    "terrain-art-authoring.html",
  ])
    sources[file] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  await writeFile(
    resolve(output, "manifest.json"),
    JSON.stringify({ ...result.manifest, hashes, sources }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({ output, entries: result.manifest.entries.length, hashes }),
  );
} finally {
  await browser?.close();
  await server?.close();
  console.log("Owned browser and Vite closed");
}
