# Upstairs original-art work in progress

This ignored study belongs to Astra. Delivery owns all tracked source, integration,
proof scheduling and release. The current public release is `765c328`.

`floor.js` is a one-cell original timber deck with its finished walking surface
at local y=0 and joists below it. `stair.js` is an original cleated loft stair:
lower entrance `(0,0,0)`, upper landing `(0,2.16,2)`, with flat landing boards,
handrails and an open supporting frame. Both use the accepted geometry primitives.
They have not yet been visually accepted or integrated.

The settled shared storey height is the existing wall-top datum, 2.16. The
three-cell footprint and endpoints follow Delivery's source contract: dir0 rises
along +z and dir1 along +x. The isolated visual trace takes 18 fixed 50ms ticks
per climb/descent, with unchanged carrying/walking poses. Production simulation
owns every real route, action, resource, support and save outcome.

Lower roof geometry occupies the proposed upper-floor volume: an upper surface
must replace the lower roof over its footprint. Reused upstairs roofs are anchored
at level1. Floor/support/opening occupancy and boundary-door clearance remain
Delivery's coupled topology/caller responsibilities.

The first visual batch will show both axes, construction stages, existing human
and door scale, an upper landing and actual sampled ascent/descending motion.
No new figure art or tracked edits have been performed here. The art vignette is
a composition for scale and occlusion, not a claim of a resource-built game state.

## Isolation and caller identity

`baseline/src` contains exact retained source from `765c328`. `bake.js` contains
the exact outline/bake/anchor function block from retained `src/art.js`, with
only its required Three/Pixi imports. `scale.js` retains the accepted camera and
projection with a literal SIZE15 instead of importing the actively changing
world. `home.js` preserves the original building implementation and adds only
floor/stair imports and type dispatch. `baseline-home.js` changes only relative
import paths for browser execution. Twelve sampled old building bakes compare
their actual pixels through the two callers.

The retained input graph allows the live core writer to continue independently.
The eventual production patch contains only floor.js, stair.js and home.js.
Production stair imports STOREY_HEIGHT from the shared art/scale.js export, whose
projection/picking changes remain Delivery's custody. The study's datum.js is
not a second production owner and is not included in the patch.

## Final art disposition

Astra accepts the original floor and three-cell ramp geometry in `art-integration.patch` (SHA256 `7ca8ad56ec5697e3b88b5c4b7e020e6bf5aa7b178c82a4941940b697dcc61a18`). Personally inspected v2 native/game-scale stills and eight decoded recorded-motion samples; no uncut playback claim. v1/v2 and clearance evidence remain preserved. Exact source/receipt scope is in `source-inventory.json`. Delivery owns tracked application, shared STOREY_HEIGHT=2.16 export, actual stairwell headroom, supported bedroom/material budget, runtime traversal/picking/save and hosted proof. The vignette is an art caller, not a constructed resource fixture.
