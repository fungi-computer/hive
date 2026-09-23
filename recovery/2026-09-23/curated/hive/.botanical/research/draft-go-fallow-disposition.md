# Draft/Go Fallow disposition

Read-only caller pass, 2026-09-07, against `fallow-audit-draft-go-final-20260907.json` and the current command, fixed-step, work, persistence, construction, and HUD callers.

## Release disposition

**No true Draft/Go release blocker found.** `commandProblem` validates actor membership, drafted state, bounds, blockage, and route before admission. `acceptCommand` interrupts work on Draft, clears the draft and marks work dirty on Undraft, and admits Go only with a freshly derived route. The fixed-step `advanceDrafted` path moves a drafted actor with an admitted Go walk; `assignWork` and routine work deliberately exclude drafted actors. Thus Draft holds automatic work, Go has a dedicated movement owner, and Undraft returns the actor to normal automatic assignment without a second scheduler.

## Audit findings and disposition

| Audit finding | Disposition |
| --- | --- |
| `checkInvariants` 192 | Real centralization debt at the untrusted-save boundary, not a release blocker. Its cross-reference, conservation, and drafted/walk-state checks need one atomic rejection authority; do not mechanically split it. |
| `commandProblem` 61; `orderWork` 49 | Real concentration of command admission, but the current routes are the actual authority and are not duplicate whitelists. Extract only when a concrete second consumer can preserve the same admission semantics. |
| `assignWork` 58 | Intentional single automatic-work allocator. Its drafted exclusion is required by Draft/Go; no extraction or duplicate allocator. |
| inherited `drawSites` 46 | Pre-existing construction rendering ownership, not introduced by Draft/Go and not a release finding. |
| `Hud` 36; `runAction` 27 | Current UI/control ownership, whose interaction proof is outside Fallow's static entrypoint set. No threshold-driven panel or dispatcher split. |
| `activity` <-> `routine` cycle | A real future boundary debt, but both imports are delayed fixed-step function use rather than initialization work. No current failure shown; do not introduce a mechanical shared module. |

## Fallow visibility versus deletion test

The eight `prove-*.mjs` runners are direct proof entrypoints, not package-script entrypoints Fallow can discover; deleting them would remove required proof coverage. The accepted isolated study duplication has the same bounded-evidence rationale, not a production duplication finding. `nightCourt` is called by `fireCourt`, which is imported by the fire study, so it is not dead. The root direct `@fungi.computer/stipe` tarball is required to resolve Caps' declared Stipe dependency from the local tarballs; it is not removable as an unused root dependency.

No suppressions, cosmetic complexity splits, or deletions are warranted by this audit.

## Existing issue associations

- [#4](https://github.com/fungi-computer/hive/issues/4): retain the current atomic persistence-validation authority as later chunk/save scope grows; no refactor is required now.
- [#5](https://github.com/fungi-computer/hive/issues/5): Draft/Go's fixed-step hold/resume semantics do not imply offline progression or a server scheduler.
- [#6](https://github.com/fungi-computer/hive/issues/6): measure the persistence validator, allocator, and activity/routine boundary before any scale-oriented extraction.
- [#12](https://github.com/fungi-computer/hive/issues/12): revisit HUD/action decomposition only when a concrete new control surface has an independent consumer.
