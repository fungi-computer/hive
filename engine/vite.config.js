import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { STATIC_ART_BASE } from "../src/art/static-manifest.js";

const engine = dirname(fileURLToPath(import.meta.url));
const repository = resolve(engine, "..");
const artDirectory = STATIC_ART_BASE.replace(/^\.\//, "").replace(/\/$/, "");

// The original checked bank is copied byte-for-byte, never baked at startup.
function originalAssetsAndAuthorSource() {
  return {
    name: "hive-original-assets-and-author-source",
    configureServer(server) {
      const manifest = JSON.parse(readFileSync(resolve(repository, "public", artDirectory, "manifest.json"), "utf8"));
      const files = new Set(["manifest.json", manifest.ground.file, ...manifest.pages.map((page) => page.file)]);
      const base = server.config.base.endsWith("/") ? server.config.base : `${server.config.base}/`;
      const prefix = `${base}${artDirectory}/`;
      server.middlewares.use((request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") return next();
        let pathname;
        try { pathname = decodeURIComponent(new URL(request.url ?? "/", "http://hive.local").pathname); }
        catch { return next(); }
        if (!pathname.startsWith(prefix)) return next();
        const file = pathname.slice(prefix.length);
        if (!files.has(file)) return next();
        const source = readFileSync(resolve(repository, "public", artDirectory, file));
        response.statusCode = 200;
        response.setHeader("Content-Type", file === "manifest.json" ? "application/json; charset=utf-8" : "image/png");
        response.setHeader("Content-Length", source.byteLength);
        response.setHeader("Cache-Control", "no-store");
        response.end(request.method === "HEAD" ? undefined : source);
      });
    },
    generateBundle() {
      const manifest = JSON.parse(readFileSync(resolve(repository, "public", artDirectory, "manifest.json"), "utf8"));
      for (const file of ["manifest.json", manifest.ground.file, ...manifest.pages.map(page => page.file)]) {
        this.emitFile({ type: "asset", fileName: `${artDirectory}/${file}`, source: readFileSync(resolve(repository, "public", artDirectory, file)) });
      }
      for (const file of ["MapleMono-OFL.txt", "Nunito-OFL.txt", "README.md"]) {
        this.emitFile({ type: "asset", fileName: `licenses/fonts/${file}`, source: readFileSync(resolve(repository, "tools/asset-mcp/portable-fonts/stipe/fonts", file)) });
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
      input: Object.fromEntries(["index", "colony", "colony-performance", "survival", "formations", "pirates"].map(name => [name, resolve(engine, `${name}.html`)])),
    },
  },
});
