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

The current TypeScript session format is version 4. It saves queued authored
writes as well as the previous physical
step's ordered action outcomes with the world and RNG state. Authored systems can
react on the following step; rejected actions are explicitly distinguishable.
Pause does not consume outcomes, and successful stepping replaces them, so save
and restore do not repeat an authored response. The eventual DO host must commit
this whole session atomically; these in-process fields alone are not durability.
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
