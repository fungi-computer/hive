import { defineConfig } from "vite";
import { cp, readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./editor/", import.meta.url));
const fonts = fileURLToPath(new URL("./portable-fonts/", import.meta.url));
const rawFiles = new Set([
  "frame.html",
  "frame.js",
  "session.js",
  "history-admission.js",
  "protocol.js",
  "inner.css",
]);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};
export default defineConfig({
  root,
  base: "./",
  publicDir: false,
  resolve: {
    alias: {
      "@fungi.computer/stipe/fonts.css": resolve(fonts, "stipe/fonts.css"),
    },
  },
  plugins: [
    {
      name: "pinned-editor-runtime",
      // Raw native modules keep the iframe's import map. Vite must not rewrite
      // their `three` imports to the parent's installed r185 module graph.
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          let path;
          try {
            path = decodeURIComponent(
              new URL(req.url, "http://localhost").pathname,
            ).slice(1);
          } catch {
            return next();
          }
          if (!(
            rawFiles.has(path) ||
            path.startsWith("vendor/") ||
            path.startsWith("portable-fonts/")
          ))
            return next();
          const base = path.startsWith("portable-fonts/") ? fonts : root;
          const name = path.startsWith("portable-fonts/")
            ? path.slice("portable-fonts/".length)
            : path;
          const target = resolve(base, name);
          if (!target.startsWith(`${base.replace(/\/$/, "")}/`)) {
            res.statusCode = 400;
            res.end();
            return;
          }
          try {
            const bytes = await readFile(target);
            res.setHeader(
              "Content-Type",
              mime[extname(target)] || "application/octet-stream",
            );
            res.end(bytes);
          } catch {
            res.statusCode = 404;
            res.end("Missing pinned editor resource");
          }
        });
      },
      async closeBundle() {
        const output = resolve(
          root,
          "../../../.botanical/asset-mcp/editor-compact-shell-checkpoint-20260909",
        );
        await mkdir(output, { recursive: true });
        for (const file of rawFiles)
          await cp(resolve(root, file), resolve(output, file));
        await cp(resolve(root, "vendor"), resolve(output, "vendor"), {
          recursive: true,
          filter: (source) =>
            !["index.html", "sw.js"].includes(source.split("/").at(-1)),
        });
        await cp(fonts, resolve(output, "portable-fonts"), { recursive: true });
        await cp(
          resolve(root, "resource-manifest.json"),
          resolve(output, "resource-manifest.json"),
        );
      },
    },
  ],
  build: {
    outDir: "../../../.botanical/asset-mcp/editor-compact-shell-checkpoint-20260909",
    emptyOutDir: true,
    rollupOptions: { input: resolve(root, "index.html") },
  },
});
