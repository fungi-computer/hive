# Goblin structure environment geometry

`structureEnvironment({terrain, sites}, {min, max})` derives immutable plain
geometry facts from a registered point-solidity terrain capability and completed construction sites.
Goblin supplies `terrainGeometry(state.terrain)` from its one generated wet world.
The half-open region uses world voxel `[x,y,z]` coordinates and contains at most
1024 cells. Horizontal bounds must remain inside the finite 15×15 clearing;
coordinates are integers within ±1,000,000 and input sites are limited to 4096.
There is no saved cache or second mutable world.

Cell IDs are `cell:x,y,z`. Closed horizontal face IDs are the existing `y:x,y,z`
contract: the plane between cells at y-1 and y. The spacing is `[1,.54,1]` metres.
Known floor/roof faces on a region edge are included; all other cut-boundary
conditions remain unspecified. A caller must supply an explicit outside/ambient
collar before creating an atmosphere domain. Empty queried space is not an
implicit ambient reservoir or a sealed room.

Every BUILDINGS entry declares its environment shape. A completed wall occupies
four vertical voxels starting at `frame.y + site.level*frame.storeyVoxels`; floor is a zero-volume face at
that datum and roof is a face at `frame.y + (site.level+1)*frame.storeyVoxels`. Doors, stairs, beds, shelves
and brewing furniture are explicitly permeable in this first model. The query
uses actual `construction.footprint()` for width and supported direction 0/1.
It does not use `blockedCells`, occupancy, navigation costs or rendered pixels.
Construction imports its existing navigation dependencies transitively; this
query does not invoke them or infer physical closure from them.

The current stair landing remains open because placement rejects a coexisting
floor. This query never inserts a synthetic landing floor. Signed integer site
levels use the same formulas, including negative levels; that is a geometry
contract, not a migration of Goblin's current saved/admitted levels 0/1.

Terrain solidity comes from actual generated voxel points, including caves. The
registered Goblin frame is `[-7,15,119]`, with four voxels per storey; local (7,9)
therefore stands above world voxel [0,14,128]. Bounds use the registered world's
half-open vertical extent and the finite map's horizontal extent. Unknown building
types, absent/invalid shape definitions, malformed positions and out-of-domain
bounds reject. There is no authored height-field fallback.

Provenance includes terrain identity/revision, checked building shapes, completed
site geometry facts, metric and limits. These are detached descriptive inputs,
not new ownership of site completion, support, resources or physical fields.
Actors, trees and other non-building content are outside this bounded query.
No gas, heat, fuel, atmosphere solver or rendering is introduced here.

Historical initial-shape proof from the worktree root uses the shared run-proof wrapper around:

```sh
node --test --test-name-pattern='structure environment|actual libcolony admits legal stairs' src/structure-environment.test.js src/clearing.test.js
```

The original authored-terrain shape: eight geometry laws plus the existing actual-libcolony stair admission law passed
u4175 /12d360d6551e47c480c6393c47bee24d. They cover unfinished/completed walls,
zero-volume floor/roof faces, doorway and stair openings, signed levels, actual
terrain edits, directional footprint reuse, malformed bounds/metadata and deep
immutability. The metadata footprint law temporarily configures a bed with the
supported column shape to prove shared footprint behavior, then restores the
definition; no production building behavior is changed by that test.

Strict TypeScript/declaration checking passed u4176 /111a4a090cff40d8befc016c22f268b7
with skipLibCheck:false. Fallow found no new geometry-module hotspot. Its changed-file
report retains four existing construction advisories: placementProblem CC33/cog41,
removalProblem CC23/cog17, indoors CC14/cog18 and upstairsIndoors CC11/cog18.
Only definition metadata changed in that file; these unrelated lifecycle and room
queries were not refactored or suppressed. The atmosphere query does not use the
existing indoors room classification.

Review corrected the stair/floor law to assert actual rejected command admission,
its concrete lower-support reason and unchanged site facts. The earlier comparison
to an empty string could also pass for successful null. The corrected affected
law passed u4183 /3e1e76c370bd4ac49f8dfc0a88a2da7a for both supported directions;
no production behavior changed and no broad suite was repeated.

Current generated-terrain join: all eight geometry laws passed with the six joined
main-world laws in u4230 /18ad50d8299243a5b9007181cfcdca78. These use the registered
frame and real exact excavation. Historical proof IDs above retain their original
source meaning; they do not qualify the new terrain owner.
