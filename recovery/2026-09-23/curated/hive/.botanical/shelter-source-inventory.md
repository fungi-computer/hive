# Clearing-to-shelter candidate

Commit: 6733700a6489930ed12cd70ae36667bf48e654e2
Branch: feat/goblin-bed-and-breakfast-mvp
Accepted inn parent: 403f886c58429fec6711aa5747006a658d72da78
Preview: https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev
Native deployment: ee998344-0bcd-4fbf-a95e-ac06927562c7

Personally authored source:
- src/art/geometry.js: original mesh primitives, lighting, fixed camera and ground projection.
- src/art/clearing.js: original earth/moss clearing, three oaks of one type, notch/stump stages.
- src/art/pawns.js: human Rowan, axe/mallet/walk poses, original goblin watcher.
- src/art/shelter.js: committed timber pile/stakes, framing, finished slatted timber lean-to.
- src/art.js: Three -> fixed 480×320 ground / 96×96 pawn / 160×160 props -> nearest Pixi textures. No reference images enter the pipeline.
- src/clearing.js: authoritative fixed-step gameplay; explicit command eligibility, real libcolony assignment, then wood spend and work outcomes.
- src/construction.js: one shelter's 2×2 footprint, 6-wood cost, blocked-site and approach checks. Preview and command use these same rules.
- src/movement.js: retained deterministic grid search and eight-tick travel per cell.
- src/feed.js: seeded simulated demand and reaction to first completed roof. No SSE/backend/LLM integration.
- src/ticker.js: retained 50ms fixed-step accumulator, with frame clamping. Delivery timing does not own simulation time.
- src/main.js: input/bootstrap; one pending explicit order survives pause, reset clears it.
- src/view.js + src/construction-view.js: state projection, selection, travel, axe chips, work/site progress and footprint preview.
- src/hud.js + index.html + src/style.css: human identity, task/placement instructions, resources and compact exact FAKE SHIITAKE status.
- src/clearing.test.js: five tests using the unmodified shipped WASM; explicit command/one-time yield, pause/reset, cadence replay, resource-funded placement/work, two cycles and grouped command replay.
- scripts/prove.mjs: actual browser inputs, no direct simulation calls/state mutation; two chop/build cycles, insufficient wood, occupied preview, cancel free, order/pause boundary, mid-construction pause and reset. Screenshots, JSON, uncut WebM.

Reused unmodified dependency: public/vendor/libcolony/colony.js and colony.wasm,
v1.0.0. SHA-256 still matches pinned provenance. No optimizer replacement.
No shipped reference pictures or external art assets. No second inn engine.

Verification and limits:
- npm test: 5/5 pass. npm run build: pass, existing Vite bundle-size warning.
- Native Sol final read-only logic/build/proof review: no material defects/readability blockers. Initial pause-loss finding fixed and reproduced through DOM inputs in the permanent browser proof.
- .botanical/shelter-final-fallow.txt: zero dead files/exports; 18 complexity advisories remain, chiefly procedural art, scene setup and input/UI choices. No suppressions or score-driven framework was added. Historical inn-test deletion is expected: the old engine remains in parent Git history; current laws have real WASM/browser proof.
- .botanical/shelter-final-dist-proof/: final local production build proof and intended-scale images; 68.44s uncut WebM page@f647497ca3b872c9f10042bae98a9750.webm.
- .botanical/shelter-hosted-integrity.json: separate hosted/local SHA verification of HTML, CSS, all JS chunks and WASM.
- .botanical/shelter-hosted-proof/: same actual browser proof against the refreshed public URL.

Bounded product: one human, three harvestable oaks of one type, one wood resource,
one 2×2 shelter type. No sleeping/interior use, combat/death/needs engine,
economy, world growth, generalized task/construction framework, live Shiitake,
SSE schema, backend or platform-owner edits. Roof threat/approval is simulated
story intent. No ticking supper/death deadline is claimed.

Run: npm run dev
Authenticated native refresh after build: npm run preview -- --name goblin-mvp
