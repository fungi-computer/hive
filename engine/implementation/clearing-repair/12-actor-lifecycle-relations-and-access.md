# Actor lifecycle, relationships and access: implementation contract

September 15, 2026. Design baseline: integration `5db452ab`, plus the source
findings in [11](11-authoring-shapes-and-ownership-audit.md). This document freezes
the remaining semantics for bounded implementation. Names in pseudocode are
proposed exports, not claims of installed APIs. No runtime or hosted acceptance
is claimed. Use the existing GamePack, native kernel and Region transaction.

## A. Scope and dependency order

Read [10](10-scripted-engine-authoring-audit.md) for actor/behavior preparation and
[07](07-native-work-planner.md) for native scheduling/materials. This contract does
not reopen either design or block useful native planner work. It supersedes the
party/Teams/creation sketches listed as exploratory in section 11.

Implement serially at the coupled boundary:

1. Define checked actor templates and private native instantiation preparation;
   convert first join to that owner. Keep the existing authenticated binding and
   Region receipt flow while removing raw physical-record construction by callers.
2. Add indexed, typed relationship operations; separate player ownership from
   party membership. Convert all current readers/writers together.
3. Replace inferred action scope with explicit operation roles and prepared access
   rules. Convert command, behavior and native-work callers together.
4. Add team building-use policy through the same operations, then prove revocation
   and cleanup using the existing native work scheduler. Finish any remaining
   section 07 cutover before claiming the whole loop accepted.

Review the first real consumer after each stage. Keep intermediate commits
recoverable; do not release a client/backend with different ownership schemas.
No new team service, player controller framework, policy server, generic workflow
engine, graph database, socket, receipt ledger or public raw-mutation escape hatch.

## B. Canonical facts and their owners

| Fact | Representation and mutation owner | Explicit non-implication |
| --- | --- | --- |
| Authenticated player | Existing host-resolved stable world principal/binding | A socket is not a player; do not invent global account identity |
| Actor identity | Stable external EntityId, native handle map; lifecycle owner allocates | No DO or JS runtime per actor |
| Player property | Checked `OwnedBy { player: PlayerId }` component; access/relationship owner | Ownership permits only operations whose policy says so |
| Membership | Registered relation, e.g. Goblin `MemberOfParty` or `PartyOnTeam` | No automatic ownership, control, inventory access or lifetime coupling |
| Building sharing | Goblin `SharedWithTeam` relation, managed by building owner | Does not grant withdrawal, demolition or character control |
| Work eligibility | Section 07 worker participation and work-pool facts/index | A multiplayer team is not the labor pool |
| Physical custody | Materials' lot/container/quantity/claims | A generic relation cannot move or copy goods |
| Connection/UI selection | Existing connection and client owners | Disconnect does not cancel world jobs or despawn actors |
| Committed result | Existing Region result/receipt and native operation state | Handler return or animation is not physical completion |

`PlayerId` is a checked stable world identity resolved through the existing host
binding. It is not a browser-supplied ownership field and need not be an ECS actor.
`OwnedBy.player` refers to that binding, not to a Bevy handle. Membership targets
are actor IDs. Keep these types distinct. A neutral actor has no OwnedBy component;
that does not make it freely controllable. Public interactions require explicit
rules. This slice introduces no disconnected-account deletion or property transfer
UI; an unbound/deleted principal must not be silently reassigned to another person.

**Levi's persistent-world rule:** once a player joins, their people are residents
of the world. Last-socket closure, a dropped connection, absence of the owner or
another player joining must not despawn, suspend, undraft or cancel those people
or their jobs. While the Region advances, they advance under ordinary game rules,
including when only another player is online. Reconnection only restores access
and observations. Region sleep/activation remains the existing world-time policy;
this rule does not require an offline player's private per-connection tick loop.

Goblin supplies Party and Team actor definitions. Both may be ordinary actors
without a body. It supplies membership/sharing definitions and policies. Native
mechanisms must not branch on `goblin.party`, Rowan, Sedge, a team name or a brewer
catalog ID to infer authority. Optional labor configuration may name the party
relation as its work-pool relation. A zombie needing only movement never installs
that labor configuration.

The current kernel already represents `Party` as an ECS component on an entity;
fields such as `PartyMember.party`, `OwnedByParty.party` and the transitional
`WorkPolicy.party` are references to that actor's stable external identity. Their
current Rust representation as bare `String` must not become the public or final
domain model. Introduce checked newtypes such as `PartyId`, `PlayerId`, `TaskId`
and `EntityId` at parsing/registration boundaries, preserving their compact string
wire representation where useful. A reference field does not make the referenced
party a value object or scheduler category. Conversely, giving a party an actor
identity does not make membership imply ownership, control, work eligibility or
access. Section F1 replaces the planner's temporary party-equality rule with an
explicit work-pool relationship and admitted execution context.

## C. Actor definitions and admitted creation

### C1. Prepared definitions

Extend GamePack preparation, not a second registry. An actor definition identifies
versioned component defaults, supported initialization fields, behavior attachments
and required native capabilities. Existing component schemas remain the structural
owner. Module validators enforce relational/physical laws. Prepare definitions
once and pass registered physical templates to the kernel with the current pack.

Initialization accepts only fields declared by that actor definition; it cannot
override native progress, claims, controller identity or quantity by smuggling
arbitrary component records. Position, visual choices and named references are
common declared parameters. New physical capabilities still require a typed native
handler. A supported recipe or another actor combination does not.

An actor may reference another actor created in the same operation through a local
slot. Slots are temporary reference names, never a second persistent identity.
All stable IDs are allocated by the canonical owner, resolved before publication,
and returned as typed result data.

```ts
// Internal request vocabulary used by Actors.spawn(), not a raw client payload.
type SpawnRequest = {
  definition: ActorDefinitionId;
  slot: string;
  parameters: CheckedActorParameters;
};
type ActorReference =
  | { kind: "existing"; id: EntityId }
  | { kind: "spawned"; slot: string };

// Creator sketch: same pack definitions and normal command submission.
// Actors, Ownership and Relations are operation namespaces, not runtime objects.
const party = Actors.spawn(Party, { slot: "party" });
const rowan = Actors.spawn(Worker, { slot: "rowan", at: spawn.first, look: Rowan });
const sedge = Actors.spawn(Worker, { slot: "sedge", at: spawn.second, look: Sedge });
Ownership.assign(party, joiningPlayer);
Ownership.assign(rowan, joiningPlayer);
Ownership.assign(sedge, joiningPlayer);
Relations.set(MemberOfParty, rowan, party);
Relations.set(MemberOfParty, sedge, party);
```

These calls collect a single prepared command plan inside the accepted authoring
context. They do not mutate eagerly or create promises to await. The host selects
safe spawn using existing geometry; clients do not choose `joiningPlayer`.
The author does not instantiate a transaction/session manager. `Actors.spawn` is
usable for a singleton too. Do not require a special group-creation DSL.

The collector lowers same-command spawns and their initial links into **one native
instantiate action**, not a sequence of spawn/assign/set actions whose earlier
successes survive a later failure. Its payload contains templates/parameters,
initial ownership and relation edges over local slots. The lifecycle owner
prepares the complete bundle before application. Initialization grants come from
the host execution context, never from a boolean in this payload. Ordinary later
membership changes remain separate admitted operations. Existing Region candidate
commit supplies outer durability; a merely rejected action result must not leave
half an instantiation inside an otherwise successful candidate.

### C2. First join and creation authority

The existing authenticated join owner supplies a durable occurrence identity keyed
by the world, stable binding and initial-join purpose. Reuse its snapshot/Region
owner, replacing its current party-attached receipt representation as described
below rather than maintaining a parallel join receipt. Two network
command IDs for the same first join must return the same committed actors.
An ordinary reconnect performs a read of this binding, not a fresh spawn.

Current source discovers the binding by scanning PartyReceipt on the party
(`world.rs:party_join_identity_json`), and validates that the party still exists.
That lifetime is wrong for a removable party. Move this canonical binding into
the existing kernel snapshot's host-owned join-binding records, keyed by binding
and join purpose, and remove the PartyReceipt component representation. Record
PlayerId, original result actor IDs and receipt identity. These original IDs are
historical result references, not live membership links; deletion does not erase
them or violate referential validation. Current controllable actors are a separate
query of surviving OwnedBy facts. Reconnect after a worker/party was removed
returns the original join result plus the current live observation; it never
respawns them or allocates another player. Creating replacements is a separate
game operation. Save/reload tests must cover reconnect after party deletion.

The first-join handler is a privileged, pack-registered initialization path.
Players cannot submit arbitrary SpawnRequests or an `asHost` flag. Normal gameplay
spawns (construction, reproduction, drops) need their own admitted operation and
physical costs. Host privilege never waives geometry, referential validity or
capacity. Existing startup supplies, if retained by the product definition, go
through an explicit initialization grant and Materials preparation; lifecycle
creation cannot initialize arbitrary lots for free. Do not change starting
content or conjure new pails as part of this architectural cutover.

```text
prepareJoin(binding, commandIdentity, expectedRevision):
  resolve authenticated binding using existing host owner
  if committed join exists: return original typed result
  obtain current safe spawn; if unavailable: return spawn-unavailable, no entities
  collect pack's starter definition operations
  lifecycle allocates provisional IDs from candidate's saved sequence
  validate definition parameters, references, geometry and module requirements
  prepare any authorized initial goods through Materials
  prepare membership/ownership and result binding in the same candidate
  publish through existing Region atomic commit
  only then acknowledge / expose committed result
```

Prepared values are private owner/revision-bound witnesses, following Materials.
No callback can alter them after preparation. Failure anywhere discards the whole
candidate, including sequences, goods and join binding. Native partial application
must never be reused after failure. Use Region begin/accept/discard; do not clone
the whole world once per actor. A crash after durable commit but before response
returns the same identities on retry. Definition changes do not rerun a completed
join; compare a request's immutable identity/content under existing receipt laws,
not a newly generated starter plan against old actors.

## D. Relationships: exact first representation

### D1. Definitions and indexes

Use registered component definitions carrying one typed target reference. First
implementation supports **zero or one target per source per relation kind**.
This covers worker-to-party, party-to-team and building-to-shared-team. A team can
have many incoming parties/buildings. Multiple simultaneous team membership is
not silently emulated; it requires a later explicit many-target representation.

```ts
// Proposed definition helper; registers in GamePack's existing component path.
relation("goblin.member-of-party", {
  source: Worker, target: Party, onTargetRemoved: "detach"
});
relation("goblin.party-on-team", {
  source: Party, target: Team, onTargetRemoved: "detach"
});
relation("goblin.shared-with-team", {
  source: Building, target: Team, onTargetRemoved: "detach"
});
```

`source`/`target` compile required capability predicates, not inheritance checks.
Definitions also support `onTargetRemoved: "restrict"` for a real dependent
reference. No generic cascade deletion in this slice. Physical custody and work
claims remain excluded from generic writable relations.

Keep one canonical source component and a **derived native inverse index** keyed
by (relation definition, target). Every set/clear/removal updates that index at
the same mutation owner, including paused commands. Restore rebuilds it from
canonical components; never save an independently authoritative inverse table.
Use stable IDs for deterministic iteration. Use the existing dynamic component
storage for authored relations in this slice; do not generate a Rust type for
every TS definition or add a parallel saved edge table. Native labor's required
membership index consumes this owner rather than keeping a second fact.
Bevy concrete relationship hooks are optional only if they preserve this single
representation; adopting them is not a prerequisite or a new design task.

### D2. Operations and lifetime laws

`Relations.set(kind, source, target)` replaces the previous target atomically.
Setting the same target and clearing an absent relation are idempotent no-ops.
Both endpoints must exist in the committed/candidate overlay and satisfy the
definition. Unknown kind, wrong capability or self-edge where forbidden is a
typed rejection. Definitions explicitly permit or forbid self-edges (default
forbid); no recursive group inheritance or transitive permissions.

Source removal removes its outgoing relations. Target removal detaches incoming
detach-relations and rejects any surviving restrict-reference. `detach` changes
membership only: it never transfers ownership or destroys a member. Incoming
affected work is invalidated through the work owner before its next protected
step. Process/work references use their own cleanup, not generic detach.

Raw authored writes to registered relationship and ownership components are
rejected. Generic field-schema reference validation still applies to unrelated
authored components, but does not claim to provide cleanup semantics for them;
surviving unhandled references block deletion. Provide query operations for target
and sources; callers must not inspect the inverse map or scan all actors.

Capability edits also participate in these laws. A write/removal changing a
relation endpoint's required capabilities revalidates affected incoming/outgoing
relations through the index. Reject the entire edit if any becomes invalid unless
the same admitted operation explicitly clears those relations. Do not wait for
reload to discover the violation or silently detach on arbitrary field writes.
Lifecycle target deletion alone uses the declared detach/restrict policy.

## E. Explicit permission and operation roles

### E1. Identity and protected operations

Replace player scope requiring `party` with an authenticated player identity.
Parties remain queried gameplay facts. Replace `derivedActionScope`,
`derivedCreateScope` and `canonicalPartyFor` string scanning with exhaustive typed
operation target roles. Unknown action kinds fail schema/exhaustiveness checks.

Examples of roles, declared by the existing native operation handler:

| Operation | Protected role checks | Separate physical checks |
| --- | --- | --- |
| Move/draft | control(actor) | body, traversal, reachable destination |
| Start production | use(station), allocate(inputs), place(output destination) | recipe, finite stock, capacity, contact |
| Transfer | withdraw(source), deposit(destination), control(carrier) if used | custody, quantity, capacity, path |
| Build/designate | plan at region/cells under game policy | geometry/support law, not worker availability |
| Demolish | demolish(target) | cleanup, support and material consequences |
| Set sharing | manage-access(building) and checked team target | references/capabilities |
| Change membership | manage-membership(source) plus join approval described below | cardinality/references |

One role may cover an actor set through the existing batched query path. Do not
authorize a batch by checking only its first actor. A resource source, destination,
carrier and actor are distinct roles even if all are string EntityIds today.

### E2. Policy execution location

GamePack owns named rules and command-to-operation composition. Native owns
evaluating the prepared supported access predicates against current canonical
facts for each protected physical action/continuation. Do not run TS callbacks
from inside Rust. Do not maintain a TS policy evaluator with subtly different
semantics: previews/Whistle ask the same native evaluator in a batched query.

First rule vocabulary is deliberately finite: `all`, `any`, owner-equals-principal,
explicit registered-relation matches and bound-role identity comparisons.
Relation traversal consists of declared, finite indexed joins, compiled at pack
prepare with named bindings and endpoint types. No recursive reachability,
arbitrary JSON evaluation, eval, or interpreted general JS policy. Empty `any`
denies; an unconditional allow must be explicit. Unsupported predicates reject
pack preparation rather than fall back to host authority. These predicates are
part of existing query/access preparation, not a user-facing policy language.
New unusual rules can supply a new supported predicate/operation; no claim that
this slice runs every possible TS rule inside Rust.

The public authoring surface remains ordinary named policy definitions using
typed relation/property references. Implementers must show the real two rules
below before adding fluent syntax. This fixes semantics without blessing another
long builder chain.

```text
control(actor, principal):
  OwnedBy(actor).player == principal

use(station, principal):
  OwnedBy(station).player == principal
  OR exists party:
       OwnedBy(party).player == principal
       AND PartyOnTeam(party) == SharedWithTeam(station)
       AND both team references exist
```

These are Goblin rules, not built-in implications of ownership or membership.
Owner lookup and inverse indexes bound the join; do not scan all parties per
worker. Other ordinary player permissions default to owner-only in this game.
The shared brewer
case draws ingredients from the requesting player's permitted stock and sends
output to that player's permitted destination. Sharing use alone never consumes
the station owner's private inventory. Co-op pooling can later be a separately
declared allocate/withdraw policy, not an undocumented consequence.

**Station-port exception is process-scoped, not general access.** Current recipes
bind inputs/outputs to containers named `station:port`. An owner-only deposit or
withdraw check would prevent the shared use above. The process owner therefore
prepares an input-delivery requirement with exact process/generation, port, role,
lot/quantity reservation and initiating principal. Native delivery may deposit
those admitted inputs into that port; it does not authorize arbitrary deposits
or withdrawing other port contents. Input selection uses actual lot ownership
and reservations, not container ownership as a proxy. The output settlement
assigns produced lots to the process's player owner and records output identity;
collection of those outputs/retained inputs is permitted by that process result,
not by broad station withdrawal access. Do not merge lots owned by different
players or consume another process's bindings merely because kind matches.

Use existing process bindings, Materials reservations and work requirement
identity for this authority; no copy of inventory or second claim table. Sharing
revocation blocks new use/input admission, but does not confiscate already
delivered private lots or completed output: recovery/collection of the process's
own committed property remains permitted, subject to physical access. Unused
reserved inputs release through existing settlement. A station owner may stop
new use, not forge consumption of another owner's items through a generic
withdraw. Two users of the same station obey its existing occupancy/production
constraints; this slice does not promise simultaneous batches in one brewer.

Team creation assigns its creator ownership. Joining another player's team
requires an existing committed invitation issued by that team's owner; the
joining party's owner accepts it. Store the invitation as game-owned reference
data and consume acceptance atomically with membership. Duplicate acceptance
returns the existing result. A party owner may leave; team owner may remove a
party. No self-joining an arbitrary team to unlock buildings. This is two normal
game commands, not a new invitation service or transport. Until invitation UI is
wired, test through ordinary authenticated commands; do not expose unrestricted
Relations.set over the client.

### E3. Commands, behavior and continuation

The host supplies execution identity, never the command arguments. A submitted
command has a principal and immutable command identity. A normal ongoing job
stores its initiating principal and stable plan/attempt identity; a worker's
membership does not impersonate that principal. Autonomous actor behavior uses
a pack-registered execution policy with explicit subject actor and declared
operations, not inferred authority from whatever strings it returns.

For an owned creature, that policy can resolve its current owner to the player
scope. For a neutral cat it can permit only declared self-movement. A director or
world-growth rule has a different registered policy. No implicit host fallback
when an actor is unowned, and no blanket permission to mutate other actors.
Native physical interactions (e.g. a projectile damaging a target) follow their
admitted operation's game rules; target ownership does not prevent all combat.

Access witnesses are internal and valid for the candidate revision/operation
they checked; they are not portable bearer tokens or saved authorization caches.
Saved continuations retain policy/operation references, initiator and targets,
and evaluate current permission before the next protected effect. No second
per-tick scheduler: existing native attempts perform that check when progressing.
An unrelated state change must not cancel every job; maintain derived indexes of
attempt dependencies on affected actors/relations and dirty the relevant work.
Rebuild dependencies after restore. A final check at the effect boundary remains
necessary even when no invalidation hint fired.

Every command/step uses the existing Region serialized candidate and atomic
commit. Two concurrent edits are applied in committed order; later work sees
the new membership. No acknowledged access change can be followed by work based
solely on a pre-change cached allow. Pause permits editing intent/access while
time stays frozen. A paused invalidation can mark work for settlement; it cannot
teleport cargo or complete labor.

## F. Revocation, interruption and removal

### F1. Native work-pool replacement

Replace the semantic `party` field on WorkPolicy/WorkAttempt and begin-work
requests with this explicit work context, through all providers and serializers:

```text
WorkPolicy {
  pool: EntityId | null,
  ...existing priority/enabled/schedule facts
}
WorkExecution {
  pool: EntityId,
  initiatingPlayer: PlayerId,
  policyId: registered execution policy
}
WorkAttempt { ...existing task/generation/worker/operation, execution: WorkExecution }
LaborDefinition { membershipRelation: RelationDefinitionId }
```

The optional labor definition is registered once in GamePack; the first Goblin
consumer configures MemberOfParty. Work pools are existing actors, not new worker
runtimes. A task/process has its own OwnedBy player and WorkPolicy.pool. An
automatic process inherits initiating player and pool from the admitted order,
not from the station owner. Its outputs remain that process owner's property.

Eligibility requires: task and pool exist; current configured membership target
of worker equals pool; work participation/draft/skills/continuity rules permit it;
initiating player may allocate that worker under the configured control rule;
and the requested operation passes its target roles and physical predicates.
Do not require a native Party component or property-owned-by-pool equality.
ProcessAttendance additionally requires that task identifies that process and
its bound operation; it does not infer initiating identity from membership.

Changing worker membership invalidates its current assignment through existing
settlement. Deleting a pool leaves plans visibly waiting `missing-work-pool`,
releases assignments, and clears WorkPolicy.pool in the same cleanup. Settling
attempt execution may retain the old pool ID as historical context, never as a
live dereference. A future reassignment explicitly chooses another existing pool.
Connection loss changes none of these facts. Typed WorkExecution in this slice
is for player labor; do not force neutral movement, projectiles or spoilage into
WorkAttempt to obtain an operation lifecycle.

The initial designation supplies a valid pool even when it currently has zero
workers. Native stockpile/designation/property operations must likewise receive
explicit initiator and target roles instead of carrying a party as authority.
Stockpile ownership and storage rules remain their existing owners.

### F2. Effects and cleanup

| Trigger | Required outcome |
| --- | --- |
| Leave team / revoke building sharing before starting | Pending personal order remains visibly waiting `access-denied`; no claims or worker held; restore access makes it eligible again |
| Revoke during attendance/delivery | Current attempt enters existing settlement, releases future reservations and worker assignment; plan waits with reason |
| Material already transferred/consumed | Remains at its committed location or in its process; never undo, duplicate or mint a refund |
| Worker carries material after revocation | Existing cargo owner retains custody; return to a permitted reachable destination, otherwise use existing lawful ground-drop operation; if physically impossible, keep cargo and report blocked cleanup without monopolizing unrelated work or a hidden claim |
| Paid elapsed fermentation already started | Existing process continues its paid elapsed phase; revocation does not erase it; next attendance/withdrawal needs current permission |
| Cancel future tasks | Preserve completed tree/trunk/inputs/process effects under section 07; cancel only remaining intent |
| Disconnect | No lifetime or permission change; actors and existing jobs remain |
| Remove party/team | No member destruction; detach memberships, invalidate access; surviving owned actors still belong to their players |
| Remove physical actor/building | Prepare module-specific cleanup; reject removal if surviving cargo, process or reference has no lawful disposition |

Settlement has narrowly defined authority to release its own claims and safely
dispose of cargo it already carries; it does not authorize a new withdrawal or
continued production at the revoked station. Free the scheduling assignment even
if the carrying actor cannot move; occupied carrying capacity affects future
eligibility, not a permanent invisible job lock. Preserve custody until an actual
drop/transfer commits. Manual draft/undraft policy remains the existing owner.

`Actors.remove` is an admitted lifecycle request, not direct ECS despawn. It asks
Movement, Work, Materials and registered reference owners to prepare disposition.
All required cleanup and removal commit together, or the request is rejected with
a reason and no partial deletion. Long physical cleanup is a normal task before
retrying removal, not async callbacks inside a transaction. Do not add a generic
cleanup-hook scheduler. Destruction may use a domain-defined spill operation,
but must conserve goods and obey terrain/capacity rules.

## G. Results, parsing and persistence

Use the existing operation outcome/Region receipt family, adding exhaustive
variants where absent. Distinguish command rejection from accepted waiting work,
operation completion, and transport failure. Stable reasons needed by this slice:
`access-denied`, `spawn-unavailable`, `invalid-reference`, `invalid-definition`,
`cleanup-blocked`, `missing-work-pool`, and the existing physical waiting reasons. Reasons carry typed
relevant actor/operation references, not client-interpreted exception prose.
Do not create a parallel universal receipt DTO just for these modules.

Boundary parsers own command payloads, packed definitions and saved state.
Use the maintained Whistle `parse` for neutral capabilities; no Hive copy.
Game schemas own args/results, and native domain validators own physical laws.
Internal code consumes checked unions, not repeated typeof trees or casts that
pretend unknown data is trusted. Wire schemas are derived from the same command
definitions; local gestures stay client-side and absent from neutral snapshots.

Save canonical actor/relationship/ownership state, identity sequence, join result
binding, plan initiators and operation continuations under current format owners.
Version changed formats together; reject older unsupported formats clearly.
Do not migrate old saves or keep old scope APIs. Preserve new-current-format
roundtrip and crash recovery. Inverse indexes, policy witnesses, resolved native
handles and permission projections are rebuildable, not independent saved truth.

## H. File ownership and deletion checklist

These are module destinations, not permission to create forwarding-only wrappers.
Use existing directory conventions and keep invariant types private.

| Seam | Current code to read/change together | Owned destination |
| --- | --- | --- |
| Template preparation | `src/sdk/authoring.ts`, `contracts.ts`, pack preparation/native registry | Registered actor definitions and checked parameters in existing pack path |
| Physical creation | `kernel/src/authored_entities.rs`, `world.rs:establish_party`, `src/games/colony-party.ts` | Native lifecycle module with private prepared spawn/removal witnesses |
| Relations/access | `sdk/party.ts`, `registry.rs`, `components.rs`, scope validation and planner indexes | Native relation/access modules; canonical components and inverse indexes |
| Runtime callers | `runtime/session.ts`, `runtime/actions.ts`, `runtime/region-program.ts`, `runtime/wasm-kernel.ts` | Explicit identity/role flow through existing runtime, no inferred strings |
| Game policy | `games/colony.ts`, `colony-party.ts`, native-work configuration | Party/team definitions and named rules; normal command handlers |
| Continuations | `work_attempt.rs`, native planner/providers, process/material modules | Same attempt/settlement owner; invalidation dependencies local to it |
| Client/headless | Whistle projection, observation, party shortcuts and gesture caller | Same semantic commands and permitted projections; no second membership roster |

Remove superseded `Party.ownerPlayer`/`OwnedByParty` truth when converting to
OwnedBy, update PartyMember consumers to the registered membership owner, and
remove old scope derivation and party-only target checks in the same accepted
cutover. No permanent dual writes. The first-join command can keep its gameplay
name; its special raw-record native action and party-specific allocation routine
must disappear once replaced. Update all public/local/performance consumers of
changed contracts. Test-only fixtures must not retain old privileged shortcuts.

## I. Consolidated proofs and lower-thinking-model work packets

Do not turn every assertion into a separate expensive world fixture. Use three
focused multi-assertion scenarios plus boundary definition tests:

1. **Creation/recovery:** first join creates exactly two distinct workers and one
   party; ownership/membership correct; duplicate same and different request IDs
   for the same binding; failed placement/last invalid reference leaves no partial
   actor/sequence/goods; inject failure before commit and lost response after
   commit; reload and retry; delete party/worker then reconnect without respawn or
   identity reassignment; disconnect player A while B remains connected and prove
   A's workers keep progressing the same jobs, then A reconnects to those same
   actors/results; disconnect all sockets and restore under existing Region
   activation policy without removing residents; unsupported save rejected.
2. **Two-player permissions:** owned actors stay independently controllable;
   uninvited join denied; invited join idempotent; building-use share allows brew
   with own inputs/output, denies teammate control/demolition/private withdrawal;
   two players' successive batches at the same station keep inputs and outputs
   separately owned, with own-output recovery after revocation; changing team or
   share while paused invalidates availability and actual next
   execution; stale UI cannot bypass; team removal detaches without destroying.
3. **Work/cleanup:** queue with no available workers; later two deliveries run
   through one scheduler; revoke before pickup, in transit and after paid process
   start; quantity/custody preserved, assignment released, waiting reasons visible;
   floor replacement below furniture and existing draft controls still work;
   restore during settlement; object removal with invalid disposition rejects
   atomically; lawful removal cleans indexes/claims and later queries omit actor.

Boundary tests cover undeclared initialization fields, protected component writes,
invalid relation endpoints/cardinality, unsupported access predicates, absent
owner denial, missing team refs never comparing as equal, stable ordering under
input permutation, endpoint capability edits that would invalidate relationships,
and inverse-index equivalence before/after reload. Reuse
existing geometry/material/work tests rather than copying their entire suites.

Each bounded writer brief must name this section, exact source pin, isolated
worktree, owned files, affected callers, removal list and relevant scenario:

- **L1 lifecycle:** C plus G; first working join definition/preparation reviewed
  before replacing special spawn. Deliver creation/recovery proof.
- **L2 relationships:** B/D plus H; reviewer checks one canonical component and
  no authority inferred by mutation. Include F1's native work-pool field/index
  conversion in the same coupled stack, with explicit identity temporarily passed
  by the current admitted caller until L3 replaces inference. This is not a
  releasable intermediate. Depends on agreed L1 identity contract.
- **L3 access:** E plus G/H; first control and shared-use rules reviewed before
  all-caller conversion; include station-port process rights and exhaustive native
  operation role binding. Depends on L2 query/identity representation.
- **L4 continuation/client:** F and remaining I, after native planner integration;
  shared brewery proof and ordinary human/headless controls. No new demo engine.

Keep one writer on the coupled Rust/runtime stack at a time; independent reviewers
may read pinned changes. Run relevant checks through the existing owned proof
runner, inspect touched Fallow advisories, and report actual results. No repeated
full suite for document changes. Do not claim tested population capacity from
these functional fixtures. Final acceptance includes local visible interaction
and coherent authorized hosted pairing under existing release rules, not a new
deployment scope granted by this document.

Architectural decisions above are fixed for implementation. Stop for review only
if actual source contradicts a physical/transaction invariant, a new capability
is required beyond this slice, or the first consumer needs callers to manipulate
private cleanup/index state. Routine naming, file splitting and fixture wiring
do not require asking Levi to re-design the engine.

## J. Minimum internal schemas and evaluation order

This section fixes the lower-level shape so implementers do not invent a generic
policy interpreter or trust an opaque `Checked...` name. Public helper spelling
can follow existing SDK conventions; representation and authority cannot drift.

**Actor parameters:** each registered actor references one maintained parameter
schema and explicit bindings from those checked parameters to component defaults.
Bindings are prepared using existing component field types and definition-time
functions, not saved callbacks. Reference-valued parameters use ActorReference
from C1. All outputs pass module initialization validation. No runtime arbitrary
record spread over physical components. Registered actor definition IDs/versions,
parameter schemas, native initialization capabilities and prepared defaults travel
through the existing versioned pack format. Save instances and pinned definition
identity through current format owners; do not reapply defaults on reload.

**Instantiation request:**

```text
Instantiate {
  actors: [{slot, definitionId, parameters}],
  ownership: [{actor: ActorReference, player: resolved PlayerId}],
  relations: [{definitionId, source: ActorReference, target: ActorReference}]
}
Result: {actors: [{slot, id: EntityId}]} // stable request-slot order
```

Only newly spawned sources may receive initial ownership/links in this operation;
existing targets are allowed after reference/access validation. Mutating existing
actors is a separate operation with its own permission. Duplicate slots or
conflicting initial ownership/links reject the bundle. Distinguish absence from
explicit nullable parameters through their schema. Adopt existing action/pack
budget accounting; charge aggregate instantiated state and initial goods, not
just the number of top-level requests. Capacity failures reject atomically, never
silently truncate the group or increase limits to get a fixture passing.

**Relationship definition:** ID/version, source and target capability requirements,
one-target cardinality, self-edge flag, target-removal policy. The canonical
component value is `{target: EntityId}`; the definition ID identifies the component.
Ownership is `{player: PlayerId}` with a derived player-to-owned-actors index. The
host binding table validates PlayerId references. Membership index consumers must
use registered definition IDs supplied by their work/game configuration.

**Access rules:** compile the finite vocabulary into checked tagged nodes, for
example the following conceptual native types. They extend existing prepared
query selection; they are not strings evaluated as code.

```text
EntityTerm = Role(roleId) | Bound(bindingId)
           | Target(relationId, EntityTerm)
Rule = Allow
     | OwnerIsPrincipal(EntityTerm)
     | SameEntity(EntityTerm, EntityTerm)
     | All([Rule]) | Any([Rule])
     | AnyOwnedActor { bindingId, requiredCapabilities, rule: Rule }
```

`AnyOwnedActor` selects from the principal's ownership index then applies declared
capability membership; it exists to bind that player's party in the shared-use
rule, not to search arbitrary world data. Preparation checks bound identifiers,
role declarations, component/relation IDs and endpoint types. `Target` is a
single indexed lookup; chained targets are finite nodes in the definition, not
recursive graph traversal. Missing terms deny their predicate, including
`SameEntity(missing, missing)`. Empty All is rejected at pack preparation; authors
use explicit Allow. Empty Any denies. Cyclic definition objects reject at the
definition boundary. Do not invent per-player serialized depth caps for this.

The shared-use rule compiles to:

```text
Any[
  OwnerIsPrincipal(Role(station)),
  AnyOwnedActor(party, PartyCapabilities,
    SameEntity(Target(PartyOnTeam, Bound(party)),
               Target(SharedWithTeam, Role(station))))
]
```

Rule IDs bind to operation permission roles at pack prepare. Operation handlers
extract role IDs from their typed action union; neither client nor action payload
chooses which rule to use. `control(actor)` and `use(station)` are separate checks
even when a command contains both. Rules cannot alter state or query host APIs.
Native physical effects check the resolved execution principal/policy and all
required roles before preparing domain changes. Return a typed denial with failed
role/rule identity. Do not expose hidden target facts in public reason text.

**Binding persistence:** retain the existing host-to-world identity binding. If
its current player ID is sequence-generated, reuse it as the world PlayerId;
do not switch it to the credential string. Replace party-specific allocation with
a general saved actor sequence. Update first-join receipt shape within its current
owner to reference the returned party/workers; no second lookup table kept in sync
by UI. A consumed invitation references team, invited principal/party and its
issuer; acceptance rechecks that the issuer still owns that team and the invitee
still owns that party. Team removal or lost issuer authority invalidates unused
invitations. Clients cannot forge an invitation by supplying those fields.

**Work invalidation:** relation/owner edits update indexes in the same native
commit. A reverse dependency index maps changed subject IDs/relation keys to
attempts/plans that used them; newly eligible waiting work is notified through
section 07's dirty work-pool mechanism. A missing invalidation hint may delay
eligibility only within the existing bounded reconsideration policy; it must
never permit a stale protected effect. Started work records its initiating
principal/registered policy, not a cached permission boolean. Policy definitions
are pinned with the saved pack version; incompatible definitions reject restore
under the current-format rule rather than silently granting different powers.
