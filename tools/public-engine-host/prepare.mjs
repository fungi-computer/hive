import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [outputArgument, originArgument] = process.argv.slice(2);
if (!outputArgument || !originArgument || process.argv.length !== 4)
  throw new Error("Usage: node prepare.mjs <output-directory> <public-origin>");
const origin = new URL(originArgument);
if (origin.protocol !== "https:" || origin.origin !== originArgument)
  throw new Error("Supply the exact HTTPS frontend origin without a trailing slash");
const output = resolve(outputArgument);
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) files.push(relative(root, path));
  }
}
await collect(resolve(root, "engine/src"));
await collect(resolve(root, "src/engine"));
files.push("tools/public-engine-host/worker.ts", "tools/public-engine-host/protocol.ts",
  "engine/generated/hive_kernel.js", "engine/generated/hive_kernel.d.ts",
  "engine/generated/hive_kernel_bg.wasm");
const digest = createHash("sha256");
const inventory = [];
for (const path of files.sort()) {
  const bytes = await readFile(resolve(root, path));
  digest.update(path); digest.update("\0"); digest.update(bytes); digest.update("\0");
  inventory.push({ path, sha256: createHash("sha256").update(bytes).digest("hex") });
}
const config = JSON.parse(await readFile(resolve(root, "tools/public-engine-host/wrangler.json"), "utf8"));
config.main = resolve(root, "tools/public-engine-host/worker.ts");
config.vars = { IMPLEMENTATION_HASH: digest.digest("hex"), PUBLIC_ORIGIN: origin.origin };
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
await writeFile(resolve(output, "wrangler.json"), JSON.stringify(config, null, 2) + "\n");
console.log(JSON.stringify({ name: config.name, implementationHash: config.vars.IMPLEMENTATION_HASH,
  origin: origin.origin, files: inventory.length, config: resolve(output, "wrangler.json") }));
