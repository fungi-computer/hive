# Goblin Bed & Breakfast

An original isometric Hive experiment, set in **The Moss & Ladle**. Select Pip,
give the hearth a preparation task, and watch the innkeeper walk there and stir
mushroom soup. Give a delivery task to a waiting guest; they receive the bowl,
eat, celebrate and leave satisfied.
The compact Shiitake label describes a **fake feed**; there are no model calls.

[Play the branch preview](https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev).

With Node 24.20.0 and dependencies installed (`npm ci`), run:

```sh
npm run dev
```

Open http://127.0.0.1:5187/ . Click Pip (or the portrait), then **Prepare soup**
or the hearth. When the bowl is ready, click the waiting guest or **Deliver**.
Pip moves automatically. Travelers yield in the narrow corridor; wait for an
arriving or departing guest to pass before starting another preparation.
Pause freezes the entire inn, including arrivals; reset restarts the same seed.
The 480×320 scene is intended to display at 960×640; a desktop browser
with WebGL is required.

`npm test` runs focused gameplay tests against the actual vendored libcolony
WASM: explicit orders, complete services, no duplicate credit, furniture and
shared-corridor navigation, pause/reset and command replay.

`npm run build` produces the static `dist/` site. `npm run preview -- --name goblin-mvp` uses
Wrangler 4.127.1 to upload that existing build under the stable `goblin-mvp`
preview name, with the authorized Cloudflare CLI environment loaded. It does not
merge to main or enable a production workers.dev route.

Art is original Three.js geometry and posed puppets, baked to low-resolution
canvas textures at startup, then displayed by Pixi. `src/art.js` contains all
geometry, materials, poses and camera choices. Reference images are inspiration
only and are neither tracked nor shipped. The pinned third-party assignment
engine and its MIT license are in `public/vendor/libcolony/`; see its provenance
file for upstream release and SHA-256 hashes.

`src/feed.js` retains Hive’s seeded random generator for fake arrivals.
`src/inn.js` owns gameplay state, navigation and service; libcolony owns
assignment optimization. `src/main.js` projects state and collects commands.
`src/ticker.js` adapts the fixed-step accumulator from retained Hive commit
`14cfa809480dec9b7f4586a9993354925345fa38`. The retained split between feed,
gameplay truth and visual presentation guides the prototype; calendar,
prosperity and world growth are outside this small room.

Local proof images, recordings and scratch output live in ignored `.botanical/`.
The complete product brief and current authorizations are in `PROTOTYPE.md`.

To repeat browser proof, serve `dist/` with Vite’s ordinary static preview
(`npx vite preview --host 127.0.0.1 --port 5188`) and run:

```sh
node scripts/prove.mjs http://127.0.0.1:5188/ .botanical/play-proof
```

The same command accepts the hosted URL. It records two complete services with
real scene/button clicks, pause, reset, screenshots and an uncut WebM. It requires
Playwright Chromium; `CHROMIUM_PATH` and `LD_LIBRARY_PATH` may select an existing
host browser and its libraries. No global browser/host install is needed on the
current development machine.

Current scope: one innkeeper, one admitted guest at a time, one soup, a decorative
bed and an explicitly simulated feed. No sleeping, economy, world growth or real
Shiitake integration. Original sprites are baked once at startup; this takes a
few seconds and needs WebGL.
