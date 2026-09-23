# Hive retained job/config source discovery

Read-only discovery, 2026-09-07. Revisions inspected: retained
`origin/worldbox-mvp` `14cfa809480dec9b7f4586a9993354925345fa38`, the later
architecture-doc commit `50433b49e2c843abf45bcc304d2035abf0236484`, and the
current baseline named by the project, `016b1a02b009e798165bd4ba11653093cf4ee1c6`.

## Result

No retained Hive document or source implements the claimed asset-plus-config
path for adding a job through a workstation/workspace tile type and animation.
The exact terms `workstation` and `workspace` do not occur in the retained
source tree as an implementation schema. `git log --all -S` finds only the
later architecture discussion and unrelated workspace wording in a report.
There is no tile-type-to-workstation registry, animation declaration tied to a
job, or config loader in the inspected history.

The closest retained evidence is a data seam, but it is a different system:

- `14cfa...:src/assets.js` says “the ONLY file that maps Kenney tile indices
  to sprites” and defines `TILES` entries such as `worker`, `workerWalk`,
  `tree`, `well`, and `den`. `tileUrl` only resolves an explicitly mapped
  tile index; it does not attach jobs or workstation behavior.
- `14cfa...:src/tables.js` says “a new job or crop is +1 row here, never a new
  code branch.” Its `JOB_CLASSES` rows contain `queue`, `siteKind`, `mode`,
  and `yield` for the farm POC (`wood`, `water`, `sow`, `harvest`, dormant
  `stone`). These are source-level tables, not an external config format or
  workstation tile schema.
- `14cfa...:plans/reports/hive-farm-slice-implement.md` §3 says the pack
  “ships NO manifest” and the renderer has one seam, `src/assets.js`
  (`TILES` map `idx+scale`; `FALLBACK` paints; `tileUrl`). It explicitly says
  “Only assets.js values change.” The report contains no workstation or
  workspace job mapping.
- `14cfa...:src/glade.js` describes the fixed-step ticker as driving “ONLY
  animation” and reusing the `assets.js` tile seam. This is renderer timing,
  not a job animation config.

## Current Hive shape

The current `src/construction.js` still owns a literal `BUILDINGS` object:
`wall`, `door`, `roof`, and `bed`, each with `label`, `wood`, and `ticks`.
Current `src/jobs.ts` imports `BUILDINGS`; `buildOption` reads the selected
site's recipe and derives pickup/build work from delivered wood and remaining
work. This is the implemented construction/job path at the current baseline;
it has no workstation asset or animation field.

The current docs make the intended boundary explicit. `PROTOTYPE.md` says
`construction.js` owns “footprint/room/recipe rules” and calls these “concrete
colony responsibilities, not a generic job engine.” `ARCHITECTURE.md` says,
“A later workstation should reuse these operations, adding its recipe and
domain outcome rather than copying movement, pickup, cancellation and UI.”
That is a future design direction, not evidence of a live config engine. The
same document records that a generic “job language” has “no demonstrated
consumer yet.”

Therefore the user-selected asset/config direction remains a future design
input. The smallest eventual proof should begin from one real workstation
consumer and one real actor animation, after the workstation's domain recipe,
tile identity, and animation state are concretely specified; this note does
not introduce that schema or alter the current owner boundaries.
