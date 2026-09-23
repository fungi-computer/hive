# Joined-game ordering UX decision — 2026-09-07

Read-only player-flow decision for hosted `1704e9b` and the current hover-only
hotfix. No product source, dependency, Git, browser, or deployment work was
performed.

## Decision table

| Decision | Player contract | Current evidence / smallest custody shape |
| --- | --- | --- |
| Select vs inspect | Left-click a home actor selects it; Shift+left toggles; empty-ground left-drag box-selects home actors. Left-click a tree or building inspects it and never submits work. Visitors are inspected, never added to the home selection. | Actor selection/visitor inspection and box selection already exist in `hud.jsx`/`main.js`; trees already open a target panel. Building sprites are non-interactive, so add building inspection only when that caller is deliberately extended. |
| Personal work: direct vs queued | With one or more selected home actors, right-click a target is **Do now** (the existing `direct:true`: interrupt those actors and put the job first). Shift+right-click is **Queue** (`direct:false`: preserve their current work and append). The inspected-target panel exposes the same two labelled actions for touch/keyboard. `C` means Do now; Shift+C means Queue. | This follows RimWorld's contextual order/Shift queue convention while retaining the existing typed command and fixed-step result owner. Today the panel has both forms, but `C` sends no `direct` flag despite its “Chop now” label. Correct that semantic mismatch before adding jobs. |
| Shared area work | `Chop designation` is a separate, explicitly labelled **Shared work** mode: it targets trees, uses `actors:null`, freezes the ID list on release, shows count/highlights, then requires Commit. It never depends on the current personal selection. | Current rectangle query, preview, fixed state, and command-result settlement provide this. Keep it distinct from a personal right-click order; do not overload Shift selection or build row placement. |
| Escape / right-click | Precedence: focused text control handles its native cancel first; otherwise an active tool/drag/fixed preview cancels; then a target popover closes; then a panel closes; actor selection remains. Right-click follows the same cancel rule while a tool/preview is active. Only when idle does right-click issue the personal contextual order (or open its accessible equivalent). | Escape already routes through OpenTUI and XState. Current tree `rightclick` is identical to left inspect and active tools merely suppress tree input, so right-click has no deliberate cancel contract yet. Route it through the same XState cancellation action before any contextual command. |
| Build repeat placement | A selected building tool is persistent: valid release submits one or a row of build commands, returns to `ready`, retains tool and rotation, and updates hover; Done, Escape, or active-mode right-click exits. Invalid release retains the tool and reports why. | Current UI says “Done placing,” but `main.js` immediately dispatches `finish-placement` after every placement. The hotfix adds ready-state hover only; it does not make placement repeat. This is the smallest productive build convention (Sims/Banished-style mode), not a new owner. |
| Current vs queued | Per selected actor, show **Now** from `actor.task.job` (or cargo's job) and **Queued** personal jobs in ordered job-list order. The global Orders panel separately labels each entry Personal (named actor(s)) or Shared (home), with active entries derived only from `task.job`. | Current list correctly uses `activeJobId` for active state but offers no actor-level current/next distinction. Scope is eligibility/queue affiliation, never evidence that an actor is currently working. |
| Building selection / Deconstruct | Left-clicking a completed or blueprint building inspects it. **Deconstruct** is not immediate deletion: it enters the same shared-target tool contract as Chop—click/drag eligible building IDs, frozen preview, count, Commit, XState cancel precedence, fixed-step `CommandResult[]`, and an Orders entry. It defaults to `actors:null`; any future personal direct/queued variant uses the same right-click contract above. | There is currently no interactive building picker and no `deconstruct` command/job. Do not add it ahead of ordering clarity. When the core adds it, extend the existing discriminated Command/Job/Activity path; do not create a separate UI-side demolition owner. |

Evidence: the supplied colony UX research records RimWorld's left selection,
box/Shift selection, right contextual order, Shift queue, multi-tree designation,
and Escape cancel; Sims/Banished support explicit persistent construction modes.
Caps remains presentation primitives, OpenTUI physical key/hint ownership,
XState mode/cancel ownership, Jotai display/selection ownership, and the fixed-step
core remains the only command application owner.

## First working trace

```text
1. Left-click Rowan; Shift+left-click Sedge     [Rowan ✓] [Sedge ✓]
2. Left-click oak 4                            Inspect: Oak 4 (no order)
3. Right-click oak 4                           Now: Rowan + Sedge -> Chop oak 4
4. Shift+right-click oak 7                     Queued: Rowan + Sedge -> Chop oak 7
5. Build > Shared Chop; drag oaks 2–5; release Preview fixed: 4 oaks [Commit] [Cancel]
6. Escape                                       preview disappears; actor selection remains
7. Build > Wall; click cells                    wall tool stays selected until Done/Esc/right-click
```

Later deconstruction reuses steps 5–6 with eligible building IDs and the label
“Deconstruct”, then appears as an ordinary shared Order; it must not remove a
building at click time.
