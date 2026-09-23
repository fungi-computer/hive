# First brew: vessel custody, process claims and finite clearing budget

CTO review, initially 2026-09-08 08:13 UTC, with the post-mixed-storage consumer recut below. Planning and ordinary Delivery handoff only. Root personally read the model/material/construction callers and settled recipe, with bounded native reviews of the vessel boundary and exact fixture budget. Readers changed no production source and ran no proof. The historical v7 checkpoint below has since shipped as857f504; active mixed8 remains independent of this future brewing handoff.

Baseline HEAD is `9c16db8`; the inspected runtime is the valuable dirty v7 candidate, not a shipped brewing implementation. Reviewed SHA256:

- `src/model.ts`: `e54cc69ced0bcfdbd2644280d08f521ef7329f5e7f75c816702062a6936d7859`
- `src/materials.ts`: `7f46a02e91816bbf61fbbea871591902ae6ef04389079021e41766d35722684b`
- `src/construction.js`: `f8cc81bd3d5b8ddcac9b5e65f542df22e7b2344066141d5ffee7f8765f4b302e`
- [Settled first-brew contract](brewing-readiness-reconciliation-20260908.md): `0977a564b0c011ee8e51b7a476f0bd07944e719e20f4d427e4c64ab599606248`
- `scripts/prove-upstairs-bedroom.mjs`: `3976247497f299aa6621dfd0a22d6f40abc69d44665939b70095d015eaf259af`

## Disposition and delivery order

Accept the finite first-brew direction as the next real process consumer after current common-transfer closure and mixed storage/withdrawal. Retain Delivery's selected recipe and ordinary balance authority. It legitimately requires portable containment and process-owned claims; declaring more item names/config alone cannot implement it through the current ground-source, actor-transfer, site-destination API. Add those responsibilities to the existing goods owner at their real consumer, not a third brewing haul implementation.

Floor stockpiles remain a distinct post-v7 player outcome under the [accepted storage direction](stockpile-dwarven-automation-20260908.md). They own ground-cell policy, not a second inventory. Dwarven machines are later movement consumers of this same owner. This review adds no belt, fluid solver, regional source or backend work to the current release.

## One vessel, one physical location, real contents

A pail or keg is an indivisible quantity-one physical lot. It owns an interior container, extending the ADR's site-only container-owner sketch with the bounded `site | lot` distinction. Liquid lots remain at that interior's container ID. Moving the vessel changes only its own `ItemLot.location`; it never also moves or recreates each contained serving. The contained lot's world position is derived through the vessel to its current ground cell, carrier or storage site.

```ts
// Conceptual ownership sketch, not a second store or a final schema.
ContainerOwner = { kind: "site", site: SiteId }
               | { kind: "lot", lot: LotId };

pail.location = { kind: "hand", actor: brewerId };
water.location = { kind: "container", container: interiorOf(pail.id) };
// Storing or dropping pail changes pail.location only.
```

The schema rejects containment cycles and unsupported nested vessels. First pail/keg interiors accept their defined liquids; there is no need for an arbitrary recursive backpack framework. The barm crock may remain one reusable catalyst item without simulating a second yeast inventory. Empty/filled is derived from contents, never a replacement item ID or decorative flag.

Shelf bulk, liquid volume/servings and loaded carrying capacity are different measures. One pail is not two carried items just because it contains two water units. A shelf admits the root keg using its physical storage policy; its four servings do not independently occupy four shelf slots. Definition-driven capacity and carry contribution must use checked, explicit units. Increasing shelf capacity alone does not make its current mugwort-only policy keg-capable.

## Transport and pouring have different effects under the same goods owner

Ordinary transport reserves, picks up, carries, delivers or drops the vessel through the common transfer lifecycle. Stored/cache sources need the already planned withdrawal extension. A carried vessel retains the ordinary custody obligation until delivery or a lawful drop. Water must never briefly become an uncontained hand/ground item to fit a ground-only pickup function.

Drawing and pouring require a bounded atomic portion transfer between compatible containers. The effect preflights exact source portions, both container identities, permissions/access, existing claims and destination capacity before its first mutation. It settles with a stable effect identity through the goods owner. This operation is not another walking/hauling state machine. It can be used at a work boundary with the actor and pail physically at the required access position.

If interrupted after drawing, the filled pail drops intact and the spring stays depleted. If interrupted before drawing commits, no water moved. A later worker can recover the same filled pail. Pouring must preserve or deliberately complete the carried-vessel obligation rather than leave an unowned item in a hand.

Current `materials.ts` reserve/pickup explicitly require a ground source, and delivery compares the carried lot quantity with the transfer request quantity. Keep those v7 invariants honest; extend the actual operation contract for this consumer rather than disguising `pail ×1` as `water ×2`.

## Existence, policy and accessibility are separate queries

The ruined cache's initial contents exist while repair blocks withdrawal. The spring's eight units should have one canonical finite goods representation, such as water located in its source container. Drawing transfers that stock; it must not decrement an independent spring counter and separately mint water.

Resolving a container identity must work while it is closed, occupied, claimed or portable. Separate derived queries answer whether the proposed withdrawal/deposit is permitted and where it can be performed. The current construction resolver rightly encodes current site lifecycle for v7; brewing must extend that real provider boundary and its immediate jobs/activity/save callers, not add a parallel beer resolver or infer identity from an art part.

Zone filters and desired stock amounts also control admission rather than existence. Removing a stockpile designation or changing a quota leaves its physical goods valid. This is the same distinction that keeps closed cache goods and a filled keg valid even when they cannot currently be withdrawn.

## Preparation owns claims before work; fermentation owns them after the worker leaves

The settled contract preserves exact staged inputs and preparation progress on interruption. Therefore preparation admission must protect the selected input portions, catalyst, keg and needed output capacity **before** the forty attended ticks start. Waiting for preparation completion to claim the barm/keg permits another action to remove them while work is already progressing.

Use typed claim ownership under the goods owner for the attended operation and then the persistent process. Both block conflicting withdrawal/movement through the same availability/capacity queries; neither owns a copied inventory. Preparation completion consumes the exact inputs into provenance and transfers continuing catalyst/package/output obligations to the process atomically. Ordinary worker assignment may then end without releasing the process's claims.

Once the staged ingredients have been consumed, the active process still occupies the kettle and excludes another batch. Live lot sums alone no longer express that occupancy. Represent the process's binding/capacity explicitly; do not invent ghost ingredients or retain an actor-owned transfer merely to keep the station busy. Invalidated output capacity leaves the process visibly waiting to settle.

The by-product tray is a **fifth station destination**, capacity one, in addition to kettle/hearth/culture/package. The portable keg interior is separately owned by the keg. The package slot's empty-keg requirement is a process-admission rule: the same keg remains a valid occupant after it fills. Claims release after settlement so the barm and keg can be withdrawn normally. Clearing spent grain and returning the emptied keg must be possible before the second batch.

## One transformation ledger and one settlement

Preparation consumes source portions and records the pinned recipe, exact provenance and process identity together. Twenty attended kegging ticks later, one atomic settlement creates four ale servings inside the existing keg and one spent-grain lot in the tray, releases the relevant reservations and records completion. It never creates a replacement keg or duplicates ale in both a station inventory and keg inventory. Repeated settlement returns the saved result; a full destination retains the unsettled process.

The material owner remains responsible for both transformed inputs and generated outputs. For each material, current live/embedded quantities plus consumed/transformed inputs reconcile against authored/produced sources plus transformation outputs. Do not compare generic input item count with output count, or count the same wood fuel in both `consumedWood` and an independently added sink. Historical consumed lot IDs in provenance do not require those lots to remain live forever. The process stores its ledger reference and state, not a second writable ledger.

Tapping commits the one-serving consumption and drink event together. Four taps leave the original keg empty and reusable. These attended prep/kegging/tapping effects supersede the earlier readiness sentence saying brewing adds only preparation work; they add no separate haul path or scheduler. A full keg, spent grain or running process continues to block station removal as already settled. Shelf teardown drops a filled keg intact, without ejecting its liquid separately.

## Art and clock mapping

Use the accepted hollow-kettle geometry and real stage/contents facts. Liquid visibility comes from actual staged liquid/process contents, never solids alone; paddle motion requires an attending preparation worker. Hot-preparation fire/steam must stop when entering the unattended fermentation stage. The settled wording that lights the hearth only after preparation would currently imply heating throughout fermentation; correct that caller wording before joining art. This is a recipe/activity depiction, not evidence of a heat, evaporation or combustion solver. Cold staged fuel and active flame must not be confused by the art's grouped logs/flame part.

Pause freezes attended and unattended committed progress; restore resumes paused without offline advancement. The already accepted art remains held, with no new art gate on the current v7 work.

## Finite wood conflict requiring Delivery's normal layout/economy decision

The actual current upstairs fixture is **40 wood**, not the earlier readiness note's historical 47: eleven lower support walls + eleven floors + nine upper walls + doorway (2) + stair (3) + two roofs + bed (2). Source is `prove-upstairs-bedroom.mjs:464–493,635,662–698` with current `BUILDINGS`. It contains no shelf. The normal clearing starts with no stock and has eight oaks yielding six each (`world.js:11`, `clearing.ts:41`, `activity.ts:241`), so only **48 wood** is available.

| Combined outcome | Wood |
| --- | ---: |
| Current upstairs fixture | 40 |
| Cache repair | 2 |
| Brew station | 6 |
| First batch fuel | 1 |
| Shelf at current construction cost | 1 |
| **Total / available** | **50 / 48** |

Reordering construction does not fix this two-wood deficit. An already built shelf still belongs in the same budget; salvage surrenders an existing structure. The second batch adds another fuel unit. Delivery must choose an attainable combined layout/economy before calling the first brew ready; keeping this exact home requires reconciling the deficit through an explicit normal product choice. Do not grant proof stock, refill the cache/spring or silently add map resources. An explicitly smaller combined fixture is valid, but it must be named and satisfy its actual support/access/sleep/storage requirements. The historical final9–final12 traces establish the 40-delivered/8-remaining intermediate checkpoint only; those traces later failed and are not completed upstairs browser proof.

## Save and focused exit

The selected later schema is v8 reading valid v7/v8. Valid v7 clearings do not contain the new cache/spring. Specify a deterministic one-time initialization rule and collision-free identities for that migration; ordinary Continue must never recreate or refill them. If existing structures occupy proposed source cells, the migration needs a defined valid placement/defer outcome rather than overwriting them. This is a feature handoff decision, not permission to reopen v1–v6 migration work.

The first useful source/proof split is existing mixed-shelf withdrawal, then portable filled-pail transport/draw/pour, then the one finite recipe using those accepted operations. Focused laws cover intact filled-vessel drop/store/reload, source depletion, preparation exclusion, worker release while process claims persist, capacity invalidation, exact settlement/tap/reuse, and containing-shelf teardown. Test paused save/restore and repeated completion at meaningful boundaries, without a long whole-home/browser marathon. The ordinary short player trace should complete one real batch from an attainable clearing, leave three servings after one tap, and show recoverable pail/barm/spent grain and the same keg identity.

Delivery retains writer assignments, routine corrections/final acceptance and serial publication. This note is a source-grounded architectural correction to its brewing handoff, not another approval checkpoint or a reason to hold the v7 release.

## Post-mixed-storage consumer recut

Current HEAD is857f504 with a schema-8 mixed-storage candidate under the existing sole writer. The candidate already provides ground/container origin evidence, stored-wood withdrawal, a six-bulk mixed shelf and preserved shared/personal scheduling. Do not rebuild those capabilities from the historical ground-only observations above. Mixed8 owns its own release; brewing uses its actual accepted predecessor, normally9 or later, superseding every earlier “brewing8” allocation.

### A held reusable tool is not an unfinished delivery

The actual `src/model.ts` Transfer binds an actor, source, destination and reserved/carrying phase. `materials.ts:pickupTransfer` owns acquisition; `activity.ts:transfer` automatically treats a held transfer as travel/delivery to a site; `persistence.ts:validateHandCustody` requires exactly one carrying transfer for every hand lot. That rule correctly protects current wood/herb custody. It cannot by itself express holding the same pail through drawing, walking and pouring without inventing a destination or leaving a completed haul alive indefinitely.

At the portable-vessel consumer, deepen that same goods/custody owner with a closed intent distinction: delivery to a real destination versus holding an acquired item for a named active operation. Names below describe the contract, not mandated public API syntax:

```ts
CarryIntent = { kind: "deliver", destination: MaterialDestination }
            | { kind: "use", operation: OperationId };
// Shared acquisition/custody record owns actor, owner, exact source portion,
// reserved origin and reserved/carrying phase. Its use form is indivisible.
// One record holds the pail; contained water never occupies the actor's hand.
```

Do not add a separate vessel pickup/drop implementation alongside ordinary goods. Both intents share source availability, hand exclusion, origin revalidation, whole/portion acquisition, identity-preserving held lookup and legal drop in materials. Only delivery reserves destination storage capacity; use owns a real operation obligation and its separately checked effects. Preserve wood/herb destination promises and migrate their existing carrying state into the delivery form exactly once. The internal record name/table may be chosen by the writer; it must have one authority and narrow queries rather than duplicated cargo fields or two independently mutable claim stores.

The first use is **filling the brew kettle**, not a new watering job. Its lawful operation is acquire the pail → approach the spring → draw two contained water units → approach the kettle → pour the admitted units → place the same pail at a real legal location. Movement remains in the current actor/path owner. The operation retains only its current phase, resource references and durable effect identities; it does not save another path or another inventory. Later plant establishment may reuse the same acquisition/container-portion effects under its own admitted consumer.

Drawing and pouring preflight both containers, access, exact portions, competing claims and capacity, then commit once in materials. They leave the pail's holding obligation intact. Finishing an intermediate work activity does not release that obligation. Finishing/canceling the overall operation must place or hand off the actual held item and close the obligation atomically. Draft/path failure uses the same interruption owner: before a draw commit no water moves; after it the same filled pail drops intact and the spring remains depleted. Resuming recovers actual held/ground contents rather than drawing a second charge from a stale step counter. Save validation accepts exactly one matching live delivery/use owner for a held lot, with valid operation references and no orphan hand item.

The job planner must continue the held use through its owning operation. It cannot send every held item through the current unconditional delivery-to-site continuation, nor assign another automatic job while the hand is still occupied. Personal order interruption and routine Work eligibility retain their existing distinct policy.

### Source existence and introduction must preserve existing worlds

Current `persistence.ts:relationContext` constructs containers only from unfinished construction and finished shelves; `validateSiteTopology` requires every finished Site to have construction embedding. A natural spring is not a fabricated completed building, and a sealed brewer cache still contains real goods. Extend endpoint existence to the actual source-feature provider as well as site and portable-lot providers. Keep source metadata/access in its bounded world feature record and quantities only in materials. This is an explicit third real provider, not a universal optional-field entity or a duplicate source inventory.

The next migration first validates the actual predecessor, then introduces the finite feature definition at most once. Stable feature identity/initialization is distinct from current contents: an empty spring is a present depleted source. No `if contents empty then seed` path belongs in Continue, load or a tick. Fresh creation and migration share one preflighted finite-source initialization operation; existing source cells, lots, IDs, paths and work are never overwritten or cleared to make room.

Delivery still settles the source placement policy. A supporting reader proposed fixed preferred cells plus deferred introduction when occupied. Its suggestion to reject a otherwise-valid old world merely for a newly chosen ID collision is not accepted: allocate collision-safe identities deterministically or use an explicitly reserved checked namespace while retaining one feature identity. Likewise, deferred introduction must have an actual player-visible resolution, not force a new world or silently leave brewing absent forever. A bounded deterministic search of valid cells, or a saved pending introduction with an explicit “choose a clear place” action, are legitimate choices to settle before implementation. Do not invent arbitrary fallback positions inside a worker. None of these choices authorizes refilling sources, touching the old1–6 decoders or adding a backend.

### Preserve the attractive home; choose the economy explicitly

The source/layout reader reconfirmed40 wood for the smallest fully enclosed rectangular upstairs bedroom under this fixture's two-cell interior and direct support arrangement. Removing a corner's wall/floor/support saves three and happens to satisfy the cardinal shelter test, but leaves a visibly clipped enclosure. Do not use that loophole or move the sleeper downstairs while claiming the same upstairs-home outcome. This is a bound for the retained rectangular arrangement, not a proof over all possible future architecture.

The two-batch combined total is51 versus48 available. Delivery should make one ordinary explicit price/acquisition or home-scope decision and record the resulting normal-play budget. For example, reducing the current six-wood station to three would fit exactly48 with the present cache cost; that arithmetic is an option, not an accepted price. Merely spending the final wood on the exact required fixture leaves no room for building experiments, so consider remaining playable stock as well as mathematical attainability. Keep changes visible and attainable through ordinary play; no proof-only stock or hidden replenishment.

### Next useful implementation handoff

After mixed storage, Delivery chooses the serial placement of floor stockpiles and the portable-vessel/first-brew consumer. The first vessel checkpoint should expose real acquisition, filled-pail transport/draw/pour/drop/reload through shared goods operations before extending process stages. The completed brewing packet still requires the actual finite ingredient route, preparation exclusion, worker release during fermentation, exact output/tap/reuse and readable recovery. A pail-only mechanics checkpoint is not completion of the brewing goal.

Accepted original hollow pail/carry art is held at `.botanical/pail-study-20260908/ACCEPTANCE.md`; hollow kettle acceptance remains held separately. Both are source-native art with bounded local evidence and no production claim. No second art gate is required for their unchanged accepted bytes, and neither delays the current mixed-storage release.

### Joined claim lifetime and worker policy at the real process consumer

Root re-read the current mixed candidate with two bounded independent readers. The original Delivery readiness note still claims barm/keg at preparation completion; the earlier correction above remains authoritative: protect exact input portions, catalyst, package, station occupancy and output space **before** preparation work begins. Current `materials.ts:availableMaterialFacts`, `availableQuantity`, `incomingBulk` and persistence capacity checks derive reservations only from actor transfers. A staging transfer disappears on delivery. Thus a process cannot reuse that completed transfer as its continuing lock, and an idle or absent brewer cannot be its authority.

Use one stable brew-operation identity across preparing, fermenting, kegging and settled states. Its goods binding is owned by materials and referenced by the process; do not duplicate locks in both records or require a second process ID merely because attendance changes. Availability, incoming-capacity and teardown queries must account for these bindings and ordinary transfer promises through the same owner. A narrow typed process binding can represent exact portion locks, exclusive catalyst/package locks and output capacity; it is not another inventory. If the implementation factors reservation primitives, both existing wood/herb transfer consumers must use the same resulting checks. No permanently parallel beer claim API bypasses ordinary withdrawal.

| State | Physical/material obligation | Worker obligation |
| --- | --- | --- |
| Preparing | Ingredients remain real lots in the kettle/hearth; bind their exact portions, barm, empty keg, its four-serving output capacity, the one-unit by-product tray and station slot. | Forty attended ticks; interruption retains operation progress/binding. Explicit pre-commit cancellation releases binding and leaves staged goods. |
| Fermenting | Atomically consume admitted portions into pinned transformation provenance; keep the same operation's catalyst/package/output/station binding. No live duplicate of consumed ingredients. | No actor required for240 committed ticks. The former worker may take ordinary jobs. |
| Kegging | Retain binding and process progress; blocked attendance does not rewind fermentation or recreate input. | Twenty attended ticks, interruptible. |
| Settled | Atomically create four ale servings inside the same keg and one spent-grain lot in the tray, record completion identity, then release claims. Physical contents and the current station policy govern further access/removal. | No lingering actor or hand obligation from the completed work. |

These operations run in the existing synchronous authoritative step. The process owner resolves a typed, fully preflighted transition; materials alone mutates lots/claims and the process owner alone mutates process stage/progress. Their joined commit has no await, event subscriber, fallible post-consumption validation or world-wide clone. Stable completion identity makes retry return an already-settled result. Normal first-slice withdrawal or teardown must reject while the relevant binding exists; capacity invalidation is not a normal escape hatch for stealing reserved output space. Any supported future invalidation must retain the ready process and its ledger without partial output or silent release.

Save laws distinguish historical output from current inventory. A settlement receipt identifies what was produced; after legitimate tapping, movement or later consumption, it cannot require all four original servings still to exist unchanged. Record subsequent consumption through the same goods owner and preserve per-material source/transformation/sink accounting. Do not count fuel both as a new generic sink and the current consumedWood total when migrating that representation. Replayed settlement must not recreate an already-consumed serving. Persisted process bindings have one valid owner and match their actual stage, locations and capacity; derived availability/indexes rebuild after validation.

The current `jobs.ts:automatic` maps transfer→Haul and supplied-site work→Build; `actors.ts`, the persistence schema and HUD WORK_TYPES repeat the four category keys. For the first workstation, use one checked work-category definition consumed by defaults, current decoding and Work display, with exhaustive activity-to-category handling. Keep the actual old decoder pinned rather than letting a new category retroactively broaden predecessor admission. Recommended ordinary policy is Haul for supply, including an acquired pail's draw/carry/pour operation, and Craft for attended preparation/kegging. Once a held-use operation starts, its continuation and safe cleanup retain precedence even if automatic Haul is toggled off, just as current cargo does. Personal direct orders retain their deliberate preference bypass. Fermentation is a process state, never a worker category or an actor assigned to wait. Delivery may settle the player-facing category label at its first source checkpoint; no automation framework is required.

The minimum architectural exit uses the real kettle fill and recipe, not a standalone water demo: shared acquisition/drop, explicit site/source/vessel provider resolution, atomic container portions, operation-owned held continuation, then process binding and worker release. Existing wood/herb paths remain the same consumers throughout. These are first-shape review requirements for the next brewing writer, not extra gates on mixed storage.

### Delivery's post-release balance decision

After mixed8 released in runtime973829a / feature38c8928, Delivery re-read the full contract and settled the final ordinary budget: retain the6-wood station and2-wood cache repair; the finite cache includes10 reclaimed wood in addition to the existing named recipe/package inputs. With48 oak wood, total available is58. The40-wood home +1 shelf +6 station +2 cache repair +2 batch fuel consumes51, leaving7 for building experiments. This supersedes the earlier provisional5-wood/10-spare statement and the old48-only impossibility; no proof-only grant or refill is implied. Reclaimed timber has its own explicit finite source provenance rather than being counted as another felled tree. Spring8 and cache contents enter once through valid8→9 introduction and New Clearing, with normal valid-save preservation and no load-time refill. Source placement remains part of Delivery's exact first writer brief. The visible deconstruct-pm acknowledged the held-vessel foundation/current-source read; world-lab owns the independent picking UI correction before its minimap join.

### First vessel API review while its writer remains active

Root and a bounded independent reader inspected the early model/materials diff after86185db. This is partial source review, not a completed candidate or a runtime reproduction. The same writer keeps custody and routine compiler/caller completion.

The new use intent's operation string is accepted independently of the existing opaque job/step owner; the held-pail helper merely compares the supplied string. Close that to one actual live operation ownership relation before wiring the consumer, whether represented as a closed purpose/owner union or checked through the real operation resolver. Admission, continued draw/pour and restored hand custody must agree on that operation and its job/actor obligation. An arbitrary matching string or synthetic test-only job is not a durable runtime owner. Existing delivery relations migrate explicitly; shared acquisition/drop remains one implementation. A private primitive checkpoint is acceptable, but unsupported orphan use states must not become publishable saves.

The early Partial bulk map uses `bulkFor(...) ?? 0` for existing and incoming contents, and `bulkFor` also tests `accepts`. Unknown contents cannot count as free space. Physical accounting must remain defined for existing goods independently of admission filters, or malformed resolved contents must reject at the mutation boundary. This preserves the stockpile rule that changing a filter never erases occupied space or strands goods. The new `createContainerLot` takes an arbitrary ContainerId and currently skips provider, compatibility/capacity and embedding checks. Restrict finite-source creation to a preflighted initialization boundary with actual resolved container definitions; ordinary draw/pour uses checked portion movement, never a separate water-mint path. Its source caller is not written yet, so this is a boundary correction before first wiring, not evidence of a shipped infinite source.

At the later presentation join, replace the current HUD projection that interprets every `container` location as `stored shelf` by stripping a string prefix. Preserve canonical container identity and resolve site, source or portable-vessel owner through the actual provider. Item names, units and appearances must come from the checked definitions rather than the current wood-versus-Mugwort fallback. Existing ground/hand/shelf callers move together; local-goods rows remain a read-only projection and introduce no parallel inventory. This is a real new-container consumer requirement, not a gate on the released stump-row fix.

### Finite source introduction: physical policy and atomic preflight

Root personally read the active `introduceFiniteSources`, world placement/navigation callers and an independent bounded source review. This remains an early partial schema9 candidate, not a shipped regression. The same core writer retains custody; Delivery assigns the necessary world/provider caller boundary, separate from the minimap presentation writer.

The basin and reclaimed cache each occupy one ground cell. Their physical bodies reject new build/sow placement and ordinary transit; work approaches an adjacent reachable cell through the existing world/path owner. Their source containers own contents independently of whether the basin is dry or the cache is sealed. Depletion never removes the feature or triggers reseeding. Do not add a special renderer collision policy or expand cat/furniture navigation in this slice.

Introduction must use the actual world size and site footprints, not hardcoded15 loops and site anchors. Preserve existing actor/cat positions and saved path cells when choosing a new blocking feature location; preserve existing trees including stumps, herbs and loose goods. If no suitable footprint exists, retain the explicit pending introduction without overwriting the world or granting stock. Its eventual resolution must have a real player-visible path before the complete brewing release; no periodic search or silent refill is implied.

Preflight the complete proposed introduction before mutating: feature identities, derived container and lot identities, locations, resolved container definitions and all stock insertions. The early ID chooser omits `source-lot:${id}`, so a later cache collision can currently fail after a spring mutation. Allocate collision-free derived identities together, validate the resulting candidate, and then commit it. A newly decoded migration candidate may already provide isolation; this does not require cloning the live world on every command. Strict current-schema records must contain only actual record fields: spreading the whole source definition currently leaks `preferred`, `material` and `quantity` into `SourceFeature`.

Restore must check unique source/pending kinds and identities, relevant derived-ID disjointness, in-bounds physical footprints, content ownership/capacity and navigation consistency through the same policy. Introduction is a migration/New Clearing boundary, not ordinary current-save recovery by inference. Use focused preservation laws for a bed/stair extension, an active saved path, a derived lot-ID collision, no-space pending introduction and reloading a depleted source. These protect existing worlds; unrelated broad browser proofs remain unnecessary.

The follow-up migration read found the early v8 path structurally parses the predecessor, converts it, introduces sources and only then validates relations. Preserve old-world custody, topology and conservation validation before finite stock enters; then validate the introduced candidate. Converting delivery-owner syntax into an otherwise empty-source current shape can permit reuse of the relevant common laws without duplicating a whole validator. Static review did not establish a particular malformed v8 save becoming accepted, so no such runtime claim is made. Source definitions and finite budgets now have real introduction, provider and restore consumers; put those checked content facts behind one shared definition boundary instead of repeating source-kind conditionals and numbers in the clearing tick owner and persistence.

## Held first-brew art inventory completed

The accepted original grain sack and closed keg can be reused unchanged. Root authored the three actual missing small assets in `.botanical/brew-supplies-study-20260908/ACCEPTANCE.md`: reusable closed barm crock, empty/spent fixed station tray and sealed/repaired opaque one-cell cache. Final props SHA615d7b596b225a36b577e48b58f55c5045fc4b735e25a0d06f5da80f85ef8563; asset-only u2234 exited0 and root personally viewed native/2× in every facing. These join the held kettle, pail/carry and basin as an art handoff for the actual production consumer. They do not introduce a new feature, ingredients, runtime stock or art gate on minimap/core work.

## Personal Fallow review of the coherent vessel foundation

Root ran Fallow3.20.0 through the ordinary proof wrapper after the writer's focused checkpoint: **run-u2291.scope**, invocation **c73650ae0c2e4947be36b7e0536531f7**, retained native10284, normal **exit1** with fail verdict. The no-cache audit uses baseb1ef4b3 and observed HEAD5ca82e12481350bad7cbe9f284f7adcb53f44a97 plus the dirty vessel candidate. `.botanical/vessel-v9-cto-review-20260908/{source-before,source-after}.json` recorded160 inventoried files unchanged through the scan; this is not a clean committed-vessel audit. Audit SHA256 **0f764b64da7e3343fd676a9fe11495e200bcf0f5c13969853ecfb2ae4fd3eacf**.

The report spans26 changed files and reports21 dead-code/dependency/cycle issues,47 complexity findings and74 clone groups. Attribution labels16/30/71 respectively introduced, but preserved untracked historical proof scripts also appear new relative to the committed base. Those counts are not26 changed game-runtime modules or71 newly copied runtime systems. Only four clone groups have exclusively runtime src instances. Coverage/CRAP inputs are static estimates, not measured test coverage or performance.

Root read the implicated source and immediate callers. The new high-priority hotspot is `reserveTransfer` (cyclomatic43/cognitive46/120 lines); `moveContainerPortion` is22/20, and new source validation is27/16/101 lines. Before process stages enlarge this seam, keep the existing public reservation operation but factor its owner/intent admission and source eligibility by responsibility. More substantively, reservation, delivery and container-to-container portion movement repeat the same occupied-plus-incoming capacity arithmetic. Give that rule one checked internal owner used by all three consumers, including the delivery's exclusion of its own incoming promise. Do not add a parallel capacity ledger or merely move each duplicated expression into a separate wrapper. Preserve existing precise rejection and mutation-free failure laws.

Incoming promised material must come from the transfer's canonical phase: reserved source lot or actual carried lot. The present exact-lot branch looks up the old request source and defaults to wood if it has gone. Partial pickup can leave a different carried ID while other work consumes the old remainder. Wood happens to match that fallback today; upcoming portionable recipe materials would not. Remove that inference before the new material consumer, using the actual retained physical payload and explicit invalid-reference handling.

The actual runtime clones include introduction/restore physical occupancy and identity lists; keep their common physical policy consistent behind the source/world boundary rather than duplicating more arrays in clearing orchestration and persistence. The two interruption branches also repeat vessel-use release; cleanup belongs to that same material owner. Existing activity↔routine cycle and construction/job hotspots remain visible advisories. Do not delete valid proof entrypoints, required packed Stipe or expected pending first-consumer APIs merely to erase findings. Make incidental helper exports private where there is no external consumer, and let the actual first-brew join consume its promised API before calling the vessel outcome complete. This bounded responsibility cleanup is for the core owner and does not delay the independent minimap release.

## Cleanup accepted for the next real consumer

Root personally read the coherent cleanup and its immediate callers; an independent bounded reader accepted the extracted finite-source introduction/restore boundary. `admitContainerCapacity` now owns occupied-plus-incoming admission for reserve, delivery (excluding its own promise) and direct portions. `transferPayloadLot` resolves the actual phase lot, and interruption has one vessel-use cleanup. `finite-sources.ts` owns definitions, introduction/pending planning, identities, physical occupancy and source validation; clearing and persistence use it. The v8 converted shape is relationally validated before source introduction. Existing reported evidence is u2333 (48 material/persistence laws), u2315 (18 focused clearing/WASM laws), u2334 typecheck and u2335 diff; root inspected source/tests rather than rerunning these tests.

A fresh Fallow3.20.0 audit of the changed cleanup ran as **run-u2370.scope**, invocation **7af38220b55b42ce86d78af5f62ae498**, normal **exit1**, base and observed HEAD `e15f080acedbb97b190a068ed50365c53ee09d8f` plus the dirty v9 foundation. Its 162 inventoried files were unchanged during the scan. `.botanical/vessel-v9-cleanup-review-20260908/audit.json` SHA256 **dff82e01044c2954a5a99a3c4c8f6624e2d72b4d6b38ab073974394005927e25** records 20 dead/dependency/cycle findings, 47 complexity findings and 80 clone groups. Most clone groups include preserved proof code; one group is exclusively runtime source, the existing reserved/carrying persistence checks. The earlier three source-introduction/cleanup clone groups are gone. Different base/changed-file scopes mean the overall counts are not a clean before/after quality score.

The reviewed `reserveTransfer` is now cyclomatic18/cognitive18/65 lines, from43/46/120 in the prior audit. The direct-portion capacity duplication is gone. `finiteSourceProblem` remains25/15/78, and existing activity/job/persistence hotspots remain advisories. Estimated coverage/CRAP is not measured coverage. Expected source/vessel APIs await the actual consumer; no suppression, valid-entrypoint removal or second cleanup round is required before the next working shape.

Next production handoff is repair cache → acquire its real pail → draw two finite spring units → fill the actual station kettle → retain/drop the same pail recoverably. Reuse source/site/vessel endpoint resolution, command admission, libcolony assignment and the common transfer owner. Keep the material commit and its job-operation phase update synchronous, so a resumed draw or pour cannot repeat a completed movement. The full brew still requires all preparation/fermentation/keg/tap commitments above. Before source definitions gain the remaining recipe goods, separate per-material initial production from physical container capacity; increasing a cache's capacity cannot become reclaimed-wood production. The current single-material foundation is not yet the full cache acquisition or a playable brewing release.

### Physical lot and source-identity correction during the following writer checkpoint

After the accepted cleanup pin, Delivery's source/derived-ID corrections continued under the same writer. Root's bounded synthetic save checks found two concrete missing physical-shape laws: u2387 (invocation29f9051837534846b23c89001bfc7209, exit1) accepted a quantity-two ground pail; u2390 (invocation21049bed5d444e12a7f7837236ec47af, exit1) accepted six water units remaining in the spring plus a separate two-unit water lot on the ground. Total water stayed eight. The latter probe recorded identical before/after source hashes. Vessel lots must be indivisible quantity-one records, and water must stay contained; creation/admission and strict current-save validation must agree. These were synthetic snapshots, not mutations of a user's save or evidence of a hosted regression. Results are retained in `.botanical/vessel-v9-cleanup-review-20260908/physical-lot-*.json`.

The subsequent active source guard also conflated identity references with competing definitions and source provenance with permanent custody. A source's own container reference is valid. Full withdrawal preserves a lot's ID while moving it to its legal destination; an initial `source-lot:*` name cannot require the lot to stay in the source forever. Root's u2394 (invocation7751efb86b7f4a0bbbd0c2e747e9c917, exit1) applied four successful canonical two-unit container movements, preserving the source lot ID on the fourth, but all snapshots rejected under that intermediate guard. Because even the first movement rejected, this probe does not isolate the last-draw branch; the source read identifies both guard problems. Its pinned before/after hashes and exact results are in `final-source-withdrawal-probe.json`. No repeated probe is requested while the writer edits. Delivery owns the correction and its focused valid-source/last-withdrawal/drop/restore laws before the next consumer.

At the presentation/job join, the existing `storageTransferOption` still hand-counts wood and mugwort occupancy. Extend the material-owned read query for remaining destination capacity/eligible quantity when new goods join, so planning and HUD do not duplicate the just-unified commit rule or ignore incoming promises. The planner remains a derived query and final material admission remains authoritative. No second reservation ledger or generic automation runtime follows from this correction.

### Foundation closure and actual first-consumer recut

Delivery committed and pushed the corrected finite-source/v9 foundation as `20d6f60eef059d92d0c0e6512a78785e878159a9`. Its integration `run-u2427` passed 80 focused laws plus typecheck/diff. The bounded independent current-source review confirms water cannot be loose or hand-carried, pail lots have quantity one, the final full withdrawal may move the original source-lot ID into a valid vessel, and own provider references are not competing identities. The earlier synthetic probe failures describe superseded candidate bytes. The Fallow report above retains its exact earlier pin; it is not a new audit of this commit. The foundation was not deployed alone.

The early consumer shape was recut before expansion: cache repair is independently once-only shared work. Fill Kettle submits station and existing scope/direct intent; the UI does not choose worker, spring, pail or repair-wood lot. Assignment resolves eligible people and resources through the world and existing Haul policy. A held-use operation begins after assignment and tracks acquisition, draw, carry and pour. Refilling an already repaired cache's pail cannot charge or replay repair. Exact drawn-water identity and synchronous movement/phase settlement must survive paused reload. The same core writer owns that join; the current dirty runtime is not accepted merely because this product boundary is settled.

The separately accepted station construction geometry is handed off in `../brew-station-study-20260908/ACCEPTANCE.md`: stakes/frame/empty finished, two facings, one centered 2x2 datum and the existing bake/picking path. This is an asset-only acceptance; core, presentation and gameplay proof stay with Delivery's current owners. The account-refresh recovery preserves their exact sessions and all valuable dirty bytes in `../account-refresh-recovery-20260908/RECOVERY.md`; it changes no game semantics, release scope or runtime-store authority.

### First consumer interruption and retirement review

A bounded independent read of the active consumer found lifecycle gaps at HEAD `20d6f60` plus changing source: jobs `23ae2d…`, activity `729f12…`, materials `cd8ffa…`, persistence `68fc30…`, model `cc412d…`. This was source evidence, not a completed stable candidate or test run. Root routed all findings to Delivery and the existing writer before acceptance:

- After drawing, Draft/path loss drops the same filled pail but must keep a resumable per-job operation/phase. A later worker rebinds that exact operation and pail and proceeds to pour, without creating a second operation or drawing into a full pail. Strict saves must accept the legitimate inactive checkpoint.
- Explicit job cancellation drops retained goods through the material owner and retires its incomplete operation atomically, leaving ordinary physical pail/water lots without an orphan job reference.
- Successful pouring must settle the empty pail's custody and close held use before/with completion. An idle actor cannot remain permanently excluded from ordinary jobs by a completed use transfer still occupying its hand.
- Filling is a transfer, not production. After pour, pail release and job completion settle together, its live operation can retire. The canonical moved goods and removed job establish that completion; a permanent completed operation must not require those exact water lots forever or reject the later legitimate brew consumption. Full recipe transformation keeps its separate production/conservation provenance.

### Executor-independent binding and joined quality checkpoint

Later2026-09-08. Root and one bounded reader traced the settled pail candidate:
parking originally left an actor-owned transfer, preventing unrelated work/rest;
repeated Draft then removed that transfer but left its operation. The same writer
corrected both by keeping the exact `{operation,vessel}` promise separate from
current executor custody. Parking removes the actor transfer while preserving the
same physical pail/water. Assignment acquires that exact bound pail; completion
or explicit cancel retires its binding. Current laws cover repeated interruption,
disabled Haul, personal Chop, reload during unrelated work and same-water resume.
The additional unique-vessel restore check rejects two parked operations promising
the same pail. Root inspected source/laws; Delivery owns the95-law joined run and
typecheck. These are not hosted results.

Root read the actual `.botanical/schema10-fill-kettle-final-20260908/fallow.json`,
SHA3c1609ed1a81ad382c2943b1d6652b2824c4cb55768f4b264dcf7e4bd72a70e0.
Fallow3.20.0 reports fail,27 dead/dependency/cycle findings,107 complexity findings,
93 clone groups, base/head9f78aa3 with38 changed files. That label is not a clean
9f78 source audit; later carry-pail edits are not automatically covered. Static
estimated coverage is not measured coverage. Keep Delivery's execution/inventory
record and the exposed findings, including retained proof entrypoints and Stipe.

Before expanding the next recipe consumer, prune by responsibility in the actual
current owners. `finiteSourceProblem` is67 cyclomatic/44 cognitive/157 lines and
mixes active/pending identity allocation with stock/provenance/capacity checks;
share identity validation/claiming across active and pending source admission,
and keep finite contents validation distinct. `brewWater` is37/41/128 and
`assignWork`26/56/194; the next process owner must own phase, remaining itinerary,
interruption and settlement rather than adding another nested recipe branch to
both callers. Existing `Target` and `drawSites` are also large (86/88 cognitive
in this scan); don't grow their condition trees to add each process display.
The numerical counts choose a review target, not a request for a cosmetic
helper per conditional or a new scheduler. Preserve working order policy and
shared materials; reuse current focused laws. This is a next-expansion boundary,
not another broad pre-release suite or a reason to suppress source findings.

Current art-consumer closure: the existing accepted pail poses were missing from
drawActors/bakeArt. Root handed off only the exact carried-pail delta at
`../pail-study-20260908/carry-art-integration.patch`, with recorded hashes in its
ACCEPTANCE. It uses the same reviewed figure baseline and shared pail geometry;
Delivery integrates with real vessel contents and stationary frame0, without a
new art approval gate. Future stirring contact remains the separately reviewed
ignored prototype; it does not delay the current Fill Kettle consumer.

### Next consumer handoff as CTO focus moves to environmental systems

Levi explicitly assigned the Game CTO a new water/gas/world-generation goal.
Delivery retains the current Fill Kettle release and the already-approved full
brew continuation. Root and a bounded Astra reader inspected current model,
materials, jobs, activity, finite-source and save callers at HEAD9f78aa3 plus the
active candidate. This is a next-consumer design decision, not another release
gate or a claim that the subsequent process exists.

Use executor-independent material bindings as the one promise owner. The current
VesselUse is its first concrete consumer. When the brew binding enters, migrate
that pail promise into the same authority and delete its separate source-claim
exception. Ordinary transfers retain physical carrying custody. Availability,
direct consumption/movement, incoming bulk and container release must all see
the binding. An authorized transfer cannot double-count its own binding as a
second reservation. Batch admission preflights every exact input portion,
retained barm/keg, output capacity and exclusive kettle occupancy before mutation.

Extract the repeated supply-demand planner used by construction, cache repair
and storage before recipe tuples become another copy. Preserve actual libcolony
assignment and reserveTransfer's final admission. Extend the existing endpoint
contract for real station slots and portable interiors; the current water-only
brewKettle(capacity2) is not yet a general routable ingredient destination.
Current finite-source definitions supply only wood and pail: the agreed malt,
barm and keg need explicit one-time introduction/migration, never assumed stock.

One saved process module owns typed phases, progress, remaining attended action,
interruption and transitions. Actor activities attend it. PREPARE completion
atomically consumes bound ingredients/fuel into provenance; FERMENT retains the
same process/binding without an actor; KEG atomically settles four ale in the
original keg and one spent-grain lot, with a retained idempotent receipt. Specify
the transition tick: preparation completion must not also earn an accidental
fermentation tick. Move the existing fill itinerary into this responsibility
when extracting it; jobs/activity should not each grow another process machine.

Current consumeContainerPortion is a single-input sink, not an atomic recipe
transaction. Current save laws require all harvested mugwort and spring water
to remain live. The transformation/provenance owner and relational conservation
must land with legitimate consumption, counting wood fuel exactly once. Keep
historical consumed/output identities distinct from required live catalyst/keg
references. Teardown must observe process occupancy after raw inputs disappear.

The next playable exit remains interrupted preparation, another task during
fermentation, paused reload, one kegging settlement, tapping and second-batch
reuse through shared transport. Delivery chooses serial source checkpoints and
routine acceptance under the established scope; no new CTO permission required.

The shared-art source relocation was independently read against its actual study caller. Kettle/pail/station geometry and transforms are preserved, but the now-empty cold kettle exposed an old unconditional steam caller in `src/studies/brewhouse/composition.js`; remove that contradiction under the same art owner. Root separately accepted the clear-water appearance at `../kettle-water-study-20260908/ACCEPTANCE.md` (asset-only `u2479`, eight displayed bakes and twenty unchanged default-art parity pairs). Runtime still selects contents from real facts. None of these notes assert that the pending source corrections, pail UI or brewing are deployed.
