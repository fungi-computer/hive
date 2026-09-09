# Terrain removal yields

`terrain-yields.ts` is Goblin's content interpretation of already validated
removal records. Original material1/porous yields soil; material2/impermeable
yields stone. One unit is one0.54m³ bulk portion (1×0.54×1m), not1kg. The source
record retains its original voxel identity, quantity, volume and pore-water
history. This module creates no water credit, mined counter or second ledger.

`excavationYield(before, after, target)` requires the exact target-derived source
ID to be new, all predecessor IDs and fields to survive unchanged, and no
unrelated addition. Record array order, reconstructed object identity and JSON
key order do not establish provenance. `removalYield` rejects unsupported
material/kind/volume/quantity/identity combinations; the physical source parser
continues to own record structure and original-world authenticity.

The physical completion owner first prepares the actual detached excavation,
then resolves its yield and calls the existing ordinary material allocator on
its one detached material branch. Allocation refusal cannot publish terrain or
a partial yield. `terrainYieldProblem` uses the same definitions to check live
soil and stone separately across ordinary ground/hand/container lots. Neither
material currently has a supported sink, recipe or embedding: adding one later
must join this equation rather than silently losing its output.

The current envelope is21 and Goblin Region identity is
`goblin-wet21-yield054-v1:<optimizer identity>`. Predecessor20 is explicitly
unsupported. Preserved schema20 native/field receipts are historical evidence;
they are not current-format replay proof.

## Deliberate current limits

Main `world-presets/goblin-terrain.ts:parseTerrain` still rejects impermeable
exports, and its excavation preparation still restricts targets to the32 owned
porous source cells. Existing standing, rim and reach restrictions remain.
Thus stone can be interpreted/accounted through the headless owner but cannot
enter current main play through excavation or a restored deep-world checkpoint.
Adding a stone lot to a soil-only main save fails per-material conservation.

Stone's registry entry supports ordinary material portion semantics; shelves
still accept only their existing wood/mugwort definitions. No new stockpile or
stone hauling gameplay is claimed. `view.js` only renders ground wood, soil and
ration, and original terrain art remains soil-colored. Stone art and actual
signed-depth access require later owned joins; there is no visual fallback.

Four authored laws cover exact identity/predecessor preservation, unsupported
projection, the existing17-cell engine shaft coordinates as a headless removal
source input, and current save corruption/version rejection. The shaft law
performs no flow/time advance and makes no new numerical or pawn-access claim.
At this source checkpoint no tests, types, Fallow, build, browser or native run
was authorized. Existing physical completion laws are unchanged.
