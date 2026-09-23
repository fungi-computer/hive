# Herb-storage core/persistence review — frozen `0643e2f`

Read-only source review; no tests, browser, or Git command run. This is limited to
the storage core/persistence callers and the two existing focused test files.

## Disposition

Two corrections block calling the storage transition contract complete. The normal
assignment path otherwise has the intended ownership shape, but it has no new
`clearing.test.js` transition coverage at all.

### P0 — revalidate the shelf at store completion

`src/activity.ts:106-148` validates the claim and carried bundle, then writes
`{ kind: "stored", site: claim.shelf }` at line 145. It does **not** look up the
target shelf or prove it is still a finished shelf with free capacity. `targetFor`
only establishes that some site with `task.target` exists (`src/activity.ts:280-283`).
That falsifies the required completion law if a destination is stale, changed, or
has become full between the walk/claim and the last work tick.

Small correction: in the `store-herb` branch, before changing bundle location,
look up `claim.shelf` and require `type === "shelf"`, `finishedAt !== null`, and
no other stored bundle / claim owns that shelf. On failure call `interruptWork`;
that drops the same carried bundle at the actor cell and releases the claim. Do
not finish the store job on that failure.

### P1 — Store is not structurally shared-only

The agreed seam is one shared Store command/job, but `WorkCommand` gives every
variant `direct?: boolean` (`src/model.ts:14-21`), the v5 decoder extends the
same generic schema (`src/persistence.ts:353-387`), and `commandProblem` only
rejects `direct` when `actors === null` (`src/orders.ts:55-58`). Consequently a
persisted or admitted `{ kind: "store-herb", actors: ["rowan"], direct: true }`
is accepted; `orderWork` also interrupts that actor first (`src/orders.ts:173-181`).

Small correction: give Store its own shared-only command shape (`actors: null`,
no `direct`) in the model and v5 command/history schema, and reject any
non-shared Store at `commandProblem`. Keep the resulting job scope shared.

## Source-confirmed transition behavior

- Claim occurs before `person.assignment`, `person.task`, and `beginWalk`
  (`src/jobs.ts:512-519`). Pickup claim validation includes bundle ground state,
  finished shelf, capacity, and competing shelf claim (`src/jobs.ts:346-373`).
- A carrier is offered its storage continuation before ordinary jobs
  (`src/jobs.ts:422-430`); claims also remove that actor and job from personal and
  shared optimization (`src/jobs.ts:431-465`). That continuation bypasses the
  automatic Haul toggle, so an already-carried bundle can finish after Haul is
  turned off. `src/jobs.ts:258-285` still correctly classifies pickup/store as
  Haul for new automatic assignment.
- A full shelf is not rejected by `commandProblem` (`src/orders.ts:72-95`): it
  creates the shared job, and `storeHerbOption` waits without a claim
  (`src/jobs.ts:175-180`).
- Cancel, Draft, another direct order, and lost route all converge on
  `interruptWork`, which drops a carried bundle at the actor cell and deletes its
  claim (`src/activity.ts:26-61`; `src/orders.ts:127-163, 181`).
- Shelf deconstruction interrupts storage claim holders, ejects stored bundles,
  removes Store jobs, then gives normal wood salvage (`src/activity.ts:172-216`).
  Either actor order is source-safe: Store-first is immediately ejected;
  Deconstruct-first interrupts/drops and removes the Store job before its holder
  can advance.
- Real job/activity dispatches are discriminated and exhaustive in the relevant
  handlers (`src/jobs.ts:205-255, 328-392`; `src/orders.ts:317-403`; and
  `src/activity.ts:334-347`).

Advisory: `claimCandidate` does not explicitly reject an existing
`state.herbStorageClaims[person.id]` (`src/jobs.ts:355-373`). Current
`assignWork` excludes those actors and matching offers at most one task per actor,
so this is not currently reachable. Add that guard with the claim test below so
the atomic primitive cannot overwrite a claim if reused.

## Exact must-add tests

`src/clearing.test.js` has garden coverage through line 710 but no `shelf`,
`store-herb`, or `herbStorageClaims` coverage. Its existing conservation helper
already measures one bundle total (`src/clearing.test.js:58-72`), so add focused
fixed-step tests there rather than a second simulation harness:

1. Shared Store of one harvested ground bundle to a finished shelf: assert the
   claim is installed before the first walk, bundle transitions ground → carried
   → stored exactly once, job/claim clear only at completion, and conservation
   holds at each tick.
2. Turn Haul off after pickup: the committed carrier alone receives delivery and
   no second optimizer offer; it stores after the toggle. Include a second home
   member to prove alternative offers are excluded.
3. A full shelf accepts a Store command as a waiting shared job with no claim;
   a duplicate bundle/shelf command remains rejected. Cover cancel, Draft,
   unrelated direct interruption, blocked route, and stale destination: each
   must retain the same ground bundle and pending Store job except when the shelf
   is deconstructed.
4. Run Store completion and shelf deconstruction in both actor orders. Assert
   no carrier/claim/job survives, exactly one ground bundle and normal shelf
   salvage remain, and material conservation still holds.
5. Exercise the P0 revalidation branch with a destination made invalid/full
   after pickup and before the final store tick; assert safe drop, released
   claim, and uncompleted Store job.

`src/persistence.test.js` has useful v5 continuation/capacity validation
(`src/persistence.test.js:599-763`) and a v5 loose-overlap round trip
(`src/persistence.test.js:659-683`), but must add:

1. An actual strict v4 envelope (not a v5 snapshot relabelled v3) whose legacy
   `{x,z,level}` ground bundle normalizes to the v5 location discriminant, while
   v1-v3 retain their old strict variants. Include accepted loose ground overlap
   at the preserved location.
2. V5 rejection of personal/direct Store command history and non-member scope;
   acceptance only of the shared shape.
3. Claim/task/capacity/duplicate and `nextId` cases across ground, carried, and
   stored boundaries, including stale shelf rejection after normalization.

The existing v1-v3 test starts from `snapshotFor(createClearing())`, which is
already schema 5, then derives v3/v2/v1 (`src/persistence.test.js:135-171`); it
does not exercise an actual schema-4 bundle migration.
