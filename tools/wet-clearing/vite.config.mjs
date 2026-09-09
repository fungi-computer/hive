import { defineConfig } from 'vite';

// An independently built study joins the frozen playable release. Namespaced
// assets keep every existing game/study bundle byte-for-byte unchanged.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: '.botanical/wet-clearing-output',
    emptyOutDir: true,
    assetsDir: 'wet-assets',
    rollupOptions: { input: { wetClearing: 'wet-clearing.html', study: 'study.html' } },
  },
});
