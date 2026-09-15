# Authoring shapes and ownership audit

September 15, 2026. Personal source audit of integration `5db452ab`, with primary
engine documentation comparison. Scope: representative authoring, execution,
party/admission, work, material, lifecycle, and presentation paths. This is not a
line-by-line audit, new performance measurement, or acceptance of the separate
`behavior-authoring` candidate. No runtime changes are included.

Read with [the accepted authoring contract](10-scripted-engine-authoring-audit.md)
and [the existing ownership repair](08-engine-ownership-audit.md).

Implementation follow-through: [section 12](12-actor-lifecycle-relations-and-access.md)
resolves the actor creation, relationship, permission and cleanup decisions raised
here. Follow its staged briefs; this audit's findings are not competing API designs.

## Finding

The missing design is an end-to-end ownership contract around existing mechanics.
More fluent methods cannot supply it. Keep a small authoring vocabulary; do not
create a module for each game noun. Distinguish four uses of "owner": canonical
state/mutation responsibility, lifetime cleanup, player ownership as a game fact,
and permission to request an action. They are not interchangeable.

Team, party, colony, guild and squad are game definitions. Membership alone grants
no control, allegiance, property ownership, shared inventory or cascade deletion.
`Teams.join`, standalone `joinTeam`, `party().letsOwner()` and the conversational
creation DSL were exploratory sketches, not frozen implementation requirements.
The accepted lesson is module-owned operations; their names must follow actual
invariants rather than create a service for each noun.

## Eight authoring families to organize, not eight new packages

| Shape | What authors express | Current anchor | Missing or leaking boundary |
| --- | --- | --- | --- |
| Actor/component definition | A goblin has body, needs and worker capabilities | `sdk/authoring.ts`, `contracts.ts:ComponentDefinition`, native `registry.rs` | Compile capability requirements and actor attachments once; spawning an actor must not require a bespoke party path |
| Relationship definition | Member of a party, owned by a player, on a team | `sdk/party.ts`, native reference fields and party validation | Separate relationship facts from action permission; indexed reverse lookup, cardinality, deletion policy and native handle remapping need an explicit owner |
| Behavior and query | Find matching actors, read declared facts, propose actions | `SystemDefinition`, `GameSession.step`, `wasm-kernel.ts:query`, `colony-cat.ts` | Shared prepared reads, dependent stages, due selection, branch conflicts; current callbacks receive broad context and repeat queries |
| Command and access rule | A player requests movement or uses a shared brewer | `sdk/authoring.ts:command`, `region-program.ts`, native `validate_action_scope`, `runtime/whistle.ts` | Explicit principal and target roles; remove party equality as the universal permission model and string-field scope inference |
| Module operation and outcome | Move, transfer, spawn, damage, connect; accepted/blocked/completed | `ActionRequest`, native action dispatch, `WorkAttempt` | Distinguish admission from completion; expose useful operations without raw state mutation or duplicate outcome bookkeeping |
| Process/task definition | Cut then stitch; brew with supplies, labor and elapsed stages | `staged_process.rs`, `process_transition.rs`, `work_attempt.rs`, native planner and TS providers | One execution/scheduling path; optional chart controls progression without duplicating physical task state |
| Content/resource definition | Material properties, recipes, actor defaults, visual references | `material_catalog.rs`, environment/structure definitions, `GamePack` | Instance data versus shared immutable definitions must be consistent; a new recipe must not require another lifecycle implementation |
| Presentation/input binding | Display progress, animate movement, acquire targets, play an impact | `presentation.ts`, `presentation-cues.ts`, `observation.ts`, Whistle and retained gestures | Shared facts for browser/headless readers; cosmetic cues cannot drive durable behavior, and control discovery must not grant permission |

`find`, `where`, `do`, `connect`, and `transfer` are operations within these
families, not additional top-level abstractions. Scene collections/prefabs are
composed actor definitions. Predicates are ordinary deterministic functions with
declared reads. Statecharts are a progression authoring option. Time, persistence,
identity allocation and cleanup are engine responsibilities exposed through those
shapes; they should not require every creator to construct new managers.

## Concrete gaps, with owners

### 1. Creation and removal are not yet a general actor lifecycle

`kernel/src/authored_entities.rs:prepare_authored_entities` rejects physical
components in ordinary authored creates/removes. `world.rs:establish_party`
creates physical actors through a special composite; `colony-party.ts` constructs
raw records for workers, goods and stores. `region-program.ts:applyCommand` has
special `join-party`/`establish-party` handling and identity comes through the
party sequence. This is why an innocent spawn example kept needing invented APIs.

Required boundary: admitted actor instantiation from registered definitions with
references resolved within one transaction, explicit initialization authority and
repeat identity. Keep the existing Region receipt and native creation owners.
Do not unlock raw physical writes. Initialization must not become a player-accessible
way to mint materials. Removal must settle/drop cargo, release claims and handle
references through domain owners; it cannot just remove an entity from Bevy.

### 2. Player identity, grouping and command authority are coupled

`CommandScope` requires a party for a player. `sdk/party.ts` encodes a party owner,
membership and property owned by party. `session.ts:canonicalPartyFor` scans those
components; `derivedActionScope` inspects arbitrary string-valued action fields
and rejects more than one inferred party. Colony command callers recheck membership;
native scope and work validation enforce party agreement again.

These are several partial owners of the same colony assumption. They prevent
expressing shared use across parties cleanly. Replacing the word party with team
does not fix it. Host authentication owns principal identity; world relationships
own membership/property facts; command admission owns permitted target operations;
work owns which workers may serve which plans. Carry the admitted scope into native
execution with revalidation against relevant changes, not a global bypass token.

Sharing a building may permit production while still denying demolition, actor
control, withdrawal or ownership transfer. Access to a station also does not imply
access to every ingredient inside it. Revocation needs a specified in-flight-work
outcome that preserves already committed materials and releases claims safely.
Disclosure/observation policy is separate from permission to mutate.

### 3. Relationships need storage laws, not a universal graph database

Native `registry.rs` supports authored components with entity references. The
dynamic record layout is JSON-backed; reference validity does not automatically
provide indexed reverse queries or special relationship mutation semantics.
Party membership is a concrete Rust component used directly by work candidates.

The installed Bevy ECS is 0.19.1. Its relationship implementation maintains a
source component and a derived reverse collection using hooks. One source has at
most one target for a given relationship type. This is useful for membership,
but not arbitrary many-to-many grants. Stable external IDs also need conversion
to native entity handles and reconstruction on load. Do not claim derived Rust
relationship types automatically cover dynamically authored TS relationship kinds.

Use existing components and maintained indexes first; select a native representation
against membership and shared-access consumers. A relationship operation owns
cardinality, index maintenance and reference cleanup. Specialized physical custody
(lot in container) still belongs to Materials: generic connection writes must not
bypass capacity, conservation or reservations.

### 4. Event delivery and continuing operations need one lifecycle contract

`session.ts` retains impact consumer frontiers but replaces ordinary action outcomes
per step. `colony-cat.ts` reconstructs destination/home lookups and maintains its
own decision/retry deadlines. `WorkAttempt` has task/generation/operation identity
and retained terminal states, but requires worker and party. It is useful evidence,
not yet a universal lifecycle for every projectile, creature or food packet.

Preserve the underlying distinct owners while making admission, ongoing work,
completion, interruption and consumed-event position explicit to behavior authors.
Extend existing phase/deadline ownership; no private JS timer per actor. A mold
update uses elapsed simulation time; a one-shot join uses a retained occurrence;
presentation cues may expire. These different lifetimes must not be flattened into
one fire-and-forget event bus. Continued intent must not restart routes each tick.

### 5. Physical mechanisms are reusable unevenly

`material_consumption.rs` is a positive model: private preparation witnesses,
revision/owner checks and one publication path. `process_transition.rs` prepares
coupled consequences, but `process_work_requirement` requires a finished
`ConstructionSite`, matching station catalog and a sealed marker. Production on a
moving creature/tree is therefore not earned by the current capability interface.
Extract actual workstation/contact and production requirements when adding that
consumer; do not add a beer-tree branch or claim the earlier example works today.

`WorkAttempt` separates execution identity from domain activity. However,
`colony-work.ts` still performs worker/order discovery and assignment; the native
planner groundwork is not active as the complete tick planner. Finish section 07's
cutover. New authoring syntax cannot make this migration complete by itself.

### 6. Composition validation and runtime encapsulation are different

`GameSession` rejects overlapping system component writers, but this is coarse
declaration checking, not proof that every native mutation and physical conflict
has an owner. Several native files use `impl Kernel`/`use super::*` and can access
wide state. Keep the single transaction coordinator, but hide domain witnesses,
indexes and cleanup behind useful operations, as Materials already demonstrates.

Pack preparation should connect declared capabilities, reads, operation handlers,
versions and ordering and reject invalid compositions. It must not become another
runtime registry alongside GamePack. The staged behavior candidate is unaccepted;
its existence does not prove actor attachments, batching or lifecycle completion.

## What other engines teach us

These are scoped comparisons, not claims that these engines solve Hive durability.

- **Godot:** recommends self-contained scenes with explicit injected dependencies.
  Its node parent/child lifetime, packed-scene `owner`, and multiplayer authority
  are different concepts. Lesson: distinguish lifetime, stored composition and
  permission; a colony member must not die because a group actor is deleted.
  Sources: [scene organization](https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html),
  [Node](https://docs.godotengine.org/en/stable/classes/class_node.html),
  [multiplayer](https://docs.godotengine.org/en/stable/tutorials/networking/high_level_multiplayer.html).
- **Bevy:** queries expose declared access; Commands stage structural edits for
  deferred exclusive World mutation. Relationship hooks maintain inverse data.
  Lesson: use the ECS mechanisms we installed and explicit application phases.
  Deferred Commands are not a database transaction or a player authorization rule.
  Sources: [Commands 0.19.1](https://docs.rs/bevy_ecs/0.19.1/bevy_ecs/system/struct.Commands.html),
  [relationships](https://docs.rs/bevy_ecs/latest/bevy_ecs/relationship/index.html).
  The pinned local `bevy_ecs-0.19.1/src/relationship/mod.rs` was also read directly.
- **Defold:** collection factories instantiate reusable groups with property
  overrides and return instance IDs; resource loading/unloading has explicit
  lifetime. Lesson: reusable group instantiation belongs below the party example.
  It does not imply durable exactly-once creation or shared command authority.
  Source: [collection factories](https://defold.com/manuals/collection-factory/).
- **GameMaker:** object definitions expose Create, Step, Alarm, Destroy and Clean
  Up events. Cleanup is distinct from a gameplay death event; initialization order
  matters when instances reference one another. Lesson: expose predictable lifecycle
  and time semantics without requiring every author to invent them. Keep our batched
  execution rather than requiring per-instance Step polling.
  Source: [object events](https://manual.gamemaker.io/monthly/en/The_Asset_Editors/Object_Properties/Object_Events.htm).
- **Unreal/Unity:** StateTree combines hierarchical states with tasks/selectors;
  Unity offers both script and state graphs. A visual graph and a state machine
  are compatible representations. Functional transitions make prepared changes
  easier to inspect, but do not uniquely enable state machines or prove durability.
  Sources: [StateTree](https://dev.epicgames.com/documentation/unreal-engine/overview-of-state-tree-in-unreal-engine),
  [Unity graph types](https://docs.unity.cn/Packages/com.unity.visualscripting%401.7/manual/vs-graph-types.html).

## Whole-loop acceptance and next order

Use one Goblin scenario as the composition review; no new demonstration engine:

1. Authenticated first join instantiates a party and two workers together. Duplicate
   join returns the same receipt; no invisible second member roster in the client.
2. Party membership and ownership are separate from permission. Join a team with
   another player: allow declared building use, deny control of their workers and
   undeclared demolition/withdrawal. Leaving the team removes that access, including
   an explicit outcome for pending operations. Connection loss does not erase actors.
3. Designate a building with no available worker. Native shared scheduling waits,
   then performs concurrent deliveries and work. UI previews and command admission
   use the geometry owner; material claims and storage obey one custody path.
4. Request beer: native process/task state advances; elapsed fermentation holds no
   worker; work outcomes survive reload. No TS worker matrix or duplicate chart state.
5. Interrupt/remove a relevant actor or building. Existing domain operations settle
   cargo and references; render resources are disposed independently of world death.
6. Human and headless controller inspect the same committed work and permitted
   commands. Cosmetic events drive animation/audio; no visual event settles goods.

Repair order: preserve the current staged planner work; finish the first real
behavior/query consumer with existing ownership; then resolve actor lifecycle and
admission/reference seams against join plus shared-building use. Complete native
work cutover under section 07. Only then expand optional statechart authoring and
unusual capability combinations. Review short real-consumer code at each boundary
before bulk migration. This audit is not permission to first build eight frameworks.

The functional contract is prepared decisions over existing mutable ECS/domain
owners. Rust internals need not become universally immutable. Safe Bevy borrowing,
owned operations and durable Region commitment each solve a different problem.
