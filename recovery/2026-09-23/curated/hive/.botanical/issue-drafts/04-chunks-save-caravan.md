# Chunk-loaded world with local save and caravan return

Status: future playable foundation.

Extend the finite clearing into generated chunks with deterministic borders/features, bounded resident and render caches, dirty-save protection, and a local caravan that leaves and returns to its persistent home while another person works. Preserve existing actor identities and state through departure and return. Keep terrain chunks, active simulation regions, and camera visibility separate. A future worldgen experiment may combine layered/fractal noise with separate elevation, moisture, climate, terrain, and water-connectivity signals; global seed/coordinates keep borders continuous, player edits override the base, and caves need volumetric data. The exact recipe is not selected. Save/reload must preserve actor, item, task, claim, home, and learned-state ownership; missing chunk data waits safely. Full gear and knowledge systems are not prerequisites.

First useful proof: cross positive and negative chunk boundaries, leave with real cargo, save, reload, return, and compare equal-tick replay and opposite generation orders. A local slice is sufficient; no hosted backend or world framework is implied.
