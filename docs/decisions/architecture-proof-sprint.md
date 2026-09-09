# Current plan: extract Hive and prove it in the tiny clearing

Game CTO decision, 2026-09-09. Personally authored after reading production at
`bf12e99362845c16cd055f5bf877085f2425c460`, the current sprint and retained
system/game-study decisions, lab callers and numerical handoffs. Three bounded
read-only reviews checked the digging join, current economy and lab limits;
their work is returned and parked. This replaces the active sequence below,
including the stale schema-12 paragraph that still schedules plant watering.
Historical plans remain evidence. This document is a plan, not a new runtime,
hosted interaction, performance or full simulation-completion claim.

## Current release and active outcome

**Latest development policy, Levi September 9:** breaking engine/game APIs and
save formats are allowed. Do not implement legacy shims, compatibility wrappers,
old-save migrations or parallel old execution paths unless Levi explicitly asks
for them. Update current consumers together and delete what they replace. This
supersedes predecessor migration requirements in the historical plans and earlier
v0 wording below. Current-version saves, DO restart/replay, physical conservation
and rejection of unsupported formats remain required. Reference snapshots may
remain test evidence; they do not require a live predecessor reader. The new
finite-work representation and soil/world join should use this simpler policy.

**Primary runtime constraint, reaffirmed by Levi September 9:** Hive's engine
will run in Cloudflare Durable Objects. This governs the current extraction;
it is not a later hosting optimization. A process may disappear between any
two effects. Acknowledged commands, physical changes, work custody, tick/revision
and outgoing event obligations must recover from durable storage without relying
on the old process. Bounded RAM and rebuildable caches remain useful. Current
material and voxel snapshot tests establish in-process laws and serialization,
not the missing DO transaction/restart boundary. The
[DO durability contract](local-snapshots-and-durable-ai-jobs.md) owns the required
atomicity, Watchdog reevaluation, first failure-injection consumer and remaining
source gaps. Its acceptance is part of engine completion, not an optional later
AI feature. Existing backend publication limits remain; a local actual-DO
runtime proof and source integration do not claim a deployed game backend.

**Direct scope amendment from Levi, September 9:** engine acceptance includes
deep digging and multi-storey witch towers. The deliberately small clearing
limits horizontal play space, not vertical capability. The current one-voxel
excavation and Ground/Upper implementation are temporary shipped restrictions,
not the engine target. Floor and roof placement must use the same visible
physical surface-height convention. This supersedes the shallow-only excavation
envelope in the earlier v0 wording and the deferral of tower capability below;
it does not require every decorative spiral stair or future collapse rule.
See the [vertical-world contract](world-generation-and-streaming-contracts.md#vertical-world-amendment-september-9)
for migration, physical geometry and acceptance. Preserve the active material
writer/reviewer and independent asset work while Game CTO owns this recut.

**Further direct amendment:** four logical object orientations and quarter-turn
world rotation belong in both the engine and playable demo. Two-direction stair
art/placement is not the final contract. Camera rotation is a view transform,
not a rotation of saved geography; picking, ghosts, visibility, ordering and
directional original bakes must consume the same transform. See the same
vertical-world contract. Do not claim completion from rotating the ground image
alone or reuse asymmetric art by mirroring it.

**Selection amendment:** the same geometry/controls work includes a visible
3D box gizmo with draggable faces/edges, shared shape selection and depth-aware
volume designation. Levi's quarry consumer is planned through reachable work
stages; a bottom-depth field alone does not satisfy the interaction. Keep one
shape/preview owner for Chop, digging, construction and zoning. Persistent layer
buttons/hotkeys and camera rotation must work with it. X-ray, target queries and
AI tools respect visible/remembered/unknown knowledge; slicing downward cannot
reveal an undiscovered dragon. The [3D selection contract](controls-floor-priority-recut.md#visible-shapes-and-volume-designations-september-9)
owns interaction, pause/cancel, knowledge and bounded query/work requirements.

**Opaque owner and debug amendment:** apply the actual Watchdog/Field Guide
payload-blind boundary. Game definitions and registered systems give opaque
content its meaning, including material distribution, diggability and supported
physical interactions; the engine owns lawful storage, lifecycle and mutation.
Moving an air/soil/stone recipe into an engine directory does not finish that
extraction. Rich optional debug tools are engine consumers of the same owned
geometry, work, material and field queries, usable through overlays or tool
adapters without a second simulation. Developer inspection requires its own
grant. The [engine contract](architecture-implementation-plan.md#opaque-engine-contracts-and-composed-tools--september-9)
records source anchors, first debug consumers and acceptance. Asset creation's
public MCP connection grants no game administrator access.

**Saved goal reconciliation, September 9:** Levi pasted and activated the full
Hive v0 objective in native Game CTO Session
`01a0791e-7ac8-7cc0-90dd-48f8d164e526`. The goal tool now reports **active**;
Game CTO read the referenced attachment before continuing. Its six completion
requirements match the contract below, including the unfinished water, gas/heat
and world-generation gameplay joins. The earlier paused environmental goal and
visible-Delivery paragraph are historical; no model or Session restart occurred.
An MCP export success does not finish the engine goal.

### Engine completion contract — jointly reviewed v0 scope

Levi's September 9 amendment makes the **first reusable Hive engine** the next
goal, with Astra retaining its present model and Session through acceptance.
The original unfinished environmental work is included. Before Levi's new goal
activation, the native status-only tools could not replace it and Game CTO did
not falsely complete it as an editing workaround. The full engine objective now
owns continuation in this same Session.

Botanical CTO reviewed `47e7729` and accepted this as a declared small-world v0
scope. That is agreement on the target, not source or engine acceptance: each
row still requires its actual consumer and evidence. Keep the current Astra
model and working Session until the agreed engine finish is accepted.

**Goal text:** Complete Hive v0 as a reusable, headless, Shiitake-ready sandbox
engine extracted from the actual Goblin implementation. Prove that Goblin and
independent consumers use the same capability, material/work, edited-world and
environment owners; integrate bounded game-scale water/soil and air/heat; expose
scoped observations/actions/results through Botanical's existing execute-door
plumbing; preserve saves, original art, finite resources and the one world clock.
Deliver accepted source, useful playable interims and reproducible behavior/
performance evidence. Copper Familiar/MCP is a separate asset-product outcome,
not engine completion. Keep game direction and integration custody until the
two CTOs review the concrete engine finish and Levi accepts the role transition.

Here, “complete” means a useful **v0 contract over a declared supported world**,
not implementation of every planned game feature or scientific fluid dynamics.
The acceptance packet must close all six exits below; individual rows can ship
first while the overall engine goal remains unfinished.

| Exit | Concrete acceptance |
| --- | --- |
| Reusable entry and real consumers | A headless public engine entry runs without Goblin scenario/content, React, Pixi, Three, Caps, DOM or model-provider imports. Goblin construction and shelves plus the independent five-unit ore depot use the extracted material owner. No copied demo kernel or second inventory remains. Import/source review identifies where each game definition is supplied. |
| Capabilities, work and persistence | Resolve body/navigation/carry/container/source/work/needs capabilities through narrow owners. Current wood/herb/soil/water/food consumers share applicable supply/transfer/execution rules; final domain effects stay typed. Kettle filling, planting water, drinking and eating no longer orchestrate separate phase machines. Another supported vessel, consumable and recipe are definition changes. Snapshot phase/custody validation uses domain facts; both reproduced save defects are closed. Cancellation, contested stock, moving/lost targets, partial pickup and load preserve quantity/ownership and settle effects once. |
| Edited world and generation | One versioned, stepped generator supplies height/sea level, biome fields and bounded cave/feature queries. Coarse maps and fine samples share that owner. Generated base + sparse edits + resident field state stay distinct. Adjacent-chunk and vertical-brick edit/evict/reload proofs preserve seams and state without generating the whole world. Geometry feeds separate movement/support/contact/picking queries; topology invalidation is owned. The tiny clearing supports deep excavation and a multi-storey witch tower using general signed voxel coordinates, repeated traversal links and consistent floor/roof surface placement. Publish and measure its vertical envelope; Ground/Upper and one removed voxel cannot pass this exit. |
| Water, soil, air and heat in real play | Player excavation changes finite flow/soil exchange, including underground spaces and vertically separated occupied volumes; pail withdrawal/deposit balances field and item units. Filling terrain displaces/accountably handles water. An indoor source consumes real fuel, emits accounted heat/smoke, and opening/closing ventilation changes exposure across stacked rooms. Field state and continuation survive reload under the same clock. Declare sources/sinks/outdoor reservoirs, approximation/tolerances and unsupported pressure/geometry. One surface height per column may serve a compatible surface-water subcase but cannot own the whole excavatable world. Reference playback and visual bubbles do not pass this exit. |
| Engine controller door | An authored public Mycelium module registers input/output schemas and handlers over the scoped engine API, then the existing execute tool and sandbox invoke it. Use Knapsack only where the actual host needs connection discovery; neither a generic MCP adapter nor a custom client catalog is required. Keep platform imports in the integration consumer, outside the headless physical owner. The independent consumer and Goblin enforce allowed actor/actions/knowledge. Wrong scope/stale inputs reject without mutation; retry after a lost acknowledgment does not duplicate goods/effects, and saved command results remain distinguishable from unfinished world work. A deterministic host proof can establish those laws through a real execute-tool invocation. The later live Camel/Shiitake match is separate evidence of model play. |
| Integration, budgets and distribution | Goblin consumes the same accepted modules and remains playable through a short dig/build/supply/care trace. A consumer installs/runs the documented engine entry from a clean checkout with pinned definitions and snapshots. Record actual candidate/path/optimizer/field/render/save costs and peak/resident memory separately on named hardware. Freeze workload sizes, fixed-step budgets, field tolerances and browser response targets before final performance acceptance; exceeding them remains a blocker, not an invitation to relabel the load. Source/caller review, focused laws, visible interaction and hosted artifact parity each state their own evidence. |

**Durability qualification across these exits:** the extracted owners must also
run inside the real DO storage/runtime boundary with committed command identity,
atomic world/material/work/receipt updates and durable event obligations. Kill
and recreate the instance around commit and delivery boundaries; retry the same
command and wake; prove no lost acknowledged intent, duplicated goods, torn
terrain/resource changes or repeated physical completion. A database transaction
must not leave a failed candidate published in RAM. Measure storage writes,
commit latency, reconstruction and bounded advance work along with computation.
Watchdog is the preferred existing host-job owner to qualify against this
consumer, not rejected because the playable browser uses IndexedDB. It does not
replace the deterministic physics step or libcolony's pawn assignment.

Performance acceptance covers the named active workload, not hundreds of idle
pawns. Deterministic work budgets bound simulation; wall-clock scheduling can
yield rendering/generation without changing physical decisions. The first packet
must publish the tested actor/job/resident-cell/chunk counts and frame/fixed-step
budgets so a larger-world claim cannot outgrow the measured result. Exact final
workload numbers are selected jointly from the first extraction baseline, rather
than inventing a supported population in a planning document.
Freeze numerical tolerances from those same named consumers and baseline before
the final comparison. Preserve declared physical sources/sinks when selecting
budgets; changing a reservoir boundary to make a benchmark pass changes the
experiment rather than improving its implementation.

Deferred game content (nations, religions, courts, realms, deep breeding,
decorative spiral-stair variants and the whole social ecosystem) does not gate
this engine version. Basic deep excavation and multi-storey tower capability do.
Production multiplayer, paid autonomy and engine-wide hot mod execution also
need their own real hosting/authority acceptance. Their planned capability seams
remain protected. Full Fiend scene-editor parity belongs to the asset product;
its progress neither replaces nor completes water/gas/world integration.

### Current parallel custody

**Latest actual witness, superseding the earlier startup-only result:** Root ran
frozen `b5e1303` once as `u4438`, invocation
`bbfb6f47060749eba4a0b7283617372c`, after Delivery released the input-only
window. Initial startup succeeded. Physical paused Dig admitted `[0,14,128]`
at tick0; Rowan completed it and produced one soil lot, paused at tick56 with
physical time2.8seconds. Root viewed `completed.png` in the actual isometric
clearing. Reload then exceeded the unchanged60second startup deadline: main
entered, storage/optimizer complete, art1291 textures complete after68.044seconds,
display initialization running and game assembly not begun. No canvas existed
at that observation. Error arrays were empty. This is a measured frontier,
not proof of an earlier root cause or exact reload restoration. The two actual
input/work assertions passed; reload equality did not run. Browser, all captured
processes and port5198 closed; scope inactive/dead with empty ControlGroup.
Delivery has the returned window. Evidence and hashes are in frozen
`game-startup-proof/.botanical/game-startup-input/WINDOW-RESULT.md`. No benchmark,
law/build replay, new deployment or automatic browser repeat. Hume completed
source-only reload-cost disposition: installed Three rewrites backing dimensions
on every setSize call, and1288 of1291 startup requests repeat the previous size.
The shared bake guard `a24ade6` is now source-reviewed/integrated: read actual
renderer size every call, resize when needed, otherwise reset full viewport.
Original builders, pixels/outline code, dimensions, cameras and dynamic bakes
remain unchanged. Syntax `u4450` passed; Fallow `u4451` retains the inherited
bakeArt complexity advisory. No speedup or new raster/parity claim. The frozen
input-only candidate remains unchanged. Hume released that one-file source;
The completed field/material source and remaining qualification are recorded below.

**Material boundary now integrated:** Meitner's `5c35791` is joined as `18a1e30`,
all five accepted hashes verified. Held-vessel import delegates identity,
quantity/definition and capacity to the existing creation owner. Export shares
exact held-portion debit with consumption but appends no consumption sink.
Seven focused laws `u4429`, strict types `u4432` and inspected Fallow
`u4433/u4435` qualify that material-side boundary; existing advisories remain.
No unchanged suite was repeated. The later paired source and generated-room
acceptance below supersede this former caller dependency. Root retains units,
source acceptance, integration and actual runtime qualification.

**Current paired field/material source is integrated:** schema20 and the
fixed-baseline law live in Root's paired owner; Hume's `b40213c` is joined as
`506528c` with all five hashes matched. Three actual-WASM laws u4485 prove natural
seepage wakes waiting work, serves kettle/hydration/garden through the existing
vessel lifecycle, retains canceled contents and draws only a partial pail's
missing unit. Existing container behavior passed its affected laws; strict app
types with skipLibCheck=false passed u4486. Independent review accepted the
caller. Fallow retains existing activity/routine complexity/cycle advisories,
with zero introduced findings in this chunk.

Root's six paired/intent laws and strict app types passed u4493. The expanded
actual Goblin Region law u4496 then proves both return and the ordinary subsequent
work-tick draw across SQLite receipt failure, exact reopen and lost-ack replay.
These use a validated authored intermediate work state, distinct from Hume's
naturally seeping field fixture. Withdrawals must match the operation's recorded
field source; returns can choose another reached receiver but cannot invalidate
the pending supply. Both rules reuse current owners. No new native Cloudflare,
browser, benchmark, build or deployment is implied.

Hume's native field/pail witness source `6bfa2dd` is accepted by Root and
Meitner, joined as `b647d3e` with all six hashes matched. The same authored held
fixture now feeds Node laws and the existing native Goblin harness; fixed local
configuration selects a separate field DO identity. The prepared trace checks
return and ordinary draw/tick receipt failure, lost-ack restart/replay, and actual
continued walking without a second draw. It uses the existing process/credential/
receipt owners and at most five runtime starts. Strict host and transitive app
declarations passed u4506; fixture validation/sizing u4507 and final syntax u4510
passed. Root read Fallow u4508: command estimated-coverage and inherited fetch/
stop/other-harness duplication advisories remain, without suppression or a green
audit claim. No physical laws were repeated for the fixture extraction.

**Actual native qualification now passed:** after Delivery's release, Root ran
the unchanged command once as u4514, invocation
`343fb54fef2547a6a63eaf9ed41694e4`, exit0. Five actual owned local DO starts proved
return and ordinary draw/tick receipt rollback, exact restart/lost-ack replay,
authorization/conflict rejection, and real continued walking with the same held
portions. Two units returned to the field and two were drawn; material/field
coupled residual remained0 and no consumption sink appeared. All82 captured
local source/config hashes match the integrated candidate. Complete evidence is
`field-region-host/.botanical/field-region-host/native-v1/REPORT.md` and receipt
SHA256 `6a6a40e6c25b6ba229ace738b63aadbd56d2a2c597a87082ecc4b04fb7be62f8`.
All five owned PIDs and port39505 closed; scope inactive/dead with empty
ControlGroup. Delivery has the returned window. The fixture is authored current
work state; autonomous wake, browser/account entry and hosted acceptance remain
separate. No build, benchmark, old digging replay or deployment ran. Sol completed the
accounts-to-Goblin source trace in ignored notes. The agreed
[DO contract boundary](local-snapshots-and-durable-ai-jobs.md#account-bound-goblin-entry--agreed-peer-boundary-september-9)
uses opaque pairwise App-scoped customer identity; the public App runtime is
Deployment-owned, while private world ownership is game data. Botanical must
qualify public customer admission through its real browser/backend caller before
the game connects. Anonymous saves remain untouched. No account writer, server
or identity store is authorized. Root retains
integration and actual rendered/DO qualification; frozen prior input evidence
remains.

**Next released source custody:** Hume retains his Session and owns actual-game
field-water inspection/projection in isolated `field-inspection` at `aa24956`.
Use the current main/HUD/view interaction owner to expose real standing-water
litres and whole measures, without changing physics, material, save or original
art. Source/focused checks only; no browser/build/native/deploy release. Meitner
independently owns ignored-only air volume-change readiness from current rebind
and construction geometry. Root owns the physical design and paid-fuel join;
Sol's corrected full-game air trace is accepted supporting evidence. No repeated
agent activation is needed when Botanical relays these same releases.

**Generated-room source integrated:** Sol pinned `fad0657` with10 affected laws
u4465 and app types u4456. Root and Meitner accepted the three corrections:
shared terrain/site/air coordinates, geometry identity across same-revision
histories, and rejection of fuel splits/remainders smaller than the public field
interval. Joined as `8257657`; the serial `parseClosedTerrain` recut rejects an unpaired
water deposit in u4480 because this room has no material-water counterpart. It remains an authored starting house on actual
generated terrain, outside full Clearing; tree permeability and fixed air-volume
limits remain. No new rendering, ventilation-benefit or DO claim.

The following records preserve prior evidence and completed custody history.

**Latest actual input witness:** diagnostic `u4391` at runtime `09e813a`, fixture
`696bd2a`, again timed out at initial readiness after60seconds. The bounded
document read succeeded: original loading text, document complete, no
`__GOBLIN`, no DOM canvas, and empty page/console/request/module-error arrays.
This does not identify which module or startup task is pending. No gameplay
input/check or screenshot ran. Browser/runner cleanup completed; Vite803936
exited143, driver804014 exited1, both PIDs disappeared, port5198 was clear and
the owned scope inactive/dead with empty ControlGroup. Delivery has the returned
window. Original evidence and `WINDOW-RESULT.md` remain under frozen goblin-wet
`.botanical/goblin-wet-startup`. Hume now owns actual startup progress and bounded
DOM diagnostic facts in isolated `game-startup` at base `2991691`; no timeout
increase, skipped asset/WASM/storage work or automatic rerun. The partial-pail
packet `a0c32f4` passed Root and independent review and is integrated `c330675`.
The joined current physical/save format passed all4 actual-WASM vessel caller
laws plus strict installed types in `u4412`; the unchanged93-law source suite
was not repeated. Hume's actual startup reporting `7b17b93` + `8df3007` is
integrated `9007e90` + `3c411a9`: five real startup stages, main-body marker,
bounded art-group/count/rAF observations and plain loading text. Root reviewed
the original-art caller and removed per-texture DOM publication; bake geometry,
frames, cameras and yields remain unchanged. Reporter laws `u4409`, source
syntax/types `u4410` and final wrapper syntax `u4415` passed; Fallow `u4411`
retains eight broad startup/art caller advisories. This is not another browser
result or an identified startup cause.

The prior `u4344` at unchanged `09e813a` used the matching
headless-shell1243 and provisioned libraries. Browser launch and page navigation
succeeded; the first `window.__GOBLIN.artReady` wait timed out after60seconds.
No game inputs, assertions or screenshots ran. The page-error array was empty,
but the fixture did not capture console errors or loading text, so startup cause
is unqualified. Browser close completed, Vite exited143, both recorded child
PIDs disappeared, port5198 was clear and the owned scope inactive/dead. The
window was returned to Delivery. Preserve the two earlier before-page desktop
Chrome failures and the already-completed benchmark; neither is being rerun.
Its unknown startup cause prompted the later diagnostic-only fixture.

**Next physical composition:** the reviewed [field-water/vessel contract](field-water-and-vessel-work.md)
keeps one fixed original field baseline and one signed boundary total, with exact
removed-soil records and material water completing the joined conservation law.
Meitner's physical state/exchange/remap is pinned `cfd8456`, integrated locally
as `abcf9f8`. Seven new laws,35 affected laws and types passed in its owned
source packet; no new native/hosted result is implied. Root has added shared
closed-consumer admission: the recipe binds its exact initial stock and rejects
unpaired net water imports/exports. Goblin queries/mutations, the independent
Region and the wet worker all use that check. Three new consumer laws passed
`u4384`, including actual SQLite corrupt-checkpoint reopen; types `u4387` passed.
Four-file Fallow `u4388` completed with no duplicate/cycle/security findings;
existing unused content-ID and estimated worker-coverage advisories remain.
Root retains paired material/game admission. Partial pails use checked portions over
existing lot identities: drink1 from2, retain1, draw only1, then deliver2 to the
kettle. Kettle, gardening and hydration must share that correction. These are
accepted implementation boundaries, not completed pail/field gameplay.

The diagnostic fixture is pinned `696bd2a`, integrated as `f37c001` with the
previously reviewed launch/paused-restore setup. Runtime remains `09e813a`.
Root executed it once as `u4391` and returned the window. Hume completed the
shared partial-pail/material-portions caller change in
`/home/levi/src/hive-worktrees/vessel-portions`, branch
`engine/vessel-portions-20260909`. It retains the existing closed finite supply
budget; field sourcing is the later serial paired join. Meitner released the
physical files, accepted Root's implemented closed-consumer guard, and now
accepted the clean partial-pail packet. Meitner now owns only generic held-vessel
material import/export primitives in isolated `vessel-boundary` at `c330675`;
outward transfer must reuse exact debit and must not append a consumption sink.
Root retains units, actual field supply/reach and paired game/Region commitment.
Neither source chunk changes the frozen diagnostic runtime. The generated-room
read-only recut is complete: actual terrain supports the existing footprint and
collar; the [air contract](gameplay-air-owner.md) records the next shared producer
and its limits. Sol owns that bounded producer/Region/view implementation in
`generated-room`, branch `engine/generated-room-20260909`, base `2991691`;
original `air-view` is preserved and clean. Original air presentation remains
accepted as source only. Neither active writer owns Root's environment worktree,
the frozen startup evidence, shared Caps or a browser/build/deployment window.


**Latest measured correction, September 9:** the first full main-game workload
is retained at `goblin-wet` pin `4afe1c4`. `u4325` completed the frozen 20/80/60
tick benchmark, then failed before opening Chromium because `libnspr4.so` was
not on the browser child's library path. There is no input/render evidence from
that attempt. All owned processes and port 5198 closed; the shared window was
returned. The existing provisioned browser-library directory is recorded for
the next authorized child invocation; no installation or rerun was started.

The full-game 50ms target remains **unmet**: mean wall time per tick was
178.9/119.5/74.6ms; aggregate CPU per tick was52.5/40.8/31.7ms. These are a
shared-host run, not isolated browser capacity or per-tick p95 CPU. Separate
samples measured 20 field advances at 26.252ms CPU, versus 20 full 225-column
query passes at 587.054ms CPU. The samples are not additive profiling. Source
inspection found repeated world-description copying and schema construction
inside tile queries. `engine_core_pm` now owns that bounded query/projection
correction in `goblin-wet` after importing `9977f85`; unchanged physics, exact
outputs, invalidation and branch isolation are required. Another benchmark or
browser session waits for Delivery's release. Preserve the original failure.

The reviewed correction is now pinned `09e813a` and joined as `91d46ee`.
One private projection owns checked bounds, at most225 frozen cell facts,
changed/excavated column lists, solidity and the visual geometry key. Known
water-only changes share it; edits and fresh restores remain isolated. Water
facts use the admitted physical state separately, including when an external
caller reuses a mutable checkpoint object. Ten projection/codec/picking laws
(`u4334`), four actual-pawn/UI/isolation laws (`u4339`) and strict declarations
(`u4340`) passed. Fallow retained only existing exhaustive UI-dispatch complexity
in the inspected scope. The next benchmark retains the exact workload and
records the intervening deep-water source merge separately.

The corrected run `u4342` completed that benchmark on `09e813a`: mean wall
time per tick was 12.25/25.41/5.48ms for the same three workloads; aggregate
CPU per tick was 3.52/6.65/1.54ms. The 20 full-map query passes used 1.061ms CPU,
down from 587.054ms. A/B p95 wall times were still 117.76/58.21ms, so full
50ms/20Hz acceptance remains open. This is one shared-host sample, not a browser
frame-rate or population claim. Source hashes and both benchmark results remain.

`u4342` then exited1 before opening desktop Chromium, which also requires
`libcups.so.2`, `libcairo.so.2` and `libpango-1.0.so.0` beyond the provisioned
library set. All owned processes and port5198 closed; the window was returned.
Root's offline linker inspection found that the existing matching Playwright
headless shell1243 resolves every listed dependency with that same library path.
The next authorized attempt therefore uses it for the missing input/render proof
only. No benchmark, unchanged laws, editor test or install is needed again.

**Deep-water source checkpoint:** reviewed `905f170` is joined as `9977f85`.
The same generated-world excavation and finite stock owner now deepens an
existing vented shaft through real stone. One tagged record per removed voxel
distinguishes porous water-bearing soil from impermeable stone; stone exports
zero water and creates no fictitious pore node. Current format is v6 with no
predecessor reader. The actual 17-cell witness crosses y=0 while preserving the
same nonzero water stock, column identity, clock and reference total. Its31
hydraulic unknowns cover 29 porous nodes and two columns; the geometry limit of
32 cells per column is not a 32-cell hydraulic qualification. The 17-cell flow
refinement error is 0.180mm against the unchanged 5.4mm tolerance.

Final six deep/Region laws (`u4326`), 12 affected existing laws (`u4322`), strict
types (`u4323`) and the named actual-libcolony trench/save/soil-yield law (`u4329`)
passed. Root read the source and Fallow findings; retained contact complexity
and estimated-coverage advisories remain. This is source/Node SQLite evidence,
not a new native DO, browser or hosted result. Main-game stone items remain
gated until the real material/work caller joins them. The released water reader
now traces field-to-pail units and custody in ignored notes only; it owns no
concurrent material or main-terrain writer.

**Latest custody, September 9 (supersedes the staffing below):** King Bolete
owns the environment worktree, actual finite fuel/air consumer and integration.
Native `engine_core_pm` pinned the isolated `goblin-wet` worktree's coupled
main-game generated terrain/water migration as `151e60d` plus retained-bake disposal
`f73b94b`, joined as `e829c01`/`2b93cc8`. It owns the declared actual-game cost
measurement and focused input/render closure after the coordinated window.
The source includes immediate projection, save and command callers. All 225 map columns need the same generated geometry;
the current 32-cell soil patch is a bounded simulation capability, not the extent
of the map. The single registered frame supplies the actual surface datum.
This interim does not finish the accepted deep-vertical/world-coverage target.
The independent air owner and typed entry are settled; native `scene_document_review`
owns the separate `air-view` worktree's actual two-storey room consumer. Native
source review and the completed room numerical study are separate from Root's finite material join.
Wet UI source is reviewed/joined and awaits a coherent release. No retired Hive
Herdr role is refilled. Routine milestones and actual heavy-window closure go to
Botanical `delivery-lead` Shimeji; cross-owner decisions remain peer CTO work.

**Main join and computation checkpoint:** the current browser/Region tick publishes
one detached candidate across pawn work, extracted soil and finite water. Schema18
stores that generated-world checkpoint; the old authored edits and unsafe backfill
path are removed. Ten main pawn/Region laws (`u4242`), affected current-codec/picking
laws, strict declarations and three public Mycelium/Goblin laws (`u4261`) passed.
This is source/current-save evidence, not a new browser/native/hosted acceptance.
The old water deployment below is unchanged.

Root's `6912138` reuses admitted immutable water geometry through private weak
keys; unknown input still fully validates, cuts edit a fresh world, and every
advance retains the exact wire-size guard. Fifteen affected laws passed `u4268`;
the final guarded correction passed cache isolation plus exact40-step state,
facts and solver-work parity in `u4297`. In the predeclared32-cell adapter-only
workload, p95 CPU fell from15.743 to3.346ms before cuts and21.468 to7.011ms after
three cuts. Both meet that workload's25ms target; this does not prove the entire
50ms game tick, browser frame rate, field-only memory or DO runtime capacity.
Main benchmark and short build/input/render work are queued with Delivery;
expensive editor testing remains stopped. Fallow retains existing caller
complexity and the activity/routine cycle; no advisory was suppressed.

**Completed controller checkpoint:** the isolated controllers worktree supplied
public Mycelium authored operations through the
current Mule Effect/Stream execute path and actual Codemode/DO SQLite. Native
`u4101` passed lost-response/restart/replay, scope and one-effect laws. Installed
declaration closure now passes separately (`u4121`, `skipLibCheck:false`, pinned
maintained optional peers). The combined generated Worker and Node ambient
declarations still conflict externally (`u4106`); there is no shim or suppression.
The source packet is `7bb871a`, joined as `6cbe352`. No provider call or controller
backend deployment is implied. The actual Goblin delegated-player consumer is now
`70cc373`, joined as `edc3de6`: the same public module binds selected personal
orders and scoped observations to the actual Goblin region. `u4136` passed three
public binding/Node SQLite/actual-WASM laws, including paused order admission,
host-driven excavation and receipt replay; strict platform types passed `u4133`.
That evidence is distinct from the quarry's native execute sandbox and does not
claim a live model, independent player accounts or a deployed Goblin backend.

The native wet-region source/proof lane is complete and released. Wet UI source
`1886e10`/`4a36d8e` is joined as `4f9f9d5`/`3724cb5`: actual connected adjacent
and deeper excavation, explicit short wait, checkpoint reopening and atomic
worker publication. Its affected adapter/worker check, typecheck and build passed
`u4180`/`u4181`/`u4182`; no new rendered/hosted claim follows. Expensive editor
browser work remains stopped. Hive integration stays with King Bolete.

The environmental numerical clock correction `d0ab751` is reviewed and joined as
`7d134f6`; `u4102` passed 11 focused clock/connected-column laws. Root's current
world join derives all columns, capacity and contacts from edited terrain,
removes the single-pit and duplicate command-history owners, and keeps one stock
vector and clock. The original one-cut physical reference remains within its
unchanged tolerance (`u4107`, 12 affected laws). The actual generated 4x4,
32-porous-cell consumer supports two adjacent cuts and paired surface exchange
(`u4108`, three laws), including exact current-state reopening. This is source
evidence, not a newly rendered or hosted interaction. Independent review accepted
`1df187f` after removing the unused mutable world returned by the recipe; the
correction and explicit off-domain checkpoint rejection passed `u4131` (3 laws).
The reviewed local browser source now exposes the connected-column interaction;
the hosted release below still has its previously published one-cut behavior.

The published water study remains `4a6931c`, deployment `30835156`, at
`/wet-clearing.html` on the same preview. It supports one actual local dig and
finite seepage; 44 served files matched. Its physical local interaction passed,
but the screenshot budget expired, so no new rendered/narrow/hosted interaction
claim is made. Compact editor `8518cc5` is hosted by Botanical; expensive editor
browser tests remain stopped. Deploy less frequently; current source milestones
do not trigger another publication automatically.

**Actual deeper-water checkpoint:** sealed stone floors are now supported by the
reviewed `e6646d6` owner, joined as `9d35a35`. A sealed column has no fictional
porous-floor port, retains actual porous side contacts, and owns its real volume.
`u4138` passed 17 affected numerical laws. Root's `abc8ffd` joins it to the fixed
generated world: two adjacent cuts followed by removal of the lower soil voxel
expose actual stone and a 0.54 m floor ledge. The column keeps its identity and
water when deepened; capacity changes from 540 to 1080 litres. `u4146` passed 11
generated-world/region laws: finite downhill transfer, exact reopening and total
water error below 2e-9 kg. The predeclared six-second comparison with 0.1-second
steps stayed within 0.0054 m of column height. This does not establish arbitrary
stone digging, flooded sealed rooms, backfill displacement, long-time accuracy or
new rendered interaction. Native DO qualification and source UI join are recorded
below; main-game pawn/environment integration remains unfinished.

**World transaction source checkpoint:** the independent generated wet-world
RegionProgram now uses that existing owner. `u4122` passed 15 affected laws over
real Node SQLite: two cuts, water advance, exact receipt replay/reopen, separate
player/host grants and failure after state/event/receipt writes with complete
rollback. Those laws also retain the existing quarry and actual-WASM Goblin
checks after sharing their SQLite test owner. `u4128` passes application types.
The following native water proof now qualifies that separate host boundary;
neither proves the whole-game pawn/environment transaction. The local browser is
not the durable game host.

**Native water transaction checkpoint:** source `4b0874a` and result `754b65a`
are integrated as `32bffe2`/`8e206bc`. Strict Worker-only declarations passed
`u4151` with `skipLibCheck:false`. Actual local DO run `u4164` passed seven
checks: three real cuts through the two soil layers to stone, rollback after the
native receipt INSERT for both excavation and water advancement, and lost-response
process termination/reconstruction/replay for each operation. External read-only
SQLite observed committed receipts before acknowledgment and unchanged rows after
restart before any DO request. Final field time is six seconds, with 0.722594 kg
in the holes and 7680.570516 kg total water; residual 9.094947e-13 kg. All three
owned runtimes/listeners closed. The retained first runtime logged a broken pipe
during readiness; its cause is unqualified and the later physical checks passed.
No new wake scheduler, backend publication, cross-region exchange or performance
acceptance follows. The heavy window was returned to Botanical delivery-lead.

**Air selection:** use the retained qualified Boussinesq airflow and MC scalar
transport for the first fixed-volume, mildly heated, dilute-smoke brewhouse.
The [gameplay air contract](gameplay-air-owner.md) freezes its initial supported
envelope and remaining finite-fuel/building/vent joins. This reuses existing
numerical work; the newer sealed finite-gas experiments do not supply open vents.
No flame-temperature, oxygen depletion, compression or full thermal-energy claim
follows. The numerical owner, actual room consumer and rendered game remain
separate acceptance steps under the same engine goal.

**Finite room source checkpoint:** the extracted air owner `bcfde49` is joined
as `b007230`; its exact typed public entry `e436307` is joined as `d43af97`.
Nine focused runtime laws and the strict isolated type consumer passed separately.
Root's [actual two-storey room](../../src/world-presets/brewhouse-air/README.md)
uses the existing building query, one real stocked hearth lot, shared material
recipe settlement, field clock and Region transaction. `u4203` passed three
Node SQLite source laws for paid emission, partial-dose reopen/replay, rollback
and grants. Review's initial remaining-dose display correction passed the one
affected law `u4211`; the real public-type caller passes `u4221`.

The independent 504-voxel room study `u4207` is explicitly **exit 1**: opening
the upper shutter increased upstairs smoke exposure by about50%, instead of the
predeclared reduction. The single time refinement reproduced that change within
0.6%; source/stock/boundary balances passed. It establishes a reproducible harmful
air-path response under the declared approximation, not safe ventilation or smoke
clearance. Preserve the original failed criterion and both histories. No room
render, actor-health, main-game join, DO crash or deployed-air claim follows.

**Authored-room presentation checkpoint:** reviewed `033bf881`/`bfa76bff` is
joined as `d876871`/`c042f90`. Two worker laws (`u4302`) and final source/syntax
checks (`u4331`/`u4336`) passed. Its original Three-to-Pixi view consumes the actual
room's cells, finite fuel and shutter state, with optional fixed-scale heat/smoke
overlays. Plain-language actions and Celsius readings lead; numerical assumptions
and the failed ventilation criterion remain in optional technical details.
Unchanged kettle-fire geometry appears only while the real fuel is burning.
It has no browser/rendered-art or hosted acceptance yet. The room uses the
explicit foundation in `9c98db2`, matched to the numerical scenario; that authored
foundation is not the generated playable world's completed air producer join.

### Historical source handoffs below

The following dated checkpoints retain source and proof provenance. They are not
active staffing assignments or competing next-work queues.

**Active source handoff after `512c698`:** `engine_core_pm` owns the first actual
Goblin-region source join: `src/orders.ts`, new command admission schema/tests,
new `src/world-presets/goblin-region.ts`/tests and isolated `tools/engine-do/goblin-*`.
Existing Clearing codec/material/world and frozen Watchdog remain read-only to
that writer. The accepted ignored static-Wasm libcolony build (`u3919`) supplies
the optimizer readiness, not a substitute assignment algorithm. The first shape
must preserve paused admission and separate bounded host time advancement, then
prove actual pawn digging through the existing work owner. Root retains the
environment/voxel-water seam and serial acceptance/Git/deployment.

`asset_product_pm` independently owns the next full-editor source refinement and
real edit/undo/save/reopen/export trace. `512c698`, the accepted static review
archive and its normal/390 evidence remain frozen for Botanical hosting. Current
renderer/settings/import limitations are explicit; no shared-link service is
implied. A read-only supporting reviewer traces only the retained seepage adapter
versus current opaque voxel queries for Root; it owns no shared source.

**Public demo amendment, September 9:** Levi wants environmental demonstrations
inside Hive's voxel world. Water, soil, air/heat and terrain exhibits must share
the actual world geometry and applicable simulation owners, with ordinary visible
actions such as digging, opening a sluice or changing ventilation. Optional debug
overlays expose measurements; detached mathematical plots are supporting evidence,
not the public experience. A recording must remain labelled as a recording.
Do not paint an unrelated numerical fixture isometrically and claim a world join.

The next water interaction should make an actual world intervention change finite
water flow. The current browser labs replay reference output; world-lab surface
water is static classification. The accepted shallow-water boundary is
`.botanical/research/environment-round3-20260908/water/accepted-boundary-v3/`.
It supersedes the earlier optimization's admission/lifetime API. Its meaningful
finite-diversion tests use 0.1 m terraces; the method qualification reports wrong
flow across some 0.54 m transitions. Thus the current Hive ledge join is an actual
unfinished correctness requirement. Keep the reference and resolve the supported
voxel-world behavior before offering a live world-water demo. Neither changing
the display scale nor publishing a recorded result closes that requirement.
The small scene is an engine consumer, not a second water owner or a reason to
restart the full physics research programme. Botanical owns final site/host
publication; King Bolete owns its engine/art/source qualification.

**Newest native durability milestone, September 9:** the separate packed Watchdog
consumer passed strict workerd types (`u3906`) and actual local native-alarm
recovery (`u3907`). Independent source/evidence review accepted the exact frozen
packet in `.botanical/engine-do/watchdog-20260909-v2/`: queued work completes after
owned runtime restart, and a running job recovers after its physical commit while
replaying the same region receipt. External read-only SQLite observes each success
before any DO fetch, with zero constructor alarm repairs and no duplicate goods,
state or events. The first lazy-SQL adapter failure is retained in `v1`.
Alarm re-arm failure/retry exhaustion, outgoing-event acknowledgment recovery,
Goblin execution and deployed-host behavior are still unproved. This qualifies
these two local crash windows; it does not complete the overall durability exit.

Root also separated the current Goblin state codec from browser IndexedDB IO:
`src/clearing-state.ts` owns the existing validation/migrations and current state
encoding; `src/persistence.ts` retains browser IO and existing exports. Independent
review found no mechanical validator/migration drift; 61 focused laws passed,
then the final parser export passed two focused laws (`u3920`) and strict types
(`u3921`). Browser Continue still deliberately
pauses; live engine reconstruction preserves saved pause/tick/work state. Canonical
region state will exclude browser command diagnostics. This is a source checkpoint,
not a running Goblin DO. Existing material/transfer validator Fallow hotspots remain.

**Latest checkpoint, September 9:** the opaque voxel owner and material owner now
compose through `src/engine/region` in an independent quarry consumer. Root owns
these sources. Nine native SQLite laws passed (`u3868`); independent review
accepted scoped replay, detached candidates, atomic physical state/results/events
and persisted admission limits. The actual local SQLite DO trace (`u3865`) passed
rollback injection, explicit failed acknowledgment, two abrupt runtime restarts,
exact recovery and one-winner concurrent admission. Its retained evidence is
`.botanical/engine-do/quarry-20260909-v2`; a sanitation-only erratum removes
truncated ephemeral harness bindings from logs without changing runtime evidence.
No autonomous wake, hosted game backend or full-engine completion is claimed.

Native `engine_core_pm` now owns only a new packed Watchdog consumer under
`tools/engine-do`, separate from the frozen direct-transaction harness. The next
exit is durable queue admission and native alarm recovery without a player
request, including process loss between physical commit and host-job settlement.
Watchdog uses the same SQL owner and replays the engine receipt. Botanical's
replacement package hash is `00ca3f33f7eac8742555fec180bc5788afe414fc3f0ea5a6afa953282cde626e`;
Cairn remains `803c6e3a95290443ba0dcd22e73d3be95795e0dc356df82f0f8ceba554581f45`.
The docs-only correction is accepted separately from the original failed gate;
these ordinary local packages are not a registry release.

Native `asset_product_pm` independently inspects Levi's Fiend hosted editor
references against the existing Copper Familiar scene-document/viewer and public
Three.js editor source. The first source boundary follows that comparison;
Root retains shared-site/hosting coordination with Botanical. Private share-link
capabilities do not enter source, public notes or artifact URLs. The paragraphs
below describe earlier checkpoints, not overlapping active writers.

**Current checkpoint, September 9:** Game CTO accepted the bounded material
extraction recut2 after personal caller review and independent Sol review.
All 24 source hashes match the retained inventory. Reported evidence is 130/130
focused laws (`u3781`), strict types (`u3778`) and the actual five-unit ore depot
(`u3780`). Current Goblin validation uses the same physical-relations owner;
old checks are restricted to predecessor saves. Game CTO takes coupled source
and serial integration back from `engine_core_pm`. The checkpoint is on disk,
not hosted; shared work execution, care interaction and the full engine exits
remain unfinished. The retained Fallow factory/validator advisories remain open.

The current asset PM owns the independent portable viewer fonts/navigation fit;
its six-tool MCP document packet remains frozen for Root's local HTTP acceptance.
The old hosting archive is preserved. Root also owns the opaque world-storage
recut and its independent material-palette consumer. The paragraph below records
the preceding PM assignments, not an additional live writer over those files.

Botanical confirmed the two-PM shape. Native Astra-low `engine_core_pm` completed
the accepted needs/persistence repair packet and now owns the single coupled
material extraction, existing Goblin consumers and independent ore depot.
Native Astra-low `asset_product_pm` completed the accepted scene document/editor
checkpoint and now owns the original-pack schema/compiler/MCP caller join in
`src/asset-pipeline/**` and `tools/asset-mcp/assets.mjs`. The existing hosting
handoff remains pinned to immutable MCP `886d542` and its retained viewer package.
Both PMs acknowledged new bounded saved goals in their existing native Sessions;
neither completed an unfinished goal merely to replace it. Their source/caller
decisions, corrections and proof report to Game CTO. Supporting workers
and independent reviews share the real slot limit; do not occupy every slot
with another coordinator. Root Game CTO keeps architecture, original-art review,
serial source acceptance/Git/build/deploy; Botanical owns sites/shared Caps and
the separate MCP hosting route. Existing dirty source and parked sessions remain
preserved. No model switch is authorized before engine acceptance.

Every UI consumer, including labs/studies and asset tools, uses Caps. Botanical
owns the shared component source and editable source-registry direction. Hive
keeps its current packed public package until the agreed registry/package join
is released; there is no new shared writer or local Caps fork in this outcome.

**Latest joint direction, 2026-09-09:** finish deriving the reusable sandbox
engine from Goblin and prove it through actual game and independent consumers.
Shiitake integration is a core engine capability: scoped observations, controller
actions/events and durable results, as defined by
[Vishnu's many faces](vishnus-many-faces.md). The finite ore depot is the agreed
first independent material-owner proof, paired with existing construction and
shelf consumers. It is not an already extracted engine or a completed AI match.

**Launch amendment, September 9:** Levi requires a real Three asset MCP demo
alongside Copper Familiar for September 10. The first stdio client/tool/export
and rendered original-asset result is now implemented under `tools/asset-mcp`;
the maintained Streamable HTTP Worker uses the same operations. Botanical owns
remote `mcp.shiit.app/mcp` routing/deployment and site publication. Source/local
proof does not mean remote deployment. The checked 28-tool Fiend capability
target and next scene-editor cuts are in
[the asset MCP decision](asset-mcp-demo-and-scene-editor.md). Preserve the dirty
care/engine candidate; this released asset seam proceeds independently.

Game and Botanical CTOs jointly selected Copper Familiar's real rotate/cutaway/
floor interaction, a playable-clearing link and explicit launch signup as the
first polished marketing story. Root owns shiit.app/website and shared Caps;
Game supplies original art and reviewed consumer artifacts. Engine extraction
continues independently. A later Levi-versus-Shiitake resource challenge uses
one game state/action owner, real finite goods and a bounded server-side Camel
integration; it is not due tomorrow. Model terminals do not prove game results.
Polished ecology/water/air making-of stories retain their actual experiment
labels; private transcripts stay private and provider savings need measurement.

**Shallow digging and backfill are live**, runtime
`449e9b8a642dc1c9e6d815f8e7417c143ba1e574`, same-preview deployment
`ad099b8c-0c97-4432-bc8a-8ae92781a460`. Build → Dig/Backfill supports persistent
paused shared rectangle designations. Workers use a safe rim; each removed
0.54 m voxel creates one ordinary soil unit, and backfill carries/consumes one
unit through the existing material owner. Schema 14 retains terrain edits and
validates their soil balance. Existing authored clearings keep their layout.

Evidence: 89 actual-WASM clearing/persistence laws; four actual gesture/terrain
picking laws; typecheck and final build passed. Focused hosted `run-u3583`
physically dug two adjacent cells, preserved terrain/materials/actors and tick
through paused reload, then backfilled one cell with exactly one soil consumed.
Normal and 390px controls passed content containment; Astra viewed both hosted
screenshots. `run-u3584` compared 72 served HTML/JS/CSS/WASM files with the proved
dist, with no mismatches. Evidence is retained in `.botanical/digging/hosted-1/`
and `hosted-parity.json`. This does not claim digging inside holes, collapse,
flowing water, caves or large-world simulation.

Fallow `run-u3579` exited 1 advisory. The new terrain job planner was split by
rim eligibility, route, supply selection and ordinary transfer preparation;
unneeded new exports were removed. Remaining touched hotspots include save-version
dispatch, terrain work, command flushing and terrain face generation. Preserved
proof/static entrypoints, upstream exports and the existing activity/routine
cycle were not deleted to produce a green audit. The source/caller review and
focused behavior evidence establish this release; the audit is not claimed clean.

**Active next outcome: engine capability/execution boundaries, using shared
physical care as the next playable consumer before the first inn visitor.**
Levi's current engine/game audit is recorded in the
[Hive engine, asset pipeline and Goblin boundary decision](hive-engine-asset-pipeline-and-goblin-boundaries.md).
It separates reusable world/material/work mechanisms, original art packs and
bake/export, Goblin policy/content/UI, and eventual Fungi App authority. No package
move or backend is implemented by that decision. Correct the proven save defects,
then consolidate current endpoint/supply/execution consumers before care ships.
The next physical engine outcome remains useful tiny-map water/soil and room
ventilation; the asset workbench/MCP seam can advance independently at released
file boundaries. Do not restart broad numerical studies or discard the retained
needs candidate to perform this extraction.
The [current whole-game audit](current-systems-review-and-module-plan.md)
now owns the immediate repair order: two reproduced save/phase-policy defects,
then endpoint/capability/supply/execution composition before care publication.
The partial wood Store-save rule also exists in the shipped baseline; the
manual-rest-plus-thirst contradiction belongs to the dirty needs candidate.
One 0.86s actual-WASM diagnostic reproduced both, without production mutations.
The audit records the separate controls, render/contact and lifecycle outcomes
and which old owners must disappear; it does not restart the environmental labs.
Levi's current correction requires the capability/execution boundary in
[the unified work recut](unified-work-algebra-recut.md) before this candidate
ships. Shared inventory alone is insufficient. Existing care source, art and
focused-law evidence are retained; the next checkpoint removes the repeated
special-purpose activity orchestration using its current consumers.
The retained schema-15 needs/material/job checkpoint transferred from native Terra
to native Sol, then back to Astra when Sol terminated with an account usage-limit
error. Its source bundle and inventory are preserved at
`.botanical/needs/sol-limit-checkpoint/`. Astra is the sole runtime/persistence
writer. The needs-law author is now stopped at its retained checkpoint and all
source custody is back with Astra. Native audit/tool readers own only their
bounded ignored diagnostics. The HUD and focused proof sources are released.
Astra retains original art, final source/caller review, product decisions and
sole Git/build/proof/deploy custody.
No Herdr lane is refilled.
The old modified proof and 19 untracked files remain preserved.

## Product outcome and actual baseline

**Build a strange little home, change the land to support it, welcome a goblin,
and use the proceeds and discoveries to improve the place.** The first complete
playtest should contain choosing, building, watching, correcting and a payoff.
The 15×15 clearing stays small. Bigger scenery cannot compensate for a weak loop.

Production already has paused shared orders, work preferences, Draft/Go, upstairs
construction, local saves, common goods/transfer custody, mixed shelves, brewing,
and one-time carried-water establishment of mugwort. The plan's original baseline
was schema 13 at `bf12e99`; the current schema-14 digging release is recorded above.
Earlier delivery records distinguish local interaction from hosted byte parity.

The important gaps are visible in source:

- `brewing.ts:attendRecipeOutput` consumes ale and records a receipt, but nobody
  receives a drink benefit or hospitality outcome. Four malt and eight water in
  `finite-sources.ts` support only two batches plus establishing their two new
  mugwort plants. There is no sustainable livelihood yet.
- The digging release replaces implicit flat-ground support with canonical terrain
  queries and face picking. Logical storeys remain 0/1; opening and walking inside
  deeper volumes require the later topology/contact work.
- Beds remain ordinary route space, and the cat still chooses ground-only paths.
  The retained furniture/contact contract is relevant before overnight guests.
- `feed.js` supplies an initial demand and shelter approval. That is not yet a
  recurring physical visitor/storyteller loop. HUD guidance ends too early.

## What can be carried out of the labs

| Work | Established | Remaining game work |
| --- | --- | --- |
| World generation | Deterministic stepped geography, cave-feature and sparse-edit experiments, eviction/reload, bounded point queries; live browser World Lab | Terrain ownership in Clearing, edit-aware navigation/picking, compatible saves and a useful starting layout |
| Soil and excavation | One generated wet soil voxel removed with accounted wet spoil; real side/floor seepage; exact checkpoint continuation | Worker commands, physical spoil, connected hollows, backfill, field-to-pail units, browser terrain/render/save integration |
| Water motion | Separate shallow-water and native 2D wave reference behavior; recorded public playback | The bounded voxel-scale production model, spill/diversion and conservation across actual game edits |
| Air and heat | Recorded transport/plume experiments and narrower momentum/energy checks | Real openings, accounted fuel emissions, exposure, saved gameplay consequences and a bounded production update |
| Ecology and art | Mugwort water establishment in production; original animals, fire, foliage, brewhouse and mess studies | Environmental growth responses, physical guests/waste/animals; an art study is not its simulation |

The wet-pit experiment gained about 12.6 litres in 600 simulated seconds. It does
not demonstrate a rapidly flooding mine, connected ditches, backfill or player
digging. The full thermal reference remains incomplete and parked. Reference
restart overlays are uncompiled research. Keep all failures and accepted evidence.

## Release 1 — ground you can actually change

**Player exit:** designate a shallow pit or short trench while paused, watch a
worker dig from a safe edge, see real spoil and exposed earth, save/reload it,
and fill the excavation using actual available spoil. Publish the useful dry
dig checkpoint before waiting for flowing water; follow with backfill as a short
interim if needed. Do not call dry digging the complete environmental loop.

Deepen the existing world geometry owner. Base terrain plus durable edits owns
solid volume and exposed surfaces. Drawing, picking, build admission and movement
query it for their different purposes. A single `blocked` flag must not stand for
navigation, structural support and permeability. Editing a cell invalidates the
affected derived queries at one revision; neither the renderer nor minimap owns
terrain. The ghost, clicked face and admitted target must agree.

Use the reviewed metric: 1 m horizontal cells and 0.54 m vertical voxels; four
vertical voxels equal the existing 2.16 m storey. A shallow pit is not `level=-1`.
First work is from the rim, one voxel deep. Reject excavation beneath bodies,
active traversals, buildings, sources or loose goods until their displacement
rules exist. Backfill requires an empty, legal volume and actual material; it
cannot bury a pawn or erase fluid. Keep collapse, tunnelling and walking inside
holes out of this first release.

Dig completion settles one edit and its declared dry material yield together.
The materials owner creates/carries/stores spoil through the existing transfer
path. Establish the conversion from voxel volume to recoverable material once;
wet spoil later retains its water. Repeating a completion cannot mint more soil.

Use the same versioned terrain query/edit contract intended for generated worlds.
Existing saved clearings retain their authored flat base; loading never moves a
house onto a new seed. A generated starting patch is a later consumer, not a
reason to regenerate this map or abandon current saves.

## Release 2 — people with needs, then an inn for those people

Levi's direct correction is part of this plan: hunger, thirst and tiredness apply
to player characters and residents as well as guests. A customer cannot introduce
a one-off thirsty-guest flag. Social life is also a shared system, not a guest
approval counter pretending to be a relationship.

**First interim:** Rowan and Sedge need food, water and rest, satisfy those needs
through physical eating/drinking/sleeping, and explain their next action. Move the
current authoritative `Actor.rest` and its decrement/recovery callers into the
shared needs owner; remove the superseded representation as consumers migrate.
Add real edible starting rations and a finite replenishment route with the feature.
Do not activate hunger against a world where nothing can be eaten, or consume the
last establishment water before a player can reasonably learn the system.

**Guest interim:** a goblin with the same applicable needs physically arrives,
eats/drinks, uses a suitable bed, socializes and leaves a useful, finite barter
reward. A co-presence interaction creates a remembered reason for an opinion.
The player can inspect why the guest enjoyed or disliked the stay and improve it.

This closes the existing brewing loop before adding more production machinery.
Extend definition-owned creation and the existing actor/work owners for a guest;
do not introduce a separate guest simulation. Use the furniture-contact decision
for an exclusive bed slot, legal entry/exit and ordinary body occupancy. Apply
its geometry to bed rendering so floors and sleepers no longer disagree.

Needs describe physical state; preferences affect choices; mood summarizes current
conditions and memories; directed opinions/bonds describe relationships; hospitality
tracks a visit and its terms. Keep these separate. Guest, resident, prisoner and
human/LLM controller change access and policy, not the identity or physical needs
of the person. Need definitions declare applicable bodies, rates, thresholds and
supported satisfiers. New supported food is a definition over ordinary consumption;
a genuinely new physical effect earns a typed primitive.

Use existing work/movement/contact/material ownership for self-care and assistance.
An urgent need requests a safe work interruption; it cannot erase carried goods or
reservations. Draft suppresses ordinary automatic self-care but never freezes
physiology; display the unmet need. Hysteresis and cooldowns avoid eat/work/eat
thrashing. Update on the authoritative clock at bounded, staggered intervals,
never one timer or LLM per need. Generous early rates should support long stretches
of choosing and watching. Routine food/water/bed access should automate maintenance.

One hospitality outcome follows actual served material and completed services.
Cancelled service, a missing bed or repeated save/reload cannot award a successful
stay twice. First barter can replenish a declared finite amount of malt or useful
supplies; an arriving guest's stock is an explicit external arrival, not automatic
cache refill. Alcohol's nourishment/hydration, enjoyment and intoxication are
separate authored effects; ale is not silently the universal thirst solution.
Full money and faction politics are not required. Preserve a manual Serve action
with clear recipient/status; self-service checks the same stock and permission.

First social content is a shared meal/drink, friendly conversation, disagreement
and a visible memory. Resolve only bounded nearby opportunities with persisted
randomness and cooldowns. A shared meal requires two actual portions and compatible
places; its social success follows attendance and consumption. Relationship
values are derived from applicable memories and durable bonds, not an independently
incremented guest score. Friendship can inform a later invitation; recruitment
remains explicit. Marriage, rituals, custody and courts use these foundations
later. See the current needs/social source study in
[living-world-system-contracts](living-world-system-contracts.md).

Extend the familiar's existing guidance into real shortages and next actions:
where the pail is, why growth waits, what the next batch needs, and whether the
guest can reach a bed. Keep guidance derived from the world rather than a second
tutorial progression simulator. Offer a small starter layout as a New Clearing
playtest option only if it removes setup repetition; do not rewrite existing saves.

## Release 3 — a garden whose water you can manage

**Player exit:** collect water in a hollow, cut a short channel to move it, fill
the existing pail there, and drink, establish plants or brew with it. Then connect soil
moisture to one clear growth decision: an adequately wet bed helps; a waterlogged
bed can be worse. Add one useful food crop through the shared cultivation rules
when this replaces reliance on arrival rations; no second herb-specific lifecycle.
Good layout reduces repeated hauling rather than adding chores.

I own the water/world integration decision. Start with conservative cell/face
transfers near the actual voxel scale, finite initialized water and explicit
boundaries. Prove adjacent hollows, an opened/closed channel and overflow in the
same production module before its playable join. Outdoor hollows may explicitly
use vented atmosphere; they do not wait for sealed cave pressure.

Resolve physical units first: current water goods use positive integer portions,
while the soil reference uses kg/litres. Define the physical size of a portion and
preserve sub-portion field remainders. One atomic draw/pour operation moves water
between field and vessel; no rounding it away and no second source inventory.
Extend conservation from the old finite-spring assumption to field + pore water
+ vessel + wet spoil + declared consumption and boundary exchanges. Existing
pail/Haul/plant/kettle consumers keep their owners. Environment-fed establishment
uses the same plant transition; it must not also debit a carried-water operation.

Start updates every two/four existing 20 Hz game ticks (10/5 Hz), with bounded
stability work and slower soil updates. These are targets to measure, not achieved
performance. Cosmetic interpolation can be smoother without moving physical stock.
Choose authored permeability/rates for readable gameplay and state that scaling;
do not tune against centimetre-grid or millimetre-wave accuracy.

## Release 4 — a brewhouse that changes its indoor environment

**Player exit:** brewing downstairs warms the house but smoke can spoil the loft;
opening a high vent or changing the layout measurably improves it. Temperature
and smoke overlays explain why. A first consequence can be poorer rest, reversible
by ventilation, before adding suffocation or lethal fires.

Use the same placed geometry and explicit face/opening facts. Shelter flood-fill
currently treats doors as sealed while movement treats them as traversable; it is
not an airflow solver. Define actual door/vent state for environmental queries.
Start an ambient-backed, low-speed voxel model with stated outdoor exchange,
not an assertion of fully compressed gas or accurate chemistry. Model smoke as a
transported gameplay constituent, separate from temperature/energy.

Fuel settlement owns one finite emissions budget. Current brewing consumes fuel
at preparation completion; heat before that point requires changing the process
settlement deliberately, not silently charging wood twice. Pause, interruption
and reload preserve remaining fuel/heat/smoke budget. The room renderer only reads
conditions. This also establishes the owner later used by greenhouse heating,
compost heat, fire and dwarven vents.

## Next after those releases — depth with a reason

1. **A productive garden cycle:** redirect spent grain into one compost process
   and use the result on one crop. Add a renewable crop input or tree regeneration
   only with a real production consumer. Separate moisture, fertility and heat;
   saturated is not automatically fertile. Shared process/material/lifecycle rules
   should replace special cases as a second supported consumer lands.
2. **A useful basement:** one traversable lower room with a safe stair/ramp and
   return route, followed by a small generated cave. This earns headroom, signed
   vertical coordinates, access and water hazards. Collapse needs its own readable
   warning, support and rescue rules; it is not a surprise side effect of Release 1.
3. **A living rhythm:** a modest ordinary storyteller schedules physical visits
   and a small weather/supply complication with recovery time. A familiar chess
   match offers optional downtime play. LLM intervention, tarot recruitment and
   the visitable purple realm remain later consumers of real outcomes and travel.
4. **Expand only after home works:** start a new tiny clearing on a chosen patch
   of the existing generator, with an authored safe home site and preserved edits.
   Then earn one nearby outing and return. Keep global atlas/caves/LOD work bounded
   until that consumer needs it; no planet population or seamless multiplayer claim.

These are an ordered follow-on horizon, not parallel assignments now. Retained
forests, fungi strains, animals/beavers, food chains, hygiene, pipes/automation,
kingdoms, religion and AI players still fit the existing contracts. They do not
all become prerequisites for making the inn pleasant to play.

## Why this sequence uses the studies

RCT contributes inspecting and improving a place; RimWorld/Prison Architect/DF
contribute shared work and understandable commands; Stronghold contributes layout
and production; ONI contributes visible causes and environmental tradeoffs;
permaculture contributes persistent water/soil interventions. Diablo/Darkest
Dungeon contribute preparation and a meaningful return home once there is a home
worth returning to. Chess/tarot supplies characterful downtime later. These are
design lessons from the retained studies, not claims that all those games or their
algorithms were exhaustively studied.

## What the first playtest should feel like

The first ten minutes should offer a useful place to dig/build, an understandable
food/water/rest decision, visible work progressing and something the player can
finish or improve. A complete two-storey house is not the entry fee for seeing a
payoff. A first meal/drink and growing plant can land before a full inn does.

By roughly half an hour, aim for preparation, one physical visit, an understandable
problem or preference to address, a remembered social outcome and a reason to
improve the next visit. Those times are pacing hypotheses, not an enforced raid
timer. Fermentation and ordinary work leave room to plan, inspect the garden and
socialize; later chess adds optional play during that downtime.

After each release, judge whether Levi can identify the shortage without us
explaining it, make a layout or policy choice that changes the result, correct a
mistake, and return to a useful saved world. If the answer is no, correct that
slice before adding another obligation or a larger map.

## Architecture and delivery rules for this plan

Each release has one coupled production owner. Reuse `orders` for admission,
`jobs`/libcolony for assignment, `movement` for traversal, `materials` for physical
custody, and the fixed `step` for time. Deep modules own terrain edits, field
exchange, contact and outcome settlement where those decisions now lack an owner.
Definitions supply supported content. A third haul path, render-owned physics,
parallel inventory or generic framework is a failed implementation shape.

All derived views use the same world revision. Saves retain canonical facts and
strict relations; caches rebuild. Preserve current valid saves with explicit
migration at each actual schema change and raw recovery. The old v1–v6 readers
remain prohibited. Gas and water stock on a boundary need a named disposition;
chunk eviction never drains a pond or refills stock.

Review the first working source and caller before adding polish. For each release,
check cancellation, retry, pause/reload, quantities and touched spatial conflicts;
read Fallow findings on the changed modules. One short real-input trace and normal
preview parity follow. Reuse existing evidence; no repeated complete-house build
or expensive reference run. The live lab becomes a small debug view of the actual
production module when that module joins; recordings retain their honest labels.

Performance acceptance targets the actual two-resident clearing doing useful work,
with a guest and active environmental patch as introduced. Measure simulation,
field update, render/input and save cost separately. Begin with few-millisecond
field updates and check tail latency under edits; report misses rather than
claiming capacity from idle cells. Rust/WASM is available for an observed hot
kernel after measuring this workload; a language port is not a release goal.

## Custody and the next action

Levi's 2026-09-09 instruction puts this plan and returned source decisions with
Astra personally. Delivery returned the settled handoff at `bf12e99`: world-lab
released its nine-file committed slosh boundary; deconstruct-pm released the
committed ecology/main/HUD boundary; game-systems-pm has no remaining dirty docs.
Their sessions are parked and preserved. Delivery found no running proof/build/
deploy subprocess. The unrelated modified `scripts/prove.mjs` and 19 untracked
files remain untouched. Levi then explicitly requested all-work takeover and
native Codex implementation. Delivery acknowledged release of Git/build/proof/
browser/deploy custody too; Astra is sole integrator. Native Terra core and controls
writers plus a read-only Sol reviewer completed digging; current native custody
is recorded above. Astra owns original geometry/art and integration. No reference
CFD simulation resumes.

Release 1, shallow editable ground and safe backfill, is complete. The next
implementation brief is **Release 2, shared physical care**, with the specific
source and provisioning decisions in the needs/social contract. Subsequent lanes receive one
accepted outcome and exact files, not the whole horizon. Personal playtests after
each release decide refinements. No calendar ETA is credible before those first
working shapes; each useful interim ships independently on the same preview.

## Historical sprint decisions retained below

The following 2026-09-08 and older sequences are superseded by the current plan above.


## Current sprint: a small home worth returning to

Game CTO reviewed direction, 2026-09-08. This section supersedes the historical section and evidence retained below. It is sequencing direction, not a new source, proof, deployment, cost or deadline claim. Delivery's exact revision/release records establish what is playable.

**Outcome:** on the deliberately tiny map, the player can confidently place and inspect things, organize real supplies, make an honest brew, leave people working, and return to a useful result. A separate responsive map lab proves future geography without making a larger world the substitute for a satisfying home. Ship coherent improvements on the same preview as each becomes ready.

Current Delivery checkpoint `48dced7` has shipped the strict schema-12, repeatable
herbal-ale loop on the feature preview: finite inputs, station construction, pail
fill, preparation, fermentation, kegging, four attended servings, spent-grain
clearing and a second batch through the same physical custody. Serving currently
records a durable batch receipt but grants no personal inventory or needs effect.
The next coupled consumer is one-time mugwort establishment by carried water; it
does not wait for regional fluid simulation. The same checkpoint publishes the
recorded native gas/heat playback lab with explicit non-live labels. Levi's newer
Game CTO water, gas/heat and world-generation work remains isolated under
`.botanical/research/environment-round3-20260908/GOAL.md`; those experiments are
not retroactively represented by the older public recordings and do not expand
the live clearing or tracked physics runtime.

### Preserve current work and name its limits

Continue the existing controls/visual-geometry/picking correction and independent responsive World Lab work with their current writers. This reconciliation does not reopen the stopped upstairs house-building marathon or move active authors. Selection, persistent designation, direct orders, Draft/Go, level controls, view occlusion and physical contact remain distinct decisions. The intended click, preview and submitted target must agree; transparent sprite padding cannot intercept distant ground.

The retained Maps baseline describes diagnostic overview/local views sharing a geography recipe. A candidate worker or navigation diff is not hosted evidence. Keep exact selected-cell inspection distinct from approximate overview samples, signed coordinate and chunk-order invariance, bounded cancellable generation, stale-result rejection and explicit buffer ownership. World Lab neither owns the playable clearing nor overwrites its save.

The actual-clearing minimap remains a small independent consumer at the next safe HUD/camera handoff: show real people, structures, selected level and camera extent; click recenters the camera without jobs or ticks. Do not give it a second generator or duplicate game state. Loaded terrain is not discovered knowledge. Later committed edit/tombstone → decoded-data eviction → regenerate/reload is a separate lab proof; actors/cargo crossing live chunks remains deferred behind tiny-map playability.

### Audit and consumer precedence

The accepted `u1567` Fallow run was a stable dirty-worktree scan, not a clean
`071a59e` audit. Preserve its scan-vs-HEAD distinctions, finding counts and
static-estimate labels; exit 0 is not a no-findings claim. The next landable
schema-v7 migration is coupled: after the isolated helper, migrate **both wood
and herb** transfer branches and validators, never an herb-only durable
intermediate. Keep materials laws in the ordinary required test command when
the runtime joins.

The brewhouse remains isolated authored art with local served interaction and
verified hosted HTTP byte parity; that is not a gameplay/build claim. Mixed
storage is complete only when stored wood can withdraw into ordinary
construction through the same owner. Bed contact stores provider, slot and phase
only, never a movement path or `leg`; Go waits or rejects while contact clears,
and historical overlap/egress remains proposed. The dead brewhouse bake anchor
and needless factory exports are separate narrow future cleanup; packed Stipe
remains a required Caps dependency.

### Playable packets and dependencies

| Packet                                        | Dependency and owner boundary                                                                                                | Player-visible exit                                                                                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trustworthy controls and spatial presentation | Current writer remains; reviewed geometry shared by actual picking/diagnostics, separate from simulation support/path policy | Select the visible intended thing, access Ground/Upper with buttons/keys, keep compatible tools armed, inspect without covering essential controls, and understand who stands in front/behind.                   |
| One goods/transfer owner                      | One coupled work/material/save writer; serial view/HUD handoff                                                               | Existing wood construction supply and herb shelving both reserve, pick up, carry, deliver, wait, drop and resume through the same laws. Save interruption preserves identities and quantities.                   |
| Mixed storage                                 | Full wood/herb migration closed; reuse its location/capacity/claim owner                                                     | One shelf holds multiple permitted goods, shows a simple grouped list and remaining capacity, and explains a rejected/full destination. No backpack puzzle UI or duplicate contents store.                       |
| First brewing                                 | Delivery records actual recipe, acquisition and economics; mixed storage and common transfer are usable                      | Obtain finite inputs, stage them at a real vessel, perform visible preparation, do another job during fermentation, then collect or serve exactly one batch through ordinary goods custody.                      |
| One ecology consumer                          | Brew/home play feedback; reuse the actual vessel/transfer/process seams                                                      | Establish one newly sown mugwort plant with a carried-water delivery: “needs water” becomes growth, then a useful harvest returns to storage/brewing. No recurring chore loop without evidence it improves play. |

These are serial gameplay dependencies, not a fixed calendar or a mandate to finish every row before publishing. Independent map/art/research work can proceed without broadening the coupled candidate. Delivery gives estimates after a useful first source/caller checkpoint.

### Historical goods-migration wording (superseded by the audit disposition)

The first source checkpoint can fully move existing herb Store through a generic transfer owner, with quantity splitting and destination promises designed for the immediate wood port. It does not satisfy completed unification. Then construction uses the same owner for partial wood pickup, supply, cancellation, embedding and salvage. A third beer hauling implementation rejects the candidate.

Preserve meaningful differences as data and explicit outcomes: wood carries up to its current two units, mugwort retains whole-bundle identity; supply delivery advances construction while storage delivery finishes its step. One transfer retains the destination obligation across reserved/carrying phases. Continued cargo precedes new automatic work, while personal/shared priority, Work flags, Draft interruption and actual libcolony matching remain intact. Claims never count as physical stock. Clearing an activity must not accidentally erase a live transfer.

Delete authoritative runtime `piles`, actor `cargo`, `claims`, `herbBundles`, `herbStorageClaims` and `Site.delivered`, plus the separate pickup/delivery/drop and material-validation branches they support. Their new lots, containers, transfers and embedding ledger have one synchronous mutation owner. Read-only display selectors are acceptable; writable legacy mirrors are not. Old wire fields remain only for historical save conversion. Plant development keeps its own validation, not a generic bag of optional fields.

Keep strict v1–v6 parsing/rejection before deterministic conversion and validate the resulting new schema. Preserve paused restore, job progress, path/leg, scope/priority, raw recovery and no write merely from load. Old identities are only unique per collection: reserve existing herb identities, remap colliding wood/synthetic IDs deterministically and rewrite references/allocator together. Handle valid empty wood shells deliberately. Preflight teardown/refund placement before deleting its source. Per-material live + embedded/transformed + sink balances must remain equal to production; a single combined “item count” is insufficient. **This v1–v6 wording is historical; the next durable landing is schema-v7 for both wood and herb after the isolated helper.**

Mixed storage then selects one explicit bounded capacity policy, compatible grouping/stacking rules and visible contents representation. Capacity, carry limits and liquid containment are different policies. Existing goods exercise the first mixed list; future filtering/priorities and automatic storage demand enter only when separately needed. It must not silently make every shelf an unlimited vessel.

### The first brew is settled; preserve its shared owners

The shipped herbal-ale definition consumes two malt, two contained water, one whole mugwort and one fuel wood; it retains one barm and one physical keg and produces four ale servings plus one spent-grain tray output. Preparation and kegging are attended Craft work, fermentation advances on the authoritative game clock, and serving/clearing are definition-owned output actions over the same durable process and material receipts. The finite cache and spring provide actual inputs; no proof-only stock or completion-time keg is conjured. Mugwort supplies flavouring, not fermentable grain. The MF DOOM reference remains named inspiration, not a settled second recipe.

The station cannot disappear while inputs, process or output remain. Serving does not yet create a personal inventory or needs benefit: the batch ledger and physical output settle truthfully, and a future accepted consumer may use those servings through the same goods owner. Adding a second recipe should be definitions/assets over the checked slot, timing, retained-input and output-action mechanisms; a genuinely new physical behavior earns one typed primitive rather than another scheduler or material path.

Recipes over supported operations are versioned definitions/assets with checked references. New physical behavior earns a closed typed operation and invariant; no arbitrary callbacks, universal job engine or additional scheduler. Pin in-flight semantic recipes so changing configuration cannot rewrite an existing batch. Demonstrate a second recipe as data only when it is a real accepted playable recipe, not filler created for a test.

### Original brewhouse and authored structure research

Astra is personally authoring reusable original two-storey brewhouse art and a scene template. Its optional visual study proves appearance, reusable prop/room composition, levels/cutaway and readable workstation placement at native/game scale. It may portray a composed example; it does not claim that the simulation gathered materials, constructed it, brewed there or generated a village.

The reviewed [authored-building procedural assembly study](authored-building-procedural-assembly-study.md) verifies Minecraft Bedrock template pools/connectors and creator-described Gungeon/Isaac authored-room composition, with explicit edition and source limits. It supplies the bounded building-template contract; no runtime assembler is implemented by that research. A future runtime room template uses relative cells/levels, direction, entry/access and support requirements, versioned content references and fresh instance IDs. Player stamping calls the existing construction/admission owner and exposes conflicts/costs; it cannot inject finished sites or bypass jobs. Generated settlement initialization is a distinct one-time creation cause for finished structural/semantic records. It additionally needs site suitability, stable instance identity and canonical feature ownership across chunks; regeneration never replaces player changes or refills contents. Those runtime consumers are not prerequisites for publishing the isolated brewhouse study, and a successful study is not their acceptance.

### What the studies support—and do not prove

Retained RCT, Stronghold, RuneScape, Diablo and Darkest Dungeon notes support readable cost/commit/response, physical production and preparation/return rhythms. The colony-control studies support separating selection, designation, direct work and drafting. Coverage is bounded: no comprehensive DF/Prison Architect review, RimWorld right-click evidence is largely mod-author material, detailed shelf behavior is not uniformly primary, the Darkest Dungeon talk was not watched, and RuneScape/Don't Starve editions are distinguished.

ONI/RimWorld/Dubs notes support coupled conditions, overlays and service tiers, not a verified current solver. Water-history, compost and beaver research offers conditional, site-specific mechanisms and tradeoffs; it does not establish universal restoration, safe treatment or greenhouse performance. Millison material was selectively read rather than all videos watched. Minecraft/RimWorld landform studies separate deliberate shape, density/cave geometry and ecology; generation-time aquifers are not a live fluid solver, and planar roof grids are not stacked Hive volume.

Thus the proposed first ecology addition is one finite-source, physical-vessel watering operation for plant establishment. Confirm representation after brewing, explicitly migrate existing plants, and show the limiting condition. Regional flow, groundwater, gases/heat, fire, sewage/compost, climate, perennial forests, animals/beavers, caves, realms, tarot, factions and multiplayer remain durable future direction.

### Prove usefulness, deletion and cost

Review actual handlers and immediate callers; retain visible Fallow findings and remove superseded paths rather than hiding complexity. Use focused deterministic laws for competing source/capacity, partial/whole pickup, interruption, teardown, corrupt/old saves and exact output settlement. One short real-input trace through the changed loop plus exact served parity is sufficient; preserve prior failures and scope limits.

Measure useful work separately: candidate/path/matching/commit counts and times, input/HUD/render/save costs, and map generation/assembly/draw/resident/in-flight/scratch bytes. An optimizer microbenchmark, lab map or offscreen sprite does not prove 100 active people or offline simulation.

Ask Levi: can he understand and correct a shortage without explanation; do the first ten minutes offer meaningful choices; is watching work satisfying; does storage reduce friction; and does fermentation create useful downtime rather than waiting? Return to those answers before adding area or chores. Delivery retains serial Git/proof/publication and visible PM outcome ownership; Astra retains architecture/product and changed original-art review. No extra management framework or blanket art gate for routine source work follows.

## Historical status and prior plan

Status: Game CTO reviewed direction for Delivery publication, 2026-09-07.
Authority: Levi requests review of all plans and a separate large-world generation
page before permitting gameplay expansion. This supersedes automatic
home → upstairs → caravan sequencing; it preserves the active upstairs writer.
Source baseline: shipped feature 765c3282982d2ee6b07d5bea67bc21d08e4c2011.
The inspected worktree also contains unaccepted upstairs changes. No source,
build, performance test, world page or deployment is claimed by this ADR.

## Decision and committed sprint exits

Keep the 15×15 game as the place to judge whether ordinary play is satisfying.
Separately prove that its next world substrate can scale. These are independent
release tracks with one Delivery owner and serial integration, not a map-size
increase concealed inside a home update.

| Outcome                                          | Concrete exit                                                                                                                                                                                                                                                        | What that establishes                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Finish the active upstairs bedroom               | Gather its actual materials, build legal stairs/floors, carry material up, build and sleep in the upstairs bed; block the sole approach; pause/reload an in-progress traversal/work state. Review actual floor picking and stairwell cutaway.                        | Shared topology, work positions, resource custody, interruption and save across levels.                 |
| Publish a separate `/world-lab`                  | Generate a seeded large region overview, inspect it in the original isometric presentation, pan/jump across signed chunk coordinates, regenerate in another request order, and inspect generation/frame/residency measurements. Gameplay stays on the tiny clearing. | Deterministic terrain generation, coordinate/projection consistency and bounded generation/render work. |
| Establish a real simulation performance baseline | Run the actual simulation, routes, claims and selected WASM optimizer with 5/25/50/100 actors under useful workloads. Record outcomes and phase costs separately from browser display costs.                                                                         | Where population scaling actually costs time and memory; an evidence-based next optimization.           |

These are the sprint's committed proof outcomes, not a calendar guarantee that
all future foundations can be delivered in five days. Delivery estimates the
World Lab after its first actual generator/caller checkpoint and reports coherent
interims on the same preview. A measured shortfall is a finding to fix or a
supported workload limit to disclose, never a successful capacity claim.

The next playable slice after upstairs remains **beer brewing**, with mixed
shelf storage only as its necessary goods consumer. Its readiness contract can
advance independently now; its runtime starts when the coupled home writer is
free. Do not require world expansion or completion of unrelated lab work before
brewing. Do not bundle a brewery, caravan, fluids, multiplayer and a new inventory
framework into the current upstairs candidate.

## Findings from plans and actual source

1. **World-scale architecture is specified but unexercised.** `world.js` still
   owns SIZE=15 and finite inside/blocker scans; `art/scale.js` centres projection
   on SIZE; the cut-earth `art/clearing.js` bake is one authored board. The current
   game cannot become streamed simply by raising SIZE. The lab should establish
   a real reusable terrain/coordinate consumer before changing gameplay topology.
2. **Population capacity is unmeasured.** `jobs.ts:assignWork` already batches
   assignment behind workDirty and uses the actual optimizer; that is valuable.
   Its nested actor/job/pile/route queries and per-actor blocker derivations still
   need whole-workload measurement. Limiting emitted matches does not itself
   bound the work spent searching candidates. The isolated small optimizer probe
   is not a 100-person simulation benchmark.
3. **Historical storage finding (superseded by the coupled v7 disposition).** `model.ts`, `jobs.ts`,
   `activity.ts` and persistence contain a separate mugwort bundle/storage path
   beside construction wood. Another item kind should not require a third copy
   of the whole claim/pickup/carry/store chain. Brewing earns a narrow goods and
   capacity owner; the old proposal that construction wood can remain on its
   existing path is historical. A shelf is a mixed grouped list, not a pack
   grid. Bulk/weight/filter policy and exact capacities remain proposals.
4. **A timed workstation process does not exist yet.** BUILDINGS is construction
   data, and herb growth is a specific fixed-tick owner. Brewing should establish
   one recipe-driven batch whose consumed inputs, work, fermentation and output
   survive interruption/save. The actor can do something else while it ferments.
   New recipes over that supported behavior should be data; new behaviors still
   extend explicit typed owners. No job DSL or universal actor state machine.
5. **Save and display surfaces need a focused deletion review before new goods.**
   `persistence.ts` has historical schemas plus substantial relational invariants;
   HUD projection manually maintains identity across many entity fields. Keep
   boundary Zod and legitimate custody checks. Classify scheduler/display caches
   before persisting more of them, inspect all consumers before removing fields,
   and measure panel commits before changing selectors. Equal-tick outcomes and
   focus behavior, not line-count targets, decide acceptance.
6. **The roadmap mixes historic and current status.** PROTOTYPE still names the
   old two-person goal/schema; Architecture and the living-world ADR still have
   automatic caravan ordering and old source custody in later sections. The new
   record should mark those sequences superseded and update the top-level current
   baseline without erasing historical evidence or old advisory dispositions.

No evidence from this pass justifies adding an ECS, Effect migration, a second
optimizer, a generic event bus or a new state-management library. Existing
Jotai/XState/Zod have explicit owners. Revisit a maintained primitive against an
observed missing capability or cost, not a library checklist.

## World Lab: first working scope

Use a distinct page and separate local world namespace. It must not import the
Clearing scheduler, overwrite the game's save slot, spawn playable actors or
change live build/path rules. Its new terrain module is production-intended code
with this page as its first consumer; it must remain usable without Pixi/DOM so
the later game and a future host can use exactly the same generation rules.

- Expose seed and generator version, a 512×512 region overview first, and a
  1024×1024 diagnostic preset after the first bounded measurement. Overview pixels
  describe sampled terrain; they are not hundreds of thousands of scene objects.
  Changing seed/region cancels or supersedes queued generation. Report real time
  and buffer counts; never preallocate the entire signed world coordinate domain.
- Start with the documented 16×16 chunk candidate and global signed coordinates.
  Use mathematical floor division, stable feature ownership, and coordinate-based
  randomness. A seed/generator-version change changes the generated world identity.
  Compare exact chunk bytes/checksums across opposite request order and unload/
  regeneration, including x=-1/local15 and a distant coordinate jump.
- Layer elevation, moisture and terrain classification from one deterministic
  sampling recipe. Show diagnostic layers beside the composite isometric view.
  A water mask is terrain classification, not flowing water, drainage or a fluid
  simulation. Do not claim caves from a surface height map. The first sampler
  does not dictate the eventual volumetric excavation representation.
- Render only camera-intersecting chunks plus bounded overhang; use a bounded
  resident window/cache and a bounded generation queue. Choose counts from the
  first source/viewport measurement (a 5×5 window is a candidate). Separate
  rendering disposal from decoded terrain residency. Preserve cross-chunk prop
  sorting and visible canopy overhang; one monolithic ground bake cannot tile.
- Exercise origin-relative projection and inverse picking with the same helper
  intended for the game. Do not duplicate the fixed SIZE transform. Coordinate
  extraction into a shared caller is serial with the upstairs camera owner;
  independent terrain/worker/page files can proceed first.
- Prefer existing maintained noise/platform primitives for commodity mechanics;
  inspect the selected implementation and license before adding a dependency.
  A single native Worker is a candidate for generation responsiveness, with a
  bounded request queue and stale-result rejection; no worker-pool framework.

First checkpoint: adjacent positive/negative chunks, one seed, one inspectable
layer and correct pick round-trip. Then overview/camera culling and measurement;
then original seamless terrain presentation reviewed at game scale. Publish
useful intermediate results rather than wait for final scenery variety.

An optional follow-on inside the isolated lab is one diagnostic terrain edit or
feature tombstone, saved into a separate IndexedDB namespace and recovered after
actual decoded-data eviction and page reload. It must use the intended base+
patch shape and commit-before-evict rule. An in-memory repaint surviving a camera
pan is not durable edit proof. This checkpoint may ship separately; it does not
add gameplay and is not required to finish the first world-generation page.

## Measurement that can falsify the plan

For the World Lab record browser/device/renderer, revision/seed, generation time,
frame intervals during continuous pan, input response, visible/resident chunks,
explicit terrain/texture bytes and allocations/disposals. A repeated out-and-back
journey must settle to the configured cache budget rather than retain every
visited chunk. Test cancellation during a seed change. Avoid reporting JS heap
alone as total memory: WASM, textures and decoded buffers have distinct costs.

For population use an immutable coherent source revision and the actual `step`,
`assignWork`, `optimizeEligible`, movement and resource owners. Fixtures need
ready work, unreachable/waiting work, scarce-material contention, steady walking/
work, a topology change and cancellation. Complete useful outcomes; an idle crowd
or repeated raw Hungarian call is not representative. Keep fixture setup out of
timed samples. Record p50/p95/worst tick and assignment/path/state times, memory,
completed jobs, starvation/wait reasons, unique ownership and equal-tick replay.
Record each fixture's finite topology, task count and offered optimizer-pair count;
this is scheduler workload evidence, not physical population capacity.
Measure HUD publishing/component commits and rendering separately; reusing art
for a diagnostic crowd does not add recruitable people to the playable clearing.

Initial desktop targets are responsive input below 100 ms and ordinary simulation
work well inside the existing 50 ms tick; steady display aims for 60 fps. These
are targets to measure on named hardware, not outcomes already achieved. Mobile,
headless software rendering and hosted runtime fit get separate labels. An
oversized assignment pass should produce a bounded optimization decision before
an ECS rewrite; preserve priority/fairness and scarce claims when reducing work.

## Brewing is the next content-extension proof

Before runtime, Delivery selects one honest finite ingredient acquisition path,
recipe and brewing timing; grain/yeast/water/fuel sourcing remains an unresolved
entry decision, not permission to conjure inputs. Scope the initial resource
path without requiring complete agriculture, fluid transport or combustion.
Mugwort is flavouring. “Fig Leaf Bi-Carbonate” is the later soda/MM..FOOD nod,
not the name or recipe specification of the first herbal ale.

The useful chain is ingredients → mixed shelf → reserved transfer → workstation
work → unattended fixed-tick fermentation → one physical output → store/serve.
Prove last-space competition, full-destination waiting, cancellation/drop,
consumed-input accounting, one output, exact restore and no offline advancement.
Choose a narrow location/capacity API using these actual consumers. A second
recipe over the supported brew behavior should require definition data rather
than copying activity logic; that is the concrete extensibility check.

Normalize old saves into the selected new durable shape using the existing
parser/transaction owner. Preserve real activity/claim/custody facts; remove a
recomputable cache only after proving the next scheduling decisions still agree.
Do not turn this into an upstairs-blocking migration rewrite. The shelf and
workstation inspector consumes one simulation-derived view and emits ordinary
typed commands, with focused updates and stable focus across process changes.

## The expansion gate after the lab

A pretty large world is insufficient. Before unlocking large-world gameplay,
prove one persistent person with actual cargo crosses a real chunk boundary and
returns while another keeps working at home. Home remains resident offscreen;
a third modified unoccupied chunk is saved, evicted and reloaded. Restart must
preserve actors, items, stumps, jobs and construction. Missing terrain has an
explicit needs-data outcome, not an invented free route or destroyed cargo.
Topology, supported rooms and stair openings must also work across a chunk edge.
This controlled integration test is separate from opening the world to play;
Levi's tiny-map fun gate still controls that product transition.

Only after that consumer comes same-world two-client authority, then two-owner
visits/recovery and offline catch-up. A local tool-client using ordinary commands
can later prove AI control boundaries; model calls, Watchdog, DO deployment and
billing remain separate work. The worldgen page proves none of them.

## Delivery, issue custody and review

Game-delivery retains sole Git/deploy and coupled-source integration. Keep the
existing upstairs writer uninterrupted. Assign a genuinely independent World Lab
owner to new terrain/page/worker files, and a bounded performance reader/runner
to frozen-source fixtures. Shared Caps implementation changes require an agreed component/file boundary with
the Botanical CTO and exactly one shared writer; current game composition uses
packed Caps/Stipe and remains game-owned. Do not fork shared primitives into the
game. Each portfolio checks an accepted shared change in its actual consumer.
The systems lane can finish brewing/commodity readiness
and reconcile docs; it is not a second runtime writer. Do not give one PM all
three execution responsibilities. New visible assignments use the supported
Shiitake role where available, otherwise record the current role-capability gap.
Astra retains original art direction/review. Delivery accepts routine source,
corrections and proofs without another CTO gate; shared camera/Vite/package
edits integrate serially. Ordinary gameplay releases need not await lab art.

Publish this reviewed draft under existing docs/decisions and link it from both
plans. Update #3 (upstairs), #4 (world lab versus gameplay expansion), #6 (real
population measurements), #7/#14 (mixed storage/brewing), and current ownership/
status paragraphs. A lab child issue under #4 is useful if Delivery gives it an
independent owner; no new board/report framework. Preserve the other ideas in
#2/#8–11/#13/#15–19 and existing ADRs with their first-consumer proof boundaries.

Review inputs: PROTOTYPE, ARCHITECTURE, all four current decision records, the
19 open issue bodies plus current #4/#6/#14 comments, direct current source/caller
inspection, and the independent notes `sprint-architecture-audit.md` and
`world-lab-ready-audit.md`. No implementation test or benchmark was run for this
planning review. Current complexity/duplication advisories remain evidence to
address by responsibility as those callers change, not a zero-findings claim.
