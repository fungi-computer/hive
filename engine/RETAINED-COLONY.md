# Retained Colony behavior and the next native join

King Bolete, September 11. Source review against deployed `6080e4e` and
retained JavaScript callers. This is implementation guidance, not a claim that
construction or brewing is running in the Rust Colony. The connected-world
objective in DEMO-ROADMAP.md remains unchanged.

## Preserve behavior, replace ownership together

The retained game is the behavioral reference. In particular:

| Retained owner | Behavior to preserve | Current native gap |
| --- | --- | --- |
| `src/structure-support.js` | Rooted columns, connected spans, distance measured from the original anchor | No static structure support query |
| `src/physical-completion.ts` | Recheck access and support; prepare material and geometry together; a blocked job waits | Excavation exists, building and removal do not |
| `src/construction.js` and `src/materials.ts` | Finite staged, embedded and salvaged material custody | No native construction site or embedded-material state |
| `src/navigation-space.ts` | Actual stairs, landings, headroom and swept occupancy | Native terrain routes exist; constructed links do not |
| `src/brewing.ts`, `src/recipes.ts`, `src/jobs.ts` | One production order, input readiness, attended effort, unattended fermentation, output delivery | Shared assignment and delivery exist; a general multistep process does not |

Do not port a second simulation or make the renderer create collision. The
current `Surface`/`Support` components also serve moving ship decks. Static
building geometry must preserve that frame-relative contract; a building name
or sprite is not a substitute for physical support.

## Construction completion contract

Three usable levels is the first consumer proof, **not a native 0..2 level
restriction**. Positions remain signed cells inside generated bounds. Floor
placement and roof placement use the same physical elevation convention; a roof
is a floor/sealing definition at its own elevation. Four stair directions are
explicit cardinal orientations, independent of camera rotation.

Rooted support follows the retained rule: carrying a span across another floor
does not reset its distance from a real anchor. Span reach is definition data.
Automatic collapse remains deferred; refuse or retain a waiting unsupported edit
with a useful reason. Do not require a wall directly under every floor.

```text
build order selects a validated definition and placement
  ordinary delivery moves actual lots into the site's finite container
  shared assignment considers ready work, filtering before route estimates
  worker reaches a current valid work contact
  native advancement earns saved effort once per elapsed step
  completion prepares:
    current site identity and definition
    support, headroom, standing and in-flight actor contact
    staged lots -> embedded material custody
    structure geometry plus affected water/air geometry admission
  if transiently blocked: keep earned effort and lots; explain waiting
  otherwise publish the compound result once in the existing transaction
```

Cancellation releases future work, not already transformed material. Removal
must prepare salvage and geometry together, including dependent structures and
actors using the surface. A cache is invalidated at the geometry owner; it cannot
be another saved representation of a finished building.

The precise static face/support representation is still under caller review.
Do not start a floor-only collision map while that boundary is unresolved.
Review thin floor headroom against the current 0.54m voxel spacing, terrain
traversal and environmental face rules before choosing solid voxel versus face
geometry. Publish one representation to navigation, water, air and rendering.

## Brewing is a test of the same work design

The standing-production contract in DEMO-ROADMAP.md remains required. A batch
uses ordinary deliveries, native effort, passive elapsed-time conditions and
atomic finite transformations. Fermentation holds its vessel, not its worker.
Full output storage blocks that transition without consuming inputs twice.
Recovery and cancellation preserve actual intermediate goods and waste.

Construction is the next concrete consumer of staged materials and compound
completion. Do not declare the process system complete from that alone. Its
second proof must include a multistep recipe with passive waiting, a changed
worker and blocked output. Another supported recipe should then be definitions,
not another hauling implementation or a `brew` branch in generic persistence.

## Reviewable increments

1. Qualify already-deployed area orders across same-store restart and exact
   command replay; do not substitute save/reload for that evidence.
2. Settle the physical structure representation and implement earned building
   using current material, route and work owners. Demonstrate supported spans
   and all four stair directions on three levels in the same Colony.
3. Join fueled room smoke and openings to those real structures, retaining
   finite emissions and the existing native environmental owner.

Two-region Survival remains a parallel goal outcome. Neither this construction
sequence nor the deferred vision port redefines completion of that objective.
