# Finite emissions source review — 2026-09-09

Read-only review of the dirty three-file candidate on base
`cf66f922b8d42db4af2332a39c6b49809526c851`:

- `src/engine/environment/finite-release.ts` — `b8faa4bb7b66b0ae62bcbe0d55234db7324b4b39b0c56e517aa7585b1092d098`
- `src/engine/environment/finite-release.test.js` — `571e92069048ef70dca4892774f10c6c5cb96bfaaff41e90223409a00d11bc5f`
- `src/world-presets/brewhouse-air/region.ts` — `6459fc1bdde94002af219d265ea486eb5b04ae06cfcab72284c3310011ef558d`

## Disposition

Accepted as a source-only first shape. Six focused laws are authored and were
not run in this review.

The initial represented-time blocker is closed. `read` derives cumulative
release from the represented span `endS - startS`, and `plan` derives each
active interval's rate from the difference between cumulative release at its
two represented endpoints (`finite-release.ts:74-108,123-157`). Consequently a
large valid host clock cannot enlarge the content-declared totals merely
because `startS + durationS` rounds away from the nominal duration. The added
large-clock crossing and partition law exercises that exact case
(`finite-release.test.js:74-108`).

The helper remains a query-only definition: it stores no cursor, payment,
receiver, or callback. The room's committed `burn.startS`, materials
transformation, air source ledgers, and common air/terrain clock remain the
authorities. Restore reconstructs and validates those relations
(`region.ts:65-105`), while advance gives air and terrain the identical returned
segment sequence and publishes candidates only after every segment succeeds
(`region.ts:237-281`). Region SQL transaction/replay remains the commit owner.
Subminimum active, coast, and owed intervals are blocked before either field is
advanced; nonrepresentable definitions or clock arithmetic remain fatal input
or state errors rather than recoverable physical outcomes.

## Retained limits

- This does not join the source to main `Clearing` material/work activity or its
  fixed tick cadence. The room's authored paid transformation and clock remain
  an independent qualified consumer.
- The helper permits arbitrary signed finite channels because channel meaning
  belongs to each consumer. The current room supplies positive heat and smoke.
- Plans are pure and can be queried repeatedly. Exactly-once application and
  nonoverlap come from the Region's canonical clock, expected revision, durable
  receipt replay, and transaction; the helper alone is not a receipt owner.
- Receiver arithmetic can retain ordinary floating roundoff, so the room uses
  its existing physically scaled ledger tolerances on restore. The finite
  definition still bounds the intended cumulative source totals.
