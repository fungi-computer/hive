# Building the fresh examples

The existing clearing stays separate. Root owns this worktree's dependencies and
serial build; sibling writers use only its read-only dependency installation.

- Rust 1.98.1, target `wasm32-unknown-unknown`.
- wasm-bindgen CLI 0.2.128, matching the exact crate pin.
- Standalone Bevy ECS 0.19.1 with `std`, without renderer/reflection/executor.
- Node and the root lockfile, existing Caps/Stipe original packages and art bank.

Install ordinary Rust using rustup, or use the isolated
`.botanical/toolchain/{cargo,rustup}` installation recognized by the scripts.
The local CLI comes from the official wasm-bindgen 0.2.128 Linux musl release.
No shell profile or other lane's dependencies are changed.

Native build caches belong on the existing mounted drive. The integration
`engine/kernel/target` already links to
`/mnt/fungi-data/botanical-work/hive-build-cache/fresh-engine-target`.
For new worktree checks, reuse the root-owned toolchain and an explicitly owned
mounted target; do not accidentally create another large Cargo target on the
nearly full root disk. Cache placement does not move source or durable world data.

## Native water source checkpoint — September 11

The bounded local Rust module at water-writer `847ff3c` is integrated with its
public Rust module export. It has no live Colony, WASM binding or Region record
consumer yet. The first focused compile/test, `u5379`, compiled successfully and
passed ten of eleven water laws. The gravity law incorrectly treated the sorted
upper cell as the lower cell. Its test-only correction now looks up coordinates;
`u5384` passed that exact law, including downward movement and conserved total.
The other ten laws were not replayed after this test-only change.

The initial missing-Cargo PATH attempt, `u5381` misplaced test-runner flag, and
`u5382` disk-full compiler exit are setup failures, not additional water results.
Only this writer's rebuildable target moved to mounted `native-water-target`,
recovering roughly 700 MB on the root disk. All four owned scopes were collected
inactive/dead with empty control groups. This establishes native source behavior,
not browser/DO performance, pressure, pollution, remapping, gas or hosted water.

The retained frontend lock installs with `npm ci --legacy-peer-deps
--ignore-scripts`: Caps uses React 18, while OpenTUI's optional React integration
declares React 19. Hive uses OpenTUI's independent HTML integration, not that
optional React binding. The install limitation is explicit; it is not a claim
that all optional package integrations are compatible.

```sh
# Wrap automated checks/builds with the repository's run-proof.sh on shared hosts.
bash engine/scripts/qualify-kernel.sh
node_modules/.bin/tsc -p engine/tsconfig.json
node_modules/.bin/vite build --config engine/vite.config.js
```

The native check includes the actual Rust public laws and produces generated
web bindings in `engine/generated/`. Vite writes only `dist/engine/`; publication
must preserve the existing clearing's frozen files. Original art and authored
example source are included byte-for-byte. No browser/server acceptance follows
merely from compilation.

The current TypeScript session format is version 5. It also retains bounded pending
projectile impacts and their delivery frontiers. It saves queued authored
writes as well as the previous physical
step's ordered action outcomes with the world and RNG state. Authored systems can
react on the following step; rejected actions are explicitly distinguishable.
Pause does not consume outcomes, and successful stepping replaces them, so save
and restore do not repeat an authored response. The DO Region host commits this whole session atomically; in-process fields
alone are not durability. Native restart/rollback evidence is recorded below.
Pending player input is bounded at 128 actions; authored systems have another 128
per step, within the native 256-action batch. Malformed input is rejected before
queueing; physically unavailable actions return normal rejections.

## First actual consumer checkpoint — September 10

Native pin e5aba62 in fresh-native-proof: u4850 exited 0 after five assignment
laws, seven public kernel laws, and release WASM generation. Kernel source matches
the integrated root. WASM SHA256 db1d8f26c1f02a375c67448eed6c079f0f571b662d86b7e487c6d058fc1bf37e.
Initial u4848 compile failure (ambiguous Result) is preserved in tool output.
Strict TS u4855 passed. Actual TS/WASM consumers plus session laws u4858 passed
10/10 after u4857 exposed the shared movement helper's extra destination field.
Client build u4859 includes the real worker and WASM (earlier u4856 build did not).
Local browser u4861 passed all three pages' rendered-ready and acknowledged pause
checks; root viewed all three captures in .botanical/fresh-browser. Scope dead,
empty control group and port5197 clear. No page errors. This is not movement-input,
save-button, narrow-view, hosted, or DO proof. Pantry/locker visual mapping and
label overlap remain visible corrections. Nothing from this checkpoint is hosted.

Publication supersedes the earlier unhosted status: source3478538 client correction
built in u4864. Local input u4865 passed pointer selection/order, food take/eat,
Save and paused Continue; exact restored snapshot comparison is limited by the
saved-message observation, so full restore correctness remains headless evidence.
Root viewed survival-input.png. Ordinary same-preview upload u4869 exit0,
deployment4d780b7b-64a3-4e0f-a456-dd5f914e002b; u4870 readback141/141. Initial
u4868 lacked an exported token; corrected SAME subprocess sourcing/export worked.
No credential rotation. All owned scopes dead/empty, browser port5197 clear.

## Current DO source qualification

The browser release remains frozen at 3478538. Current root d921c47 passed strict
TypeScript in u4874 (exit 0, owned scope inactive/dead and empty). This includes
the reusable session Region program, immutable program capture and removal of
unused component definitions. It does not establish DO execution or recovery.
The local DO witness is undergoing source review before its first invocation;
it must prove physical consumption, same-command replay after process restart,
conflicting reuse rejection, and rollback of a physical step. No DO is deployed.

Local native DO acceptance: root 07ef860, u4878 exit 0, invocation
d8bd1d1b4aff47b38af5fb15d8c8a0a8. Three owned runtime starts used the same persisted
SQLite store and generated WASM. Survival move/take/eat reduced bread from 8 to 7;
after lost acknowledgement and abrupt runtime restart, exact command replay kept
revision 6/tick 3 and did not consume again. Conflicting reuse returned 409. The
following step applied the exact saved TypeScript hunger consequence. Injected
receipt-write failure rolled back native movement and session state together; a
second restart retained revision 8/tick 4 with its pending command.
Evidence: .botanical/fresh-do/native-v2/{survival-proof,survival-proof-receipt}.json.
Scope inactive/dead/empty, no 8789 listener, ordinary reuse bind available; temporary
config removed. A separate Python bind without reuse hit TCP TIME_WAIT, not a live
listener. Initial u4876 stopped before readiness on unsupported compatibility date;
09-04 matches the installed runtime. No hosted DO, automatic alarm, large-world
capacity or multiplayer browser claim follows from this bounded native proof.

Custom authoring witness: u4880 exit 0 at 990ed50 ran the single new named
TypeScript-component law against unchanged WASM db1d8f26. An orchard ripeness
number/boolean component advances through an authored system, restores into a
second native instance and continues, while the first instance remains unchanged.
The filtered runner also reports an empty session-test file as passing; this is
one authored law, not two. Scope inactive/dead/empty. No Rust rebuild was used.

Joined client 173b69d: u4882 strict TS + build passed. Browser u4883 exited 1:
survival food and exact save restoration passed; formation pointer box selection,
three distinct march positions and exact restore passed. Colony exact restore
failed because native JSON time 0.39600000000000013 became 0.3960000000000002.
No tolerance was introduced; native JSON round-trip correction is in progress.
Root viewed survival-joined.png. Scope inactive/dead/empty and 5197 clear. This
candidate is not deployed; prior browser 3478538 remains live.

Native correction 11d0d1f enables serde_json float_roundtrip. Within u4894, the
new exact fractional snapshot regression passed (one named law, 12 existing laws
filtered). WASM compilation is still pending at this checkpoint. Prior live
3478538 engine assets were recovered into .botanical/fresh-browser/rollback-3478538:
all 29 files matched the published manifest, preserving the exact browser rollback.

The corrected WASM built in u4897 (exit 0):
70c7e77f62793a8b4a0309d0e2502b1b9a4b43c53787ee21a06b2d8c6467dcc8.
The earlier u4894 native law passed but WASM compilation failed on full root disk.
Cargo dev-cache cleanup recovered space; after compilation finished, this lane's
engine/kernel/target moved to /mnt/fungi-data/botanical-work/hive-build-cache/
fresh-engine-target with a local symlink. No source/store/artifact move.
u4899 browser build passed; u4900 colony-only exact Save/Continue comparison passed,
closing u4883's numeric restore failure. Scope inactive/dead/empty.
Levi's bedtime amendment pauses routine publications: batch the next release and
continue implementation. Live browser remains 3478538; corrected local dist is
held, not advertised as hosted.

Authored commands / shared presentation join 85b542f: u4906 strict TS passed and
one new actual WASM law passed for paused pending writes, last intent replacement,
committed-only reads, immutable query values, missing-reference rejection, fresh
instance restore, forged system-write rejection and failed-step queue recovery.
Filtered runner additionally counts an empty session file; one authored law ran.
u4905 type failures were fixed at actual joined imports/fixtures, not bypassed.
This source adds session format 4 and rejects prior versions; it is not deployed.
Game-specific controls and fact providers are the next consumer work.

Presentation u4908 passed three named filtered laws: empty unconfigured packs,
bounded/cloned facts and controls, and rejection of non-JSON/oversized input.
Two other test files had no matching laws and are not counted as authored tests.
The expanded runner now explicitly names bundle entry outputs so adding a test
from another directory cannot cause stale bundled game/session files to execute.
Actual game fact/control providers remain in the isolated game-rules source lane.

Session u4910 passed eight affected authored laws; the two filtered empty files
are not additional laws. Scope readback is inactive/dead with empty ControlGroup.
Game consumer candidate 18bd404 remains unaccepted: source review found a missing
query import, duplicate survival definition key, facing disconnected from normal
march commands, and a retreat control that cannot affect the initial units.
The same isolated writer owns corrections and meaningful physical consumer laws.
No build, publication or additional browser run follows this source checkpoint.

Game controls joined through c98ad02. u4917 strict TS passed, five affected game
laws passed and the old two-second formation arrival assertion failed on the new
crate detour. u4918 reran only that corrected four-second law and passed, retaining
exact destination checks. Empty filtered files are not authored laws. Both scopes
inactive/dead/empty. Actual checks cover delivery pause/custody/resume, survival
split-lot consumption, authored meal recovery, facing/retreat and game projections.

u4920 (invocation b6afe71e5c16463c94eec5fbea3f567d) passed the updated native DO
fixture on c98ad02. Three owned process starts used the same SQLite store.
Consumption/retry stayed at revision 6 with seven bread; failed step preserved
revision 8. Authored meal intent persisted at revision 9 across abrupt restart,
replayed the same command receipt and applied once at revision 10 with no pending
writes. Source: tools/fresh-engine-do/proof.mjs; actual evidence:
.botanical/fresh-do/native-v4/survival-proof.json and survival-proof-receipt.json.
Scope inactive/dead/empty, port 8789 clear, generated config removed. This closes
the current local schema-4/native restart witness; it is not hosted DO, alarm,
multiplayer capacity or new browser evidence. Deployment remains held for bedtime.

Independent author exercise 2007a5d/cd5ad33 joined as f0058cc/5cc0c2e. The author
used public examples/contracts and exposed the duplicate component-list hazard;
one shared list corrected pack/encoded registration before qualification.
u4924 strict types and one named actual-WASM fatigue law passed: actual movement
increases fatigue, stationary steps reduce it, a second native instance restores
the custom fields and continues to an identical snapshot. Two empty filtered
files are not extra laws. Scope inactive/dead/empty. WASM remains exactly
70c7e77f62793a8b4a0309d0e2502b1b9a4b43c53787ee21a06b2d8c6467dcc8;
no Rust or generated output changed for the author exercise.

Assignment export built in u4926 (34.66 seconds, incremental Rust release build).
That command stopped at a test-port TypeScript ID mismatch; source correction
928cb1b uses the actual AssignmentCandidate type. u4927 strict types plus three
named assignment laws passed, including actual WASM joint matching where greedy
selection loses a match and a full unchanged-world snapshot comparison. Two empty
filtered files are not extra laws. Both scopes inactive/dead/empty. New local WASM
SHA bcd660dd77e35947520fb9a18c2d395a70dcad6c9d3e77df2a03f81d3f780d25.
No browser build/deployment occurred. Colony integration of this operation remains
with the isolated fresh-colony-orders author.

### Selected colony orders and display review

The two-worker colony now uses the Rust assignment door for distinct finite delivery tasks. Focused u4934 passed three authored laws covering distinct assignments, paused carrying restore/resume, and completed-order rejection. u4939 passed the one additional missing-quantity law: malformed delivery intent leaves the exact saved state unchanged. Its command exited 0 and scope is inactive/dead with an empty ControlGroup. Filtered runner file wrappers are not additional authored laws.

Shared display interpolation is under source correction, not integrated or visually accepted. Review found duplicate ticker registration, an ineffective resume test, and dropped-frame/clock handling requiring correction. No new deployment or rendered animation claim follows from these source checks.

### Original gait export and interpolation checkpoint

Original goblin walk export u4944 exited 0 through the maintained exporter;
1406 total bank textures, manifest SHA256
92d169343e9118973368ea1a82b472c860a3fdbf0529ad149f06a34fbf659b30.
Previous bank is preserved in `.botanical/fresh-walk-art/prior-bank`.
Exporter scope inactive/dead/empty; port5187 clear. New art bytes await personal
visual inspection; export success is not rendered acceptance or deployment.

Interpolation source is joined with root corrections for pending epoch changes
and nondecreasing display time. u4947 passed six laws and failed the added recovery
fixture because its single initial snapshot did not exercise starvation. Corrected
two-snapshot fixture alone passed u4948. Existing six laws were not replayed.
No browser smoothness or online-host claim follows from these isolated checks.

King personally viewed the 32-frame goblin contact sheet at
`.botanical/fresh-walk-art/contact.png`: four orientations, eight walk frames
from the unchanged original figure builder. Silhouette/leg motion and fixed bake
placement are accepted as asset evidence. This does not yet prove client motion
under actual input. Generated bank bytes are committed together after this review.

### Actual client input frontier

u4950 built the joined client successfully (19.58s). u4951 ran real survival
selection/Go/Pause/Save and captured walk-a.png/walk-b.png under fresh-browser,
but failed the destination assertion: clicking projected (4,0) produced saved
(5,1). King inspected walk-a.png; this is a real inverse-projection mismatch,
not a successful movement witness. Both scopes closed inactive/dead/empty and
5197 is clear. Root removed hardcoded 32/16 inverse-picking dimensions and now
inverts the actual shared projection basis. u4954 passed all 225 signed clearing
cell round trips in one authored law. Changed-client input confirmation remains
pending; prior built bytes do not contain this correction.

u4958 rebuilt ed9eed5 and passed the same bounded real survival selection,
right-click Go, Pause and Save interaction: canonical position exactly
{x:4,y:0,z:0}, page errors[]. King personally viewed the new walk-b.png;
the stable viewport contains the world and selected survivor correctly.
Scope inactive/dead/empty, port5197 clear. Earlier u4955 retained the destination
failure before fixed viewport sizing; v1/v2 red images remain archived. These
static captures prove placement, not subjective animation smoothness or network
latency behavior. A following presentation-only correction rounds numeric HUD
facts to one decimal without modifying simulation values; it is not in that build.

### Playable client interim deployed — 7cea479

Levi requested the next logical demo deployment. u4971 exited0 publishing exact
141-file bundle to the existing /engine/ preview, deployment
51594c50-d4aa-48df-84d6-e624e2cec9aa. All112 non-engine files matched the prior
release before upload. First HTTP readback briefly mismatched colony.html;
subsequent canonical and deployment HTML both showed the new hashes, then all141
canonical HTTP file hashes matched the frozen inventory. Evidence:
`.botanical/fresh-browser/release-7cea479/{files,hosted}.json`.
Deployment scope inactive/dead/empty. Includes shared interpolation, original
walking goblins, actual-projection picking, stable viewport, concise needs facts,
selected two-worker colony delivery and TS fatigue exercise. Native assignment
remains Rust. It is still browser Worker/WASM authority; pirate/native support
WIP and hosted DO multiplayer are not part of this release.

### Moving-support native/WASM caller checkpoint

Native140e12c u4975 passed14 kernel integration laws, including moving-deck
obstacle routing, resolved contact and exact mid-voyage cargo/route restore.
Earlier u4967 compile errors are retained, corrected rather than called passing.
Joined root u4978 built WASM SHA256
a082c65c1200a28faf046f033062953daf94d69c73483b849296ffcfc63af09b;
strict TS initially found an authoring-test context gap and Surface export name
collision. Root corrected these, then u4980 strict types passed, six animation
laws passed (including passive ship motion stays idle), and six authored
world-pose/colony laws passed on actual new WASM. Filtered file wrappers are not
additional laws. Snapshot format2 now preserves remaining route progress.
No new DO restart or hosted pirate claim. Public source7cea479 remains unchanged.

## Original vessel bank — u4983

Maintained static exporter completed exit 0 at source f6afec4. Owned scope is
inactive/dead. New v2 bank contains 1,410 textures (four added vessel facings),
manifest SHA256 d6bba196acfb207f0f8eb1c682439a85c2c1513dac867ef56e5858895bae1e08.
King personally viewed the four facings in the nearest-neighbor contact sheet
`.botanical/fresh-ship-export/contact.png`: readable timber raft, bounded deck,
small sail; no full sailing-ship claim. This accepts original sprite appearance,
not crew depth ordering or game interaction. Existing v1 bank remains preserved
for the previously published consumer. Pirate client composition is still open.

## Pirate authored consumer — u4986

Three new actual WASM laws pass: vessel carries crew without changing local
coordinates; crew routes remain on their support and reject invalid selections;
finite cargo reaches a distinct hold and saves/restores exactly. The runner also
reports five empty filtered file wrappers; these are not five additional laws.
Strict engine TypeScript passed. No browser/native-DO qualification of this new
pack is claimed. Shared client vessel rendering is in its isolated writer lane.

## Pirate client first-shape review

3017994 is not integrated: review found support sorting overridden by Pixi
zIndex, raw screen coordinates passed into deck projection, additive selection
masking empty-click hits, and a mismatched obstacle visual ID. The same client
writer is correcting these before the bounded input check. The prepared driver
uses the actual elevated deck projection and remains unrun. No new browser or
deployment result is claimed.

## Four-page build and raft input — u4990/u4994

Build 441dae6 completed exit0; three client laws passed. Bounded browser input
u4991 first failed selecting the deck at a point intercepted by nearby subjects;
no simulation failure was inferred. Revised far-corner input u4994 selects the
raft, right-clicks a destination, advances it to x=3,z=0, pauses and saves through
public controls. errors=[]; King viewed pirate-initial.png showing original raft,
crew and cargo furniture on water. Command exit0, scope inactive/dead/empty.
This witness does not yet prove browser deckhand walking, cargo or Continue;
headless cargo/save laws are separate. No new deployment claimed.

## Browser cargo and Continue — u4997

Same 441dae6 built bytes: real Load cargo moved both finite units to the hold;
Save, Reset and Continue restored the displayed delivered quantity. errors=[];
exit0 and owned scope inactive/dead/empty. This check exposed broad point hits
selecting two crew and an obstacle, so its attempted manual crew move is NOT
accepted movement evidence. The shared nearest-point selection correction is
underway before release. Existing native crew route laws remain separate.

## Four-game release — d3b914a

Actual u5002 build plus manual deckhand browser movement/save passed; nearest
selection returns only crew1, support remains pirates.ship. Five client laws pass.
Prior same-kernel cargo/Continue and raft movement evidence retained. u5005
publication exit0 deployment c12d0753-fe29-47ff-8bb7-a8725021bbd1. All143 served
files match frozen dist after seven initial propagation mismatches cleared on
readback. 112 non-engine files preserved. Public /engine/pirates.html is playable.
This remains browser Worker/WASM; new pirate native-DO fixture is source-only.

## Current pirate native DO recovery — u5008

At109cebc, maintained tools/fresh-engine-do/proof.mjs --pack pirates completed
exit0 using two owned local runtime starts. Receipt pirates-v1 records success;
scope inactive/dead/empty and driver verifies port8789 free on cleanup.
Actual native format2 route survives abrupt process restart: revision16 x=1.5
with remaining route is unchanged by replay; fresh revision17 advances to x=0.
Before-commit fault rolls back, after-commit lost response replays exactly, and
finite cargo remains seven units with goods delivered to the hold. Original
crew local pose remains unchanged by resumed ship movement. This is actual local
SQLite DO evidence, not a hosted multiplayer or capacity claim.

## Foundation audit after release

Independent source audit identifies remaining hosted-client join, colony/formation
DO consumer qualification and requested cannon-impact progression. Boarding is
not part of the accepted starting-aboard raft. Root found SDK index importing
worker-entry, whose top-level code accesses self and boots WASM. Removed that
export: Worker installation remains internal to browser entry; public WorkerRuntime
and GameSession remain available. Added piratesPack beside the other pack exports.
This is a source correction pending the next affected type/import check.

## Headless public SDK — u5010

Actual bundled Node import of sdk/index passes without global Worker/self or
starting a browser runtime. All four authored pack exports and core authoring
functions are present. Strict TypeScript passes; one selected public-import law
plus six filtered file wrappers, not seven domain laws. Scope inactive/dead/empty.
The public release is unchanged; this fixes the author-facing module boundary.

## Shared committed observations — u5015

Joined04e9681/2d324c4 passes one actual WASM projection/no-mutation law, strict
engine TypeScript, and native pirate DO witness including /observe. Two concurrent
authorized reads match at committed revision16; unauthorized read returns403;
world snapshot is unchanged by observation. Runtime restart/replay and resumed
route remain passing with the changed host. Two starts, exit0, scope inactive/dead
and empty. Observation output excludes proof receipts and secrets. This is a
local host read consumer, not yet a network-connected playable client.

## Colony and formations native recovery — u5017/u5019

At2a20889, both selected fixtures pass against actual local SQLite DOs, two
owned starts each, exit0 and scopes inactive/dead/empty. Colony queued delivery
survives restart; lost-step replay leaves the snapshot unchanged; four units
arrive at guest, total six conserved, both jobs complete. Formations queued
threshold90 and march survive restart; the authored retreat rule takes effect,
active route persists, replay does not change it, and next step moves closer to
home. Both authorized observation parity checks pass. No survival/pirate rerun,
browser build, public backend or capacity claim is included.

## Raft selection correction — 8f4042d

User could sail only after hunting for a clickable deck spot. Shared pointer
selection now tolerates 5px press/release movement, and authored selection
shortcuts provide a Caps Select raft button. u5032 passed the ordinary build and
one actual button/select/right-click/sail/save witness; King viewed
.botanical/fresh-browser/pirate-select-raft.png. No wider browser matrix replayed.
Owned scope closed inactive/dead/empty. u5036 same-preview upload passed:
d1efdaa2-9e28-4166-ae2b-6beaa6af0e51. All 143 served hashes match after four initial
propagation misses; initial evidence retained in release-8f4042d. Non-engine
files remain byte-identical to d3b914a. Authority is still browser Worker/WASM.

## Remote connection source join — 651c8b0

Actual six remote-connection laws passed in u5029, including lost-response exact
identity, queued revision advancement, receipt/poll race, bounded response body
and disposal. Initial strict types failed missing lane dependencies/generated
bindings plus actual unknown-value guards. Read-only links and source f77d344
corrected those; strict engine types u5038 exit0, scope closed. Root joined the
three reviewed source commits as 6077d1a/3f4cdbf/651c8b0. No new public network
host follows. The next isolated native witness will use the real connection
against the existing authenticated DO host; browser-local remains live.

## Constant-size host clock frontier — ae14d8e

The Region owner now commits ordered host occurrences through the same detached
candidate/state/event path as player commands. Its versioned retained frontier
holds next sequence and last canonical request/receipt; exact replay returns the
same result, while conflicting, retired and skipped sequences cannot execute.
Clock records include storage accounting and relational reopen validation.

u5023 failed before tests because the isolated lane lacked its read-only dependency
link. u5025 passed11/12 laws; the remaining corrupted-frontier law correctly
rejected but expected a different error category. The corrected named law passed
u5027. u5040 strict types found nullable nextClock access; direct branch narrowing
1268930 passed strict types u5043. All owned scopes closed inactive/dead/empty.
The combined source is integrated as705eb39/175233e/ae14d8e. This proves the SQLite
occurrence owner, not an autonomous alarm or hosted-clock acceptance.

## Real remote clients against a local DO — a072d19

u5059 network-v6 passed against one native host: two actual connectRemoteRuntime
consumers observed the same committed frame, shared pause/resume, moved the
survivor into reach, took and consumed finite bread. A deliberately lost take
response retried the exact envelope and returned the same committed revision.
Unauthenticated observation was denied. Scope inactive/dead/empty and8789 free.
Evidence is in fresh-network-proof/.botanical/network-v6, including bounded
sanitized diagnostics and source inventory. Earlier script, readiness, retry
bookkeeping and out-of-reach failures remain in v2-v5; no false pass was inferred.

The readiness failure exposed a real type mismatch: Rust RenderFact.local is a
Pose with nested position, not the flat WorldPose query value. contracts.ts and
remote validation now match the native output, including null visual/label.
The kernel and its render payload did not change. This is local network/physical
acceptance, not the pending public autonomous host or deployment.

## Public DO join — September 10

Actual public-host native witness u5070 exited 0 with two owned runtime starts.
It used the same public token routes and remote client: missing token rejected,
two private worlds isolated, one paused while the other advanced, a lost applied
pause response retried byte-identically at the same revision, and both clients
were disposed before restart. Read-only native SQLite showed the selected world's
clock sequence advance after restart before any game request. Port 8789 and the
owned scope were closed. Evidence: `.botanical/public-host-native-v1/`.
This is local native evidence, not yet a hosted release or a public-host injected
outer-rollback witness; earlier Region rollback evidence remains separate.

Remote stale-intent qualification u5067 passed six laws and failed one erroneous
poll-count assertion (4 actual, 5 expected). The test retained its timer after
failure; the exact owned scope was terminated normally and collected exit143.
The corrected test owns disposal and expects the actual bounded four polls.


## Public online release — September 10

- u5072: corrected two stale-intent laws and strict engine types passed; closed.
- u5074: actual DO deployment passed, version
  `daf0575c-a5f4-4841-b024-21d5985d05a8`, host
  `hive-public-engine-demo.levi-fe0.workers.dev`; scope closed.
- u5076: one frontend build with VITE_HIVE_PUBLIC_HOST pointing at that actual
  host passed (28.75s); original art reused, no bake. Scope closed.
- u5078: exact stopped build served in the browser at its canonical origin,
  actual remote DO calls, raft selection/sailing x=0→3 and same-world reopen at
  revision22 passed, errors[]. King viewed online-raft.png. Scope closed.
- u5081: hosted smoke failed on test-only wrong rejection field; preserved.
  u5083 corrected `receipt.result.reason`, all four packs passed CORS,
  missing-token rejection, pause stability, resume/time and same-command replay.
  Both scopes closed; no host runtime changed for the correction.
- u5085: same-preview frontend upload passed, deployment
  `03e69896-07d3-40c3-b4af-16acfad95297`; all143 HTTP SHA256 values match,112
  non-engine files unchanged. Scope closed.

Evidence: `.botanical/public-online-release/` (browser-result.json,
online-raft.png, files.json, hosted.json, rollback-8f4042d-dist.tgz),
`.botanical/public-host-release/hosted-v2/hosted-smoke.json`.
No hosted backend population/performance claim or injected public-host outer
rollback proof follows. Actual native Region rollback and request-free public
host restart remain separately recorded above.

## Route recovery and public food loops — September 10

Source44863b9 client build passed u5170. Actual WASM f9f44bf90a1b55bdce490336f75a78421d246f98925850af1455dbc094571e4c
passed the colony restore-every-step regression and strict types in u5167;
three native route laws passed u5163. Existing public host is now version
8283beea-8ce6-4482-a700-fbc86650abaa, implementation04c3c1a0f8363e871e369083a837d7ef31e6f421b961b9e788dab2c4641017a4.

Public browser u5174 proved colony selection, one finite delivery, interrupted
cargo retention and resumed completion. Survival did not move because the script
left keyboard focus on Resume, where the maintained input guard ignores keys.
The survival-only corrected focus check u5178 passed movement, pickup, meal-rule10,
consumption, hunger improvement and same-world paused reload at revision52.
Both page-error lists are empty. King personally viewed colony.png and
survival3/survival.png in .botanical/foundation-public-actions. Earlier failures
remain retained; no colony replay accompanied the focus correction.

Frontend u5181 deployed exact same prepared dist as
1575e169-f8cc-4de0-9f82-8656f0cbe7b6. All143 HTTP file hashes match;112 non-engine
files are unchanged. Proof scopes closed. Prior cannon dist/config are preserved
in .botanical/route-release. The public DO clients exercised above use the same
unchanged UI behavior; the new browser-mode WASM now includes the native fix too.
No large-world, fleet, shared-player lobby or hosted fault-injection claim.


## Native environmental source — September 11

At 0a5d836, u5388 compiled the Rust generator and passed three of four generator
laws. The supplied supplementary Unicode expected hash was wrong. u5391 checked
the actual retained JavaScript hash owner: 1059832673, matching Rust. Corrected
7f2588f passed that single hash law and all three new water geometry-rebind laws
in u5393 (exit0). Soil-to-void keeps mass, newly represented cells start empty,
and removing wet capacity blocks without mutating either input. All three scopes
were collected inactive/dead with empty control groups. No older water-law replay.

This qualifies local native source only: no WASM/Colony/DO join or capacity claim.
Terrain owner source 9ca7657 is now joined for focused qualification, with root
corrections for ordered Cell keys and the revision9-to10 encoded-size assertion.

Terrain qualification u5399 stopped at compile with two test-only typing mistakes
(coordinate integer widths and unwrapping PrepareResult). Root corrected them at
104b3d9. u5401 exit0: five terrain laws and four generator laws passed, including
negative-page agreement, bounded cache, excavation/retry, save binding, exact
encoded size and finite groundwater proposals. Generator laws reran because the
seed framing changed in this terrain join. Both scopes inactive/dead/empty. No
WASM, actual movement integration, browser, DO or performance claim follows.

Opaque Region record source7c7d048 joined as488653c after personal and independent
review. Its focused runtime/type qualification remains pending. Public release
is unchanged; native terrain/water still need the actual Kernel/Colony consumer.
