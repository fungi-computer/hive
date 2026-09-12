# Sprint: bring the Clearing back to life

King Bolete · September 12, 2026 · **active Colony delivery plan**

## The outcome

**Levi and a friend play together in a beautiful little goblin clearing. They
select people, designate digging, build a home and cellar, move real supplies,
encounter groundwater, and see people visibly doing their work.** The result is
an enjoyable public demo and a genuine 30–60 second clip with a playable link.

The engine supports that experience. Its abstractions, benchmarks, saved records
and other demos are not the product finish line. Restore the retained Clearing's
quality over the Rust/DO implementation; do not start another game or rewrite.
Engineering quality follows the **current Botanical-next Field Guide and current
Botanical implementations**, not the original Clearing's internal code. The
Clearing supplies gameplay, control and art references. Before accepting a changed
seam, apply Botanical's software-shape, ownership-and-seams, testing-and-gates and
anti-slop rules from `/home/levi/src/Botanical-next/wiki/3-resources/field-guide/`:
one decision owner, typed boundary outcomes, maintained parsing primitives,
bounded recovery, removal of superseded mechanisms and proof through real callers.
King personally owns that comparison and every nonmechanical design decision.
The two screenshots Levi supplied on September 12 are the direct visual comparison:
the original clearing with varied grass, paths, trees, Rowan, Sedge and the cat
versus the current sparse Colony with generic actors and flat-colored terrain.

This document supersedes the active sequencing in DESIGN.md, DEMO-ROADMAP.md and
the architecture-proof sprint. Those retain technical contracts and historical
receipts. MULTIPLAYER-STREAM-CONSOLIDATION.md supplies supporting connection detail;
this document owns priority. Earlier versions of this file preserve the two-day
velocity assessment and wider forecast in Git at b508d6e. The 5–8 day feature
forecast is **not a gate before the next playable repair**.

## Current interaction restoration — September 12

Levi explicitly requests the retained station-first gameplay: click the hearth,
request its job there, and let available workers carry it out. The flat list of
worker-dependent demo buttons is not the intended loop.

- Shared presentation publishes bounded entity scopes for facts/actions. The
  client derives a contextual inspector from accepted selection and facts; it
  does not know Colony IDs or grant command authority. World digging/building
  tools remain globally reachable. Preserve current Caps and gesture owners.
- Reuse the retained baked alpha silhouette for object picking, with the actual
  rendered anchor, zoom and front-to-back order. No new pixel-read loop or
  arbitrary hearth click radius.
- Requesting ignition records a command-owned EmissionOrder revision; the
  system alone owns EmissionWork progress. Current Session explicitly rejects
  shared command/system component writers. This is a station intent, not an
  immediately selected worker action. An emission-work provider composes with the existing shared
  Hungarian assignment owner. Existing site supplies deliver the fuel. The
  existing Rust begin-emission operation remains sole owner of fuel debit and
  paid smoke/fire. No separate hauling, inventory or fire clock.
- No-fuel work waits without claiming a worker. Manual takeover releases ignition
  attendance; cancellation stops unperformed intent and cannot refund an already
  committed burn. Match the previous native action outcome before completing a
  submitted ignition; that outcome is already included in the current saved
  Session. Refused work releases its worker and exposes its actual reason.
- Root owns this work design and Colony callers in clearing-station-work; Luna
  owns presentation/transport/client and picking in clearing-context-ui, both
  from 23f1885. Root joins the two, reviews exact callers and one focused actual
  queued-ignition/current-save law plus contextual/picking laws. This is not a
  claim that the retained full brewing recipe has already been restored.

Trees remain in the scenery/resource restoration queue. Levi's subsequent
playtest reports a void-like hole after a few layers and no discoverable water.
Root source plus u6268 sampled four starting columns: surface y13; two soil
and three stone cells, followed by a very tall generated cave (27+ empty levels
before stone resumes). Bounds [-32,40) describe 72 vertical coordinates, not
72 earth layers. Current water activation remains only x/z[-2,2], y[10,14].
This is an unfinished playable-world join, not sufficient water coverage.
Remove the blanket "dig deeper to uncover groundwater" instruction now. Next
terrain/water correction must give useful cellar depth and ordinary discoverable
groundwater without silently expanding all active physics work. The read-only
note .botanical/clearing-context-release/deep-hole-readiness.md also identifies
cutaway filtering that drops otherwise-published water in an open/null-surface
column. Fix through the existing projection owner; do not invent a solid floor
or duplicate water. User's exact world/hole has not been inspected.

### Contextual station source and local proof checkpoint

Root integrated Luna 94dced5 as 0ca3c55 and root station 248b0e8 as e29c0b8;
720c0b2 consolidates presentation parsing and qualifies refusal. The subsequent
compact inspector places selected-object actions before the help/world section,
uses existing Caps and real baked silhouettes, and removes the misleading
universal groundwater instruction. Current Colony definition version is 4.

Root evidence in .botanical/clearing-context-release:
- u6249 caught command/system component write overlap before any simulation;
  root corrected it with distinct request/progress ownership, preserving failure.
- u6252 and joined u6262: three actual native Colony laws pass (shared supply/
  assignment/ignition, pending-result reload without duplicate debit, cancel,
  manual takeover). u6262 strict types pass; Fallow failed with findings retained.
- u6263: new actual already-burning refusal law and all ten affected presentation
  laws plus strict types pass. Removed three real unnecessary exports and the
  duplicate manual presentation parser. Fallow remains exit1 for one new
  **moderate estimated-coverage advisory**, progressAttendance (27 lines,
  CC13/cognitive12); root reviewed its local state transitions and accepts this
  advisory explicitly. No new dead exports/clones. Inherited findings retained.
- Luna reports two contextual, two scoped-binding/schema and one remote JSON
  law pass. New silhouette law passed within a client command that remained red
  for an inherited static-binding expectation. Its terminal reports are retained
  in the Session, not separate log files; its unrelated Fallow JSON was not used
  as qualification. Root's actual joined audit above owns source review.
- u6265 browser failed before clicking: the proof selected a transparent atlas
  row. Errors[]; root viewed and retained failure.png. Corrected proof chooses
  actual registered opaque bowl pixels outside the obsolete foot-radius.
- u6270 browser passes actual sprite selection, station-specific action, automatic
  supply/ignition and emitted fire, then worker-specific action visibility. Root
  personally viewed hearth-selected.png and hearth-burning.png. Browser closed,
  no owned server. This is desktop local native gameplay, not hosted or sustained
  two-client acceptance and not full brewing restoration.

## Starting point: actual state, not aspirations

### September 12 current live interim — fd7937b

The same Colony URL now serves generated ground cover and an explicit **Invite a
friend** action. Frontend deployment `a1bddd9f-0834-4aa4-b803-191fb6bb31d5`;
Worker version `b79549b6-d86d-4d64-9500-d80eea2eacb0`, implementation
`1a0ac648f34c5ba104278f179e8bebfb507277f3c40306e6d6d2ecf19a17f03d`.
The worker/native change derives original surface height from Rust; exposed soil
loses grass. Original Rowan/Sedge work poses and manual takeover remain present.
Current source is integrated through `fd7937b`; the helper's later `f4086f1`
wrapper-only recut was reviewed and not integrated. Root instead made browser
selection own its prepared apply/rollback while the existing connection retains
runtime replacement, in `6426cac`.

Evidence under integration `.botanical/clearing-ground-release/`:
- u6227 passed nine connection laws, explicit strict types, new-only Fallow and
  joined build/Worker preparation. Full inherited advisories remain in the JSON.
- u6229 published `6426cac`; u6230 matched all 158 served files. The first actual
  friend browser run u6231 failed after receipt of a paused world, with no page
  error. It is retained, not called a pass.
- Root found the actual button dependency on the prior drawing frame. `fd7937b`
  derives shortcut eligibility from accepted facts and current view instead.
  u6235 syntax/diff checks passed; Fallow reports one moderate estimated-coverage
  finding on that inline predicate. The predicate checks the actual ID, pose,
  visual and pickability; it was retained after source review, not suppressed.
  The separate changed-client build passed; its frontend-only publication is the
  current deployment above. No second Worker deployment or native law replay.
- u6239 passed **two real hosted browser clients**, including 390px: host creates
  an invite, friend joins the paused world without replacing its private token,
  friend resumes, host pauses, and both report identical committed time/facts.
  Root viewed both captures; invitation values are masked. Both contexts closed,
  no owned server was started. This is shared-control acceptance, not separate
  accounts/grants, a sustained load test, or a clipboard/refresh/New-world browser
  matrix. Source/unit evidence covers invitation parsing and replacement rules.
- `readback-paused.json` records exact final 158-file hosted parity. The exact
  previous ddc1728 frontend is preserved in `previous-dist.tar.gz`; the original
  generated WASM is separately preserved. All prior failure receipts remain.

Use **New world** if the server explicitly rejects an older engine world. Old
stores remain retained; there is no hidden migration or reset. Trees, paths,
pickup/drop transients, earned multi-level construction with water/smoke, the
fixed sustained two-client workload and Levi's playtest remain required. This
interim is not completion of the goal.

### September 12 earlier work-animation interim — ddc1728

The existing Colony URL now serves manual Go/Resume work, original Rowan/Sedge
dig/build/carry poses and closer desktop framing. Frontend deployment
`2aac14d5-1bc2-4640-8095-a27cae9a68b6`; Worker version
`91603a99-4b07-4977-aed3-c01b9b84c90b`; implementation
`c0859c71255f3316e021b154c9c32439e6ffa58f1af2acd8949577e44ddee43b`.
`u6205` publication and `u6206` all-158-file HTTP readback pass. `u6207` connects
two actual hosted clients, verifies manual Go and exact receipt replay, reaches
and holds the destination, resumes work, observes native digging activity on the
original cast and matches both clients at the paused revision. Five commands max
132 ms; short observation gaps max 213 ms. These are transport measurements,
not browser frame times or sustained workload acceptance. Both sockets close,
no server is launched, and all owned scopes are inactive/dead/empty.

The inspected build is copied byte-identically from `clearing-work-animation`;
both source trees match. `.botanical/clearing-work-release/` retains source
inventory, manifest, publication/readback/hosted receipts and the exact previous
34f7c20 dist archive. No automatic old-world migration/reset was introduced;
an unsupported earlier world remains preserved and needs explicit New world.
Scenery/terrain richness, pickup/drop transitions, full multilevel play and the
fixed sustained two-browser workload remain open. The goal is not complete.

### September 12 earlier repair interim — 34f7c20

The source below supersedes the earlier 4414a57 availability facts. This is a
useful repair interim, **not completion of Release A or the goal**.

- Removed delivery/construction's duplicate same-destination veto; Rust owns
  healthy-route reuse and invalidated-route recovery. The actual Colony regression
  digs two cells, builds a supplied wall and completes both original deliveries.
  Exact old providers strand `colony.delivery.1` in `to-destination`; the corrected
  providers pass. Spoil remains conserved. Root replaced the initial helper test,
  which passed both versions and therefore did not demonstrate the bug.
- Known command receipts release FIFO independently of delayed observations.
  Unknown results retain immutable command bytes/identity through bounded retry.
  Exhaustion refuses new orders and exposes explicit recovery. Ordinary UI
  submissions report refusal synchronously and retain tools/aim on failure.
- Source qualification: 12 transport laws, 16 work/UI laws, one actual WASM joined
  regression and strict engine types passed. Fallow audit at the real repository
  root against fc26a78 passes its new-findings gate; inherited debt remains,
  including large client draw/render, delivery progress and manual wire parsing.
  This is not a claim that existing code already meets every Field Guide rule.
- Hosted 34f7c20: frontend deployment `3a3c5d7b-e033-4364-9536-cb44f40cbafc`,
  Worker version `ef52f932-d69e-4dce-b6d3-3d6b5af2222e`; all 158 served files match.
  The existing two-WebSocket-client scenario now completes two cuts, replay of the
  dig receipt, supplied wall, ordinary hearth supply, consumed fuel, visible smoke
  facts and shared paused state. Six commands max 123 ms, observation gaps max
  263 ms. These are short hosted transport measurements, not browser frame times
  or sustained budget acceptance. Both clients closed; no owned server was opened.
- Evidence remains in `.botanical/clearing-repair/`: initial import failure,
  corrected actual-world old/new regression, joined gate, Fallow and release
  receipts. The prior 4414a57 hosted hearth failure remains intact.
- Still open: deliberate worker takeover/resume, carrying-leg route costs,
  sustained deep digging/building, original art/activity restoration and actual
  two-browser playtest. No new rendered/UI-browser evidence is claimed here.

### September 12 source qualification — manual control and original work poses

The reviewed manual-control source (`ebe337a`, `e7bf55f`, `e79dab2`) is joined
with King's original-cast/activity work, published above as ddc1728. One shared
automatic-work capability prevents delivery, digging and
construction providers from taking a manually controlled actor back. Go preserves
facing and cargo, cancels native attendance and moves; Resume work restores the
existing claim. Current-format restore preserves that intent. Boundary parsing
uses Zod; the superseded delivery/worker structural parser is removed.

The shared observation reads actual native digging/construction attendance. The
client selects the original Rowan/Sedge work/carry poses, without moving actors
or completing work in the renderer. Desktop initial framing is closer. The
retained static atlas is unchanged. Original scenery, ground detail and transient
pickup/drop animations remain unfinished; this is not visual parity with Clearing.

Evidence in the `clearing-work-animation` lane's `.botanical/work-animation/`:
- `u6190`: nine animation/native-attendance laws and the focused JSON activity
  boundary law pass. Native attendance projection leaves saved state unchanged.
- `u6197`: three joined actual-WASM laws pass; explicit engine types fail. The
  helper's earlier `npm --prefix engine exec tsc` checked the legacy root project,
  so it is **not** engine type evidence. Root corrected the branded frame value
  and the optional shared-system read list.
- `u6199`: the same three affected laws and explicit strict engine types pass.
  Go reaches and holds its destination, cargo/claims survive restore, another
  worker completes delivery, and explicit Resume finishes the original work.
- Fallow remains exit 1: two moderate estimated-coverage advisories in the joined
  gameplay test and `progressClaimedDig`; no introduced dead-code/duplication
  finding. Root separated claimed native-work reconciliation from provider
  eligibility instead of suppressing the new production hotspot. Inherited
  renderer/decoder/delivery debt remains and valid entrypoints are retained.
- `u6200`: ordinary client build passes (8.13 s), existing large-chunk advisory.
- `u6201`: bounded local browser uses the actual original bank and public
  rectangular Dig input; four orders are authored and Rowan's native digging
  activity is rendered. Root viewed `clearing.png` and `digging.png`; errors are
  empty. Browser closes normally; no server/listener was opened. This is local
  visual/input evidence, not hosted or sustained two-client acceptance.

### Earlier baseline, retained for comparison

- Live Colony: [existing demo](https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony.html),
  runtime source 4414a57. Rust/WASM simulation runs in the public DO host. The
  shared client renders observations; ordinary commands receive durable receipts.
- Current implemented pieces include Rust terrain, finite water, simplified local
  smoke/heat, excavation, supplied construction, lots/containers and shared work.
- Excess spoil can remain on the ground. A native 4x4 excavation law completes
  after an occupied guest moves. These are real improvements, not full acceptance.
- The latest hosted combined check connects two clients, digs twice, replays a
  receipt and completes a wall, then times out on hearth supply. Sustained play,
  usable multi-level construction and indoor smoke in this joined sequence remain
  unaccepted. The reported queue lock also remains unresolved.
- The retained Clearing has better complete controls, art composition and activity
  animations. The new client reuses only part of that work.
- Two connected demo clients currently share demo authority. Distinct accounts,
  revocable individual player grants and an account invitation service are not
  implemented by that evidence.

## What a stranger should experience

Open the page and immediately see a small, inviting clearing with recognizable
people, trees, a path and useful supplies. The camera starts close enough to read
faces and tools. A short instruction offers an actual first action, not an engine
feature list: **select a person, drag a dig area, or start building your home**.

A rectangle visibly marks the intended cells. Workers walk to safe positions,
perform recognizable digging, leave the spoil, and haul it when storage permits.
Full storage or an unreachable deep cell explains what is waiting; other workers
keep doing useful work. Ordinary orders let the player intervene.

The player creates a cellar and stairs and adds supported upper floors. Water can
enter an earned cut; saturated ground and standing water look different. A fueled
hearth produces visible smoke, and a real opening helps clear it. The environment
creates understandable choices without dominating the simulation budget.

A friend joins the same clearing and can help. Both see the same completed cuts,
structures and goods. One person's reconnect does not freeze the other person's
work. The first co-op release may use explicitly shared-colony demo access; it
must not claim separate account/player permissions that do not exist.

The first short challenge is **make your little home usable**: a reachable cellar,
an accessible upper floor, supplies that workers can actually deliver, and a
ventilated hearth. Progress reads actual completed world facts. No fake rewards,
scripted water injection disguised as groundwater, or demo-only automatic builds.
Brew-and-serve hospitality follows this working foundation; it is not a new
prerequisite for handing Levi this repair.

## Release A — dependable human controls and work

Ship the joined correction as soon as it is usable; do not wait for Release B.

### Work and movement owner

Read retained src/orders.ts, src/jobs.ts, src/movement.ts and cancellation callers
against engine/src/sdk/delivery.ts, construction-work.ts, games/colony-work.ts and
kernel/src/world.rs before editing.

- Repair the concrete Destination/waiting mismatch in both current work providers.
  Native terrain edits retain the destination but invalidate a route; the TS
  providers currently suppress the same-target Move that can repair it.
- Preserve native A*, traversal costs, paid movement and assignment ownership.
  Correct delivery's carrying-leg reachability/cost from source arrival, rather
  than checking both legs from the worker's starting position.
- Keep digging separate from hauling. Full storage cannot imprison a worker with
  spoil; put-down/release retains exact material and carried-water custody.
- Unreachable, occupied and temporarily deferred targets have useful reasons and
  retry conditions. Independent work continues. Adding a valid route can make
  waiting work eligible; cancellation does not erase cargo or earned effects.

The next takeover correction uses one shared `WorkParticipation { automatic:
boolean }` capability, interpreted by the shared work owner before allocation.
Providers receive the same suspended-actor set and do not advance that actor's
automatic work. Colony's ordinary Go command takes control, cancels native work
attendance and submits native movement; explicit Resume work returns the actor
to automatic work. Existing task claims and carried goods remain paused, not
deleted or reassigned behind the player's back. Other actors keep working.
Delivery's separate quantity/haul preference remains a delivery policy. Rust
continues to own movement, traversal, work cancellation and resource custody.
The new capability must qualify manual movement during carrying/digging, explicit
resume and current-format restore before becoming a live gameplay claim.

The next independent human-client slice uses the existing demo's shared-world
authority: `remoteConnection` owns its bearer token, and the public host names a
region from game pack plus token hash. Invite a friend exposes an explicit
shared-control URL with the token only in the fragment. Opening it must preserve
the recipient's private saved token; refresh keeps the joined world. Invalid
invites refuse visibly. Explicit New world rotates the private token and removes
the invitation after successful replacement. The connection owner supplies an
optional invitation capability; local mode has none. Caps shows a selectable
read-only URL and copy feedback only after clipboard success, with a plain
shared-control explanation. This is not accounts, individual player grants or a
new backend. Luna owns the isolated `clearing-friend-link` client seam; King owns
the authority decision, review and eventual two-browser acceptance.

### Generated ground cover checkpoint — September 12

Rust surface queries now expose the original generated top alongside the current
solid top. The observation is derived and unsaved; digging lowers the current top
without growing new grass on exposed soil. The native binding and network parser
share one Zod surface schema. Original grass colors and low-poly detail are batched
into existing terrain chunks; no per-frame grass simulation or inventory is added.
The art owner keeps old and new column indexes separately and expands dirty bake
bounds for the declared grass height, so terrain edits remove old detail correctly.

Root proof in `clearing-ground-cover/.botanical/ground-cover`: u6211 passed the
native generated/excavated surface law, release WASM and explicit strict types;
u6216 passed 12 affected native-observation/wire/cache/art laws and strict types,
then failed Fallow on a duplicate type export. One public inferred type replaced
that duplication. u6218 passed the built local public rectangular Dig interaction,
observed an actual lowered surface and captured exposed soil; browser closed.
Root rejected the first polka-dot grass appearance. The larger irregular patch
recut passed three affected art laws, strict types, Fallow and build, followed by
an initial-view-only browser capture in `art-recut.log`/`clearing-v2.png`. No new
physics, server capacity or sustained multiplayer claim follows from those checks.
Fallow's new-only verdict passes; 14 inherited dead-code, 13 complexity and two
clone-group findings remain. Valid runtime entrypoints are retained.

This is an interim ground treatment, not full scenery acceptance. Trees, worn
paths, decorative plants and pickup/drop transients remain outstanding. Tree art
must join a real finite resource and navigation owner before it is presented as
choppable content. This checkpoint is now integrated and published with the invitation client, as
recorded in the current-live section. Full scenery acceptance remains open.

### Client admission and gesture owner

Read retained src/ui-actions.ts, digging-controls.test.js and main.js against
engine/src/client/controls.js, terrain-area-selection.js, client.js and
runtime/remote-client.ts.

- One visible rectangle, one release, one submitted command. Preserve screen
  endpoints, current level, pointer cancellation, Escape and right-click behavior.
- Show pending, applied and rejected results accurately. Do not overwrite refusal
  with a submitted message. The UI derives connection/work facts from their owners.
- Remove the blanket wait for a displayed revision after a known command receipt.
  Independent next commands must not depend on the display socket catching up.
- Unknown outcomes retry the same command ID and bytes. Recovery exhaustion is
  visible and stops further mutation admission; it is not an invisible queue trap.
  Keep camera, selection and view controls usable. Never enlarge the queue as a fix.
- Preserve current shared direct-input reconciliation/interpolation for the other
  demos. Colony uses deliberate orders and ordinary worker execution.

**Release A exit:** ordinary rectangle digging, hauling past full storage, an
unreachable lower target while other work progresses, route repair and reconnect
work together in the actual Colony. Levi gets the coherent build to try. This is
an interim release, not the full sustained-goal or public launch acceptance.

## Release B — the Clearing looks and plays like the Clearing

### King owns art and animation acceptance

Use the original Three → low-resolution bake → Pixi owner. Reuse src/art/clearing.js,
figures.js, art.js and the activity/presentation rules in src/view.js. No new visual
style, unrelated purchased pack, art-bank explosion or client-side physics.

- Replace plain terrain treatment with authored grass tops, exposed soil/stone
  sides, edge details and stable variation. Reuse face/tile art where appropriate;
  draw only relevant surfaces and cache changed patches. Rust still owns geometry.
- Restore paths, roots, rocks, mushrooms, ground cover and trees with the original
  visual vocabulary. Decorative details are click-through and cannot create
  physical blockers. Harvestable/obstructing scenery must use actual world rules.
- Restore the named cast and cat as their existing supported capabilities allow.
  Rowan and the witch already have dig/build/chop/pickup/deliver/carry/sleep poses;
  the current goblin-worker bank does not have equivalent activity coverage.
- Project real activity and custody into shared animation choices: walking,
  digging, building, pickup, carry and drop-off. Hold facing between observations;
  interpolate motion. No generic bouncing as a substitute for work animation.
- Restore actor names, understandable progress, clear selection and useful camera
  framing. Inspect terrain-edge artifacts against physical geometry; do not hide
  wrong geometry with scenery. Use Caps for the compact human interface.
- Keep dust, splash and sound restrained and tied to actual movement/work/cues.
  Reuse current shared effects and approved audio; cosmetic feedback settles no
  inventory and never advances simulation time.

### Water, smoke and building must work together

Keep the current finite-water and sparse local-smoke owners. Do not reopen pressure
simulation, whole-cave room reconstruction or CFD studies. Read the latest
GAS-REPAIR-PLAN.md correction before historical solver sections.

- Supply and complete walls, floors and four-facing stairs through ordinary work.
  Support spans must make usable rooms; do not regress to a wall beneath every
  floor tile. Collapse remains later. Retain deeper digging and multiple storeys.
- Confirm groundwater enters reachable excavations and soil storage is finite.
  Water and spoil transfers retain their quantities; wet ground is not an infinite
  sink. Preserve current contamination/current capability without adding chemistry.
- Correct the actual combined-play hearth supply failure. Consumed fuel produces
  smoke/heat; opening ventilation changes the real hazard and its visible feedback.
- The first scenario uses the Rust generator with a deliberate inviting starting
  clearing and nearby discoverable water. Initial composition may be authored;
  player edits and environmental behavior are genuine simulation.

### Shared world and efficient observation

Keep Region's transaction, latest-world records, receipts, native rollback/reload
and durable alarm ownership. **Do not convert all persistence to event sourcing.**
Selected durable gameplay facts can serve real observers later; a complete world
history is not required for this sprint's multiplayer or crash recovery.

- Two independent browser sessions must join one actual world through a usable
  human flow. Reuse current host access where sufficient. Clearly label shared
  cooperative control; do not invent an account backend or borrow Hub cookies.
- Resolve simultaneous orders deterministically in the authoritative owner and
  show their actual results. Neither client advances its own online simulation.
- Send a complete baseline on join/recovery, then bounded changed information.
  Reuse existing terrain changed-column facts; avoid resending complete geometry
  after each cut and unchanged presentation definitions on every update.
- Keep a single projection/replication owner with explicit additions, updates and
  removals. Coalesce replaceable poses/water visuals. A missing baseline resets
  the view; it does not cancel accepted gameplay or create another world.
- Preserve existing finite bounds and evaluate actual projection/byte costs. Do
  not add a generic patch language, replay service or broker to solve this slice.

**Release B exit:** the same actual clearing has the restored visual quality,
readable work animations, multi-level play, useful water/smoke and working two-person
co-op. It passes the fixed workload below and Levi's human playtest. Then capture
an honest short clip, add concise controls/goal copy and publish the ordinary page.

## Acceptance and feedback cadence

Keep the September 12 fixed workload and numerical budgets in
[GAS-REPAIR-PLAN.md](GAS-REPAIR-PLAN.md#fixed-playable-workload-and-budgets).
Do not silently lower them or call Release A complete-goal acceptance.

- 20 minutes with two actual browser clients; 32 earned cuts across two depths;
  full storage/ground spoil/autohaul recovery; an enclosed lower room and two
  accessible upper levels; groundwater; paid indoor smoke and ventilation.
- Reconnect one client, exercise lost acknowledgement and owner restart using the
  existing bounded harness. No duplicated cuts, goods or fuel; the other remains
  usable. Current-format save and paused intent remain correct.
- Preserve warm-step p95 ≤15 ms, p99 ≤30 ms, max ≤50 ms; command p95 ≤250 ms,
  max ≤1 s; browser gaps p95 ≤25 ms, p99 ≤50 ms, no unexplained ≥250 ms hitch
  or ≥1 s world stall. Report cold load separately, not as an exclusion from play.
- Require readable normal and narrow UI, correct clicks, and actual activity
  animation. Use Levi's supplied screenshots as the visual comparison. Static
  screenshots cannot prove timing, picking, multiplayer or fun.

Run focused checks for the changed mechanism, then one joined scenario. Preserve
valid evidence; repeat only invalidated portions or failures that need a specific
answer. No historical matrix, expensive editor trace or hours of unchanged proofs.
At the first coherent usable fix, deliver a build for Levi. Do not wait to collect
an entire sprint's worth of polish. Human feedback can reopen this same outcome.

Track progress by these exits: reliable actions; restored appearance/animation;
joined environmental play; two-person continuity; sustained acceptance and Levi's
playtest. Commits and source-only tests are supporting evidence, not velocity units.
A useful update says what can now be played, what still fails and what is live.

## Ownership and current handoff

King owns architecture, original art, integration and release. Luna handles bounded
mechanical implementation in isolated worktrees. At most two implementation lanes:
work/movement, and client/controls/replication. One writer per coupled seam. Shared
contracts are agreed before edits; King joins and reviews actual callers.

Both original repair lanes completed source and released custody to King:

- `/mnt/fungi-data/botanical-work/clearing-work-recovery`, branch
  `fix/clearing-work-recovery-20260912`: movement/work correction; root corrected
  and qualified the actual joined regression before publication.
- `/mnt/fungi-data/botanical-work/clearing-client-recovery`, branch
  `fix/clearing-client-recovery-20260912`: admission/recovery/UI correction.

Integration remains `/mnt/fungi-data/botanical-work/native-atmosphere`. Art changes
that overlap the client lane wait for explicit file release; independent art
preparation can proceed. Current goal remains unfinished. Subsequent bounded work
continues in isolated writing roots with reviewed contracts and actual caller proof.

## Off the sprint's critical path

Full brewing/needs/social restoration remains in RETAINED-BREWING-RESTORATION.md
and the retained game plans. AI players/storytellers and many-faces authority stay
engine requirements, but an AI demonstration is not a condition for the human
Clearing release. RTS/pirate/survival expansion, multi-region handoff, editor/MCP
work, new accounts and historical world replay are deferred. Preserve those
working consumers and their gains without expanding their features here.

The success statement is simple: **Levi and a friend enjoyed building and digging
in the actual clearing, it looked alive, water mattered, and it stayed responsive.**
