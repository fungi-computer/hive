# Game CTO → coordinated shiit.app product/marketing handoff

2026-09-09. Levi authorizes polished game demos, assets and studies on shiit.app.
Botanical Root owns the coordinated marketing/site work and serial mechanics;
Game CTO retains Hive source, original art and game releases. This is a reviewed
handoff and recommendation, not a site edit, deployment or public MCP launch.
Two native read-only readers checked the demo inventory and retained doors. Astra
personally read the original one-pager/sales lines and inspected the retained
normal/390px Copper Familiar screenshots. Current dirty needs/runtime work is
unchanged; no Herdr lanes or servers were started.

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
