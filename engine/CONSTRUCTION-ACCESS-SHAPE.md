# Construction access boundary

This is the source checkpoint for the construction access recut. The
blueprint (`catalog`, origin cell, and orientation) is immutable intent. It
does not contain a worker contact or a material position.

The native read boundary is one ordered batch:

```ts
constructionAccess(sites: readonly EntityId[]): readonly {
  site: EntityId;
  support: "ready" | "waitingForSupport" | "unknown";
  contacts: readonly {
    x: number; y: number; z: number; frame: null;
    kind: "origin" | "landing";
  }[];
}[]
```

The result is derived from the committed structure geometry and terrain. It
does not claim that a particular worker can reach a contact. The work provider
asks the existing route owner for the first reachable returned contact and
stores that choice in its durable approach intent. Native attendance checks
the chosen contact again.

An initial `bind-construction-stage` action binds one returned contact to the
site's physical `Position`. The bound stage never moves. If that approach later
becomes blocked, the job waits or uses another valid worker contact while
materials remain at the original stage. Delivery remains the sole quantity and
transfer owner.

Support is assessed independently from worker reachability and staging. A
pending site may remain unsupported without a worker or Position. Lost
support, lost contact, or a lost approach releases attendance while retaining
earned seconds and staged lots. The presentation layer may project
`waitingForSupport`, but no UI text enters native state.

The implementation will reuse `structure_support::resolve` for the committed
projection and its existing candidate contacts. No second support solver,
water clone, material owner, or transport registry is introduced.

## Structural law used by every catalog

Structural legality is an engine query over completed physical geometry. Solid
terrain, rooted walls or columns, and stair landings are anchors. Completed
floors carry support laterally up to the environment's bounded `maxSpanSteps`;
the current Clearing definition uses six cells. A support chain does not require
a wall directly below every floor cell.

Plans do not support other plans. A player may submit a wall and an upper floor
in either order, but the upper floor remains `waitingForSupport`, with no worker
claim, until the wall is physically complete. The same structural query runs at
admission, work eligibility, and physical completion, so action order cannot
produce geometry that the final world would reject.

This law belongs to the engine. Goblin catalog data selects shapes, materials,
work duration, and bounded work reach. Roofs, bridges, beams, and later collapse
must consume the same support projection rather than add named special cases.
