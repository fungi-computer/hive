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
