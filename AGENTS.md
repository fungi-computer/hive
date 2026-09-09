# Hive agent instructions

## Composability is a core product requirement

Build a small set of well-owned mechanisms that combine into many kinds of play. New content should normally be definitions, assets and configuration over existing behavior. Read the implementation and its immediate callers before designing an extension.

- **Favor composition over inheritance.** The engine exposes reusable systems through small capabilities and owned operations; Goblin composes those systems with its definitions. Do not build subclass trees for games, species, items or work. Declare dependencies, deterministic ordering and saved-data versions at the composition boundary; composing systems cannot grant duplicate mutation authority or bypass the durable transaction. Prove the boundary with actual consumers before adding abstraction layers.

- **Share behavior, not just syntax.** Before adding a haul, growth, crafting, storage, interaction or lifecycle path, identify the existing owner. Extend that owner when the same rules apply. A third special-purpose copy is a signal to consolidate the existing consumers, not create another adapter around the duplication. Keep real semantic differences explicit.
- **One authoritative fact, one mutation owner.** Physical location, quantity, claims, capacity, movement and process completion each have a defined authority. Other systems query or submit typed operations. A UI store, cache, renderer or AI controller cannot become a second simulation. Never duplicate a physical item to simplify presentation or transfer.
- **Compose through deep, narrow modules.** A module hides its invariants, representation, cleanup and invalidation behind useful operations. Its caller should not coordinate a collection of reset fields or manipulate its internal maps. A forwarding wrapper, string action whitelist or generic event bus does not establish that boundary.
- **Make supported content data-driven.** Another recipe using supported operations should add configuration and assets. A genuinely new behavior may add a typed primitive and its handler. Validate definitions and external inputs at the boundary; use exhaustive domain unions internally. Do not encode arbitrary callbacks in saved plans or branch shared transport on a character/item name. Content IDs in definitions and asset lookups are expected.
- **Unify all current consumers of an extracted rule.** For the accepted work migration, both wood and herbs must use the same lot/container/transfer ownership before brewing completes. Remove the superseded cargo, claim, activity and validator branches as their consumers migrate. Serial recoverable checkpoints are fine; permanent parallel truth is not the finished migration.
- **Give composition explicit laws.** State what survives cancellation, retry, save/reload and reordering. Quantity conservation, unique custody, idempotent completion and valid references matter more than an abstraction's name. Sequence/parallel composition must specify ordering and resource conflicts; ordinary Promises or animation queues do not make world jobs durable or freely reorderable.
- **Compose capabilities without a universal entity full of optional flags.** Reuse body/navigation, carrying, work and organism capabilities where actual consumers need them. Keep location, traversal and activity as meaningful typed states. Species, controllers, clothing and content definitions should not require separate copies of the simulation.
- **Separate queries by purpose.** Capability membership, current eligibility and spatial proximity are different questions. Maintain small derived indexes at the canonical mutation owner, including accepted commands while paused; rebuild after load/reset. Use stable IDs and authoritative priority for decisions. A cached query is not proof of permission, reachability or free capacity.
- **Prefer the smallest useful abstraction.** Name the existing consumer, the new consumer and the code/ownership being replaced. Do not start a general ECS, plugin language, scheduler or worker framework to prepare for hypothetical systems. A maintained dependency is welcome when it fits a demonstrated need; inspect its real caller and lifecycle instead of reproducing it locally.

## Runtime boundaries

- **Durable Objects are Hive's target engine runtime and a primary design
  constraint.** Design extraction around disposable processes, durable command
  identity, atomic world/work/result commitment and restart recovery now. RAM
  may hold bounded working state and rebuildable caches; it cannot be the only
  record of an acknowledged command or completed physical effect. Save/restore
  laws alone do not prove crash durability. Reuse Botanical's actual Watchdog
  and owner-transaction capabilities where they fit; the old browser/IndexedDB
  reason for deferring host durability is superseded. Read the
  [DO durability contract](docs/decisions/local-snapshots-and-durable-ai-jobs.md)
  before accepting engine mutations, scheduling or persistence boundaries.
- Keep Hive engine mechanisms independent of Goblin content, presentation and
  Fungi host authority. Follow the [engine/asset/game boundary decision](docs/decisions/hive-engine-asset-pipeline-and-goblin-boundaries.md).
  Split ownership inside current files before moving packages. The engine must
  become usable headlessly; asset authoring must not import live `Clearing` state.
  Game and workbench consume the same original pack and bake/export owner.
  A visual asset cannot create physical capabilities or inventory by itself.
- Shiitake participation is a first-class engine requirement. The engine owns
  scoped controller observations, actions, events and durable results, with a
  maintained Shiitake integration; Goblin supplies its personas/content/rules.
  Keep model calls outside physical ticks without deferring integration to a
  game-only chat adapter. Follow [Vishnu's many faces](docs/decisions/vishnus-many-faces.md).
- Keep the existing deterministic simulation and actual libcolony optimizer as owners. Narrow candidate work before expensive paths; preserve joint assignment, personal-order policy and cargo continuation. Rendering and cosmetic animation never advance authoritative time or settle resources.
- UI commands, buttons, hotkeys and help share the checked interaction catalog and current OpenTUI keymap. Jotai owns UI choices/display projections; XState owns gestures. Paused commands may change accepted intent while movement/work remains frozen.
- Reuse the original Three → low-resolution bake → Pixi pipeline. World geometry, picking and ordering share coordinate contracts. Cached visuals and temporary pooled objects have disposal/reset rules and never replace persistent identity.
- Generated terrain, map summaries, residency and simulation activation are distinct. Keep one versioned world generator and bounded query/work budgets; map LOD does not generate every fine tile underneath it. Offscreen does not mean offsimulation. The playable clearing remains deliberately small until Levi changes that direction.
- Preserve versioned saves, raw recovery and explicit migrations. Validate relational laws in addition to structural schemas. A cache is rebuilt from canonical state rather than saved as independent truth.

## Delivery and review

Current explicit supersession (Levi, 2026-09-09): Astra owns source acceptance, file custody, Git, proofs and same-preview releases. Game Delivery explicitly released all custody at `bf12e99`; Botanical CTO subsequently retired those released terminals with resumable sessions and evidence preserved. Only the two CTO panes remain; do not refill Herdr lanes. Use native Codex sub-agents with task-appropriate models for bounded implementation and independent review. Keep one writer per coupled seam and one integration owner; agree shared-file boundaries before editing. Astra owns game direction, difficult architecture and personal review of changed original art. Routine source work and unchanged accepted art do not wait for a second CTO gate.

Levi's later September 9 direction: each writing lane uses an isolated worktree and branch, with one owner for a coupled stack. Transfer active writers at a useful checkpoint: preserve exact dirty/untracked source and proof bytes, verify the destination hashes, then explicitly release the old root before editing the new one. Preserve Sessions and running work; do not sweep old worktrees. Reviewers read the lane root. Astra retains serial integration and may use stacked changes without confusing a private recovery checkpoint with an accepted release. Package/dependency changes require explicit custody; do not run package-manager commands that can install or move another lane's dependencies.

Keep independent ready outcomes advancing while coupled work is reviewed. Use bounded implementation and independent source/caller review; delegate decisions within the assigned outcome. Preserve active authors, dirty/untracked files, accepted studies and prior evidence. Keep plans and outcomes in existing issues and documents, not a new management framework.

Review the first working shape before expanding it. Ask what became simpler for the caller, which duplicate owner disappeared, and which invariants are now local. Read actual Fallow findings on touched code; split cognitive hotspots by responsibility and disclose remaining advisories. Do not delete valid entrypoints or upstream code to make an audit green.

Use focused laws and short real-input proof for the changed behavior. Distinguish source review, unit evidence, rendered art, local interaction and hosted parity. Do not repeat a long full-home trace for a small correction or claim population capacity from idle actors. Measure candidate/path/state/render and memory costs separately when making performance claims.

On the shared host, automated proof commands use `/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh` around the ordinary command: owned scope, 10-minute guard, 5-second shutdown grace. Keep the session retained/polled through completion and stop only owned proof work normally. Human-facing servers and live agents keep their ordinary launch paths.

Publish coherent authorized interims to the existing feature preview and tell Levi what is playable. Preserve the no-main-merge, no-production/backend-deploy and no-purchase boundaries. Routine accepted game work needs no additional permission; escalate only an actual new product, ownership or resource decision.

## Current decisions to read

For Game CTO product, architecture and cross-portfolio work, use the maintained
[Game CTO skill](.agents/skills/game-cto/SKILL.md). It requires peer comparison of
actual source/capabilities with Botanical and protects the many-faces engine/game
vision; it does not add a routine approval gate or override current user direction.

Read the current-status section of [the architecture-proof sprint](docs/decisions/architecture-proof-sprint.md) before assigning work. Historical paragraphs are evidence, not a competing active queue. Follow the applicable deeper contract:

- [Architecture implementation and module plan](docs/decisions/architecture-implementation-plan.md)
- [Hive engine, asset pipeline and Goblin game boundaries](docs/decisions/hive-engine-asset-pipeline-and-goblin-boundaries.md)
- [Current whole-game source audit and repair order](docs/decisions/current-systems-review-and-module-plan.md)
- [Controls priority](docs/decisions/controls-floor-priority-recut.md)
- [Unified work/material algebra](docs/decisions/unified-work-algebra-recut.md)
- [Excalibur composition, queries and lifecycle](docs/decisions/excalibur-ecs-and-reuse-decision.md)
- [Furniture contact/navigation](docs/decisions/furniture-contact-and-navigation-decision.md)
- [World generation/streaming](docs/decisions/world-generation-and-streaming-contracts.md) and [mapping/LOD](docs/decisions/world-mapping-and-lod.md)

Direct current instructions from Levi and explicit custody handoffs take precedence. Do not expand every future idea into the current shippable slice.
