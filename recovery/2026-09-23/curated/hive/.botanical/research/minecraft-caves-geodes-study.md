# Minecraft Caves & Cliffs: caves, aquifers and underground resources

Primary-source study for Hive, 2026-09-08. This distinguishes documented Minecraft behavior from proposed Hive mathematics. It does not reproduce Mojang's generator, download game code/assets, run Minecraft, benchmark a generator or claim live digging support. Historical snapshots establish development intent; final release notes establish what shipped. Bedrock creator documentation is explicitly edition-scoped.

## 1. Geodes and the large cave overhaul were separate deliveries

Java 1.17 / Caves & Cliffs Part I included amethyst geodes, their layered minerals and budding/cluster behavior. The large terrain/cave generation overhaul, three noise-cave families, aquifers and naturally generated new cave biomes belong to Part II / 1.18. Early 2021 snapshots and preview datapacks showed some of that future generation before its final release; their presence in a “1.17 snapshot” is not evidence it shipped in ordinary 1.17. [Official 1.17 Java changelog](https://feedback.minecraft.net/hc/en-us/articles/4402626897165-Minecraft-Caves-Cliffs-Part-1-1-17-Java), [official 1.18 Java release](https://www.minecraft.net/en-us/article/caves---cliffs--part-ii-out-today-java), [official prototype-pack scope](https://feedback.minecraft.net/hc/en-us/articles/4402614709389-Caves-Cliffs-Prototype-Data-Pack-for-Minecraft-Java-Edition).

**Hive implication:** an interesting bounded underground feature can precede a complete volumetric world. A geode, small cavern or goblin refuge is a potential first exploration consumer. It must still use real world coordinates, persistent edits and real resources; a demo feature should not create an incompatible second terrain owner.

## 2. Heightmaps alone cannot represent stacked caves

Mojang describes cheese caves as caverns, spaghetti as winding tunnels, and noodle caves as narrower winding passages. Noise caves combine with older cave carvers/canyons; intersections with the surface make entrances. Snapshot 21w17a specifically introduced noodles in the preview datapack. These are useful shape families, not three mandatory algorithms or exact parameter sets supplied by those articles. [Noise-cave introduction](https://www.minecraft.net/en-us/article/minecraft-snapshot-21w06a), [noodle introduction](https://www.minecraft.net/en-us/article/minecraft-snapshot-21w17a).

The mathematical distinction for Hive: a height field `H(x,z)` supplies one surface elevation per horizontal coordinate. A density field `D(x,y,z)` can classify solid versus empty at every vertical position, allowing multiple floors/ceilings, overhangs and passages. A proposed starting construction is:

```text
terrainDensity(p) = H(p.x, p.z) - p.y + amplitude * noise3(p)
baseSolid(p)      = terrainDensity(p) > 0
largeCavity(p)    = broadNoise3(p) > cavityThreshold(p)
tunnel(p)        = max(abs(noiseA3(p)), abs(noiseB3(p))) < width(p)
solid(p)         = baseSolid(p) AND NOT allowedCaveMask(p)
```

**This is a Hive proposal, not Mojang's exact implementation.** Two independent near-zero 3D fields can form tube-like intersections; one narrow band of a scalar 3D field tends toward a sheet rather than automatically producing a tunnel. Thresholds, anisotropy, warp and scale are design controls, with actual geometry inspected at actor scale. Degenerate intersections, isolated voids and too-thin passages remain possible; noise does not promise connectivity or clearance.

Henrik Kniberg's [original terrain explanation](https://www.youtube.com/watch?v=CSa5O6knuwI) was located; its description lists 3D noise at 17:37 and cave generation at 20:10. This pass read its metadata/chapter listing, not the video or a verified transcript, so it supplies a follow-up reference rather than evidence for the formula above. No secondhand quotation of his comments is treated as verified source.

## 3. Geodes are bounded features with a reason to revisit

Minecraft's geode has an outer smooth-basalt shell, calcite inside that and amethyst within. Budding amethyst produces new clusters in place. Developer Cory Scheviak explains that restricting this growth to immovable budding blocks was intended to make the location worth returning to. [Official developer explanation](https://www.minecraft.net/en-us/article/taking-inventory--amethyst-shard).

There is also useful **Bedrock** technical documentation: `minecraft:geode_feature` exposes replaceable layer blocks, distribution-point bounds, a distance field, maximum radius, noise and crack controls. That demonstrates a structured local feature rather than merely recoloring every world cell where a global noise exceeds a threshold. Its documented success can mean only one placed block; Hive must define a stronger semantic success rule for a playable landmark. This is not evidence that Java 1.18 uses identical internals. [Official Bedrock geode schema](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/features/minecraftgeode_feature?view=minecraft-bedrock-stable).

**Hive proposal:** choose a stable geode anchor, bounded local shape/distance field, shell strata, one opening policy and sparse crystal-growth sites. Generate the feature once into base terrain; growth then belongs to the ordinary world lifecycle. Harvested or broken crystals do not respawn because a chunk reloads. Leaving productive crystal substrate intact creates an expedition/claim/trade decision and can later connect to magic ingredients, maps and caravans. Growth rates and resource outputs remain game rules, not decorative randomness.

## 4. Resource placement can teach geography

Minecraft 1.18 deliberately changed ore distributions so one mining height is not best for everything. The release describes height biases, biome influence, reduced air exposure for some ores, and rare large veins with associated host rock: copper/granite and iron/tuff. These are distribution choices rather than a claim of geological simulation. [Official ore-distribution and vein notes](https://www.minecraft.net/en-us/article/caves---cliffs--part-ii-out-today-java).

**Hive proposal:** separate these decisions:

- A regional substrate/strata field decides plausible host material.
- A deposit candidate rule chooses feature identity, abundance, scale and depth band.
- A bounded vein/geode shape decides connected local cells.
- Exposure/host replacement rules decide which candidates actually become mineable resource.

Players can learn visible host-rock clues and record them in books/maps. A wet limestone-like cavern, a dark metal-bearing band and a crystal shell should invite different preparation. Tune for useful discoveries and travel costs rather than importing Minecraft's exact heights. “Reduced air exposure” is a possible reward tradeoff, not a default: hiding most resources in solid rock could make Hive's isometric exploration feel empty. Keep some legible clues without revealing every buried deposit on the ordinary minimap.

Official Bedrock feature rules separately control biome attachment, scatter/distribution and generation pass; the docs say order within a pass is not guaranteed. Hive should choose an explicit deterministic precedence for conflicting local features instead of relying on request or insertion order. [Official feature/rule introduction](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/featuresintroduction?view=minecraft-bedrock-stable).

## 5. Generated aquifers are not runtime water dynamics

Mojang explicitly describes an aquifer as an area with a water level independent of sea level, used **during world generation** to place water in noise caves. This produces underground lakes and flooded regions; the early snapshot's temporarily flooded height band was an acknowledged development limitation. It is not a documented finite-volume groundwater solver, nor a solution to what happens after the player excavates a connecting tunnel. [Official aquifer description](https://www.minecraft.net/en-us/article/minecraft-snapshot-21w06a).

**Hive proposal:** initialize coherent wet volumes/local hydraulic conditions from geology and the broader water plan, then hand them to the actual finite-water owner. Storage quantity, permeability/barriers, recharge sources and pressure/head approximations need explicit units and rules. Opening a rock boundary changes connectivity and wakes the fluid domain; it does not rerun generation and recreate drained water. Digging beneath a pond can reveal a dangerous connection or permit irrigation once physical flow exists.

A generation-time water-level field alone does not establish physical stability. Adjacent regions with different initial levels need coherent barriers/connectivity, and initial source/recharge policies must be explicit. Unknown neighboring volume is neither empty space nor permission to drain indefinitely. The first wet cave proof should account a finite sealed pool, open one passage, show conserved redistribution and reload the changed state. Broader groundwater/recharge and cross-authority flow are later contracts.

## 6. Chunk ownership, connectivity and readable digging are the real integration work

**Hive proposal, not a claim about Mojang's internal ownership protocol:** global-coordinate density sampling gives consistent base values at shared boundaries. Bounded discrete features additionally need canonical ownership. Derive a candidate's ID from generator version, feature domain, anchor region and ordinal. A chunk evaluates all potentially overlapping feature anchors within the declared maximum reach, clips their effects to its own cells, and resolves conflicts in a stable order. It must not spawn a second geode/ecology entity for each intersected chunk or use a mutable “next random” stream whose output depends on load order.

Large veins need a declared reach or a separately materialized regional feature graph; an unbounded feature is incompatible with pretending a tiny halo proves completeness. Persist digging/resource depletion as revisions over exact base identity. Generator upgrades require pinned old semantics or explicit migration; adjacent unexplored chunks must not silently reinterpret a mined feature's identity.

Topology and presentation are separate from shape generation. Classify accessible components and entrances for a bounded exploration area, validate actor clearance and real vertical links, and expose depth/cutaway/underground-map controls. Not every natural cavity must connect, but the first intended destination needs an honest route or an explicit digging task. Natural overhangs do not automatically follow the current building-support/collapse rule. Current building storey height also must not silently become the underground voxel unit; that unit/topology decision precedes a production volume format.

A small world-lab proof can show one chamber, winding passage, geode and dry/wet cross-section before gameplay enters a large world. Useful checks are boundary equality under different chunk request orders, bounded worker time/memory, feature deduplication, entrance/clearance diagnostics, persistent excavation, and water initialization exactly once. A coarse globe or surface map samples coarse geography; it does not need every underground voxel. Cave maps show discovered geometry separately from the complete generated truth.

## Recommended synthesis

Adopt the composition: **regional geology + volumetric solid/void + bounded deposits + one-time water initialization + persistent world evolution**. The first playable underground outcome should be a readable trip with one meaningful resource and a return to the home economy. The math is achievable; noise parameters alone do not deliver navigation, fair discovery, save integrity, finite fluids or multiplayer ownership. Keep those boundaries explicit in the shared world-generation and living-world contracts.
