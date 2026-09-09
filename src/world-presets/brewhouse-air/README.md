# A finite fire in an actual two-storey building

This authored Goblin scenario composes existing owners: actual construction
definitions and footprints supply room geometry; the material recipe owner
converts one stocked hearth lot; `createAir` advances warm air, passive smoke
and heat; the existing Region transaction commits the joined state and results.
There is no separate fuel inventory, simulation timer or saved rendering state.
The house starts built and its hearth starts stocked. This does not claim pawn
construction, hauling, actor health or integration into the main Clearing.

The room contains 504 metric voxels, including 136 wall voxels and an exterior
collar. Nine floor faces separate the storeys; the existing three-cell stair run
leaves their connecting opening. Twelve roof faces close the upper room. The
upper doorway has a zero-volume shutter; the lower doorway stays open. Both the
intended rendering caller and the field definition consume these same sites.
Subvoxel furniture/stair displacement is currently unresolved by the shared
construction metadata. The authored ground will migrate with the main game's
single generated-terrain query; it is not an additional permanent world owner.

## Material, time and commitment

`createBrewhouseAirProgram()` is the ordinary registered program for `openRegion`.
`room-player` can ignite the stocked hearth and change the shutter. `room-host`
alone can advance up to six physical seconds per command. Identity, revision,
receipts, events and SQLite transaction ownership remain in Region. It retains
no authoritative process-local room state.

Ignition irreversibly prepares the one wood unit using ordinary recipe admission,
prepare and outputless settlement. Its transformation pays for exactly 1800 J
of room-directed sensible heat and 0.0002 kg of tracer over six seconds. These
are explicit game content yields, not wood's chemical energy or a flame model.
No additional dose is available in this fixture. The saved burn start refers to
the air owner's physical clock; it is not a second clock or remaining-stock
counter. A request crossing the dose endpoint advances its remainder without a
source. Pausing host advances also pauses the dose. There is no cancellation or
autonomous alarm in this consumer.

Every restore validates the material owner's relations, the exact finite source
budget, the transformation/burn correspondence, opening-to-air identity and
cumulative emitted quantities against elapsed physical time. A detached candidate
is committed only after all these checks. Geometry changes preserve smoke/heat
stocks and report any resolved kinetic dissipation without inventing thermal
replacement. Incompatible volume changes remain rejected by the air owner.

## Evidence and the failed ventilation hypothesis

- `u4203 / d3f744dd436d48498b2080230f764883`, exit 0: three source laws over
  actual Node SQLite cover one finite wood transformation, partial-dose reopen,
  crossing the source endpoint, receipt replay, no second dose, native SQL
  rollback of fuel/plan and field/clock, separate player/host grants, opening
  preservation, and rejection of unpaid/retimed source snapshots.
- Independent source/caller review accepted the ownership/transaction boundary
  and found one display-fact error: the initial unlit dose reported zero remaining.
  Corrected to one. The affected law alone passed `u4211 /
  ea089e650bd440479af9379efd807be1`; the unchanged three-law suite was not repeated.
- Type checking initially found two untyped JS fact callbacks (`u4205`). Their
  explicit consumer types passed `u4208 / c0c915c5ac634d9faaa63403659e3db9`.
  The engine's exact public typed entry then passed its strict isolated consumer
  (`e436307`, `u4218`). The actual room caller passes `u4221 /
  5ed04fb7c2a949ca9da8835f5ab0b318` using those types; the temporary local fact
  annotations are removed. No solver runtime changed for that join.
- The independent numerical study `u4207 / 728a5d44cdec4a03973136db1783ace9`
  exited **1**: its predeclared requirement that opening reduce upstairs exposure
  failed. The 0.2 s run showed a **50.426% increase**, and the unchanged 0.1 s
  refinement a **50.495% increase**. The proposed safe ventilation layout did
  not pass and has not been relabeled or tuned into a success.

The room study supplied the same finite dose as a prescribed source; it did not
exercise the material owner. Across its four histories, stock/face/source
residuals stayed below 3.80e-19 kg and 2.51e-12 J, and upstairs exposure changed
less than 0.6% under the sole time refinement. It shows a reproducible conservative
response to this building's air paths. The inference is that the high opening
draws more of the downstairs plume through the stairwell. Almost no smoke had
reached the exterior by 66 s, so it is not smoke-clearance evidence. Spatial
accuracy, strong fires and a universally helpful window are not established.

The numerical study used 11.957 CPU seconds for 1890 accepted steps on the shared
host; wall time was 68.960 s. That includes both compared branches and refinement
and is not a production room/frame-capacity claim. Original reports, source pins
and unchanged failed criterion remain in the air worktree's ignored
`.botanical/air-room/REPORT.md` and `RESULTS.json`.

Fallow found no clones or import cycles in these new modules. Its default library
entry does not reach this separately invoked consumer yet. Estimated-coverage
advisories remain for validation/dispatch. The room layout's cognitive26 function
was split into wall-ring and upper-deck definition builders, with exact numerical
definition equality checked against the completed study (`u4219 /
8fa4008b34bc4ade8dc454ae803d572b`, with types and focused Fallow). `wallRing` is
now cognitive14. The first equality check (`u4216`) incorrectly compared the
owner's sorted exterior-side list with the raw authored definition; the corrected
check compares both raw definitions and both canonically admitted definitions.
No numerical rerun was used for that behavior-neutral source decomposition.

This checkpoint is not browser/rendered evidence, a local Cloudflare DO crash
test for this room, a deployed backend, oxygen chemistry, whole-energy closure,
wall heat storage or flooded-volume support. Existing native wet-region evidence
is separate. A visible room and the main-game environmental join remain work.
