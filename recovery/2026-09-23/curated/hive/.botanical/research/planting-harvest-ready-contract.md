# One-herb planting and harvest: writer-ready contract

Read-only design pass against HEAD `4e25b7e` on 2026-09-07. This is one explicit, shared-home loop: sow one herb on clear ground; a real home member travels and works; the herb visibly grows on fixed ticks; the player orders harvest; one physical output appears. It deliberately does **not** select soil, weather, water, gas, breeding, grafting, research, regrowth, hauling/storage, or a generic farm/item framework.

## Concrete v1 model and authority

Use exactly one closed herb kind, `mugwort`, and one cell-owned record:

```ts
type Herb = Cell & {
  id: HerbId; kind: "mugwort";
  stage: "ordered" | "planted" | "growing" | "ready";
  work: number;             // sow progress while ordered; harvest progress while ready
  plantedAt: number | null; // null only while ordered
};
type HerbBundle = Cell & { id: HerbBundleId; kind: "mugwort"; amount: 1 };
```

Add `herbs: Herb[]`, `herbBundles: HerbBundle[]`, and `harvestedHerbs: number` to `Clearing`. A bundle is the sole v1 output representation: it is a real, visible floor bundle at the harvested herb's cell, not a counter, wood pile, inventory, or implied storage. With no consumer in this slice, enforce `sum(herbBundles.amount) === harvestedHerbs`; harvest removes one ready herb and creates exactly one bundle. There is intentionally no seed economy or hidden yield multiplier in v1.

Add closed `WorkType` member `"garden"` (default `true` for every new actor and normalized old save). This is the existing automatic-work preference seam, not a crop framework: shared sow/harvest candidates require Garden; player-scoped/direct orders retain the current explicit-order policy.

Add only these discriminated variants:

```ts
Command: { kind: "sow"; ...Scope & Cell } | { kind: "harvest"; ...Scope; herb: HerbId }
Job:     { kind: "sow" | "harvest"; target: HerbId; ...JobBase }
Activity:{ kind: "sow" | "harvest"; target: HerbId; ...ActivityBase }
```

`orders.ts` remains the only admission/mutation owner. A sow admission creates one `ordered` herb plus its sow job, just as Build admission creates a site plus build job; harvest admission only creates a job for an existing ready herb. `jobs.ts` extends its existing candidate switch: resolve the herb by target, use `approach`, submit every eligible candidate through the existing libcolony batch, and map both activities to Garden in `automaticWork`. `activity.ts` remains the only outcome owner; it increments the herb's `work`, changes state/removes the herb, and calls `finishJob` exactly once. `clearing.step` alone advances growth after its tick increment and work advance.

## Target, timing, and interruption laws

- Sowing accepts only an inside, level-0, unblocked ground cell with no tree, rock, site, herb, or herb bundle. Construction placement must reject an occupied herb cell; sow must reject a construction cell. No actor, UI, or renderer owns a second occupancy rule.
- Sowing is shared (`actors: null`) from the persistent Plant herb tool. It is still an explicit player order, never an automatic planting policy. Harvest is a shared explicit inspect action in v1; do not add a second priority UX until it has a product need.
- `SOW_TICKS = 20`; on completion set `plantedAt = state.tick`, `stage = "planted"`, `work = 0`, and finish/remove the sow job. At elapsed 80 ticks set `growing`; at elapsed 240 ticks set `ready`. At the current 50 ms fixed step, the visible milestones are 4 s and 12 s from planting. `HARVEST_TICKS = 20`.
- A ready herb does not regrow. Repeated harvest admission is rejected once a harvest job exists, and after completion because the herb no longer exists. The bundle is therefore not duplicable by repeated clicks.
- Canceling the sow job before completion removes the ordered herb and job. Draft, a blocked route, or another activity interruption clears only the actor activity through existing `interruptWork`; the herb, job, and accumulated sow/harvest `work` remain, with no bundle created. Canceling a harvest job leaves the ready herb in place. This matches current incomplete Chop/Build behavior and keeps no hidden rollback/output path.
- Pause admits commands but freezes travel, work, growth, feed, and all other ticks. Save snapshots may preserve an ordered/in-progress/ready herb and job; restore is paused and never advances it offline.

## UI, renderer, and persistence boundary

Add a closed `ToolKind` including `"herb"`, rather than letting the current `string` tool leak into `art.buildings`. Build-panel Plant herb uses the existing XState tool lifetime: preview clear ground, release submits one `sow`, tool remains active; Done, Escape, right-click, tool switch, camera move, and reset use the existing single cleanup machine. The fixed release cell is the command target; no second Commit.

`UiCommand`/`UiAction` gain typed sow/harvest and `inspect-herb` cases, passed through `routeUiAction` and the exhaustive `runAction` switch. `main.js` scopes them as shared home orders, adds the herb target to `selection()`, and publishes narrow herb facts. `view.js` owns herb hit-testing/inspection and draws herb records/bundles; `hud.jsx` resolves the inspected herb and presents stage plus Harvest only when ready. Do not make React inspect mutable world state or add atom-per-cell state.

Before adding plant validation, recut `persistence.ts:417`'s `checkInvariants` into private conceptual helpers called by that same function, retaining exactly its current parse → normalization → one invariant-owner flow and assertion order/laws:

1. identity, party membership, and in-bounds cells/paths;
2. world progress plus job target/scope legality;
3. active task/assignment/cargo/claim references and ownership;
4. wood delivery/conservation;
5. feed and generated-ID frontier.

No helper is exported and no validator registry is introduced. Then add a sixth private herb validator: unique IDs/cells, stage/work/`plantedAt` consistency, no overlap with world occupancy, sow/harvest job-target legality and duplicate-harvest prohibition, active activity agreement, bundle conservation, and `nextId` coverage. Keep all existing v1→v2→v3 schemas strict and their normalization unchanged. Add strict v4 schemas for Herb/Bundle/Garden/sow/harvest/body modes; normalize only pre-v4 snapshots by adding empty herb arrays, `harvestedHerbs: 0`, and `garden: true`. `validateClearing`, `snapshotFor`, and `restoreSnapshot` remain the single validation/snapshot/paused-restore owner.

## Astra original-art caller contract

No art is requested from the writer. When Astra supplies it, `bakeArt` needs one original low-resolution texture for each `planted`, `growing`, `ready`, and `bundle` key, using the current `prop = camera(112, 112, 1.1)` and `propAnchor`. The camera's third argument is its target/aim height, not a scale value. `ordered` and preview may remain code-drawn stakes/tile tint. Herbs have no facings and no animation frames. Code supplies the cell, stage, current fixed tick, overlay progress, z-order, and the above 80/240-tick transition timing; actor work uses existing facing/animation. Art must not encode growth timing or simulation state.

## Compact proof trace

Unit/integration proof through the shipped colony adapter, not a substitute allocator:

1. Admit one shared `sow` while paused, assert no tick/travel/work; resume and prove libcolony chooses a Garden-enabled reachable home member, who walks and completes sow exactly once.
2. At fixed elapsed 79/80/239/240 ticks assert planted/growing/ready display facts; pause and snapshot/reload at each representative stage, assert restored paused state and no offline stage change.
3. Inspect ready herb, admit harvest, prove travel/work removes one herb, creates one `mugwort` bundle of one, increments `harvestedHerbs`, and rejects duplicate harvest. Draft/block interruption during sow and harvest proves no output while retaining the job, target, and work. Explicit sow-job cancellation removes the ordered herb; explicit harvest-job cancellation retains the ready herb.
4. Schema tests prove strict v1/v2/v3 decoding plus v4 normalization defaults, broken herb references/overlap/stage/conservation rejection, and unchanged existing wood/deconstruction laws.

Browser trace: Continue the paused clearing; choose Plant herb, preview one clear cell and release; see the shared order, worker, planted → growing → ready art; inspect it and Harvest; pause, reload, and verify the same paused stage/job or one floor bundle before Continue. This is the smallest visual payoff and save proof.

## Concrete writer boundary

Core writer: `src/model.ts`, `orders.ts`, `jobs.ts`, `activity.ts`, `clearing.ts`, `resources.ts` (only if the narrow herb-bundle helpers live there), `persistence.ts`, and focused `clearing.test.js`/`persistence.test.js` additions. Presentation writer: `src/main.js`, `hud.jsx`, `ui-actions.ts`, `view.js`, `construction-view.js`, and later `art.js` only when original textures exist. Keep the two passes ordered: persistence helper extraction with unchanged laws first; v4 herb seam second. Existing source anchors are `orders.ts:12-311`, `jobs.ts:45-355`, `activity.ts:81-193`, `clearing.ts:103-128`, `persistence.ts:417-783`, `main.js:282-430`, `hud.jsx:186-284,1395-1649`, and `view.js:220-327`.
