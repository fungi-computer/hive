import { defineConfig } from "vite";
export default defineConfig({
  server: { host: "127.0.0.1", port: 5187, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        game: "index.html",
        study: "study.html",
        devilStudy: "devil-study.html",
        animalStudy: "animal-study.html",
        fireStudy: "fire-study.html",
        foliageWindStudy: "foliage-wind-study.html",
        brewhouseStudy: "brewhouse-study.html",
        mixedShelfStudy: "mixed-shelf-study.html",
        clearingMinimapStudy: "clearing-minimap-study.html",
        worldLab: "world-lab.html",
        goblinDenStudy: "goblin-den-study.html",
        goblinMessStudy: "goblin-mess-study.html",
      },
    },
  },
});
