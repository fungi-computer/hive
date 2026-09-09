import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  publicDir: "examples",
  build: {
    outDir: "../../.botanical/asset-mcp/viewer-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./viewer.html", import.meta.url)),
    },
  },
});
