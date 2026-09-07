# Goblin Bed & Breakfast

An original isometric Hive experiment, set in **The Moss & Ladle**. Select Pip,
give the hearth a preparation task, and watch the innkeeper walk there, stir
mushroom soup, and carry the finished bowl. Guest service is the next checkpoint.
The compact Shiitake label describes a **fake feed**; there are no model calls.

With Node 24.20.0 and dependencies installed (`npm ci`), run:

```sh
npm run dev
```

Open http://127.0.0.1:5187/ . Click Pip (or the portrait), then **Prepare soup**
or the hearth. Pause freezes the task; reset lets you try again. Movement is
automatic. The 480×320 scene is intended to display at 960×640; a desktop browser
with WebGL is required.

`npm test` runs focused gameplay tests against the actual vendored libcolony
WASM. `npm run build` produces the static `dist/` site. `npm run preview -- --name goblin-mvp` uses
Wrangler 4.127.1 to upload that existing build under the stable `goblin-mvp`
preview name; with the previously authorized Cloudflare CLI environment loaded. It does not
merge to main or enable a production workers.dev route.

Art is original Three.js geometry and posed puppets, baked to low-resolution
canvas textures at startup, then displayed by Pixi. `src/art.js` contains all
geometry, materials, poses and camera choices. Reference images are inspiration
only and are neither tracked nor shipped. The pinned third-party assignment
engine and its MIT license are in `public/vendor/libcolony/`; see its provenance
file for upstream release and SHA-256 hashes.

`src/inn.js` owns gameplay state, navigation and preparation; libcolony owns
assignment optimization. `src/main.js` projects state and collects commands.
`src/ticker.js` adapts the fixed-step accumulator from retained Hive commit
`14cfa809480dec9b7f4586a9993354925345fa38`. The retained split between feed,
gameplay truth and visual presentation guides the prototype; calendar,
prosperity and world growth are outside this small room.

Local proof images, recordings and scratch output live in ignored `.botanical/`.
The complete product brief and current authorizations are in `PROTOTYPE.md`.
