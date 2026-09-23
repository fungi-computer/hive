# Herb-storage UI caller review — `96e68fc` UI checkpoint

Read-only review of the joined UI callers against the current frozen storage core;
no test, build, browser, or Git command run.

## P1 — carried continuation is projected as inactive, and its real wait reason is lost

The core deliberately permits the committed boundary `bundle.location = carried`
with a retained storage claim and no task (`src/activity.ts:130-143`; persistence
validates that boundary at `src/persistence.ts:1149-1207`). `actorFact` projects
only `task` or wood `cargo` into `activeJobId` (`src/hud.jsx:144-162`), omitting
`state.herbStorageClaims[actor.id]`. Therefore after a paused restore at that
valid boundary, `orderModel` marks Store inactive (`src/hud.jsx:364-408`) and the
bundle card reports the generic “Waiting for a finished shelf with room” instead
of its actual claim/continuation state (`src/hud.jsx:956-1026`). It also ignores
`StoreHerbJob.reason` for all non-active waits, including no route/no eligible
Haul worker/ground bundle.

Small correction: project a narrow immutable storage-job id (and, if needed for
the roster label, a carried-mugwort boolean) from the claim; use it in
`activeJobId`/the current-activity label. For an inactive Store order show
`storeJob.reason`, not a fabricated shelf-space reason. This keeps the valid
paused restore observable without publishing mutable claim/world references.

## Confirmed caller behavior

- `displayFacts` makes a fresh bundle and a fresh discriminated location object
  (`src/hud.jsx:282-324`), and only retains an equal prior display value; it does
  not expose mutable simulation bundle/location objects.
- Finished shelf appearance is derived from exactly a matching stored bundle,
  then chooses the existing direction texture (`src/construction-view.js:95-136`).
  Its card derives the same count and exposes `Mugwort 0/1` or `1/1`
  (`src/hud.jsx:259-272, 1030-1091`).
- Loose bundle sprite visibility, hit testing, selection mark, and placement are
  ground-location-only (`src/view.js:338-377`); stored/carried bundles have no
  loose hit target. The stored shelf remains the only visual owner.
- Tool, pan, box, and right-click ownership suppresses target inspection and
  cancels the armed gesture before a ground action (`src/main.js:529-689`;
  `src/view.js:159-181, 297-377`; `src/hud.jsx:56-142, 1829-1874`). There is one
  XState gesture owner and persistent tool lifetime.
- `selectionAtom.inspectedTarget` is the single target discriminant; the view’s
  tree/herb/bundle/site fields are derived conveniences, not reset mirrors
  (`src/hud.jsx:411-417, 501-533, 1953-1997`). A moved bundle re-resolves from
  fresh facts; an absent one renders no card safely.
- The renderer selects `pickup-herb` before ownership, `carry-herb` after
  ownership, animates it while walking, and fixes stationary carry to frame 0;
  wood carry’s prior condition is unchanged (`src/view.js:380-403`; accepted art
  bake exposes both poses in `src/art.js:67-104`).
- The UI command is ids-only and the HUD/main force Store to `actors: null`
  (`src/ui-actions.ts:9-31`; `src/hud.jsx:1884-1906`; `src/main.js:329-366`).
  It preserves paused immediate receipt admission and autosave scheduling
  (`src/main.js:285-327, 408-447`). Core additionally rejects non-shared Store
  (`src/orders.ts:56-60`).
- Store order projection uses `job.shelf` rather than the generic target and has
  an explicit Store title (`src/hud.jsx:248-258, 364-408`); deconstruct remains
  available from the finished shelf card.

No other actionable UI blocker found in the bounded callers.
