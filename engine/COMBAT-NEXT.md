# First cannon consumer: boundary before implementation

King Bolete · September 10 · source readiness, not implemented combat.

The native Action union currently has Move/Transfer/Consume. ActionResult has
accepted/reason/revision only. GameSession.step expects one result per submitted
action and gives those outcomes to authored systems on the following step.
A projectile striking later cannot be represented honestly as another result
for its earlier launch action. Keep admission results and later physical events
separate; do not manufacture a second launch or settle damage in Pixi.

The native owner should hold projectile position/velocity and collision shape;
TypeScript supplies launch definitions and damage/morale policy. Existing Body
contains speed only and is not a collision shape. Add an explicit collision
capability for actual participants rather than assuming every Position collides.
The first physical sweep must use world coordinates, including moving supports.
A sprite's dimensions must not determine physics.

Proposed step shape (requires review against a maintained collision library):

    admit launch intent using finite ammunition and current ownership
    integrate one bounded projectile interval
    sweep its volume against eligible collider shapes
    select earliest contact, using stable ID to break equal-time ties
    settle projectile state and append an impact event once
    commit world, event identity and command receipt together
    next authored rule consumes the impact and applies game damage/morale

A launch must not consume ammo and then lose its projectile to failed creation.
Detached candidate rollback covers both. Impact-event identity, consumption
frontier and pending authored consequences must survive current save/restart.
Do not append impact events to the positional action-results array. No unbounded
event history in every frame; renderer sees bounded committed projection.

Acceptance for the first shot: crossing a body between samples still hits;
nearest obstruction wins; miss stays a miss; launch retry spends one unit;
save/restart between launch and impact preserves flight; replayed impact causes
one game consequence; browser shows that physical trajectory. Ballistic accuracy,
ricochet and fleets are later decisions. Rapier/Parry adoption requires actual
API/runtime inspection and this consumer, not a speculative dependency addition.

## Maintained collision-library direction — September 10

Root checked current primary sources. Parry's `cast_shapes` computes the first
contact between two linearly moving shapes over a bounded interval. That fits a
finite cannonball sweep without introducing a second world or a rigid-body time
owner. Rapier's collision/query pipelines remain the fuller option if later
contacts require persistent physical bodies. For this first consumer, qualify
Parry directly inside the existing Rust step.

Sources:
- https://docs.rs/parry3d/latest/parry3d/query/fn.cast_shapes.html
- https://rapier.rs/docs/user_guides/rust/simulation_structures/
- https://raw.githubusercontent.com/dimforge/parry/master/crates/parry3d/Cargo.toml

The latest crate landing page reports 0.30.2, while the cached query result reports
0.29.0. Resolve and pin the actual released crate and inspect its API before code;
do not copy a version from search snippets. The current manifest exposes optional
parallelism and enhanced determinism. Neither proves our WASM target or replay
behavior. Qualification must compile the selected feature set for our actual
wasm32 target and exercise swept hits through the same kernel used by the demos.

This is a selected direction, not an installed dependency or completed cannon.

## Source-owned implementation order

The current source read confirms the first coupled seam is
`kernel/src/components.rs`, `world.rs`, and `lib.rs`, followed by the real
`contracts.ts`, `runtime/wasm-kernel.ts`, and `runtime/session.ts` callers. Native
`advance` currently returns only revision/results; no projectile or impact state
exists. `Body.speed` and `Obstacle.occupied` must not be reinterpreted as colliders.

1. Root pins and qualifies the maintained collision dependency in an isolated
   kernel lane. Native source owns explicit collider/launcher/projectile state,
   finite-ammunition launch, bounded sweep and stable impact identity. Current
   snapshots must include in-flight state. Failed admission changes neither ammo
   nor projectile count. No TypeScript copy of collision calculations.
2. The shared session gets a separate typed impact result and retained pending
   consequences. Its current positional action-result list remains one result
   per submitted action. A delayed collision is never an extra launch result.
   Root must settle successful-consumer acknowledgement/cadence against actual
   system scheduling before implementation; missing a slow consumer's event or
   executing one twice is not acceptable. Do not invent a general message bus.
3. The formation pack adds health/damage/morale as TypeScript rules and a native
   physical knockback request. Native movement remains the position owner.
   Existing selection, commands, art export, interpolation and DO host are reused.
4. Qualify the focused launch/impact/restart laws, then publish one actual cannon
   shot in the formation scene. No full old-demo matrix or separate physics lab.

The actual crates.io API reports stable parry3d 0.30.2. Root downloaded and read
that exact released manifest in `.botanical/cannon-readiness/`; it is Apache-2.0
and its feature set matches the retained primary manifest. Dependency installation
and native/WASM qualification have not run. Match numeric precision to the
existing f64 kernel before choosing parry3d versus its f64 package variant.

## Impact delivery contract for the shared session

Keep physical impacts separate from immediate action outcomes. The native step
returns bounded ordered impacts with stable identities alongside its action
results. A successful native step is their producer; rendering cannot produce
or acknowledge them. The session persists pending impacts with its existing
whole-session snapshot inside the Region commit.

A system that consumes impacts must declare that capability in its definition.
Successful scheduled execution acknowledges the impacts supplied to that system;
`every` cadence must not silently discard events between its runs. Track a
frontier per declared consumer, compact only after all interested consumers have
advanced, and reject bounded backlog overflow atomically. This is a typed
physical-event mechanism for current consumers, not a general event bus. A
failed authored rule rolls back its acknowledgement and writes together through
the existing GameSession candidate boundary. Save/restore validates consumers
against the current pack, event identities, ordering and frontier references.

The first formation consumer owns health and morale consequences. It requests
physical knockback through a native operation rather than writing Position.
Admission of launch owns finite ammo and projectile creation in one native
candidate; an impact acknowledges no second launch and consumes no second ammo.
The next implementation review must show those facts in the actual callers before
adding other event kinds or a generic subscription API.

### Native mutation boundary found during implementation review

`Kernel::advance_json` currently validates authored writes, then mutates ECS,
revision and actions before advancing movement. It is not itself a detached
whole-world candidate. The existing GameSession rollback and Region's disposable
WASM candidates must not be misreported as a native guarantee.

The projectile join introduces a new fallible geometric query after possible
launch/admission. Its implementation must stage fallible work before mutation or
restore the exact prior native state on failure. In particular, a failed sweep
cannot leave spent ammo, allocated shot identity, moved bodies or an incremented
revision. Prove this through the public native entrypoint, not only by wrapping
it in a GameSession test. Avoid adding unconditional duplicate whole-world work
to scenes without projectiles; measure the actual first-shot consumer before
claiming the approach scales to a large formation.

## Qualified collision and visual boundary — September 10

The isolated cannon-kernel source at `6af2238` pins `parry3d-f64` 0.30.2
with required-features/std/alloc/enhanced-determinism. Native u5094 passed six
focused sweep laws; its remaining crossing assertion demanded sub-nanosecond
precision. Diagnostic u5098 found TOI 0.46500000158074634 versus analytical
0.465, with contact on the expected face. The corrected law checks time error
as travel distance plus contact position/normal within 1/1024 world unit.
This is a game-scale test tolerance, not a changed solver parameter.

Actual u5099 exited zero: the corrected crossing law passed and the real
wasm32-unknown-unknown target checked successfully. Its scope is inactive/dead
with an empty control group. These results qualify the query dependency; they
do not prove integrated firing, performance capacity, or deployed combat.

Actual u5102 exited zero: both static resolver laws and the one new cannon
manifest-family law passed. The resolver test uses actual exported cannon
bindings for all four facings. Original cannon geometry has not yet been baked
or personally reviewed at game scale; the published art bank is unchanged.

Native firing remains in the isolated cannon-kernel lane. Native returns new
impacts only; GameSession owns durable pending delivery and consumer frontiers.
Active-shot capacity rejects new launches, never deletes existing flight.
Range/lifetime clip the sweep interval before testing contact. Ordinary steps
without shots or fallible combat operations retain their existing fast path.

### Original cannon bake accepted

Maintained exporter u5104 exited zero at integrated source `8ad85ee`, with
1415 textures (four cannon facings and one cannonball added). The owned scope
is inactive/dead/empty and port 5187 is free. Root personally viewed exact atlas
crops in `.botanical/fresh-cannon-export/contact.png`: timber carriage, iron
barrel and muzzle are readable in all four directions, with no visible clipping.
Manifest SHA256: `3d62bfd593c5cf532eaf5469b15294e9f73eb92d8c098162f14a18ecffb783f7`.
Only atlas-2 and manifest changed in the tracked bank; prior bank is preserved
in the ignored export packet. This accepts native sprites, not in-game
placement, projectile alignment during movement, or hosted cannon play.

### Frozen impact wire and first playable command

The shared impact record is `{id, sequence, projectileId, sourceId, targetId,
time, point, normal, velocity}`. Vectors are `{x,y,z}`; time is absolute
simulation seconds. Sequence is a positive safe integer from the native saved
impact counter and defines delivery order; times may differ within one step.
Session saves a scalar producer high-water plus consumer frontiers, compacts
the prefix consumed by everyone before admitting new backlog, and rejects
already-consumed sequences without retaining an unbounded ID set.

The first formation command should use the existing pack presentation controls:
select/march the existing soldiers, then Fire cannon launches a finite round
from a positioned cannon toward their formation. Inspect exposes ammunition,
health and morale. No new gesture engine is needed for the first playable shot;
point-target aiming can reuse the shared command/selection intent afterward.
A hit applies TypeScript damage/morale and requests native displacement; a miss
still spends the round. Projectile visual identity comes from launcher content
definition, never a Rust branch on `formation.cannonball`.

The native and Session writers have separate worktrees. Root owns final
Launch/Displace SDK callers and formation content after these native shapes
settle; the already-exported cannon assets are independent of those callers.

## Current integrated checkpoint

At `865a507`, native finite launch/swept impact/grounded displacement, saved
Session impact delivery, and the actual formation consumer are integrated.
Focused native corrections passed in u5112 and u5124; Session laws passed across
u5114/u5118/u5120 corrections, with strict types passing u5122 and consumer types
u5126. Earlier failed results remain evidence, not replaced green runs.

The formation scene has a fixed downrange cannon with six rounds. Soldiers have
TypeScript health and morale; an impact requests native knockback. Formation
facing controls turn soldiers, not the cannon. Zero health does not yet implement
death. Rotating cuboid collision during a relevant sweep is rejected atomically;
this is not a general rigid-body simulation or a large-battle capacity claim.

The new actual-WASM consumer law checks one spent round, visible flight, one
health/morale consequence, displacement, and identical continuation after saving
in flight. Its execution awaits the maintained release WASM build u5128. Cannon
play is not deployed at this checkpoint; the existing public DO demos remain
unchanged. Next acceptance is this joined consumer, followed by a bounded actual
rendered shot and coherent same-host release.

Actual release WASM build u5128 finished successfully (5m12s), with its scope
closed. Actual consumer u5131 reached all shot/impact assertions but rejected
restoring the in-flight save: native successful ActionResult serializes reason
as null. The TypeScript contract and validator now admit that existing native
representation and expose the optional returned projectile identity. Corrected
u5133's actual-WASM consumer law passed, including identical post-impact state
after restoring flight. Its strict type stage is still being collected; this is
not browser, DO-restart, or hosted cannon acceptance.

## First hosted cannon release

Actual-WASM consumer plus strict types finished green in u5133; its scope is
closed. Client build u5135 passed. Existing public DO host deployed in u5137,
version `27592e86-4037-438c-8942-059443a60f2f`, implementation hash
`643e7cd418ebc2e2803e2011c1908f33bdd322c69bbeb1eeaf762c2378bd3279`.
Browser u5139 used the exact client build with the real hosted DO. Public Fire
spent one round, produced health80/morale50, and returned no page errors. Root
viewed cannon.png. This screenshot shows the resulting scene, not a captured
mid-flight frame. Local save-in-flight passed; no new hosted crash injection.

Frontend deployed as `56ce0e7d-555c-4e73-a8a8-4f640a9acb58` at the existing
preview /engine/formations.html. First immediate readback u5142 retained11
mismatches; cache-busting followup u5144 hit403 with a different request header.
The ordinary matching-header read of only those11 in u5145 passed: all143 files
now match, with112 non-engine files unchanged. No rebuild or second upload.
Current save formats are a clean break; use New world for an old demo save.
Artifacts and prior dist remain in .botanical/cannon-release. Source9f38cd9 is
verified on the existing private recovery ref. Cannon is an accepted increment,
not completion of the full engine goal or large-battle performance proof.

### Actual current-format DO cannon recovery

Maintained local DO fixture at2dfa9e2 finished u5149 exit0 with exactly two
owned runtime starts. It saved native3/session5 while a real shot was in flight,
restarted the runtime, and replayed the lost step without changing the saved
world or spending another round. The pending impact produced health80/morale50
and native displacement once. A before-commit failure left the entire candidate
unchanged; successful retry and repeated receipt kept the same final state and
five rounds. The exact receipt and snapshots are in
.botanical/cannon-recovery/native-v1. This is local SQLite DO process-restart
and transaction evidence, separate from the already-published hosted firing
interaction; no hosted crash injection or capacity claim.
