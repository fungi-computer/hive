# Authored buildings in procedural assembly — 2026-09-08

Bounded Game CTO study for a brewhouse as Hive's first village building
template. This uses current primary documentation and creator accounts; it does
not select a runtime, expand the live clearing, or make borrowed art/content.

## What the references verify

### Minecraft Bedrock jigsaws

Microsoft's current [world-generation overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/world-generation?view=minecraft-bedrock-stable)
defines structure templates as saved structures and jigsaw structures as two or
more templates joined at connection-point blocks. Template pools choose weighted
pieces and processors; structure sets control world distribution. The
[tutorial](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/jigsawtutorial?view=minecraft-bedrock-stable)
shows authored rooms/halls exported as templates, connector blocks placed on
their sides, weighted pools, fallback end caps, and smaller interior vignettes
such as a bed, crafting table, or chest. Recursion depth and structure spacing
are explicit inputs.

The official [connector metadata](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/jigsawreference/examples/jigsawcomponents/jigsawblockmetadata?view=minecraft-bedrock-stable)
names position, `name`, matching `target`, joint type, pool, and selection/
placement priority. [Pool elements](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/jigsawreference/examples/jigsawcomponents/template_pool?view=minecraft-bedrock-stable)
reference a template, weight, optional processor, and rigid or terrain-matching
projection. A jigsaw structure bounds recursion and horizontal/vertical distance;
a structure set gives seeded spread, spacing, and separation. The Bedrock Editor
can lock a seed and preview assembly in a void world before committing.

Evidence limit: these are current Bedrock Creator APIs, not Java source or a
claim about Hive's algorithm. Microsoft says vanilla uses jigsaws, while its
intro notes villages and bastions use a legacy form unavailable through this
JSON surface. Current reference pages also disclose AI assistance. The useful
evidence is the authored-piece/pool/connector/bound pattern, not undocumented
vanilla internals.

### Enter the Gungeon

In a [creator interview](https://www.gamedeveloper.com/design/q-a-the-guns-and-dungeons-of-i-enter-the-gungeon-i-),
Dodge Roll's Dave Crooks says the team hand-designed rooms, repeatedly played
them for fairness, then structured floor layouts with rules intended to give a
Zelda-like sense of structure. He also names situated interactions—flippable
tables, rolling explosive barrels, falling chandeliers, coffins, and mine
carts—as reasons the encounter place matters.

Evidence limit: the account verifies authored/tested rooms, rule-shaped floor
layouts, and meaningful room props. It does not publish the room format, graph
algorithm, connector matching, weights, overlap behavior, or prop serialization.

### The Binding of Isaac (original, 2011)

Edmund McMillen's [developer post](https://edmundmcmillen.blogspot.com/2011/09/binding-of-isaac-gameplay-explained.html)
says every map contains required treasure, boss, shop, and secret-room roles,
plus non-core rooms drawn from a pre-designed pool organized by difficulty and
chapter. Room contents, enemies, pickups, surprises, and boss arenas are selected
from alternatives; context rooms can require conditions such as enough money.
A contemporaneous [creator interview](https://bitmob.com/articles/interview-with-team-meats-edmund-mcmillen.html)
likewise describes dynamically arranging roughly 10–20 rooms chosen from
custom-designed chapter sets, then varying their contents.

Evidence limit: this concerns the original Flash game before release, not
Rebirth/Repentance internals. The post says 1,000+ pre-designed non-core rooms
while the interview says 200+ per chapter, so no pool size is treated as a stable
fact. Neither source exposes connectivity, placement, or saved-data code.

## Hive template contract

A template is versioned authored definition data, compiled at the content
boundary. It is not a copied world snapshot:

```ts
type BuildingTemplateDef = {
  id: DefinitionId;
  version: number;
  metric: SpaceMetricRef;
  bounds: IntegerBounds3;
  anchor: LocalCell;
  allowedQuarterTurns: number[];
  parts: readonly {
    definition: BuildingDefRef;
    at: LocalCell;
    facing: Facing;
  }[];
  ports: readonly TemplatePort[];
  props: readonly SemanticPropSlot[];
  presentation: BuildingPresentationRef;
};
```

- `LocalCell` uses integer `x/z` plus logical `level`. At instantiation the
  anchor binds to one `SpaceId`, the realm-local coordinate domain; a political
  realm/faction is not a coordinate key. Three positions, pixels, chunk-local
  indices, and storey render height never enter durable template geometry.
- `bounds` includes every rotated multi-cell footprint, roof/floor extent,
  semantic prop footprint, working position, and reserved clearance. Support
  requirements name existing geometry queries; the template does not store a
  second supported/indoors result.
- A port has stable local ID, kind/tag, inside cell, outside approach cell,
  level, outward facing, width/clearance profile, and required/cappable policy.
  Connections require compatible kinds, opposing facings, matching level and
  clear transformed footprints. The complete room must provide an exterior
  entrance from which the shelf, brewing vessel, and their work positions are
  reachable.
- Rotation transforms anchors, complete footprints, facings, ports, work
  positions, support relations, and prop slots together. Content validation
  rejects a turn unsupported by current building geometry or art; rotating a
  sprite alone is invalid.
- Semantic props reference actual definitions: the brewing vessel is a
  workstation/process host and the shelf is a real container. Optional initial
  goods require explicit spawn definitions and creation causes. Decorative
  barrels, rafters, bottles, soot, tables, and clutter live in presentation data
  unless they have a real simulation consumer. Art never creates storage,
  ingredients, collision, support, fire, or work positions.

## Two explicit instantiation paths

**Authored settlement initialization** chooses a template/version, anchor,
rotation, and optional prop alternatives from a settlement feature recipe. One
authority atomically creates finished structural and semantic instances once,
with stable IDs derived from/persisted under the settlement feature and creation
cause. It records the spawned instance as durable world state; chunk regeneration
cannot respawn destroyed furniture, refill ingredients, or overwrite later edits.

**Player construction** treats the same compatible template parts as a proposal.
Stamping expands into ordinary build intents; existing placement/admission creates
fresh sites/jobs and owns cost, claims, hauling, work, cancellation, support, and
completion. It never copies a generated building's items, occupants, assignments,
delivered material, work, or finished state. Group atomicity must be chosen and
shown before exposing a room stamp; current per-command partial acceptance is not
silently sufficient.

## Validation, placement, and first proof

Compile-time validation rejects duplicate IDs, unknown definitions/assets,
non-integer/out-of-bounds cells, illegal internal overlaps, ports off a boundary
or facing inward, uncovered required work cells, unsupported turns, unreachable
semantic props, and missing support/entrance policy. Runtime preflight uses the
one geometry/placement owner for terrain, support, occupancy, feature and
navigation conflicts. It either commits one coherent instance/plan or returns
named conflicts; no partial generated building appears.

Procedural choice uses a separate stable random domain keyed by world recipe,
settlement feature ID, assembly slot/purpose, and attempt. Candidates and
conflicts use stable ordering and a declared winner/fallback/cap rule. Depth,
extent, piece count, attempts, and bytes are bounded. A cross-chunk building has
one canonical instance and overlapping chunk references, never one copy per
chunk. Opposite request order must produce the same manifest or explicit failure.

The first art/template specimen is Levi’s requested complete two-storey brewhouse. Its optional study is presentation-only and does not certify current runtime placement. For a runtime template, first validate that same building’s lower/upper surfaces, stair opening, entrance and work clearances at fixed anchors and every
supported rotation: exact manifest equality, legal support/overlap rejection,
one usable entrance, actor routes to shelf/vessel work positions, and no art-only
prop appearing in simulation. Then instantiate it once as an already-built
village feature and once as a paid player plan, verifying distinct IDs and the
two lifecycle laws above. Only after a second authored building exists should a
bounded settlement graph/pool assembler connect compatible ports. Isaac-like
role guarantees, Gungeon-like encounter rooms, recursive villages, and interior
variant pools wait for those real consumers.
