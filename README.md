# Goblin Bed & Breakfast

An original isometric survival experiment in Hive. Rowan is a human outsider
stranded in goblin country. Select Rowan, select an oak tree, and give the chop
order. Rowan finds a route and works automatically; the tree becomes a stump
and earns six wood. Choose **Build shelter**, position its two-by-two footprint
on clear ground, then click to spend that wood. Rowan walks over and builds a
timber lean-to through visible framing and roofing work. The locals would like
a roof before supper. Stay useful.

[Stable branch preview](https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev).
The earlier accepted inn at commit `403f886` remains recoverable in Git. This
branch now contains the clearing-to-shelter milestone.

With Node 24.20.0 and dependencies installed (`npm ci`), run:

```sh
npm run dev
```

Open http://127.0.0.1:5187/ . Click Rowan (or the portrait), click an oak, then
**Chop tree**. Movement is automatic. Pause freezes work, travel and events;
reset restarts the same seed with zero wood, standing trees and no shelters.
Placement previews cost nothing; Escape or **Cancel placement** keeps your wood.
Occupied ground, insufficient wood and unreachable sites cannot begin a build.
After the first shelter, chop another oak and repeat.
The 480×320 scene is intended to display at 960×640 in a desktop WebGL browser.

`npm test` exercises explicit commands, actual libcolony assignments, one-time
wood credit, occupied placement, resource spending, two construction cycles,
pause/reset and deterministic command replay.
`npm run build` produces `dist/`. With the authorized Cloudflare CLI environment
loaded, `npm run preview -- --name goblin-mvp` uploads that build using native
Wrangler 4.127.1. It does not merge to main or enable a production workers.dev route.

Original Three geometry and poses in `src/art/` are baked by `src/art.js` to fixed
low-resolution textures at startup; Pixi renders them in `src/view.js`. The five
reference images are inspiration only, neither tracked nor shipped.
`src/clearing.js` owns gameplay state, work and resources; `src/movement.js`
retains the inn's deterministic grid navigation and travel. `src/construction.js`
owns the one shelter's footprint, cost and placement rules, shared with the
preview in `src/construction-view.js`. The pinned real
libcolony JS/WASM owns task assignment, constrained to the explicitly commanded
pawn/task pair. Its license, upstream release and hashes are recorded in
`public/vendor/libcolony/PROVENANCE.md`. Vendor bytes are unmodified.

`src/main.js` collects input and advances the fixed-step ticker, adapted from
retained Hive `14cfa809480dec9b7f4586a9993354925345fa38`. `src/feed.js` emits an
explicitly **simulated** seeded goblin demand. Shiitake's future role is a
storyteller: observe job state/changes through SSE, prompt world events. Events
carry intent; deterministic simulation owns outcomes. SSE delivery timing is
not the simulation clock. No SSE schema, backend, model scheduler or live
platform connection exists in this slice.

To repeat browser proof, serve `dist/` with Vite's ordinary static preview
(`npx vite preview --host 127.0.0.1 --port 5188`) and run:

```sh
node scripts/prove.mjs http://127.0.0.1:5188/ .botanical/play-proof
```

The command also accepts the hosted URL. It uses actual scene/button clicks and
records two chop/build cycles, invalid/free placement previews, an order paused
before its first simulation step, construction pause and reset, with screenshots,
JSON state evidence and uncut WebM. Playwright Chromium is
required; `CHROMIUM_PATH` and `LD_LIBRARY_PATH` can select existing host tooling.
Evidence stays in ignored `.botanical/`. The authoritative current milestone and
review gates are in `PROTOTYPE.md`.

This is a small learning slice, not a combat, needs/death, economy or world-growth
engine. The threatening goblin demand establishes the premise; it does not
simulate a deadline or death. Shelters are built structures; sleeping and
interior use are outside this milestone. Original sprites are baked once at startup, which
takes a few seconds and requires WebGL.
