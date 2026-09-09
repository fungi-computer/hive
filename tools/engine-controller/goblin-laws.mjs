import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const evidence = resolve(process.argv[2]);
await mkdir(evidence, { recursive: true });
const bundle = new URL(".wrangler/goblin-laws.mjs", import.meta.url).pathname;
const output = await build({
  entryPoints: [new URL("goblin.test.mts", import.meta.url).pathname],
  outfile: bundle, bundle: true, packages: "external", format: "esm",
  platform: "node", target: "es2024", metafile: true,
  tsconfig: new URL("tsconfig.platform.json", import.meta.url).pathname,
});
const sources = {};
for (const path of [...Object.keys(output.metafile.inputs), "src/engine/colony/colony.wasm"])
  sources[path] = createHash("sha256").update(await readFile(path)).digest("hex");
await writeFile(resolve(evidence, "source-hashes.json"), JSON.stringify(sources, null, 2));
await writeFile(resolve(evidence, "metafile.json"), JSON.stringify(output.metafile, null, 2));
const result = spawnSync(process.execPath, ["--test", bundle], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
