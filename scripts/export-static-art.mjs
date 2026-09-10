import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import {
  STATIC_ART_BASE,
  STATIC_ART_LIMITS,
  completeStaticArtManifest,
} from "../src/art/static-manifest.js";

const run = promisify(execFile);
const url = process.argv[2] || "http://127.0.0.1:5187/static-art-export.html";
const artDirectory = STATIC_ART_BASE.replace(/^\.\//, "").replace(/\/$/, "");
const output = path.resolve("public", artDirectory);
const parent = path.dirname(output);
const bankName = path.basename(output);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function pngBytes(value, name) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  assert(match, `Exporter did not return PNG bytes for ${name}`);
  return Buffer.from(match[1], "base64");
}

async function sourceInventory() {
  const { stdout } = await run("git", [
    "ls-files",
    "src/art.js",
    "src/art",
    "src/brew-station-profiles.js",
    "src/construction.js",
    "src/terrain-surface-geometry.js",
    "src/terrain.ts",
    "src/world.js",
    "src/visual-hit-geometry.js",
    "package-lock.json",
  ]);
  const files = stdout.trim().split("\n").filter(Boolean).sort();
  assert(files.length, "Static art source inventory is empty");
  return Promise.all(
    files.map(async (source) => ({
      path: source,
      sha256: sha256(await readFile(source)),
    })),
  );
}

await mkdir(parent, { recursive: true });
const staging = await mkdtemp(path.join(parent, `.${bankName}-`));
const backup = `${output}.previous-${process.pid}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  const response = await page.goto(url);
  assert.equal(
    response?.status(),
    200,
    "Static art authoring entry did not load",
  );
  await page.waitForFunction(() => window.__HIVE_STATIC_ART_EXPORT__?.encode);
  const generated = await page.evaluate(() =>
    window.__HIVE_STATIC_ART_EXPORT__.encode(),
  );
  const names = Object.keys(generated.files).sort();
  assert.deepEqual(
    names,
    [
      generated.draft.ground.file,
      ...generated.draft.pages.map((page) => page.file),
    ].sort(),
    "Static art file inventory differs from its draft",
  );
  const hashes = {};
  for (const name of names) {
    const bytes = pngBytes(generated.files[name], name);
    assert(
      bytes.length <= STATIC_ART_LIMITS.pngBytes,
      `Static art ${name} exceeds its runtime byte limit`,
    );
    hashes[name] = sha256(bytes);
    await writeFile(path.join(staging, name), bytes, { flag: "wx" });
  }
  const sources = await sourceInventory();
  const manifest = completeStaticArtManifest(generated.draft, hashes, sources);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  assert(
    manifestBytes.length <= STATIC_ART_LIMITS.manifestBytes,
    "Static art manifest exceeds its runtime byte limit",
  );
  await writeFile(path.join(staging, "manifest.json"), manifestBytes, {
    flag: "wx",
  });

  let retainedPrior = false;
  try {
    await rename(output, backup);
    retainedPrior = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await rename(staging, output);
  } catch (error) {
    if (retainedPrior) await rename(backup, output);
    throw error;
  }
  if (retainedPrior) await rm(backup, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      output,
      textureCount: manifest.textureCount,
      files: { ...hashes, "manifest.json": sha256(manifestBytes) },
      sources,
    }),
  );
} finally {
  await browser?.close();
  await rm(staging, { recursive: true, force: true });
}
