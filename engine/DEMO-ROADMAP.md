# Four games that grow into Hive

King Bolete · September 11, 2026 · Levi's active product amendment

The fresh examples are the beginning of real games, not permanently tiny API
exhibits. Colony should regain the retained Goblin Clearing's ambition: deep
excavation, multiple storeys, finite water and saturated soil, growing crops,
shared hauling/storage, useful crafting and eventually hospitality. Keep the
existing four URLs. Restore a playable loop in successive releases; do not
one-shot every retained system or let presentation polish substitute for play.

## What exists and what can actually be reused

Read against fresh source df7f2a7 plus the retained source in this same repository.
The original models, bake/export pipeline, picking silhouettes, construction
profiles, crop art, control gestures, numerical laws and research are retained.
The fresh engine already owns Rust movement, moving supports, finite lots and
containers, transfers, assignment, collisions and projectiles, composed through
TypeScript systems and the common browser/DO session and transaction owner.
Its colony currently has two workers delivering finite food. It does not yet
have terrain edits, a construction lifecycle or water/soil stocks.

Reference owners to read before each port:

- `src/construction.js`, `src/structure-support.js`, `src/vertical-play.test.js`:
  footprints, rooted columns, spans, stairs and multiple levels. Preserve the
  accepted spacing law: a floor need not have a wall directly beneath every cell.
- `src/excavation.ts`, `src/terrain-removals.ts`, `src/world-presets/goblin-terrain.ts`:
  generated terrain, reachable exposed faces, work positions and physical yields.
- `src/engine/environment/soil`, `src/engine/environment/water`,
  `src/field-water.ts`, `src/field-water-source.ts`: finite stocks, saturation,
  connected flows and paired withdrawal/return. Prefer the final game-scale
  owners, not abandoned numerical experiments.
- `src/engine/materials/owner.ts`, `src/engine/work/owner.ts`,
  `src/water-delivery.ts`, `src/herbs.ts`: unique custody, portions, interruptions,
  crop establishment and process outcomes.
- `src/art/figures.js`, `src/art.js`, `src/art/static-pack.js`: original workers,
  carrying/pickup/drop/work poses, building/terrain art and maintained static bake.
- Fresh `engine/src/sdk/delivery.ts`, `sdk/common.ts`, `runtime/session.ts`,
  `runtime/region-program.ts`, `kernel/src/world.rs`, `kernel/src/navigation.rs`:
  current physical, work, rollback and command owners that the new callers use.

Retained source supplies proven rules and assets; its old Clearing object is not
another live simulator to embed. Rust remains the owner of physical geometry,
location and transfer. TypeScript may retain bounded pure environment algorithms
where they fit the current session contract; decide from measured real consumers,
not a requirement to translate every line. Environmental quantities must live
in the committed session, never in a render projection or module-global map.
Rebuildable indexes are allowed. Every new mutation must survive retry and DO
restart through the existing region commitment, not a parallel database.

## Colony: the same homestead becomes more capable

1. **Recognizable workers and honest work.** Restore original carrying poses from
   actual lot custody, replace placeholder shelves with appropriate storage art,
   and keep shared delivery for both colony and ship. Pickup/drop clips follow
   confirmed transfers; clip completion never settles goods. This is the current
   presentation chunk, not completion of the homestead port.
2. **A place to build.** Bring one generated integer-height clearing into the
   common terrain/geometry query. Place and earn a wall, door, floor and stairs
   through the same finite materials and job owner. Restore shared layer controls,
   visible drag selections and correct picking. A second upper floor must be
   supported by the representation from day one; demonstrate a three-level
   structure, not a special Ground/Upper boolean. Keep one physical-layer meaning
   for floor/roof surfaces. Collapse remains later, unsupported placement remains
   explicit. Preserve plans for deep caves and four stair orientations.
3. **A useful wet excavation.** Dig a reachable pit or ditch in that same world.
   Expose finite soil saturation and visible water, with spoil in a real lot.
   Remove terrain and settle pore water/material effects atomically. Opening a
   wet cell can fill a pit; dry ground has finite pore capacity and cannot absorb
   forever. Real-world rendered actions, no separate numerical showcase.
4. **Grow and use something.** Divert or carry finite water into a planted bed;
   establish a crop, grow it, harvest into shared storage and use it in a recipe.
   Keep moisture, fertility and species response separate; waterlogging is not
   universally better than moderate moisture. Additional crops/buildings normally
   add definitions and assets, not another haul/executor implementation.
5. **A functioning little inn.** Reuse common needs for workers and guests:
   hunger, thirst, fatigue, cleanliness and later relationships. Food, sleep and
   hospitality use the same items, jobs, reachable use-surfaces and saved effects.
   Brewing is a consumer of recipes/processes, not a replacement work engine.

The end-to-end player story is make a home → dig/direct water → grow ingredients
→ produce useful goods → host someone. Each step leaves a playable colony for
Levi to judge. Hidden cells remain hidden until discovered; cutaway and debug
inspection must not leak gameplay knowledge. No arbitrary one-level envelope.

## Other games and presentation

Preserve Survival's accepted continuous movement, prediction and retained facing.
Give it a distinct traveler, readable supplies, footsteps and later actual
pickup/use clips. Keep cosmetic contact clocks separate from network authority.

Pirates gets an original shaped hull, readable sail/rigging, actual chest/barrel
props, sailor wardrobe and a wake. Preserve the current moving deck bounds and
ship/crew controls; visual overhang is not new walkable deck. Then deepen sailing,
cargo and combat through common surfaces, lots and projectiles.

Formations retains the accepted cannon arc, recoil/smoke, piercing hits and
roll/embed behavior. Next gameplay choices are formation spacing, targeting,
terrain cover and readable morale; do not manufacture camera shake or a second
projectile path to add excitement. Existing original articulated hit clips are
not full joint-physics ragdolls.

A bounded motion-effect owner uses displayed movement. Stationary deckhands do
not walk because the ship moves; motion discontinuities do not emit long trails.
Effects, audio and carried-item visuals have no simulation mutation capability.
Frames, resets, pause, removal and disposal own their cleanup. Every game should
consume the same client/control/art stack with game-owned visual definitions.

## Tower defense — proposed next game, not a launched fifth writer

Levi liked the cannon/defense idea and asked to preserve it. A goblin inn beside
a winding road is a good first setting. Place a cannon tower, choose a firing
lane, fend off waves and spend earned resources on upgrades. One piercing shot
through a lined-up wave is an existing engine payoff, not a new physics promise.

Shared requirements: automatic targeting over existing spatial/capability
queries; attack cadence; target policies; authoritative projectiles/damage;
finite purchase/upgrade cost; wave schedules with durable occurrence identity;
path arrival and base damage; shared placement/selection/feedback. The same
attack controller must work for an RTS guard and a stationary tower.

```ts
// Illustrative composition, not an implemented new public API.
const defense = compose(
  terrainAndRoutes(roadDefinition),
  finiteResources(startingStock),
  weapons(cannonDefinition),
  targetPolicies({ cannon: nearestReachableEnemy }),
  scheduledWaves(waveDefinitions),
  defeatOnArrival(innDefinition),
);
// Each scheduled occurrence selects one durable ID. Its spawn/cost/result commit
// together; restart never creates the same wave or charges an upgrade twice.
```

Start with fixed paths. Player-built mazes require route preservation/replanning
at accepted placement/removal, so they follow the basic defense loop. Test busy
waves and changing routes with real moving enemies before any population claim.
This proposal adds no new host, timer service, inheritance tree or game loop.

## Sound recipes, not hard-coded sound branches

Current `client/audio.js` synthesizes two oscillator envelopes directly using
Web Audio. Keep the cannon timbre Levi likes. The next sound outcome is a small
named recipe API at that existing owner: reusable envelopes, tone/noise sources,
bounded voice count, gain/mute, user-gesture unlock and disposal. Game effects
choose recipe names; audio cannot issue commands or charge resources.

```ts
// Proposed caller shape; sound assets are presentation definitions.
const sounds = defineSounds({
  cannon: { source: 'sine', pitch: [82, 42], duration: 0.45, gain: 0.16 },
  footOnDirt: { source: 'noise', duration: 0.065, gain: 0.025 },
  waterLap: { source: 'noise', duration: 0.3, lowpass: 600, gain: 0.025 },
});
audio.play(sounds.cannon, { at: displayedMuzzle, strength: 1 });
```

Checked upstream options on September 11:
[ZzFX](https://github.com/KilledByAPixel/ZzFX) is an MIT game-sound generator and
is the smaller candidate for richer procedural effects;
[Tone.js](https://tonejs.github.io/) targets interactive music and offers synths
and scheduling. These are research candidates, not installed/qualified runtime
claims. First compare the retained sound against a tiny real consumer using the
candidate generator under our existing audio lifecycle. Do not install a full
music framework merely to play footsteps, and do not invent a new DSP project.
Use named parameters around any positional generator interface. Music, ambient
loops, recording/export and an audio editor are later needs.

## Delivery and acceptance

King owns original art, numerical/module design and integration. Native helpers
own bounded shared-source outcomes in isolated worktrees; independent review
reads the exact pinned source. First-shape corrections are normal, not permission
gates. Current work is shared motion effects, actual custody projection and
King's art pass. Terrain/environment porting starts as the next coherent source
chunk after reviewing this matrix; it is not hidden inside a cosmetic commit.

For every release: name the action the player can perform, the common owner it
uses, and the remaining gap. Use affected laws plus one short changed-game input
and personal art inspection. Preserve the fast feedback loop; do not repeat old
physics/browser matrices. No general capacity or port-complete claim follows
from a pretty model or headless test. Keep source privately recoverable and use
existing demo hosts for accepted runnable slices.
