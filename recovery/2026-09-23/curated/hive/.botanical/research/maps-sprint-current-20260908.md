## Current sprint: reliable home controls and usable maps

Game CTO direction, 2026-09-08. This section supersedes the historical source/status/sequence below. The older plan remains evidence of the original proof scope. The current game remains deliberately small; a navigable atlas is not permission to move live gameplay into generated terrain.

**Sprint outcome:** Levi can operate the home without awkward floor controls, inspect the same geography at overview and local scale, and navigate a useful map without long synchronous generation blocking input. Each coherent outcome ships on the same authorized preview as it becomes ready. A later small in-game minimap displays the actual clearing, with serial HUD/camera custody. Do not wait for the whole roadmap to provide a playable update.

### What exists, and what still needs work

The published upstairs game and World Lab are separate consumers. At World Lab revision `9db4d31`, the source has a fixed seeded 512×512 overview, an 80×80 local view assembled from 25 cached 16×16 chunks, named location jumps, viewport markers, and terrain/elevation/moisture coloring. The local and overview views use the same geography recipe at different footprints. These are diagnostic maps. Generation is synchronous; general navigation, a bounded generation worker, discovery, durable terrain edits and playable actor/cargo streaming are not established by that release.

The prior upstairs release was published under Levi's explicit move-on direction. Do not reopen its stopped full-home trace as a prerequisite to this sprint. Current floor controls are an active correction candidate, not yet a new release claim. Existing bed/contact and geometric-ordering defects remain their own accepted corrective contracts.

### Small release packets and ownership

| Packet                      | Current status and owner                                                                          | Useful exit                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floor controls              | Active: home-ui is sole controls writer; Delivery accepts source/caller correction and integrates | Persistent Ground/Upper controls plus correctly mapped PageUp/PageDown work without selecting stairs; tool policy, focus and short/narrow layout remain coherent; one short real-input trace and affected laws             |
| Atlas location inspection   | Active independent World Lab lane; isolated page/terrain/caller files only                        | Click a coast/ridge or signed coordinate in the overview; local view and inspector identify that exact global cell and match its elevation/moisture; bounded sampling and current cache size remain explicit               |
| Responsive atlas navigation | Next World Lab packet after the preceding source checkpoint                                       | Pan/jump and change request while generation runs; only the newest requested location/identity may display; one bounded worker and queue, explicit generation/draw/byte measurements, no giant synchronous overview action |
| Actual-clearing minimap     | Ready for the next safe HUD/camera slot after controls; Delivery assigns one caller owner         | Show actual people/structures/current level and camera extent; clicking recenters only the camera; markers follow real movement, paused clicks create no world jobs/ticks, and 390px layout remains usable                 |

Delivery owns task decomposition, exact file custody, routine corrections, focused proof, serial Git and same-preview publication. Current home-ui and World Lab writers stay in place. A source reviewer may inspect independently; a documentation lane is not another gameplay writer. No new PM tier or shared-file competition is needed. Changed original art alone retains Astra's personal art review; map input/plumbing does not wait for a new art gate.

The controls reviewer has returned concrete corrections, so there is no grounded deploy ETA until that first corrected source checkpoint is accepted. Delivery reports the next estimate from actual remaining work and names a material publishing blocker promptly. This sprint specifies useful exits, not an invented calendar promise.

### Map contracts implementers must preserve

- Use one world identity, generator and signed coordinate convention. Settle inclusive-versus-exclusive bounds explicitly before extending navigation; map pixels cover geographic footprints, and marker position is not itself a cell identity. Keep fine authoritative terrain distinct from approximate overview summaries.
- Overview click, local inspection and later minimap use shared coordinate contracts. Exact inspection compares the selected cell's full-detail sample with its local chunk values using the same quantization; an approximate overview pixel need not have identical elevation/moisture. World Lab terrain must never be presented as the current playable clearing. A clearing minimap derives its records from the real game display/state projection and uses the existing camera/input owner.
- Remove the local-buffer dependence on the first chunk or input array order. Shuffled chunk inputs must assemble to identical cell placement; signed seams must round-trip correctly. This is a focused source law, not a second renderer project.
- A generation worker wraps the same pure sampler, with bounded resumable work, request epochs and explicit transferred-buffer ownership. New requests supersede old work; stale results cannot overwrite the current view. Worker cancellation must be observable between bounded pieces of work, not only after a giant loop finishes.
- Name visible/resident/in-flight/result/scratch budgets and distinguish generation time from buffer assembly and drawing. An out-and-back journey must return to bounded residency. A rendering-cache eviction is not proof that an authoritative world chunk or unsaved edit was safely evicted.
- Composable seams here are geography sampling, coordinate conversion, request lifecycle, residency and map presentation. A second map reuses these where its domain matches. Do not create another generator, save owner, timer loop or universe of copied map state for each UI panel.
- Keep cartographic knowledge separate from loaded terrain. Exploration/fog, physical crafted maps and a globe remain recorded follow-ons; downloading a chunk never automatically teaches a character its contents. The first minimap may show the already-known tiny clearing without inventing a discovery simulation.

### Next architecture proof and playable follow-through

After responsive maps, the next isolated map proof is one terrain edit/tombstone stored under the lab's separate versioned base-plus-patch namespace, committed before actual decoded-data eviction and still present after regeneration/reload. Failed or stale writes must preserve newer edits. This is queued work, not a currently shipped save feature.

Live generated-world play comes later: a small controlled adjacent-chunk fixture, an existing actor and cargo crossing and returning, home work continuing, correct offscreen state and durable recovery. Levi's tiny-map-fun gate remains. No multiplayer, full globe, caverns, fluids or full fog-of-war implementation enters these map packets.

The home track continues bed/contact corrections and one unified wood+herb transfer owner, then the first recipe-driven brewing process. Brewing must not gain a third hauling implementation. The old paragraph below permitting construction wood to remain indefinitely special-purpose is superseded by [the unified-work recut](unified-work-algebra-recut.md). Small map UI work can land at a safe caller checkpoint without waiting for brewing or displacing its coupled writer.

Associate these outcomes with existing #4 world/maps, #12 controls and #6 performance, keeping #7/#14 work/brewing linked where relevant. Retain existing issues rather than creating one issue per map control. Update the top-level current-status links in PROTOTYPE/ARCHITECTURE; preserve historical evidence with an explicit label. [Repository instructions](../../AGENTS.md) make composability and single ownership the default for every packet.
