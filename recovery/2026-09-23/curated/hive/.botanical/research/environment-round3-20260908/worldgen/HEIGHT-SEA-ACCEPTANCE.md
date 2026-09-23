# Height, waterline and the three map callers

Game CTO source/visual acceptance, 2026-09-08. Isolated candidate only; Game Delivery
retains all tracked integration and publication custody.

Levi's long-standing direction is final layered height, quantized voxel bed, then
one waterline. The old World Lab used a separate coast-distance label. This
candidate fixes that owner: `height-sea/terrain.js` owns quantization, the .54 m
vertical metric, datum 12 and below/equal/above classification. Coast shaping is
a continuous input to height, not a second water classification. Equal-datum
ground is dry; an exact cardinal neighbor query establishes wet/dry adjacency.

I read the revised specification, sampleTerrain, quantization and named boundary
caller and personally inspected the normal served screenshot. The exact dry cell
at (-720,-1120), bed 12, borders wet bed 11 north. The approximate footprint can
be wet while this exact cell is dry; both scopes are explicitly displayed. The
local raster and isometric section consume the same exact bed. The worker uses
the same generator module. The author also inspected the 390px frame; its browser
proof reports document width 390 and no page/worker errors.

Evidence: Node run-u2725 exit0 (five checks); locally served browser run-u2742,
invocation b6acfa87f968459db735168837049e6b, exit0 in 18 seconds. Earlier failed
browser attempts remain in height-sea/BROWSER_ATTEMPTS.json. No hosted claim.

Source join: candidate terrain.js -> src/world-lab/terrain.js; copied
world-lab/{main,worker,section}.js -> their existing tracked callers; copied
world-lab.html -> existing page. Delivery must reconcile the pinned source in
CALLER_SOURCE_PIN.json with current bytes and restore production-relative import
paths (the ignored callers use ../terrain.js). Styles are unchanged. No game
runtime, save, original art or live water stock is part of this handoff.

The sampling policy initializes below-datum surface basins only as metadata.
Ocean connectivity, cave flooding, rainfall, basin water quantity and subsequent
finite-fluid evolution require their own owners and evidence. A label never
recreates consumed or displaced water. Existing generated worlds must not be
silently reinterpreted under this different recipe/version.
