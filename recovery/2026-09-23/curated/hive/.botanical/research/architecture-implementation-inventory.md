# Architecture implementation inventory

Read-only bounded source/plan inventory, 2026-09-07. This is a worker-brief
map, not a new sprint commitment. Delivery retains coupled source/Git/deploy
custody.

## Status

- **Shipped/local:** two-person tiny home, typed jobs/claims/carry, stairs and
  upper-floor source/proof work, paused versioned local saves (schema 6), and
  mugwort's dedicated sow/grow/harvest path. The game still has no general
  goods, process, knowledge, realm, ecology, magic or AI-command engine.
  [`ARCHITECTURE.md:60-79`](../../ARCHITECTURE.md),
  [`src/persistence.ts:26-35`](../../src/persistence.ts).
- **Ready contract, not runtime:** one kettle + fermentation vessel, one herbal
  ale, mixed shelf output, fixed-clock fermentation, save/restore and serve.
  Grain/yeast/water/fuel, quantities, times and serving rule are unresolved.
  [`brewing-first-workstation-ready-contract.md`](brewing-first-workstation-ready-contract.md),
  [`ARCHITECTURE.md:133-142`](../../ARCHITECTURE.md).
- **Pure proposal:** chunks/caravan/visits, 5–100-person scale, knowledge
  books, ecology/fields, spells, Tarot/chess, modular content capabilities,
  paid AI and backend hosting. Existing issues are direction, not delivery:
  #4 worldgen, #5 homelands, #6 scale, #8 knowledge, #10 ecology, #11 magic
  presentation, #13 occult, #14 gardens/brewing, #16 capabilities, #17
  knowledge/authority. [`ARCHITECTURE.md:80-103`](../../ARCHITECTURE.md).

## First brewing dependencies and missing primitives

The first honest chain is finite inputs → mixed shelf → reserved transfer →
workstation work → unattended fixed-tick fermentation → one physical output →
store/serve. It must enter `admitCommands`, reuse `assignWork`/libcolony,
claims, routes, interruption and custody, and add a process boundary rather
than a permanent actor task. [`architecture-proof-sprint.md:158-180`](../../docs/decisions/architecture-proof-sprint.md),
[`src/orders.ts:421`](../../src/orders.ts), [`src/jobs.ts:444`](../../src/jobs.ts),
[`src/activity.ts:50-65`](../../src/activity.ts).

Missing concrete primitives are: recipe/input-lot definitions; a kettle/vessel
site and capacity; batch ID, recipe, lots, stage and authoritative start/due
ticks; ingredient transfer and output custody; a mixed shelf location/count
consumer; typed brew command/job/activity variants; paused-save schema/migration;
and HUD/view projections for stage and first waiting cause. Current `BUILDINGS`
is construction-only, while herbs have a separate commodity path.
[`src/construction.js:16-67`](../../src/construction.js),
[`src/persistence.ts:55-126,247-370`](../../src/persistence.ts).

## Small dependency-ordered contracts

1. **Content admission:** define versioned recipe, workstation and item/batch
   records; validate IDs, cross-references and quantities at the persistence
   boundary. Ordinary recipes are data; new behavior extends closed typed
   unions. [`ARCHITECTURE.md:362-383`](../../ARCHITECTURE.md).
2. **Goods/capacity:** define physical lot location, amount, traits and claims;
   make shelf admission reserve a concrete slot/capacity. Do not introduce a
   backpack grid or duplicate wood/herb ledgers. [`a-home-between-realms.md:57-73`](a-home-between-realms.md).
3. **Workstation process:** add one kettle/vessel capacity and batch stage
   transitions, with atomic ingredient settlement, fixed-clock fermentation and
   exactly one keg/output. Reuse `workApproach`, route, claims and cancellation.
4. **Command/scheduler:** add brew command, job and activity variants through
   `admitCommands` → `assignWork` → typed activity handlers; preserve party
   scope, reachable positions and carried-drop rules. [`src/model.ts:58-170`](../../src/model.ts),
   [`src/orders.ts:421-`](../../src/orders.ts).
5. **Persistence:** bump schema with migration from v1–v6; validate stage/tick
   ordering, lot custody, capacity and output uniqueness. Restore paused and
   never ferment offline. [`src/persistence.ts:26-35`](../../src/persistence.ts).
6. **Projection/UI/art:** expose one simulation-derived brew view and typed
   commands; add kettle, vessel and keg assets through existing Three→bake→Pixi
   art, with Caps remaining the shared UI owner. [`src/art.js:20-41`](../../src/art.js),
   [`src/view.js`](../../src/view.js).
7. **Proof:** prove one input transfer, work, paused mid-fermentation save/load,
   completion, shelf store/serve, full destination, cancellation and duplicate
   output rejection before a second recipe.

## Later issue mapping and stale plans

Worldgen/chunks (#4) must first prove coordinate generation, modified-chunk
eviction and caravan return; #6 requires measured 5/50/100 actor workloads, not
an optimizer microprobe. #8/#17 share discovery → learning → recording/teaching/
trade → application; #10 ecology owns conserved fields/processes; #11 is
palette/light presentation; #13 magic/chess/tarot remains content direction;
#16 is a typed capability boundary, not a plugin bus. [`ARCHITECTURE.md:385-391,447-489`](../../ARCHITECTURE.md).

The stale conflict is any historic paragraph that makes automatic chunk growth,
caravans, magic or AI the next playable step. Current sequencing is tiny-map
fun → upstairs → one brew; expansion waits for measured first consumers.
[`PROTOTYPE.md:40-48,66-103`](../../PROTOTYPE.md),
[`architecture-proof-sprint.md:30-35`](../../docs/decisions/architecture-proof-sprint.md).
