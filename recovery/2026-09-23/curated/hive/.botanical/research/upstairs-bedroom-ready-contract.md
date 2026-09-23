# Upstairs bedroom — writer-ready contract

Read-only readiness synthesis at exact requested HEAD
`765c3282982d2ee6b07d5bea67bc21d08e4c2011`. This is a deliberately small
level-0/level-1 playable cut, not a chunk, caravan, excavation, physics, ECS, or
new framework design.

## Current boundary that must be crossed

`Cell` already carries `level` (`src/model.ts:8`), but the rest of the game is
ground-only: `inside` accepts only level 0 (`src/world.js:20-31`), `neighbors`
never changes level (`src/world.js:69-75`), `route` is a same-level BFS
(`src/movement.js:4-24`), and `BUILDINGS`/`footprint` have no floor or stair
kind (`src/construction.js:12-58`). The renderer and camera pass no logical
storey to projection or picking (`src/view.js:1-8, 159-181`; `src/camera.js:28-35`;
`src/construction-view.js:16-27`). Save schema v5 has the current four building
variants and validates cells through the same ground-only `inside`
(`src/persistence.ts:9-30, 233-240, 620-693, 709-714`).

## Mandatory first-playable contract

### Topology and levels

- Logical levels are exactly integer 0 and 1. `x/z` remain the existing 15×15
  clearing; no arbitrary elevation or fractional logical position is admitted.
- There is at most one stair site in the clearing, and it is a three-cell
  straight ramp. Its anchor `L=(x,z,0)` is the lower entrance; direction 0 has
  `d=(0,+1)` and direction 1 has `d=(+1,0)`. The ramp reserves lower cells
  `L`, `L+d`, and `L+2d`. Its upper landing is `U=(L+2d,level=1)`, and the
  only vertical traversal edges are `L↔U`. Ordinary neighbors remain same-level
  only. The edge exists only while that finished ramp and both endpoints remain
  supported; travel revalidates it before each transition and applies the normal
  blocked/interrupt law if it disappears.
- The ramp is not a teleport or a fractional logical position. Paths store the
  integer endpoint `L` or `U`; the renderer alone interpolates x/z and display
  height continuously. The vertical edge costs fixed 18 ticks, versus 6 ticks
  for an ordinary neighbor. No second stair, elevator, or alternative vertical
  edge is in this cut.
- The supported upper platform is the four-by-three bounded platform. Each
  level-1 floor cell has upper walking-surface datum `STOREY_HEIGHT=2.16`;
  boards extend below that datum. A floor supplies the upper walking surface and
  replaces cover below it. It is mutually exclusive with a roof at the
  corresponding `(x,z,0)`—those two surfaces never coexist. The stair supplies
  its surface at `U`; there is no floor at `U`.

Measured `u1060` clearance makes this stricter: upper floor/cover is forbidden
over ramp cells `L` and `M=L+d`. `U` is the stair-owned surface, has no floor,
and may support the level-1 doorway threshold. Keep the four-by-three platform
with 11 floor cells and the 47-wood fixture. Placement must reject any upper
floor or cover over `L`/`M`, and v6 validation must reject the same overlap after
restore; this is a saved-state law, not only a ghost/UI rule.

### Occupancy and construction

- All occupancy keys include `level`. Surface occupancy (trees, piles, herbs,
  bundles, actors, floors, stairs, beds), standing blockers (walls/doors), and
  overhead cover (roofs/floors) are separate queries; replace the current
  roof-versus-everything overlap shortcut rather than treating vertical overlap
  as a collision.
- Add one-cell `floor` and three-cell `stair` recipes. A floor is level 1 only;
  a stair is level 0 only and owns the paired upper landing. Existing wall, door,
  roof, bed, shelf, herb, bundle, and wood rules remain unchanged on level 0.
  Reject unsupported level-1 footprints, a second stair, and a floor without
  its lower support. For this cut, a floor's corresponding lower cell must be
  inside a finished level-0 enclosure or be a finished wall, must have no lower
  roof, and must not be a door (the door ornament reaches 2.385). Every ramp
  cell likewise requires no lower roof, door, or standing object. A level-1
  two-cell bed requires both cells to be level-1
  floors; it cannot straddle levels.
- Building delivery uses the existing claim/cargo owner and optimizer
  (`src/jobs.ts:49-89`, `src/resources.ts:19-93`, `src/activity.ts:67-104`): a
  worker walks through the finished ramp, approaches the actual upstairs
  construction position, and carries/delivers wood exactly once. A blocked sole
  stair leaves the build job and any cargo/claim intact under the existing
  interruption law; it must never silently drop material or declare the job
  complete.
- Construction and activity reachability must include storey and the actual
  approach cell. Do not use `person.level === target.level` as a final substitute
  for a stair-aware route (`src/activity.ts:335-345`).

### Shelter and sleep

- `indoors`/shelter are per-level queries. An upstairs bed is shelterable only
  when both bed cells are supported level-1 floors, enclosed by finished
  level-1 wall/door topology, covered by the existing roof anchored at level 1,
  and reachable
  from the actor through the sole ramp. Lower-floor shelter remains valid even
  if the ramp is blocked; shelter existence and this actor's access are separate
  facts (the current shortcut is `src/construction.js:145-172`).
- Sleep uses the existing `shelteredBeds`/rest job path (`src/jobs.ts:238-250`),
  but its candidate route must cross the ramp and its final two-cell bed
  footprint must pass the per-level support/enclosure/cover checks. A blocked
  ramp makes the upstairs rest order wait/no-route; it must not sleep through
  the floor.

### Strict save and corruption laws

- Bump the save envelope to v6. v1-v5 remain strict and load unchanged; v6
  writes the level-0/1 site/actor/path data and adds strict `floor`/`stair`
  site and command variants. Do not rewrite old schemas by widening their enum.
  Normalize only the documented v5→v6 defaults; preserve v1-v5 migration laws
  and paused restore (`src/persistence.ts:647-693, 1422-1511`).
- v6 rejects: any level outside 0/1; non-integer/out-of-bounds cells; duplicate
  ids or generated-id/`nextId` collisions; more than one stair; stair endpoints
  outside the clearing or unsupported; level-1 floors without lower support;
  beds whose two cells lack floor/support/cover; jobs, activities, cargo, or
  claims pointing at missing/wrong-level targets; actor paths containing an
  illegal edge; wood delivered/claimed/carried more than the recipe; and any
  finished site whose work/delivery/tick is inconsistent. Existing conservation,
  claim, task, duplicate, and atomic rejection laws stay exact
  (`src/persistence.ts:804-850, 902-1040, 1230-1293`).
- Restore always returns paused state. A malformed v6 slot is retained as raw
  recovery data and cannot overwrite the last committed valid slot; New/replace
  is the only explicit malformed-slot replacement path (current caller
  `src/main.js:159-250, 368-403`).

### Picking, cutaway, and selection

- Introduce one selected logical floor (0 or 1) distinct from cutaway/roof
  visibility. The selected floor feeds the same world-to-screen transform,
  ghosts, path lines, labels, and inverse picking; a geometry height is not a
  logical level. Keep the shared storey-height constant in art scale, calibrated
  against existing wall/thatch geometry as required by `ARCHITECTURE.md:470-500`.
- The HUD must make Ground/Upper selection obvious, show visible level-aware
  footprints, and make an upper target pickable without accidentally selecting a
  lower object. Cutaway hides/fades roofs/floors according to selected level;
  it must not mutate world positions. The current single camera projection and
  ground-cell inverse (`src/camera.js:28-35`) therefore need one coupled level
  parameter, not an independent ad-hoc offset. Preserve deliberate ordering: a
  shared depth key keeps x+z with bounded level offsets so a lower actor at the
  same footprint draws below the upper floor, upper feet/bed draw above it, and
  a genuinely foreground level-0 tree still draws later. Do not claim z-order by
  height alone. Selected-upper cutaway fades a lower tree only when its canopy
  blocks the active platform/picking; selected-ground hides/fades level-1 content.
- Preserve one selection/inspection discriminant and current Caps/OpenTUI
  ownership. Tool, pan, box, right-click, Escape, and camera movement retain
  their existing cancellation precedence. Do not add a second selection mirror
  or let an upper ghost issue a lower-level command.

## One coupled writer boundary

One writer owns the seam across `model.ts`, `world.js`, `movement.js`,
`construction.js`, `resources.ts`, `jobs.ts`, `activity.ts`, `persistence.ts`,
`main.js`, `camera.js`, `view.js`, `construction-view.js`, `hud.jsx`, and their
focused tests. The writer must change logical route/occupancy/support first,
then make build/sleep/jobs and persistence consume those same queries, then wire
level-aware projection/picking. Splitting vertical edges from construction or
save validation would create contradictory topology owners.

## Focused proof contract

Unit proof should construct a finished lower enclosure, one finished three-cell
stair ramp, a supported level-1 two-cell floor/room, and a level-1 bed; assert:

1. wood is claimed, carried through the three-cell ramp, delivered upstairs, and builds
   floor/ramp/bed with exact conservation;
2. the actor reaches and sleeps upstairs through the sole ramp;
3. a second stair, unsupported floor, wrong-level footprint, and invalid v6 save
   are rejected;
4. blocking the sole lower ramp approach leaves the upstairs build/rest job
   queued with cargo/claims preserved and no sleep completion;
5. v5 restores unchanged and v6 restores paused with level-aware paths/targets.

The browser trace mirrors that one loop: select Upper, place/finish the supported
four-by-three floor and sole three-cell ramp, watch wood delivery cross its
18-tick edge, build the two-cell bed and existing level-1 roof, select the
upstairs bed, then block the ramp and show the later rest order waiting. Assert
selected-floor state, visible footprint, actor level, sleep activity, blocked
notice, paused save status, and Continue restore.

## Astra art/caller inputs

Art remains source geometry → fixed bake (`src/art.js:45-127`). Add floor/ramp
stage textures for the three-cell straight footprint with both existing
directions, and use one shared `STOREY_HEIGHT=2.16` constant; preserve current
wall/roof/bed/shelf bakes and the existing level-1 roof anchor. The ramp render
may show continuous ascent between integer endpoints, but simulation positions
remain integer cells and its edge timing is supplied by the core. Figure/prop
callers supply selected level and direction; art does not invent topology,
support, occupancy, path rules, or depth ownership. Upper cutaway and footprint
overlays are supplied by the construction/view caller.

## Later polish (not required for this cut)

Quarter-turn projection, richer stair animation, multiple stairs, multi-storey
support graphs, arbitrary floor openings, elevators/ramps, terrain excavation,
chunks/caravans, structural collapse, and generalized room/physics solvers stay
out of this writer boundary.
