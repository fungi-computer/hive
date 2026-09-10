# Physical navigation

The owner routes and advances one-cell bodies through a supplied bounded physical
space. Footings are signed world-voxel `{x,y,z}` coordinates. Point solidity,
separating faces, explicit links and current access eligibility stay supplied by
the registered world composition. An unknown boundary is not empty ground.

`route` chooses deterministic minimum paid cost within a 4096-visited-footing
budget. Ordinary cardinal edges change height by at most one voxel. A profile
provides clearance and flat/up/down durations. Explicit links carry stable IDs
and their actual swept points. Admission compares the ordinary edge and every
matching link, choosing the cheapest clear edge; equal costs use stable link
identity, with the ordinary edge first on a tie. Link IDs must be unique. Removing a link invalidates its admitted edge even
when its endpoint floors remain. Admission checks the whole swept body, not just
endpoint occupancy.

`beginRoute` admits the first edge after checking every queued coordinate and the
4096-entry intent bound. It does not pre-authorize later geometry. `advanceRoute`
pays one tick and checks current clearance before movement. A blocked later edge
reports `blocked` at the reached safe footing, never arrival at the final intent.
`stopRoute` discards an unpaid edge or retains a paid edge with no subsequent
intent. `queueAfterEdge` changes subsequent intent without rewriting paid timing.
`position` derives presentation from that same admitted edge and elapsed ticks.

The current Goblin composition supplies human clearance4 and cat clearance1,
flat/up/down6/12/9 ticks, conservative hand-payload clearance4, exposed dry ground,
and every completed authored stair link. Bed use supplies explicit contact.
The generic owner has no Goblin placement/storey, material, clock or job state.

The game converts authored placement at `game-space.ts`, owns deferred work
cleanup, and saves the admitted edge and remaining intent in current schema22.
Material snapshots use envelope2 for the same Footing grammar; the independent
ore depot and quarry producer submit physical coordinates too.
Its movement façade replaces the former BFS/path/leg owner and the old blocked
cell/topology lists. Query projections are private and rebuildable per current
assignment/execution phase. They are not saved authorization or another world.

Current limits: no wading, swimming, jumps, hidden-cave admission, population or
20Hz claim. The authored laws are source evidence until the coordinated gate
executes them; the physical representation does not qualify new rendered art.
