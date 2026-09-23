# Upstairs harness/caller review

Read-only review of `scripts/prove-upstairs-bedroom.mjs` at the current dirty
checkpoint and its immediate callers.

**Actionable harness advisory — `placeBatch` does not prove the requested cell.**
At `scripts/prove-upstairs-bedroom.mjs:245-255`, each click waits only for the
site count to increase, then returns all sites of that type. A rejected
perimeter click or click-through that admits a different site can therefore
advance the final-5 sequence without identifying the failed cell. Smallest
correction for the next harness revision: after each count increase, assert a
site of the requested type at that exact `{x,z,level}` (and retain the existing
count wait). This directly falsifies the perimeter-wall failure.

The physical recut is otherwise wired: `#select-*`, `#draft`, `#task`/Done
placing, `[data-level]`, build selectors, and right-click Go exist in the HUD;
paused draft/go commands are flushed by the main request path and arrival keeps
draft until the explicit undraft in `parkHomeAwayFrom`. Construction placement
checks actor/cat current and path occupancy, and the harness passes perimeter
cells externally to its cat-clearance predicate. The wait predicates that close
over fixture values pass them as Playwright arguments where needed; remaining
closures use only fixed DOM/state conditions. Later wood, picking, rest, and
save assertions match the current state/persistence APIs. No tool click-through
or missing physical selector was found.
