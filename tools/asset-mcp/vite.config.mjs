import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@fungi.computer/stipe/fonts.css": fileURLToPath(
        new URL("./portable-fonts/stipe/fonts.css", import.meta.url),
      ),
    },
  },
  plugins: [
    {
      name: "portable-font-licenses",
      generateBundle() {
        for (const name of ["Nunito-OFL.txt", "MapleMono-OFL.txt", "README.md"])
          this.emitFile({
            type: "asset",
            fileName: `font-licenses/${name}`,
            source: readFileSync(
              new URL(`./portable-fonts/stipe/fonts/${name}`, import.meta.url),
            ),
          });
      },
    },
  ],
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  publicDir: "examples",
  build: {
    outDir: "../../.botanical/asset-mcp/viewer-portable-20260909",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./viewer.html", import.meta.url)),
    },
  },
});
