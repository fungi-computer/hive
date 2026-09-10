# Game CTO → coordinated shiit.app product/marketing handoff

## Current availability — September 10

This paragraph supersedes the historical water/editor statuses below. The main
Goblin preview remains runtime `210b85d` with browser simulation and IndexedDB
saves. Its desktop Dig/water interaction and 100-file hosted parity were observed;
the 390px resize failed and its accidental 32-cell Dig restriction is still live.
The earlier dedicated wet-clearing `4a6931c` and compact editor `8518cc5` were
published; the editor remains at https://hive-editor-review.levi-fe0.workers.dev/.
No new game deployment occurred during the current combined source join.

The original prepared-art bank passed u4692 and is now committed locally in
`f4825c0`: 1,307 image entries, mainly character animation frames, packed into
three atlases plus ground/manifest (4.76 MB total). Root viewed all four PNGs and
matched exact source and output hashes. Startup speed, in-game raster behavior
and whole-map environmental performance remain unmeasured. Whole-clearing finite
water, paid brewing smoke/heat, current saves and vertical consumers are being
joined in the actual game; do not market them as a new hosted playable result.

## Latest publishing checkpoint — King Bolete, September 9

This section supersedes availability and staffing claims in the historical
handoff below. Public collaborator: **King Bolete**, Game CTO; Botanical's public
collaborator is **Shiitake**, whose blog Bun B helps write. Existing Session
`01a0791e-7ac8-7cc0-90dd-48f8d164e526`, `w1:pV` contact, unfinished full engine
goal and native workers remain. Naming creates no new hierarchy.

**Already public, per Botanical's hosting acceptance:** Copper at
`https://copper-familiar.levi-fe0.workers.dev/viewer` and the maintained asset MCP
at `https://hive-asset-mcp.levi-fe0.workers.dev/mcp`. The old "unstarted MCP"
paragraph below describes the original trial only. Full engine acceptance,
shared scene editing and a ready RPG-authoring product remain unfinished.

### Water: publish the actual distinction

**Levi's latest amendment:** all environmental demos belong inside the actual
Hive voxel world. Detached numerical fixtures are not the desired public product.
The suggestions below for a sooner recording or a 0.1 m authored diversion are
supporting evidence only. A live demonstration must first join the real world;
an isometric reskin does not count. Optional measurements/debug views remain useful.

Current browser pages are not live terrain-fluid solvers. `src/studies/soil-water/`
plays validated soil/pit recordings; `src/studies/slosh/` plays a recorded 2D
surface; `src/studies/gas-heat/` plays tracer slices. `src/world-lab/section.js`
renders an interactive stepped isometric terrain section, but its water is a
static terrain classification. Goblin's finite source/pail/kettle/care transfers
are real inventory work, not terrain hydrodynamics.

The immediate honest exhibit is an isometric **recorded excavation and seepage**
view with play/pause/scrub/inspection. Existing assets are
`public/study-evidence/soil-water/excavation/{proof,moving-frames,excavated}.json`;
the recording owner is `src/studies/soil-water/recording.js`. Numerical source and
682-check packet are under
`.botanical/research/environment-round3-20260908/soil-water-v1/excavation-v1/`.
It removes an actual generated soil voxel, preserves finite wet-spoil water,
and admits 12.565 kg into the pit over 600 seconds: **1.26 cm**, not a flood.
The retained browser proof `.botanical/soil-water-lab-local-final-20260909/`
predates the excavation tab; it cannot be cited as proof of that tab or a new
isometric viewer. A polished integration still needs its own focused render/input
check. Do not imply changing the recording changes the simulation.

For the more compelling **live** interaction, prefer opening a finite diversion
and seeing the receiving pond fill using the existing JavaScript shallow-water
owner. Source/accepted numerical evidence:
`.botanical/research/environment-round3-20260908/water/accepted-optimization-v1/`
(`candidate.mjs`, `reference/solver.mjs`, `RESULTS.md`, retained runs). The corrected
shared-owner API is the later `water/accepted-boundary-v3/`, whose checked admission
and retained snapshots supersede the earlier optimization's incomplete boundary.
The 32²,
120-second wet-edit/restart comparison already executes real finite flow and
withdrawal with exact candidate/reference agreement. It is not wired to a browser
or the game. Geometry admission, borrowed-buffer lifetime, integration with the
game's 0.54 m vertical datum, and bounded browser work must be resolved before
calling that exhibit live. Its current tested terraces use 0.1 m steps.
`water/METHOD-QUALIFICATION-RESULTS.md` rejects unchanged use across arbitrary
0.54 m ledges: some measured cases reverse the intended flow. This is a physical
correctness blocker for the world join, not just a unit conversion or visual issue.
Keep the test's units in supporting evidence; do not relabel it the Goblin world.
This is a bounded surface-water consumer, not cave/stacked-water acceptance.

**Tradeoff:** a labelled recording can support a making-of story sooner; a real
gate-open-to-pond response gives visitors agency and advances the engine join.
King Bolete recommends the latter as the next water interaction, while existing
recordings provide supporting evidence. No new CFD study, language port or full
engine completion is needed merely to publish the existing recorded result.
Botanical owns final site composition/publication; Hive supplies source-owned
artifacts. No water artifact is claimed newly built or hosted by this review.

### Full Three editor: source exists, first runnable checkpoint next

`tools/asset-mcp/editor/**` plus `tools/asset-mcp/editor.config.mjs` contains the
full maintained upstream editor pinned to
`e69f76ed41069827b72550d9a4b1e3901ab61e3b`, not a replacement reduced inspector.
Native `asset_product_pm` owns this isolated source; King Bolete personally read
the first shape and returned camera/environment/import/settings corrections.
Its upstream closure is 256 files / 17,960,132 bytes before the shell build, with
resource hashes and notices. Existing original asset builders feed one upstream
Editor/History through transferred data. Caps owns the surrounding shell and
released typography; upstream interior widgets are not yet Caps components.

The first deployable shape is **static**: browser editing, native hierarchy and
transform/material controls, local project files, Three JSON and GLB exports.
No provider credential or server compute is required for those operations.
Shared saved links/live MCP scene synchronization would need a separate service
join; the existing public asset MCP does not already provide that. Project
scripts/Play/Publish are excluded from this asset workspace. Original recipe
provenance remains separate from arbitrary edited geometry.

Next source-owned artifact location:
`.botanical/asset-mcp/editor-source-checkpoint-20260909/`. It is not yet an
accepted runnable archive; first build/resource/loaded-font/original-render proof
is assigned to the same author after the source corrections. Accepted 402/886
archives remain untouched. Proposed eventual destination **editor.shiit.app**;
Botanical owns a dedicated stable review host and workers.dev fallback while DNS
authority is unresolved. Neither URL nor readiness is claimed live here.

### Native restart fixtures available to Shiitake

Baseline u3865 controller: `tools/engine-do/proof.mjs`, host `worker.ts`, native
configuration `wrangler.json`; evidence
`.botanical/engine-do/quarry-20260909-v2/`. Executed controller hash
`80d630a4252136470bc93bd69a58469cea14fff6635d922a0788a0769b8c0bca`;
current controller `e5de3a20bdeae8dbb4635d6c717820edf6c97c9b31e8b9db90ea972f25ed5171`
adds only the recorded log sanitation. It kills only owned Wrangler process
groups, keeps SQLite, reconstructs, and checks exact receipts/state. SQL rollback
is injected separately; the lost acknowledgment is an intentional post-commit 503.

New u3907 Watchdog fixture: `tools/engine-do/watchdog-proof.mjs`,
`watchdog-worker.ts`, `watchdog.wrangler.json`, `WATCHDOG.md`; evidence
`.botanical/engine-do/watchdog-20260909-v2/`. It reports native alarm completion
after both queued and post-physical-commit process loss, witnessed by external
read-only SQLite before any DO fetch and with zero constructor alarm repairs.
Independent source/evidence review is active. It is not a proof of current
Shiitake's adapter, hosted Hive, cancellation/exhaustion, or every alarm failure.

## Historical initial handoff

2026-09-09. Levi authorizes polished game demos, assets and studies on shiit.app.
Botanical Root owns the coordinated marketing/site work and serial mechanics;
Game CTO retains Hive source, original art and game releases. This is a reviewed
handoff and recommendation, not a site edit, deployment or public MCP launch.
Two native read-only readers checked the demo inventory and retained doors. Astra
personally read the original one-pager/sales lines and inspected the retained
normal/390px Copper Familiar screenshots. Current dirty needs/runtime work is
unchanged; no Herdr lanes or servers were started.

## Joint follow-through and engine correction

The CTOs have agreed on Copper Familiar -> playable clearing -> explicit launch
signup. Botanical has supplied its actual App/Session/Media limits; this is a
joint plan, not a unilateral Game task assignment. Shared Caps and website source
remain Botanical-owned. Making-of stories use polished original work and actual
history; private transcripts stay private.

Levi explicitly places Shiitake participation in the Hive engine. Read
`docs/decisions/vishnus-many-faces.md` and the maintained Game CTO skill at
`.agents/skills/game-cto/SKILL.md`. The engine exposes an ordinary open API/MCP
contract; the CTOs are checking the actual Mycelium/Knapsack path before adding
integration machinery. The asset MCP remains unstarted. A later human-versus-
Shiitake resource challenge is planned, with Camel credentials server-side only;
it is not tomorrow's launch dependency.

Unaccepted game source has a verified private GitHub checkpoint:
`fungi-computer/Botanical-next`, branch
`recovery/hive-needs-engine-20260909T053519Z`, commit
`e0ba9b0acd2c32322f63f0367d271c945ff13957`. It preserves the current dirty source
and selected relevant evidence, with live stores/credentials outside the packet.
The working tree remains intact. Local checkpoint metadata is under
`.botanical/recovery/needs-engine-private-20260909T053519Z/`.

## Recommended smallest polished story for tomorrow

**One little inn, built from reusable pieces.** Lead with **Explore the Copper
Familiar**: rotate its four views, switch exterior/cutaway/floors, and reveal a
small curated selection of the original kettle, bookshelf, bottles and tankard.
Show that these are actual reusable Three models baked into the game's pixel art.
Use **Play the tiny clearing** as the secondary action.

This demonstrates attractive, functioning work without requiring the full engine
extraction, a new model run, a physics solver or an asset MCP launch overnight.
The existing brewhouse page is an art/layout study. Its assembled building is not
a playable prefab; the separate prototype contains the actual brewing systems.

Proposed marketing composition: one focused interactive exhibit with useful
controls and a short prop strip, followed by the two clear next actions. Root's
Astro owner controls the page. Hive should supply an agreed component/artifact
boundary reusing the current builders if a custom exhibit is selected; no copied
factory fork under the marketing repo. The safe fallback is an approved game/art
capture plus a clear link to the existing interactive page. Do not automatically
embed the entire study catalog or demand a new tunnel effect for tomorrow.

The proven kettle Object JSON can be the first explicitly versioned downloadable
sample after including original source/provenance/license metadata in its public
package. Its current file alone is a format trial, not a full licensed asset pack.
No GLB, prompt-to-asset service or arbitrary character customization claim yet.

Final scope for the actual shiit.app composition: normal/narrow rendering, keyboard
access to the selected controls, real view/turn actions, navigation and any offered
download. One short focused proof and art inspection; no full game harness.

## Current engine and asset product plan

Current docs commit: `9848c36`, pushed to
`feat/goblin-bed-and-breakfast-mvp` in `fungi-computer/hive`.
All paths here are beneath `/home/levi/src/hive` unless absolute.

- `docs/decisions/hive-engine-asset-pipeline-and-goblin-boundaries.md`:
  authoritative engine/tooling/game/Fungi split, actual source map and extraction
  order. Hive owns world/material/work/field mechanisms; Goblin owns scenario,
  recipes, hospitality, progression and UI; authoring owns reusable visual
  composition/bake/export; Fungi owns host/commercial authority.
- `docs/decisions/architecture-proof-sprint.md`: current delivered runtime and
  active tiny-map work. Two confirmed save defects precede shared capability,
  endpoint and durable execution consolidation; care is its next game consumer.
- `docs/decisions/current-systems-review-and-module-plan.md`: actual whole-game
  audit, Fallow and reproduced save defects. No claim of an already separated SDK.
- `docs/decisions/simulation-and-content-contracts.md`, heading
  **Proposed asset-authoring MCP — 2026-09-09**: discover/describe, compose/revise,
  preview and export through one API shared by the workbench and MCP adapter.
- `docs/decisions/a-home-between-realms.md` and
  `docs/decisions/home-expeditions-and-living-world.md`: longer game vision;
  magic, realms, caravans, ecology and hospitality are not all current features.

Commercial direction is accepted: open/reusable engine and original asset tooling,
paid hosted asset authoring via MCP, eventual Fungi Apps. Current source does not
provide those independent packages, paid service or App runtime integration.
Botanical's App/identity/Media PM remains the current platform authority.

## The actual “little MCP test”

**No asset MCP server was implemented or started.** The useful completed proof is
an original Copper Familiar kettle exported to Three Object JSON, loaded again,
and rendered in an isolated retained scene.

- `.botanical/three-tool-trial/README.md`
- `.botanical/three-tool-trial/export-brewhouse-kettle.mjs`
- `.botanical/three-tool-trial/retained-kettle.html` and `retained-kettle.js`
- `.botanical/three-tool-trial/output/brewhouse-kettle.r185.json`
  — 47,844 bytes; SHA256
  `9d7558c491f7c5aa943fed357e2d8a8062321d680074004b650599c8ff1f6ef9`.
- `output/roundtrip-report.json`: Three 0.185.1/r185, 42 nodes, 36 meshes,
  matching transforms/bounds/materials/lights. `updateMatrixWorld(true)` precedes
  serialization. The procedural builder identity, production camera and Pixi
  outline are not recovered from Object JSON alone.
- `output/retained-kettle-browser-proof.json`, `output/retained-kettle.png`:
  retained renderer, 916 triangles, no errors. The temporary local server is
  stopped. This is a file/browser proof, not a current hosted product endpoint.

The isolated third-party `threejs-devtools-mcp@0.4.1` trial stayed unstarted:
its bridge uses `listen(port)` without an explicit loopback binding option. No
MCP client discovery/compose/export call was performed. This dependency is not
necessary for our own authoring API. Marketing can say **original reusable 3D
assets and pixel-art baking** now; **MCP authoring** remains planned.

## Exact demos, sources and evidence

Existing preview base:
`https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev`.
Current documented hosted runtime: `449e9b8a642dc1c9e6d815f8e7417c143ba1e574`;
deployment `ad099b8c-0c97-4432-bc8a-8ae92781a460`.
This handoff read retained proof; it did not perform a fresh network/browser run.

| Surface | Route | Source | Appropriate claim |
| --- | --- | --- | --- |
| Playable prototype | `/` | `index.html`, `src/main.js`, simulation modules | Tiny browser colony: work, building, storage, brewing, shallow digging/backfill and local saves |
| Copper Familiar | `/brewhouse-study.html` | `brewhouse-study.html`, `src/studies/brewhouse/{main,props,shell,template,composition,bake,cutaway}.js` | Original interactive two-storey building kit; five modes, four facings, 14 prop builders |
| Catalog | `/study` | `study.html`, `src/studies/catalog.js`, `src/studies/catalog/main.jsx`, `src/studies/StudyChrome.jsx` | Navigable internal/public study collection, not the proposed marketing landing page |
| Characters | `/study#people-proportion`, `/devil-study.html`, `/animal-study.html` | `src/study.js`, associated original art/study modules | Native poses, facings, motion; not encounters, chess or animal simulation |
| Fire/foliage | `/fire-study.html`, `/foliage-wind-study.html` | Corresponding `src/studies/` modules | Original visual effects; not fire spread, fuel, weather or ecology |
| Geography | `/world-lab.html` | `src/world-lab/{terrain,worker,main,section}.js` | Live bounded height/sea terrain generation and inspection; separate from playable Clearing |
| Soil/air/waves | `/soil-water-lab.html`, `/gas-heat-lab.html`, `/slosh-lab.html` | `src/studies/{soil-water,gas-heat,slosh}/` | Recorded numerical experiments with playback controls, not editable/live fluid simulation |
| Goblin den/mess | `/goblin-den-study.html`, `/goblin-mess-study.html` | Corresponding static pages/images | Concept/detail art. Den's generated character style is explicitly rejected for game characters |

Evidence useful to marketing review:

- `.botanical/brewhouse-study-served-final-20260908/proof.json`:
  local served five-mode/turn/14-prop behavior; errors empty. Actual screenshots
  `brewhouse-normal.png`, `brewhouse-390.png` beside it, personally reopened by
  Astra in this handoff. The screenshot predates later shared study chrome.
- `.botanical/digging/hosted-1/proof.json` and its normal/narrow screenshots:
  hosted two digs, real soil, exact paused reload, one backfill, no browser errors.
- `.botanical/digging/hosted-parity.json`: 72 served files matched frozen dist,
  including all 15 HTML entries. This does not turn the older local brewhouse
  interaction proof into a hosted interaction test.
- `.botanical/three-tool-trial/output/retained-kettle.png`: technical 3D preview;
  use the brewhouse/native prop art for the polished hero.

Keep multiplayer, autonomous AI play, customer service/rewards, a full extracted
engine, hydrological gameplay and production gas out of current-feature copy.
They are valid vision/roadmap items. Preserve independent source work and use a
pinned accepted artifact/source slice for marketing, not the dirty needs build.

## Original three doors: recovered local source

Readable locally on this host, no SSH or credential access needed:

- `/home/levi/three-doors/publish-agent-one-pager.md`
- `/home/levi/three-doors/fungi-platform-sales-lines.md`
- `/home/levi/three-doors/memo.md`
- `/home/levi/three-doors/minimalist.md`
- `/home/levi/three-doors/standard-bearer.md`

For a single-file handoff, the five unchanged originals are also archived at
`/home/levi/src/hive/.botanical/marketing/three-doors-originals-20260909.tar.gz`,
SHA256 `6573e137f876c1ee503fb28d7a5597b754378fd55022dc25a330f3d1c2e61360`.
`handoff-inventory-20260909.json` beside this note records individual source
hashes and confirms all 139 prior audit source files remain unchanged. This is
an internal reference archive, not approved current marketing claims.

The one-pager's actual historical doors are **consumer zero-code agent**,
**business configured agent with its own branded deployed surface**, and
**developer publishing their own code**. Levi's recorded correction: BYOK is
platform-wide, not Door 2's differentiator. The business buys its own product
surface, isolation and control. Historical Cloudflare/Celld/Hypha portability,
pricing and timing statements require current platform reconciliation; do not
paste them into factual availability copy.

No separate retained expanded-door document with the recent engine/game/asset
additions was found in the searched Hive/current Botanical records. The following
is **my proposed expansion**, not a quotation from the originals:

| Existing door | Expanded cross-product examples | Current limit |
| --- | --- | --- |
| Use without code | Talk to an agent, play Goblin, use a visual asset workbench; eventually request assets through an assistant | Goblin prototype and art interactions exist; unified consumer/paid authoring/AI game assistance is not all joined |
| Configure and brand | A business's agent surface, selected tools/assets/workflows, a branded creator service | Fits the original independent-surface offer; hosting, authority and commerce readiness come from Root's current platform review |
| Build and publish | Developer-owned agents/apps using Hive engine mechanisms and asset APIs/packs, with eventual Fungi distribution | Engine/pipeline public extraction and hosted publication remain work to deliver |

**Doors describe how much the customer controls. Engine, asset authoring and
Goblin are products/building blocks that can appear across those doors.** Do not
rename the original doors to Engine/Assets/Game or sell three disconnected rails.

## Retained visual direction and custody

Botanical's accepted visual record is
`/home/levi/src/Botanical-next/wiki/2-areas/marketing-design-direction.md`:
Daylight-to-Twilight continuous descent, actual game imagery and an eventual
Three tunnel effect reserved to Game CTO. Its frozen source archive is
`/home/levi/src/Botanical-next/.botanical/marketing-concepts-20260908/approved-preview-3-20260908.tar.gz`,
SHA256 `5a4b1889c5db9f9b71f2b3388d87a15eebcf69d3b005469977242fce9cce4a82`.
That direction is an input to Root's shiit.app work, not a second site assignment.
The older record spells another domain `shit.app`; Levi's current authoritative
target for this push is **shiit.app**.

Root/marketing PM owns Astro page composition and publication. Game CTO owns
original art and the supplied game/pipeline seam. Agree the exact files before
an interactive extraction; no competing site writer is started by this handoff.
Native support work is appropriate; no new departmental tier is needed inside
Hive just to deliver this reviewed asset packet.
