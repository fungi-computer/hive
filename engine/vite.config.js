import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const engine = dirname(fileURLToPath(import.meta.url));
const repository = resolve(engine, "..");
const artDirectory = "generated-art/goblin-static-art-v1";

// The original checked bank is copied byte-for-byte, never baked at startup.
function originalAssetsAndAuthorSource() {
  return {
    name: "hive-original-assets-and-author-source",
    generateBundle() {
      const manifest = JSON.parse(readFileSync(resolve(repository, "public", artDirectory, "manifest.json"), "utf8"));
      for (const file of ["manifest.json", manifest.ground.file, ...manifest.pages.map(page => page.file)]) {
        this.emitFile({ type: "asset", fileName: `${artDirectory}/${file}`, source: readFileSync(resolve(repository, "public", artDirectory, file)) });
      }
      for (const file of readdirSync(resolve(engine, "src/games"))) {
        if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
        this.emitFile({ type: "asset", fileName: `source/${file}`, source: readFileSync(resolve(engine, "src/games", file)) });
      }
    },
  };
}

export default defineConfig({
  root: engine,
  base: "/engine/",
  publicDir: false,
  plugins: [originalAssetsAndAuthorSource()],
  resolve: {
    alias: {
      "@fungi.computer/stipe/fonts.css": resolve(repository, "tools/asset-mcp/portable-fonts/stipe/fonts.css"),
    },
  },
  server: { host: "127.0.0.1", port: 5197, strictPort: true, fs: { allow: [repository] } },
  build: {
    outDir: resolve(repository, "dist/engine"),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(["index", "colony", "survival", "formations"].map(name => [name, resolve(engine, `${name}.html`)])),
    },
  },
});
