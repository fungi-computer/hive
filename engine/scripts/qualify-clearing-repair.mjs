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
  stockpile: Object.freeze([
    "engine/src/games/colony-stockpile.test.ts",
    "engine/src/games/colony-trees.test.ts",
  ]),
  work: Object.freeze([
    "engine/src/sdk/work-attempt.test.ts",
    "engine/src/games/colony-brewing.test.ts",
    "engine/src/games/colony-dig-command.test.ts",
    "engine/src/games/colony-excavation.test.ts",
    "engine/src/games/colony-mugwort-command.test.ts",
    "engine/src/games/colony-stockpile.test.ts",
    "engine/src/games/colony-trees.test.ts",
    "engine/src/games/colony-work.test.ts",
    "engine/src/runtime/colony-environment-recovery.test.ts",
    "engine/src/runtime/colony-work-contact.test.ts",
    "engine/src/runtime/colony-work-route-recovery.test.ts",
    "engine/src/runtime/physical-contact-query.test.ts",
    "engine/src/runtime/work-activity.test.ts",
  ]),
  process: Object.freeze([
    "engine/src/games/colony-brewing.test.ts",
    "engine/src/games/colony-work.test.ts",
  ]),
  resource: Object.freeze([
    "engine/src/games/colony-mugwort-command.test.ts",
    "engine/src/games/colony-work.test.ts",
  ]),
  construction: Object.freeze([
    "engine/src/runtime/construction-actions.test.ts",
    "engine/src/games/colony-construction.test.ts",
  ]),
  parties: Object.freeze([
    "engine/src/sdk/public.test.ts",
    "engine/src/games/colony-party.test.ts",
    "engine/src/runtime/colony-player-control.test.ts",
    "engine/src/runtime/kernel-records.test.ts",
    "engine/src/runtime/remote-client.test.ts",
    "engine/src/runtime/session.test.ts",
    "engine/src/runtime/session-region-records.test.ts",
    "engine/src/runtime/visual-projection.test.ts",
  ]),
  drawing: Object.freeze([
    "engine/src/client/animation.test.js",
    "engine/src/client/art-placement.test.js",
    "engine/src/client/build-placement-command.test.js",
    "engine/src/client/build-placement.test.js",
    "engine/src/client/construction-visuals.test.js",
    "engine/src/client/edge-gesture.test.js",
    "engine/src/client/edge-wall-presentation.test.js",
    "engine/src/client/geometry.test.js",
    "engine/src/client/isometric-sorter.test.js",
    "engine/src/client/multipart-visual-owner.test.js",
    "engine/src/client/placement-preview.test.js",
    "engine/src/client/visual-resolver.test.js",
  ]),
  performance: Object.freeze([
    "engine/src/client/performance-page.test.js",
    "engine/src/client/whistle-runtime.test.js",
    "engine/src/games/colony-performance.test.ts",
    "engine/src/runtime/whistle.test.ts",
  ]),
  terrain: Object.freeze([
    "engine/src/client/terrain-layer.test.js",
    "engine/src/runtime/terrain-presentation.test.ts",
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
    if (group === "performance") {
      for (const sourceFile of ["engine/src/client/performance-page.js", "engine/src/client/client.js"]) {
        await writeFile(resolve(outputDir, basename(sourceFile)), requireText(resolve(repoRoot, sourceFile)));
      }
    }
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
