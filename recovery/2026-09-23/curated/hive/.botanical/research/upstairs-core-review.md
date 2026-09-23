# Upstairs core review

Read-only review of the frozen upstairs core checkpoint against the corrected
contract. One concrete blocker remains:

- **P1 — unsupported level-1 ground bundles can survive validation.**
  `src/persistence.ts:1540-1543` only calls `checkCell` for a ground herb
  bundle. It does not require `upperSurface(state, bundle.location)` when
  `level === 1`, unlike piles at `src/persistence.ts:857-860`. A v6 restore can
  therefore retain a bundle on an unsupported upper cell (or a cell whose
  floor/stair was removed), violating upper-surface validity and allowing the
  storage route to reason from impossible state. Smallest correction: in the
  ground-bundle branch, after `checkCell`, reject level-1 locations unless
  `upperSurface(state, bundle.location)` is true; add one malformed-v6 test.

No second source-backed blocker found in this pass. Stair uniqueness, three-cell
headroom/landing rules, 18-tick edge timing and per-step topology revalidation,
upper pile checks, build/rest routing, support-aware deconstruction guards,
wood/nextId conservation, and v1-v5 strict normalization were present in the
reviewed callers. Existing upstairs tests construct finished topology directly,
but the reviewed assertions still pass through `validateClearing`, route, job,
and activity handlers rather than bypassing those handlers.
