#!/usr/bin/env node

/**
 * Focused qualification for the September 14 Clearing repair.
 *
 * The lists below are deliberately explicit.  Adding a test to the repository
 * does not implicitly add it to this proof, and an absent source or generated
 * input is an error rather than a reason to broaden the run.
 */
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputRoot = resolve(repoRoot, ".botanical/clearing-repair-qualification");

const groups = Object.freeze({
  work: Object.freeze([
    "engine/src/sdk/work-system.test.ts",
    "engine/src/sdk/work-attempt.test.ts",
    "engine/src/sdk/work-allocation.test.ts",
    "engine/src/sdk/delivery.test.ts",
  ]),
  construction: Object.freeze([
    "engine/src/sdk/construction-work.test.ts",
    "engine/src/sdk/deconstruction-work.test.ts",
    "engine/src/runtime/construction-actions.test.ts",
    "engine/src/games/colony-construction.test.ts",
  ]),
  parties: Object.freeze([
    "engine/src/sdk/public.test.ts",
    "engine/src/games/colony-party.test.ts",
    "engine/src/runtime/colony-player-control.test.ts",
    "engine/src/runtime/session-region-records.test.ts",
  ]),
  drawing: Object.freeze([
    "engine/src/client/construction-visuals.test.js",
    "engine/src/client/world-depth.test.js",
  ]),
});

const joined = [...new Set(Object.values(groups).flat())];
const allGroups = Object.freeze({ ...groups, joined: Object.freeze(joined) });

function usage() {
  console.error(`usage: node engine/scripts/qualify-clearing-repair.mjs <${Object.keys(allGroups).join("|")}>`);
}

function artifactPaths(files) {
  const artifacts = new Set();
  for (const file of files) {
    const source = resolve(repoRoot, file);
    const text = requireText(source);
    if (text.includes("generated/hive_kernel")) {
      artifacts.add("engine/generated/hive_kernel.js");
      artifacts.add("engine/generated/hive_kernel_bg.wasm");
    }
  }
  return [...artifacts];
}

function requireText(path) {
  if (!existsSync(path)) throw new Error(`missing source: ${path}`);
  return readFileSync(path, "utf8");
}

const selected = process.argv.slice(2);
if (selected.length !== 1 || selected[0] === "--help" || selected[0] === "-h") {
  usage();
  process.exitCode = selected[0]?.startsWith("-") ? 0 : 2;
} else if (!(selected[0] in allGroups)) {
  console.error(`unknown qualification group: ${selected[0]}`);
  usage();
  process.exitCode = 2;
} else {
  const group = selected[0];
  const files = allGroups[group];
  const missing = [];
  for (const file of files) if (!existsSync(resolve(repoRoot, file))) missing.push(`source: ${file}`);
  if (!missing.length) {
    for (const file of artifactPaths(files)) if (!existsSync(resolve(repoRoot, file))) missing.push(`artifact: ${file}`);
  }
  if (missing.length) {
    console.error(`qualification preflight failed for ${group}:`);
    for (const item of missing) console.error(`- missing ${item}`);
    process.exitCode = 1;
  } else {
    const outputDir = resolve(outputRoot, group);
    await mkdir(outputDir, { recursive: true });
    const entryPoints = Object.fromEntries(
      files.map((file) => {
        const stem = basename(file, extname(file));
        return [stem, resolve(repoRoot, file)];
      }),
    );
    await build({
      entryPoints,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      outdir: outputDir,
      outExtension: { ".js": ".mjs" },
      logLevel: "info",
    });
    const bundlePaths = files.map((file) => resolve(outputDir, `${basename(file, extname(file))}.mjs`));
    const missingBundles = bundlePaths.filter((file) => !existsSync(file));
    if (missingBundles.length) {
      throw new Error(`esbuild did not emit expected bundle(s): ${missingBundles.join(", ")}`);
    }
    const result = spawnSync(process.execPath, ["--test", ...bundlePaths], { stdio: "inherit" });
    const receipt = {
      group,
      files,
      artifacts: artifactPaths(files),
      bundles: bundlePaths,
      exit: result.status ?? 1,
    };
    await writeFile(resolve(outputDir, "result.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    process.exitCode = receipt.exit;
  }
}
