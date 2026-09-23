# Persistent perennial-world architecture check

Read-only source review, 2026-09-07. This records a later architecture boundary for permaculture, long-lived trees, and food forests. It changes no current runtime, tracked plan, issue, proof, or upstairs delivery.

## What Hive actually has

The shipped mugwort loop already establishes several useful laws:

- Each herb is a world record with a stable generated ID, cell, stage, work, and `plantedAt` tick ([model](../../src/model.ts#L125-L133), [sow admission](../../src/orders.ts#L236-L257)).
- Sowing and harvesting are ordinary typed jobs. Workers route to the plant and advance explicit work; harvest replaces the plant with one physical bundle ([jobs](../../src/jobs.ts#L132-L178), [activity](../../src/activity.ts#L255-L291)).
- The fixed simulation tick owns growth. Rendering reads the stage and computes a bar; it does not advance the plant ([step](../../src/clearing.ts#L108-L138), [view](../../src/view.js#L311-L354)).
- Strict save schema 6 persists herb facts, validates stage against the current tick, and restores paused ([schema and validation](../../src/persistence.ts#L293-L301), [invariants](../../src/persistence.ts#L1537-L1569), [restore](../../src/persistence.ts#L1746-L1759)).

Those are capabilities to preserve. They are not yet a perennial system.

The actual current gaps are equally clear:

- `mugwortStage(elapsed)` derives stage only from elapsed ticks, with fixed thresholds at 80 and 240 ([herbs](../../src/herbs.ts#L3-L11)). Water, shade, soil, damage, season, and care cannot alter accumulated development.
- `advanceHerbGrowth` scans every non-ready herb on every simulation step ([clearing](../../src/clearing.ts#L108-L116)). That is harmless for the 15×15 proof and is not a scalable dormant-world plan.
- Oaks have stable scenario IDs but only `work` and `felledAt`; they never germinate, grow, reproduce, senesce, or retain provenance ([model](../../src/model.ts#L125), [clearing creation](../../src/clearing.ts#L32-L39)).
- World occupancy is array-based over one finite 15×15, two-level clearing ([world](../../src/world.js#L3-L34), [occupancy](../../src/world.js#L67-L90)). There is no gameplay chunk index or cross-chunk vegetation query.
- World Lab provides deterministic chunk keys and a sampled moisture signal, but explicitly has no game simulation, persistence, actors, jobs, or routes ([terrain contract](../../src/world-lab/terrain.js#L4-L21), [sampling](../../src/world-lab/terrain.js#L136-L161)). Moisture there is generated map evidence, not soil water available to a tree.
- Source contains no water quantity, soil reservoir, sunlight field, fertility stock, plant reproduction, clone, or graft owner. These remain accepted future directions or hypotheses, not implemented facts.

Existing architecture already says dormant unoccupied terrain should be stored rather than ticked continuously, and that offline work must advance in bounded batches without moving its cursor past unperformed work ([world lifecycle](../../ARCHITECTURE.md#L449-L460), [time while away](../../ARCHITECTURE.md#L697-L718)). Those are plans awaiting a real vegetation proof.

## Seven requirements for persistent perennial patches

### 1. Preserve organism identity separately from biological lineage

Every player-planted or otherwise materialized long-lived tree needs one stable `PlantId` that survives growth stages, chunk residency, save/load, travel of derived material, and death. Maturity must not replace the sapling with a newly identified entity.

Untouched generated vegetation may stay implicit. Its prospective identity derives from world identity, generator version, feature owner, and global coordinate. The first interaction, environmental divergence, or need for exact history promotes it to a persisted plant record without changing that identity.

Propagation needs a small closed origin record, introduced only with its first real consumer:

```ts
type PlantOrigin =
  | { kind: "wild"; feature: string }
  | { kind: "seed"; seedBatch: string; lineage: string }
  | { kind: "clone"; sourcePlant: PlantId; lineage: string };

type GraftAttachment = {
  rootstock: PlantId;
  scionLineage: string;
  attachedAtTick: number;
};
```

A seed creates a new organism and may create a new lineage result sampled once at germination. A cutting/clone creates a new organism that retains the source lineage. Grafting is a later attachment to an existing rootstock, not a replacement origin: preserve its original seed/clone record and identity, with separate scion provenance so root behavior and fruit identity do not silently collapse. These types illustrate the distinction; the first real graft consumer determines its validated attachment lifecycle.

Do not require living parent records forever. Persist durable lineage or batch IDs plus immediate provenance; archival genealogy can remain bounded until a breeding, trade, or knowledge consumer needs more.

### 2. Separate age, accumulated development, life stage, and reproduction

Chronological age is `worldTick - germinatedAtTick`. It is evidence of elapsed world time, not sufficient evidence that growth occurred.

Store accumulated development produced only during viable intervals. Derive a coarse `lifeStage` such as germinating, sapling, mature, senescent, or dead from development, age, health/damage, and authored species rules. Senescence and death cannot depend solely on accumulated successful growth: a stressed tree may stop growing while continuing to age or die.

Keep reproductive/phenology state orthogonal: dormant, vegetative, flowering, fruiting, or recovering. A mature tree can cycle through reproduction many times; “fruiting” should not sit between mature and senescent in one irreversible enum.

Persist discrete boundary outcomes that matter to players: germination, establishment, canopy/root size band, first maturity, fruit set/harvest readiness, damage, senescence, and death. Rendering may interpolate appearance within a band but cannot create the transition.

This replaces the perennial temptation to call `stage(elapsed)` while leaving the short current mugwort helper intact until a real longer-lived caller supersedes it.

### 3. Read one shared local environment rather than giving each plant private physics

Plants consume local world facts owned elsewhere:

- soil-water amount and capacity;
- sunlight/shade exposure;
- soil/fertility or organic-matter state if selected;
- temperature/season boundaries when those fields exist;
- neighboring canopy/root occupancy and competing demand.

The vegetation owner should ask bounded world queries for a plant footprint or patch bounds. A cell/chunk spatial index may answer “plants intersecting these cells” and “patches affected by this changed boundary.” It should not require scanning every tree or every terrain cell.

Canopy and roots may cover several local cells while the organism retains one ID and anchor. Feature ownership at chunk borders must choose one owning patch/chunk; neighboring queries include the overhang without duplicating the tree.

Generated World Lab `moisture` can inform terrain suitability. Actual soil water must be a mutable conserved field or reservoir with named sources and sinks. Do not treat the generated 0–1 moisture sample as free irrigation.

### 4. Schedule meaningful boundaries, not render frames or every-tree ticks

Each resident or persisted vegetation patch records `advancedThroughTick` and its earliest `nextDueTick`. The world scheduler only visits patches whose due boundary arrived or whose local inputs changed.

Within a patch, a compact due queue may point to germination, stage transition, water exhaustion, seasonal transition, fruiting, senescence, or a player work result. Stable ties resolve by recorded event kind and stable ID so request or residency order does not change outcomes. Coupled continuous fields still require bounded numerical integration where closed-form spans are not valid; a due queue does not make those costs disappear. Active neighboring patches must settle shared transfers at a consistent simulation boundary.

When water, shade, soil, damage, harvest, or neighboring footprint changes, the owning system reports the affected bounds. Vegetation first settles the old interval through that change tick, applies the new input, and schedules its next possible boundary.

The renderer reads persisted stage/size/phenology and may animate wind or interpolate growth presentation. Camera visibility never schedules biological work, and destroying a sprite never evicts the organism.

This can be implemented behind the existing fixed-step authority when selected. It does not require a general event framework, ECS, physics package, or new runtime now.

### 5. Catch up through ordered condition segments and stop honestly

Eviction persists the patch cursor, plant state, due boundaries, locally owned environmental state, and references to relevant world events. Dirty patch data commits before decoded data is evicted.

On reload at a later authoritative world tick, catch-up walks meaningful boundary events in order: season/weather changes, water-route changes, local disturbance, scheduled plant transitions, and neighboring canopy changes. It can integrate a span only while the governing inputs are known to be constant or follow a proved deterministic schedule.

Do not compute `elapsed * currentRate` across a gap in which a stream was diverted, a taller tree cast shade, drought began, or soil was amended. That applies today's condition retroactively.

Catch-up runs in bounded batches. If required neighbor data is missing, a cross-border event is unresolved, or the batch budget ends, persist the cursor and report the patch as catching up/needs data. Do not jump `advancedThroughTick` or invent a final stage.

World pause and offline wall time remain different. The current local save restores paused and advances no offline time. A future authoritative host may map committed wall time to world ticks, but only that owner can create the catch-up target; client time and chunk load time cannot.

### 6. Make water a real shared balance among plants and other consumers

The useful path is explicit:

```text
source stock → carried/channel/pipe route → soil or vessel reserve
             → plant uptake / household use / brewing / loss sink
```

Every addition and removal names its source, sink, amount, and authoritative tick. A plant debits a shared local soil-water reserve; it does not own an invisible private water meter refilled by an animation.

Competing plants in one patch settle aggregate demand against available water in stable order or by one documented allocation rule. Multiple catch-up batches must produce the same debits as uninterrupted boundary processing.

Wells, basins, latrines, brewing, ponds, and crops eventually share source quantities and transfer/custody rules. They need not share one activity type or one universal fluid solver. Carried water can prove the first route; gravity channels or pipes later replace demonstrated labor without creating water.

Evaporation, drainage, transpiration, rainfall, source recharge, and water stored in produce are separate authored source/sink choices. The first tree proof should select only the terms needed to close its balance.

### 7. Keep seeds, cuttings, water, work, and harvest in ordinary ownership

Planting consumes or transfers one physical seed/seedling/cutting under the same item-location and claim law as other materials. Watering, mulching, pruning, grafting, and harvesting become ordinary typed jobs only when their readiness and outcomes exist.

The patch may expose “needs water” or “fruit ready.” It must not teleport an item, reserve stock, or perform labor. Existing command admission, jobs, movement, activity, resource custody, and persistence remain the external seam.

A harvest creates physical output once, with plant/lineage/batch provenance needed by its consumer. A canceled or interrupted job preserves exact custody and plant state. Repeating a command cannot duplicate fruit, seed, cutting, or scion.

Common crop definitions may eventually provide species thresholds and supported outcomes as data. New behavior such as graft attachment, pollination, or coppicing earns typed code and one real proof; it is not enabled by an arbitrary config row.

## Small first proof, later

Use one exact long-lived tree, one understory species or cohort, one finite water source/reserve, and one visible water route in a small patch. Keep the rest of the world implicit.

1. Plant the tree from one physical seed batch and establish its permanent `PlantId` and lineage record.
2. Advance through germination and sapling boundaries while resident. Show the understory reading the same shade, soil-water, and neighbor queries.
3. Save and evict the decoded patch. Advance the authoritative world through a compressed, explicitly labelled ten **game-year** interval using seasonal/water/plant boundary events, not ten real-time years.
4. Include one mid-interval water-route change or drought boundary. This proves catch-up uses historical condition segments rather than the final condition multiplied by elapsed time.
5. Reload and compare with an uninterrupted resident reference: tree ID/origin/lineage, age, accumulated development, life stage, canopy/root band, reproductive state, understory state, water source/reserve totals, due boundary, and state hash agree.
6. Repeat with catch-up split across several budgets and reloads. The cursor never advances past processed work and cross-boundary source/sink totals are counted once.

The proof timeline is an abstract tuning fixture. It establishes “leave a planted tree and return years later to the same, condition-shaped organism”; it does not promise a ten-real-time-year product cadence, complete forest succession, climate simulation, breeding genetics, graft gameplay, or world-scale capacity.

## Ownership boundary

The smallest future seam is one vegetation owner that advances a patch to an authoritative tick using world-owned condition history and emits due plant facts. Callers should not know its event queue, catch-up segmentation, or lineage mechanics.

World/chunk code owns global coordinates, residency, local spatial queries, and commit-before-evict. Environmental/water owners own shared quantities and boundary changes. Existing command/job/activity/resource code owns player intent, labor, and physical custody. Persistence validates the combined durable facts once. Rendering observes them.

This architecture deepens current owners around a real perennial caller. It does not justify a second simulation clock, per-tree render updates, generic farming framework, ECS migration, offline host, or change to the active upstairs work.
