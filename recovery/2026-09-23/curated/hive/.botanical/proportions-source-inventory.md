# Original proportions study

Commit: 755f873cdc7ad499716a54212952c8253f6b566a
Branch: feat/goblin-bed-and-breakfast-mvp
Preview: https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/study
Deployment: 71195b3d-6447-4ce1-96b4-25bd7de624be

## Ownership

- src/art/figures.js: personally authored Three geometry/poses for Rowan, knight armor, Fen wizard, wiry goblin and Bramble cat. No source/image geometry was copied from Pilgrimage or the supplied references.
- src/art.js: exposes the existing bake and ground-anchor helpers; existing game artwork and bake behavior are retained.
- src/study.js: 32x16 proposed ground projection, original plinth and doorway, 48x64 padded bakes, Pixi display, cached detail images, four facings, standing/walking and pause. Metrics read actual generated alpha bounds.
- study.html / src/study.css: a small review page, native pixel view with horizontal scroll when needed, and fitted view. Detail labels do not claim a fixed magnification on narrow screens.
- vite.config.js: ordinary Vite multi-page entry; package.json supplies prove:study and formatting for study.html.
- scripts/prove-study.mjs: ordinary Playwright input proof plus the immediate game consumer. It observes the real assignment during chopping and then verifies six wood, one felled tree and cleared assignment at completion.
- PROTOTYPE.md: accepted milestone, latest art/cat/sizing direction, future witchy colony considerations and bounded current study scope.

## Review and proof

CTO personally accepted first lineup/caller/brief direction; explicitly did not claim to have watched its uncut recording. Native Sol review found no blocker. Its narrow-screen magnification advisory was corrected and exercised in final proof. This proposed study scale differs from the accepted clearing's camera scale; that distinction remains explicit in source and brief.

- npm test: 5/5 existing simulation tests pass with actual pinned libcolony WASM.
- npm run build: passes. Existing large shared bundle warning remains visible.
- .botanical/proportions-final-dist: final built page controls, 180 baked frames within transparent margins, four facings, all five figures visibly animate, pause, native/fitted mobile sizing, and actual game chop via Back link. Uncut video and screenshots retained.
- .botanical/proportions-hosted-proof: same browser proof against the actual native Cloudflare preview.
- .botanical/proportions-hosted-integrity.json: independent hosted HTML/JS/CSS/WASM SHA-256 comparison against dist.
- .botanical/proportions-fallow-final.txt: no dead files/exports; six changed-scope complexity advisories (two inherited), two duplicate groups in ordinary proof code, and styling advisories including dynamic-class candidates. No suppressions or blanket clean-metrics claim.

All newly launched final automated proofs used CTO's run-proof.sh systemd scope runner; human Vite servers stayed on their existing lifecycle. The original game engine, resources, tasks and fake storyteller are retained. The cat and other new figures are art studies, not new simulated agents. No live SSE, world streaming, multiplayer, vertical collision, main merge or infrastructure framework was added.

Earlier diagnostic captures remain under proportions-proof, proportions-dist-proof and proportions-dist-proof-final. The first game-return assertion was corrected because completed tasks legitimately clear assignment; the later completed-wood observation is the final proof.
