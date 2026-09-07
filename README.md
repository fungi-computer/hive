# Goblin Bed & Breakfast

An original isometric survival experiment in Hive. Rowan begins alone with
Sedge visibly stranded nearby. Recruit her, select either or both people, issue
personal direct or queued work, or drag a shared rectangular Chop designation.
They route, chop, reserve and haul physical wood, construct a shared home, and
use its sheltered bedroll without duplicating material. Bramble offers guidance.

[Stable branch preview](https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev).
The earlier accepted inn at commit `403f886` remains recoverable in Git. This
branch now contains the clearing-to-shelter milestone.

With Node 24.20.0 and dependencies installed (`npm ci`), run:

```sh
npm run dev
```

Open http://127.0.0.1:5187/ . Click Sedge in the clearing and recruit her, then
use the roster or box selection. Click an oak for a personal order, or open
Build and drag the Chop tool across several oaks for shared work. Movement and
hauling are automatic. Pause freezes the world; reset restores the same seed.

`npm test` runs 15 actual-libcolony laws covering scoped two-person assignment,
physical wood conservation, cancellation, direct/queued priority, shared rest,
pause/reset and deterministic replay.
`npm run build` produces `dist/`. With the authorized Cloudflare CLI environment
loaded, `npm run preview -- --name goblin-mvp` uploads that build using native
Wrangler 4.127.1. It does not merge to main or enable a production workers.dev route.

Original Three geometry and poses in `src/art/` are baked by `src/art.js` to fixed
low-resolution textures at startup; Pixi renders them in `src/view.js`. The five
reference images are inspiration only, neither tracked nor shipped.
The typed core in `src/clearing.ts`, `src/orders.ts`, `src/jobs.ts`, and
`src/activity.ts` owns commands, jobs, assignment and physical transfers;
`src/movement.js` retains deterministic navigation. `src/construction.js`
shares placement rules with `src/construction-view.js`. The pinned real
libcolony JS/WASM optimizes the eligible scoped assignment rectangle. Its
license, upstream release and hashes are recorded in
`public/vendor/libcolony/PROVENANCE.md`. Vendor bytes are unmodified.

`src/main.js` collects input and advances the fixed-step ticker, adapted from
retained Hive `14cfa809480dec9b7f4586a9993354925345fa38`. `src/feed.js` emits an
explicitly **simulated** seeded goblin demand. Shiitake's future role is a
storyteller: observe job state/changes through SSE, prompt world events. Events
carry intent; deterministic simulation owns outcomes. SSE delivery timing is
not the simulation clock. No SSE schema, backend, model scheduler or live
platform connection exists in this slice.

To repeat the current browser proof, serve `dist/` with Vite's ordinary static
preview (`npx vite preview --host 127.0.0.1 --port 5188`) and run:

```sh
npm run prove:two-person -- http://127.0.0.1:5188/ .botanical/play-proof
```

The command also accepts the hosted URL. It proves recruitment, either/both
selection, shared rectangular targets, frozen preview, exact applied IDs,
double-commit prevention, cancellation, pause, Caps disabled activation and
narrow layout, with screenshots, JSON and WebM. Evidence stays ignored under
`.botanical/`; `PROTOTYPE.md` owns the full milestone and review gates.

This is a small learning slice, not a combat, needs/death, economy or world-growth
engine. The threatening goblin demand establishes the premise; it does not
simulate a deadline or death. Shelters are built structures; sleeping and
interior use are outside this milestone. Original sprites are baked once at startup, which
takes a few seconds and requires WebGL.
