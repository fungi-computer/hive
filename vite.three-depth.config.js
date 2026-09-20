import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/",
  publicDir: false,
  build: { outDir: "dist-three-depth", emptyOutDir: true, rollupOptions: { input: resolve(process.cwd(), "three-depth-study.html") } },
});
