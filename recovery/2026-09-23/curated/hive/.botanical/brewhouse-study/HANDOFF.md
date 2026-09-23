# The Copper Familiar — accepted original brewhouse art

Astra personal art/caller acceptance, 2026-09-08. Levi asked for a furnished
two-storey brewhouse and reusable 3D elements while shared work/brewing proceeds.
This is original code-authored Three geometry through the retained low-resolution
camera/bake/Pixi pipeline. It uses no generated raster illustration or borrowed
game assets. Existing figures, bed, stair, floor and geometry were retained
byte-for-byte in the isolated study; the publication candidate imports the
corresponding existing shared art modules instead of duplicating them.

## What is ready

- Finished timber/plaster shell, shuttered windows, green shingle roof, chimney,
  copper crescent, two storeys at the shared 2.16 walking-surface datum, stair
  void and rail. Exterior, cutaway, brewing floor, upper-floor reveal and
  separated-floor views support all four quarter-turns.
- Fourteen independent prop factories: copper kettle/hearth, fermenter, cask,
  preparation bench, serving counter, stool, grain sack, water pail, drying rack,
  bookcase/bottles, lantern, sign, bottle and tankard. All have four 112x112
  transparent bakes with the existing prop camera target1.1. Their visual 3D
  bounds and alpha extents are recorded; these are not collision definitions.
- Main view is a 400x360 low-resolution scene presented by Pixi. A whole-room
  bake is appropriate for this art viewer; it is not a proposal to flatten
  playable chunk geometry or replace the live ordering/picking owners.
- Props and shell are reusable original model functions. `template.js` supplies
  the authored composition; `cutaway.js` owns one view predicate across walls,
  decking, rail, furnishings and bed/cat. Model geometry is disposed after a
  bake; thumbnails use canvas-only output; the viewer owns its Pixi texture.

## Deliberate limits

This page is an art/layout study, not a running brewhouse or a validated game
blueprint. Static ingredient/ale/steam/flame/lantern details do not create goods,
liquids, light fields, heat, gases or work. No animation acceptance is claimed.
The current camera/projection is retained, but `world.js` is only the frozen
study's SIZE dependency. Production imports the real shared scale module.

`template.js` is an art dressing specimen, not a production template schema:
its fractional offsets and display roles do not establish occupancy or routes.
The shell/layout includes future building presentation. Runtime binding still
needs actual structure definitions, support and access validation, legal bed
contact, recipe/container references and explicit construction/init semantics.
Never import this object directly into saved world state or spawn a finished
brewhouse through player commands. The reviewed authored-building decision owns
that future contract and distinguishes paid plans from one-time settlement
initialization. No world expansion is part of this handoff.

## Source and publication custody

`art-integration.patch` contains **nine new files only**: `brewhouse-study.html`
and eight modules/styles in `src/studies/brewhouse`. The only transformations
from the accepted study are shared-art import paths and the HTML entry path.
`source-inventory.json` records each input/output SHA256 and the exact retained
shared dependency hashes. There are no changes to main game sources, saves,
existing art geometry, package dependencies, Vite or study discovery in this
patch. Delivery owns those last two ordinary standalone-entry/discovery joins,
build/Git/deploy and a short served-input/asset check. Same existing preview,
canonical `/brewhouse-study`, linked from `/study`. Preserve all studies and
current game behavior. No second original-art gate for these exact bytes.

## Evidence and personal review

Final frozen art check: **run-u1560.scope**, invocation
`c95a4258770c4422af9bdea44f87dfca`, normal exit0, `render-v5/proof.json` with
`passed:true`. All five modes have distinct pixels, four directions plus return
are exercised through actual buttons, building and prop alpha are nonempty and
unclipped, 56 prop bakes have at least21 pixels of margin, source hashes stay
unchanged, 390px containment passes, and page/console errors are empty.

I personally viewed the original four-facing prop contact sheet, native
exterior/ground/upper/cutaway, all final rotated cutaway views, separated floors,
and normal/narrow layouts. Source review independently caught the rotated-cut
policy mismatch and thumbnail lifetime; both were corrected and re-read with
no remaining blocker. The upper-view status says “Upper bedroom” while its
button says “Upper floor”; both describe the same reveal, not an isolated room.

Earlier artifacts remain intact: v1/u1556 failed browser startup because the
documented library path was absent (not a game failure); its old partial JSON
is not successful proof. v2/u1557 and v3/u1558 are preliminary rendered studies;
v3 fixed floor/foundation z-fighting and doorway arrangement. v4/u1559 passed
its assertions before the final unified rotated-cutaway correction. Only v5
owns the final source pin. The existing library path was supplied to the same
owned proof subprocess; no host package/provider changes were made. All owned
browser scopes exited normally, and no live human server was stopped.
