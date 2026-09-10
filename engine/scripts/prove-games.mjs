import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir(".botanical/fresh-game-laws", { recursive: true });
await build({
  entryPoints: {
    "pirates.test": "engine/src/games/pirates.test.ts",
    "session.test": "engine/src/runtime/session.test.ts",
    "games.test": "engine/src/runtime/games.test.ts",
    "presentation.test": "engine/src/presentation.test.ts",
    "assignment.test": "engine/src/sdk/assignment.test.ts",
    "colony-orders.test": "engine/src/runtime/colony-orders.test.ts",
  },
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
    ".botanical/fresh-game-laws/pirates.test.mjs",
    ".botanical/fresh-game-laws/session.test.mjs",
    ".botanical/fresh-game-laws/games.test.mjs",
    ".botanical/fresh-game-laws/presentation.test.mjs",
    ".botanical/fresh-game-laws/assignment.test.mjs",
    ".botanical/fresh-game-laws/colony-orders.test.mjs",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
