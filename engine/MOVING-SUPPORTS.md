# Moving supports: first pirate consumer

Required by Levi's fourth-game amendment in DESIGN.md. This is the implementation
contract, not a claim that moving supports already run. Preserve the current
colony assignment and animation authors; integrate their released source first.

## One pose owner

Keep Position as a canonical local pose. Add a protected optional support
reference; absence means the world frame. A support entity has its own Position
and a finite walkable surface definition. The first ship has a rectangular deck;
surface definitions must belong to the physical scene, not be inferred from art.
No boarding/reparent operation is included in the first slice.

Use explicit local versus world query names. A native world-pose query and render
facts resolve transforms from the same geometry function; they never write a
second saved pose. Validate support existence, capability and acyclic references
at load/restore before replacing the current world. Bound chain depth to 16 support links. Facing uses continuous quarter-turn units:
0 points along local -z, 1 along +x, 2 along +z, 3 along -x, and 4 is a full turn.
Native transform arithmetic converts facing to radians only at the geometry
boundary. This preserves the existing formation direction values and permits
smooth ship rotation. Rotation composes x'=cos(a)*x-sin(a)*z and
z'=sin(a)*x+cos(a)*z; height adds normally. Sprite selection rounds only its
visual direction, never the physical angle.

The native support component is optional `{entity: ID}`; absence means world.
A finite surface declares `{minX,maxX,minZ,maxZ,height}` in its own local frame.
Movement requests and saved destinations carry an explicit nullable frame ID.
Existing root-frame callers supply null; no implicit legacy compatibility path.
The native world-pose read, contact check and renderer use one resolver; canonical
Position queries remain local. Root owns the TypeScript caller join after the
native source shape is reviewed.

```text
worldPose(entity):
  local = canonicalPosition(entity)
  if no support(entity): return local
  parent = worldPose(support(entity))
  return compose(parent, local)

move(actor, targetWithFrame):
  require target.frame == actor.support
  require target lies on that support's traversable surface
  route using local coordinates and obstacles in that frame
  install destination only after admission succeeds

step(dt):
  advance every local route using its body's movement budget
  derive world poses after all local movement is finished
  emit presentation; never move passengers by writing parent displacement
```

Root-frame movement retains its existing bounded search. Supported movement
restricts every neighbor and the exact final point to deck bounds. A moving ship
does not invalidate a crew route when the deck geometry is unchanged. Destinations
persist their frame; restore rebuilds routes against that frame's current topology.

## Actual callers to change together

- `kernel/src/world.rs`: load/restore relational validation, movement admission,
  obstacle indexing, route rebuild, contact and render projection.
- `kernel/src/navigation.rs`: explicit traversability input for deck bounds.
- `kernel/src/components.rs` and registry: protected support and surface schemas.
- SDK/contracts: canonical local pose and derived world pose stay distinct.
  Shared delivery compares world-space reach; fatigue compares local locomotion.
- Client geometry: intersect the camera ray with the displayed support surface,
  transform to local coordinates and submit a frame-tagged order. Existing ground
  unprojection always assumes y=0 and is insufficient for a raised deck.
- Original pack/client: a ship visual uses ordinary asset definitions. No pirate
  switch may grant support geometry, cargo, navigation or render authority.

## Acceptance

Stationary crew follow ship translation and rotation without changing local pose.
Crew walk around a deck obstacle while the ship moves. Off-deck/wrong-frame orders
reject without replacing an accepted route. Missing/cyclic supports reject
atomically. Save mid-voyage with cargo, restore and advance to identical state.
Transfer reach uses resolved world geometry, not visually correct sprites with
stale physical positions. Passive ship movement does not raise walking fatigue.
Run the same authored pirate pack through the common host transaction; no new
ship-specific persistence owner. Public proof is an actual isometric ship/crew
interaction, not only transform arithmetic.

Ocean CFD, buoyancy, sinking, boarding, inter-region ship transfer and cannons are
subsequent consumers. Do not substitute those projects for the moving-deck slice.
