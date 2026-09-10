import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir(".botanical/fresh-game-laws", { recursive: true });
await build({
  entryPoints: [
    "engine/src/runtime/session.test.ts",
    "engine/src/runtime/games.test.ts",
    "engine/src/presentation.test.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: ".botanical/fresh-game-laws",
  outExtension: { ".js": ".mjs" },
});
const result = spawnSync(
  process.execPath,
  [
    "--test",
    ...process.argv.slice(2),
    ".botanical/fresh-game-laws/session.test.mjs",
    ".botanical/fresh-game-laws/games.test.mjs",
    ".botanical/fresh-game-laws/presentation.test.mjs",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
