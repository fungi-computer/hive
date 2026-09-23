# Local world save/load boundary

Read-only design check, 2026-09-07. This keeps the present tiny clearing and adds no backend, offline-time advance, framework, or new source owner.

## Current authority and caller

- `src/main.js:startGame` owns closure-local `state`, `clock`, `pending`,
  `pendingMeta`, `speed`, `notice`, and `lastNotice`.
- `request` appends typed commands to `pending`; `flushPending` calls
  `admitCommands(state, batch)`. Pausing also flushes that batch.
- Pixi's ticker flushes pending commands, converts render elapsed time through
  `src/ticker.js:push`, then calls `src/clearing.ts:step(state, colony, [])`.
  `step` first admits supplied commands, returns immediately while paused, then
  advances the fixed tick, routine, activities, assignment, cat, and feed.
- `window.__GOBLIN.state` is a `structuredClone` inspection hook, not a load
  API. There is no persistence call, decoder, restore function, schema, or
  browser storage use in `src/` today.

`Clearing` in `src/model.ts` is the complete continuation snapshot: seed/tick/paused/nextId; actors and parties; cat; trees/rocks/watcher; piles/sites/jobs; claims/workDirty/counters; feed/demand/notice; and `commands`. The existing
tests replay accepted `commands` from a seeded clearing, but runtime reads no
history to continue a live state. Snapshot state is therefore the smaller save
authority; command history is not an event-store requirement.

## Smallest browser contract

Use IndexedDB through the maintained `idb` API already selected in `ARCHITECTURE.md` for one async, named local-world record. Its transactions remain native; do not hand-roll a competing wrapper. At a completed main-loop boundary, first flush `pending`, take `structuredClone(state)`, and start the asynchronous write from that immutable copy. Coalesce writes rather than writing every frame. A page hide may request the same save, but does not advance time: current `visibilitychange` pauses the world and clears ticker accumulation.

The record needs only:

```text
{ kind: "hive-local-world", schema: 1, revision, savedState: Omit<Clearing, "commands"> }
```

Use `localStorage` only for harmless HUD preferences (`cutaway`, `panMode`,
`help`, `direction`) with separate preference version/defaults. Do not save
camera center/zoom, selected/inspected target, open panel, tool gesture,
pointer coordinates, focus element, `speed`, `notice` overlay, `clock.acc`,
`pending`, or `pendingMeta`. Recreate camera/HUD input state normally; load the world paused so the player observes it before continuing.

The current `state.commands` grows for the life of a tab and has no runtime consumer. V1 should omit it from the persisted continuation and restore it as
`[]`; it is only replay/debug history. This prevents persisted size from becoming a second unbounded log; it does not itself bound the live array. A command trace recorded after loading starts from that loaded snapshot, not the initial seed. Any retained diagnostic tail needs an explicit cap and a separate product reason, not silent truncation of an event log.

Astra source review: serialize writes and use the stored revision in the same read/write transaction to detect a stale second tab. A second browser tab must not silently overwrite newer progress. New clearing must also invalidate any queued old-world save. Show saved status only after transaction completion; failed writes remain visibly unsaved. These are small persistence responsibilities, not multiplayer simulation.

## Restore boundary and invariants

Decode untrusted IndexedDB data at one persistence boundary before assigning the `state` closure. Do not `Object.assign` parsed data into a clearing. Validate
the envelope/kind/schema, primitive ranges and finite numbers, every ID and reference, cell coordinates, enum, array, and record shape; then construct a
fresh plain `Clearing` value from accepted fields. Preserve the actual world
continuation fields below exactly:

- `nextId` must be a positive integer higher than every generated `job-`,
  `site-`, and `wood-` identifier, or a future command can collide.
- Every job's scope/target must reference its party and relevant tree/site/
  actor. Preserve job array order because it is priority in `model.ts`.
- An actor's `task`, `assignment`, `mode`, `path`, `leg`, and `work` must agree
  with an existing job/target and valid route cells. Activity progress is not
  derivable from a job alone.
- Every claim must reference an existing build job, pile, site, and claimant;
  cargo must reference an existing job/site. Preserve both: claims reserve wood
  before pickup, while cargo exclusively owns wood after pickup
  (`src/resources.ts`, `src/activity.ts`, `src/jobs.ts`).
- Preserve tree/site progress and finished ticks, piles, party membership,
  work permissions/routine flags, cat path/next move, counters, `paused`, and
  `workDirty`. Recomputing any of them during decode changes continuation.
- Preserve `feed.seed`, `sequence`, `nextAt`, `last`, and `demand`; the feed is
  fixed-tick state (`src/feed.js`), not a wall-clock notification.

On a missing record, make `createClearing()` as now. On a corrupt, unknown, or
failed-migration record, keep the old record untouched, start a new paused
clearing, and show a recoverable "local save could not load" action that can
explicitly discard it. Autosave into that slot must remain disabled until the player explicitly replaces or recovers it; merely rendering a fallback clearing must not overwrite the original. Migrate only named older schemas. There is no current
build ID in source; `schema` is the compatibility gate until a release supplies
one, so a build string must not be invented as validation.

## Actual gaps and outcome checks

The gap is one persistence boundary plus explicit decode/migration code; the
simulation itself already has a data-shaped state, fixed command admission, and
deterministic replay evidence. It does not have a safe state validator, a save
trigger, a load choice, or bounded command-history retention.

1. Save while a hauler has a claim, then load: reserved pile amount, cargo,
   site delivery, active job, path/leg/work, and eventual wood conservation
   match uninterrupted continuation.
2. Save while paused after a queued batch was admitted: reload remains paused,
   tick/feed/cat do not advance, and the accepted jobs/order remain present.
3. Save after recruitment, construction, and a feed event: IDs do not collide,
   job priority and worker permissions survive, and the next feed event occurs
   at the same fixed tick as an uninterrupted copy.
4. Corrupt the record or set an unknown schema: no partial world is installed,
   the old bytes remain recoverable until explicit discard, and a new clearing
   can still start.
5. A stale tab and a queued save from before New clearing cannot overwrite the newer world; a storage failure does not display a false successful save.

Browser API basis: [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) documents async structured-clone storage and transactions; [Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API) documents synchronous string storage. Both are local to the browser/origin; downloadable backup is useful for carrying a save elsewhere. No account/server sync is implied.

Deletion test: if removing persistence leaves current play unchanged, that is
correct. Save/load resumes the local world; it does not become a second clock,
command authority, UI state machine, or service integration.
