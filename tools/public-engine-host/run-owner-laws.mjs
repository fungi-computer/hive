import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const out = await mkdtemp(join(tmpdir(), "hive-host-laws-"));
try {
  await build({ entryPoints: ["tools/public-engine-host/host-owner.test.ts", "tools/public-engine-host/clock.test.ts", "tools/public-engine-host/publication-queue.test.ts", "engine/src/runtime/observation-dependencies.test.ts"],
    outdir: out, outbase: ".", bundle: true, platform: "node", target: "node22", format: "esm", outExtension: { ".js": ".mjs" }, loader: { ".wasm": "binary" },
    plugins: [{ name: "cloudflare-base", setup(build) {
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "base", namespace: "cloudflare" }));
      build.onLoad({ filter: /.*/, namespace: "cloudflare" }, () => ({ contents: "export class DurableObject {}", loader: "js" }));
    } }],
  });
  const child = spawn(process.execPath, ["--test", join(out, "tools/public-engine-host/host-owner.test.mjs"), join(out, "tools/public-engine-host/clock.test.mjs"), join(out, "tools/public-engine-host/publication-queue.test.mjs"), join(out, "engine/src/runtime/observation-dependencies.test.mjs")], { stdio: "inherit" });
  process.exitCode = await new Promise(resolve => child.once("exit", resolve));
} finally { await rm(out, { recursive: true, force: true }); }
