> September 11 scope correction: Colony must regain the retained Clearing's
> multi-storey building, digging, finite water/soil and growing/crafting loop.
> [DEMO-ROADMAP.md](DEMO-ROADMAP.md) owns the staged return, ship/art direction,
> recorded tower-defense proposal and sound-recipe boundary. Cosmetics are the
> first shared chunk, not the final size of the colony game.

> September 11 implementation update: Levi selected the existing Formations
> demo for the first pass. Native ballistics/aiming, explicit material contact,
> committed feedback, recoil/smoke/dust/hit clips and optional synthesized sound
> are live in the existing Formations demo. DESIGN.md owns exact qualification
> and publication receipts.
> Other demos, full physics ragdolls and footsteps remain later work.

# Four demos, one reusable presentation kit

King Bolete · September 11, 2026 · proposal, not an implementation assignment

Levi reports the revised Survival movement feels much better and loves firing
the RTS cannon. Preserve those gains. The next pass should make all four existing
demos inviting and satisfying, using shared client mechanisms and original art.
No fifth demo, physics rewrite, or new gameplay prerequisite.

## What the player should notice

| Demo | First visible payoff | Shared mechanism it proves |
| --- | --- | --- |
| Formations | Cannon barrel kicks, a brief muzzle flash becomes rolling smoke, a low boom lands with the shot, and an actual hit bowls a soldier over with a directional tumble, floppy limbs and a dusty landing. Soldiers march with restrained dust and readable team colors. | Committed one-shot cues, layered effects, spatial sound, visual attachments, group effect budgets. |
| Survival | Grounded walking with small foot-contact dust, clear hover/interaction feedback, a distinct survivor silhouette, and visible pickup/eating poses. No return of vertical walking bob or idle-facing snaps. | Distance-based motion cues, action clips, item attachment projection, immediate local feedback versus committed completion. |
| Colony | Workers visibly carry the actual bread parcel between a pantry and receiving basket. Pickup, delivery and eating have a small sound/pose payoff. Workers have varied clothing and unsynchronized idle motion. | The same motion, attachment and action presentation, driven by actual material custody and outcomes. |
| Pirates | A readable timber boat leaves a speed-dependent wake and bow ripples; deck footsteps sound wooden; a pennant or sail has restrained movement. The chest looks like a chest, and selecting the boat is visually obvious. | Moving-support coordinates, surface-specific effects/sound, persistent state-driven emitters, shared hover/selection feedback. |

Stage these as four charming places: a little camp, a pantry/courtyard, a cannon
practice field, and a short stretch of water with shoreline landmarks. Scene
props use authored placement data and the same builders. Decorative grass or
pebbles do not acquire collision merely because their sprites look solid; any
physical obstacle needs its explicit existing capability. Keep the moving areas
and cannon target readable. Dust should underline movement, not hide it.

## Actual source baseline

Read against integration ea063cb and its immediately preceding runtime cf172bf:

- `engine/src/client/client.js` already shares camera, selection, actor caching,
  interpolation/prediction and drawing across all four. Its transient layer is
  currently used for the drag graphic; there is no shared effect lifetime owner.
- `animation.js` selects idle/walk from motion and retains facing; its phase is
  shared. `visual-bindings.js` selects content assets. Several crates/chests/holds
  use the same shelf asset, and all four actor roles bind the goblin figure.
- `src/art/figures.js` already has pickup, carry, eat and work poses. The fresh
  client consumes idle/walk, so exposing relevant retained poses comes before
  manufacturing another rig. The original cannon and ship builders are in
  `src/art/cannon.js` and `src/art/ship.js`.
- `src/art/static-pack.js`, the existing export entry and manifest own loading,
  checksums, atlas frames, anchors and CPU silhouettes. Keep the Three-to-baked-
  sprites-to-Pixi path. The demos must not bake models when the page starts.
- `GameSession` has real action outcomes and physical impact identities/frontiers.
  `runtime/observation.ts` currently publishes poses and HUD facts/controls, not
  an identified transient cue stream. Reading health differences or disappearing
  projectiles is not a reliable substitute for a confirmed impact.
- The water backdrop in the pirate client is simple static drawing. A wake is
  presentation work; it does not require the environmental water solver.

The fresh-engine DESIGN.md owns current direction. Older COMBAT-NEXT.md opening
paragraphs describe an earlier source baseline; current cannon/impact source is
implemented and takes precedence.

## Small reusable owners

### 1. Motion and action presentation

Extend the existing animation owner to track per-entity gait/contact phase, with
stable authored variation. Derive footsteps from distance along presented normal
movement, relative to the actor's support. A stationary sailor carried by a ship
must not walk or emit dust. Reconciliation corrections, teleports, resets and
support changes reset the contact accumulator instead of generating a trail.
The presentation caller must identify corrections explicitly; the current pose
array alone cannot reliably distinguish them from walking.

Match dust/sound contact to the displayed clip's contact markers. Keep the body's
world position and picking origin stable. Actual authored limb motion supplies
weight; do not translate the whole pawn up and down as a walking effect.

Continuous state (walking, holding a parcel) comes from a bounded projection of
current canonical facts. Short actions (pickup, eating, recoil) use the confirmed
cue path. A clip may have an authored cosmetic duration without keeping physical
work alive. Rejection cancels anticipation; animation completion never settles a
transfer or consumes food. Per-entity clip state is disposable client state.

### 2. Effect playback

Add one small client effect owner with checked definitions: atlas clip, emitter,
attachment, fade/scale curves and lifetime. Compose these for dust, smoke, chips,
ripples and brief flashes. A pool owns sprites, reuse, expiry and destruction.
Game presentation packs choose recipes, colors and strengths; the renderer must
not branch on `formations`, `bread` or `pirates` to execute them.

Effects attach either to an entity/local anchor or to a world contact point.
Detached dust stays where the foot landed. A wake is left behind the hull; it
does not remain parented to the moving ship. Deck effects use support coordinates
when that is the intended behavior. All use existing projection, camera zoom and
depth conventions. Effects have no hit area and cannot intercept selection.

Smoke puffs here are cosmetic and short-lived. They do not replace physical smoke,
heat, gas or fire rules when a game uses those systems. No debris rigid bodies are
needed for a two-second impact burst.

### 3. Honest cue delivery

Keep three sources explicit:

1. Local input: hover, pressed button, selected target and pending order marker.
   Immediate and reversible; never announces damage or a completed job.
2. Presented continuous motion/state: footsteps, wakes, carried appearance.
   Local and disposable; no network packet per dust mote.
3. Committed outcomes: cannon launch, impact, delivery and consumption. Stable
   identity and committed time from the existing world/command/impact owner.

For the third source, add a bounded recent cue projection at the existing session
commit boundary. It must survive the lost-observation gap without becoming another
physical event owner. Capture the supported outcome before existing impact
compaction discards it; do not give the renderer a consumer frontier that prevents
physical history cleanup. Commit cue metadata together with the world, or derive
it from retained committed records where those actually contain the needed facts.
Never persist particle objects or audio playback.

Identify cues by world epoch plus an owned monotonic sequence, with source outcome
identity retained for deduplication. On fresh connection, establish a baseline
without replaying an old battle. On resumed connection, consume still-recent cues
once; detect retention gaps, resynchronize and skip stale flourishes. Missing a
cosmetic puff is acceptable; repeating damage or freezing commands is not. Both
browser and DO hosts produce the same projection. Limit the window by age, count
and bytes; consumers cannot grow server storage by failing to acknowledge effects.

Illustrative boundary, to refine against these callers before implementation:

```ts
// Game-owned visual/audio definitions; no world mutation callbacks.
const presentation = {
  motion: { "boots.on.soil": "smallDustStep", "boots.on.wood": "deckStep" },
  cues: { "cannon.fired": "cannonShot", "cannon.hit": "earthImpact" },
  effects: {
    cannonShot: { layers: ["barrelRecoil", "muzzleFlash", "muzzleSmoke"], sound: "cannonBoom" },
    earthImpact: { layers: ["dirtBurst", "briefScuff"], sound: "earthThump" },
  },
};

// Runtime invokes registered projection only after the physical result is known.
// Its validated output joins the existing detached world transaction.
const committedCue = { epoch, sequence, sourceOutcomeId, time, kind, at, subject };

// Browser-only owners. Neither can issue damage, spend ammo or advance world time.
for (const cue of cueCursor.accept(observation)) effects.play(presentation, cue);
for (const contact of animation.contacts(presentedMotion)) effects.contact(contact);
effects.update(renderClock, camera);
```

These are proposed shapes, not existing exports or permission to add a generic
event bus/plugin language. First callers are the cannon plus a completed parcel
transfer, so the mechanism must serve both before being called reusable.

### Real cannon trajectory and multiple hits — direct Levi amendment

Levi wants one cannonball to knock over all three lined-up soldiers and to fly
like a heavy projectile rather than an endless straight line. This is physical
engine work added to the proposal, not something the effects layer can fake.

Current source: `formations.ts` launches at velocity(8,0,0), with range20 and
lifetime4 seconds. `world.rs::advance_projectiles` uses constant velocity, sweeps
for the nearest collider, emits one impact and despawns the ball at first contact.
It is a real entity with real collision, but has no gravity, piercing or ground
response. It is not infinite; the straight flight and first-hit removal are real
limitations. TypeScript currently applies fixed damage and bounded grounded
knockback from each impact.

First playable upgrade:

- Give projectiles authored gravity/initial velocity and a readable low ballistic
  arc. Render the authoritative elevation and a ground shadow; the client must
  not draw a different decorative parabola over a straight physical path.
- Support a finite penetration policy: continue after a susceptible body hit,
  reduce the remaining speed/energy according to authored resistance, and stop
  when exhausted or against a blocking surface. Three bodies in the actual path
  can all receive a hit from the same projectile. There is no special three-person
  list, area-damage substitute, or new projectile spawned behind each victim.
- Register the practice ground through real surface/collider geometry. Do not
  invent a global ground-y=0 rule that would break towers, decks and future terrain.
  Ground impact selects the rolling/embedded/resting response in the later direct
  amendment below; a temporary impact puff is not the whole landed-ball result.
- Each physical contact supplies the committed cue for its own knockback/tumble.
  An actor that moves out of the path escapes; a nearer blocking wall protects
  actors behind it. Ammo is paid once for the entire flight. No fake death policy.

Engine ownership remains Rust: bounded curved-flight integration, swept contact,
ordered multiple contacts, projectile identity and finite remaining travel/energy.
Use the existing maintained collision owner on bounded trajectory segments rather
than endpoint-only checks that tunnel through targets. Clip the final interval to
range/lifetime and ground contact. Define maximum contacts/substeps and the exact
budget-exhaustion rule before implementation; never skip collision silently.
Preserve remaining simulation time through multiple contacts within a tick.
Track contact entry/exit or a bounded per-flight victim policy so starting inside
an already-hit body cannot create repeated hits or a zero-time collision loop.

TypeScript authors projectile profiles, penetration resistance and game damage/
morale/knockdown responses. The same supported primitives can serve arrows that
stop, cannon rounds that penetrate and later other ammunition. Do not add a full
weapon scripting language. Existing original cannonball/figure art, render
interpolation and shared cue/effect owners consume the result.

Qualify the actual scene: one ball crosses three aligned colliders and produces
three ordered unique impacts; a blocking wall stops it; moving aside avoids it;
gravity changes both trajectory and hit height; a miss lands/expires; saving and
restarting between victims preserves the remaining flight and never spends ammo
or damages an earlier victim twice. Show that same shot in the existing RTS page,
with actual arc, ground contact and three reactions. This physical upgrade comes
before decorating the cannon as if it already has those behaviors.

### Rolling versus embedded cannonballs — direct Levi amendment

Levi also wants the impact to determine whether a cannonball rolls or sticks in
the ground, with original visible embedded-ball art. Add this as the next bounded
physical projectile response, shared with the ballistic/multi-hit upgrade.

Use contact-normal speed, tangential speed and radius/mass-derived or explicitly
authored impact strength against surface properties. A small game-scale profile
can expose penetration resistance, rolling resistance and restitution. TypeScript
content binds those values; the Rust response owner does not switch on names such
as "mud" or "cannon". Firm-ground shallow impacts can skip/roll, soft-ground steep
impacts can embed, and an exhausted ball simply rests. Hard-ground steep impacts
can rebound with energy loss. Exact thresholds and units belong to one reviewed
profile; this is an intended game approximation, not a soil-mechanics claim.

Ground properties come from the actual contacted surface definition/query. The
first practice field can declare firm and soft patches. Existing wet-soil facts
may later alter those properties through their real producer; do not secretly
launch a fluid/soil solver or pretend the fresh demo already exposes wetness.

Proposed physical states:

```text
flying -> contact -> continue / rolling / embedded / resting
rolling -> next surface + deceleration -> rolling / falling / resting
embedded or resting -> quiet saved object
```

Rolling follows the ground contact and loses speed under bounded resistance; it
does not continue the old airborne straight line. A ledge returns it to flight.
If rolling contact with bodies is supported, reuse the impact/contact suppression
rule rather than applying damage every update. A stopped ball leaves the active
projectile workload. Preserve its original identity and canonical position as a
settled object; save/reopen restores it without rerunning its last impact. A game
may later permit retrieval, but settling does not mint another ammunition lot.

Render embedded depth/orientation from the settled physical result. Use the
original iron-ball builder with an authored partly buried variant, dirt lip,
small scuff and contact shadow at the game's pixel scale. Material tint/ground
bindings supply the surrounding dirt appearance. Dust is a temporary effect; the
half-exposed ball remains. Keep visual embed depth separate from terrain excavation:
a small mark does not create a free crater, remove voxel material or change paths.
Preserve appropriate picking if the settled object is inspectable.

Acceptance examples: the same shot skips/rolls farther on firm ground and embeds
in the soft patch; near-threshold outcomes are deterministic; rolling decelerates
to rest; a ledge resumes flight; stopped objects do no per-tick projectile work;
restart preserves the same buried ball and no duplicate item, damage or effect.
Review original lodged-ball art at native and actual game scale, all used views.
This is now planned functionality, not an already-deployed ground response.

### Cannon ragdoll effect — direct Levi amendment

Levi explicitly wants a ragdoll effect on cannon hits. Make this part of the
cannon payoff, not a separate demo. First scope is an authored ragdoll-like
reaction through the existing sprite pipeline: directional impact, tumbling/floppy
limb poses, landing dust and recovery. Reuse the original figure rig to bake a
small set of directional clips; do not just spin the entire flat sprite like a
cardboard cutout. Physical knockback owns root displacement and contact. The
presentation follows that committed motion and uses impact direction/strength
for the clip; it does not invent another trajectory or decide collision/damage.

Compose impact reaction from the same committed cue, animation and effects owners.
The same mechanism can later serve explosions, falls and charging animals once
those games supply their physical events. A reaction has explicit priority and
interrupt rules against locomotion, carry and eating clips. Do not delay controls
or simulation to finish an animation. Show permanent collapse only when game-owned
incapacity/death actually exists; do not fabricate death from a dramatic hit.
A carried item remains in its canonical owner's custody unless a physical rule
explicitly drops it. Repeated impact packets cannot launch a second tumble.

Full articulated ragdoll physics is a separate later decision, not what this first
pass promises. If actual limbs must collide with terrain, use one explicit native
physical owner and qualify its WASM/cost/recovery boundary; do not smuggle a second
physics world into the renderer. The first visible target is a convincing cannon
reaction with the current engine and original art, reviewed in motion at game scale.

### 4. Sound and restrained camera response

One client audio owner handles user-gesture unlock, master mute/volume, distance
attenuation, voice limits and disposal. Footsteps need small variations and a
cooldown, not a sound from every soldier every frame. Original or distributable
licensed audio travels with provenance in the asset package. Prototype synthesis
is acceptable where it sounds right; avoid making the cannon a UI beep.

Camera kick is tiny, opt-out and limited to nearby important events. It is a
visual offset through the common camera transform, with picking using the same
transform. Do not shake canonical coordinates or stop the DO clock for hit-stop.
Start with recoil, sound and impact contrast; only add camera shake if it improves
readability. Reduced-motion mode disables shake and strong flashes. Hidden tabs
suspend cosmetic playback and discard expired cues on return.

### 5. Better original art as a shared kit

Keep the accepted chunky pixel-baked figures, palette family, feet anchors and
isometric scale. Build four readable roles with shared body parts/pose conventions:
worker apron, survivor cloak or satchel, soldier helmet/team sash, pirate bandana.
Start with silhouette and clothing contrast rather than more texture detail.

Replace placeholder shelves with actual pantry crate, food basket and ship chest.
Improve cannon material separation and give the barrel an authored muzzle anchor
and recoil clip/part. Add ship bow/stern contrast, restrained rigging detail and
wake anchors without obscuring crew or changing the physical deck dimensions.
Use a few original dust/smoke/ripple/chip frames across recipes; do not multiply
whole actor atlases for each effect, color and role combination. Verify packed
atlas cost before accepting a customization approach. Retained poses may need
export/binding work; source availability is not a claim that every clip is packed.

Review new art at native bake size and actual game scale, from every supported
orientation. Silhouette, anchors and picking must agree. No new generated concept
character style or model detail that disappears at the game's real scale.

## Landing order and reviewable demos

1. **Movement and commands, across all four.** Per-entity motion contacts, tiny
   dust, shared effect lifecycle, restrained footsteps, and pending/accepted order
   feedback. Survival is the sustained-motion acceptance case; a sailor standing
   on a moving deck is the counterexample. Deliver on the existing pages.
2. **Real cannon flight, payoff and colony completion.** First land the bounded
   gravity/multiple-hit/ground-contact upgrade above. Then identified committed cues, recoil,
   muzzle smoke/boom, directional ragdoll-like tumbles and landing bursts, and pickup/delivery confirmation through
   the same owner. Preserve finite ammo, exact retry and physical knockback.
3. **Character and prop pass, across all four.** Shared roles, retained carry/eat
   clips and honest carried-item display; distinct crates/baskets/chest. Same
   builders/export owner. One coherent art bundle, not separate demo pipelines.
4. **Water and scene personality.** Wake/ripples, deck sounds, pennant movement,
   lightweight grass/shore dressing and a compact shared Caps effects setting.
   Polish inside existing pages; the hub links remain navigable.

Each chunk should be visibly useful by itself. Show Levi the running result and a
short honest capture from it; no fifth effects laboratory. Implementation can have
one coupled shared-client writer and one independent original-art writer after
exact files are assigned. King owns cue authority, source/art review and serial
integration. Botanical retains Caps source; this proposal needs only its current
public controls, no shared component writer or site changes.

## Performance and acceptance

Proposed initial cosmetic limits, to tune from the first real scene:128 live
particle sprites,32 active effect instances,12 concurrent sound voices. Keep a
small pool reserve for impacts; shed distant foot dust first. No allocation per
particle per frame, no full-screen smoke filter, no new world scan per emitter,
and no extra simulation tick or request per cosmetic cue. Degrade decoration
before controls. These are budgets, not measured capacity promises.

Measure effects-off versus effects-on in the same actual moving scene. Target
under1ms additional main-thread work at the existing demo workload and no steady
memory growth; this is an acceptance target, not current evidence. A performance
miss reduces effect density/implementation cost rather than raising the replay
horizon or masking network stalls. Do not infer RTS population limits from six
soldiers or substitute software-renderer FPS for normal hardware play.

Required behavior: stationary actors emit no footsteps; camera pan does not emit
dust; moving support alone does not animate crew walking; reconciliation does not
spray a correction trail; duplicate observations do not replay a boom; reconnect
skips expired effects; paused worlds stop world effects while UI remains usable;
picking and hotkeys remain correct with effects enabled; art and pools clean up
on world change. Test these focused laws and personally view the changed scene.
Reuse unchanged durability/physics evidence; no old browser matrix.

This is a proposal. No effect runtime, new art, sound asset or deployment was
created by this planning change. The existing improved Survival release remains
live and Levi's positive play feedback is recorded in DESIGN.md.
