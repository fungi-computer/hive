# Work, materials, navigation and save module review

Read-only review, 2026-09-08, against the current upstairs source and the root audit at `.botanical/cto-systems-audit-20260908`. Delivery retains all tracked source/Git/proof custody. This note proposes implementation boundaries; it does not claim a fix, new test result or performance measurement. It supplements `simulation-and-content-contracts.md` with the actual seams that should land before another commodity or workstation.

## Evidence and disposition

The core already has useful ownership: `clearing.ts:118` orders the fixed step, admits commands before the paused return, and calls the existing libcolony-backed assignment owner. `model.ts` closes the command/job/activity unions. Physical wood and herb bundles have conservation laws and interruption behavior. Preserve these rather than replacing them with a framework.

The defects are in contracts between those owners. `movement.js:18/43/62` silently selects different topology when optional `state` is omitted. Both Go checks in `orders.ts` omit it; the root's saved route probe demonstrates the resulting upstairs rejection. `tsconfig.json` has `allowJs:true`, `checkJs:false`, and includes `src/**/*.ts`: a passing TypeScript command does not mean the implementation bodies or command construction in `main.js` are checked. `commandProblem` is an if-chain ending in success, while application uses an exhaustive switch. Existing Zod command schemas validate save/history formats; they are not visibly the live UI command boundary.

Current Fallow highlights real concentration: `commandProblem` cognitive 90, `orderWork` 69, `assignWork` 63, `checkHerbs` 77, `checkSiteTopology` 57, and `checkActorTaskTarget` cyclomatic 66. The coverage labels in this report are estimated; they are not new measured coverage. A long but exhaustive shallow dispatch is materially different from a nested owner that mixes policy, lookup, mutation and presentation. Do not delete preserved proof entrypoints or suppress findings to improve the count.

One apparent gap is **not** a missing check: sow/harvest are empty cases in `checkActorTaskTarget`, but `checkHerbs` later validates those activities and their jobs/stages. The real problem is having to know two distant validators complete one invariant. The `activity.ts` ↔ `routine.ts` cycle is also concrete: activity imports `isNight`, routine imports `finishActivity`.

## Six material recommendations

### 1. Make navigation topology mandatory, then type the boundary

The near-term API can simply require `state` in checked TypeScript/JSDoc and remove the fallback. Keep a clearly named flat-grid search only if an actual non-world caller needs it. Do not let an omitted argument change the graph. Root has separately authorized the compact Go correction; this contract hardening follows it and does not delay that fix.

The eventual deep boundary is a navigation context that owns both edges and blocking for one revision:

```ts
type NavigationContext = {
  revision: number;
  neighbors(cell: Cell): readonly Cell[];
  isBlocked(cell: Cell): boolean;
  edgeTicks(from: Cell, to: Cell): number;
};
route(context, from, to): Cell[] | null;
approach(context, from, interactionCells): Cell[] | null;
advanceWalk(context, actor): "moving" | "arrived" | "blocked";
```

This is a proposed boundary, not a request to add revision caching before it is used. Route construction, work interaction cells, drafted Go, per-edge walking validation and restored paths must agree on the same graph. Placement occupancy and structural support remain distinct queries; neither becomes a substitute for passability. Rendering interpolation reads the accepted logical route. Later chunks may add `needs-data` as a distinct result; they must not report missing terrain as permanently unreachable.

### 2. Close the live command boundary and distinguish admission from completion

Move `main.js:request` scope construction into a checked command adapter that has a closed action union. A single boundary parser can protect commands arriving from unchecked JS today and network/AI later. Keep historical save command schemas frozen; extracting a live schema must not widen what a v1–v6 file accepts. Parsing establishes shape and ranges; state-dependent membership, target and placement checks still belong to admission.

Make validation exhaustive by command kind. Each handler returns a rejected reason or a small resolved admission plan; the owner applies that plan synchronously before another command is admitted. A UI preview is advisory and must revalidate at real admission. Shared plans must not expose mutable references for delayed application. This removes repeated target lookup/route interpretation without introducing a generic callback registry.

Preserve array-order admission and no tick advance while paused. An applied result means the request changed authority state, not that a pawn finished. Add created/reused job IDs to the result when a real UI consumer needs them instead of guessing from counts. A direct order can reuse an existing chop job, and rest can create several jobs; a single nullable job ID is insufficient.

Later persistence/network work should add command identity, admitted tick/revision and immutable admission disposition, with job/process completion recorded separately. Current `state.commands` is replay history and is omitted from snapshots; it is not a durable idempotency ledger. Current autosave follows admission, so the browser receipt is not proof the write reached IndexedDB. Do not claim exactly-once hosted execution from this local interface. Root's planned principal/world-scoped receipt protocol remains the future durable boundary.

### 3. Keep one work lifecycle owner; extract clock facts below it

Move `DAY_TICKS`, `hour` and `isNight` into a small time module with no runtime imports from activities or routine policy. Activity and routine can depend on that fact owner. This removes the actual cycle without introducing a global bus, dependency-injection container or XState machine for every pawn.

Separate activity orchestration from domain completion. The orchestration owner validates the current task/reference, moves, advances work, and calls the relevant domain transition. Domain transitions own the material/site/herb changes. A work lifecycle operation remains responsible for coordinated actor/task/assignment/path/claim cleanup and for waking assignment. These are connected changes that should not become independently scheduled events.

Current `finishActivity`, `interruptWork` and pickup-herb's duplicated actor reset deliberately differ: herb pickup retains its storage claim while wood pickup converts its claim into cargo. Preserve that distinction as explicit completion/interruption policies while the goods migration proceeds. A generic `clearEverything` helper would break cargo continuation. Route cancellation, waking a sleeper and canceling a job are also different outcomes; a sleeper losing shelter must not silently lose a personal rest order.

Finite discrete task states can stay typed unions with explicit transition functions. Future flee/combat/routine controllers propose work at a defined precedence; they do not each own another assignment or movement loop. XState remains appropriate for the already-owned UI gestures, not automatically for the entire simulation.

### 4. Put physical custody behind a small deep module before adding beer

Today `resources.ts` owns wood calculations and some movement, `activity.ts` owns wood/herb transfers and shelf ejection, `jobs.ts` owns herb capacity/claims, and persistence repeats their relations. Adding beer in this shape would create a third commodity-specific pickup/carry/store lifecycle.

First hide the existing representations behind a physical-custody API; do not create a second item store alongside them. Candidate operations are `availableSource`, `destinationCapacity`, `tryReserveTransfer`, `completePickup`, `completeDelivery`, `interruptTransfer`, and `ejectContainerContents`. Pass exact actor/job/source/destination references and return typed success/wait/rejection. Only this owner writes quantities, locations and material claims. Work orchestration calls it and owns actor activity state.

Then migrate the first actual brewing ingredient toward the root's one-location lot model in bounded checkpoints. This is not a prerequisite to rewrite all wood/construction storage before brewing. Existing herb bundle IDs and ground/carried/stored locations survive. Wood can retain its current representation behind the same physical owner until it is a useful migration consumer; when migrated, piles/cargo/site-delivered material need an explicit mapping. Material already delivered into construction remains counted at the site/structure ledger, not silently converted into another available inventory stack. Delete the old authoritative fields only when their consumers are migrated; read adapters may derive compatibility views temporarily, but dual writes are forbidden.

The atomic boundaries are the useful abstraction:

- Reserve exact source quantity **and** destination capacity with actor/job ownership, or reserve neither.
- Pickup moves the quantity once and changes the reservation phase in the same owner transition; interruption drops the actual held quantity/ID and releases its destination promise.
- Shelf teardown ejects actual contents and invalidates related claims/orders before references disappear. Structure salvage and permanent material loss are accounted once.
- Brewing start consumes exact staged inputs into a physically located transformation ledger; completion produces one output lot and settles its completion identity together. Job cancellation does not reverse completed fermentation.

These are synchronous, bounded owner transitions in the current step. Validate all fallible conditions before the first write or build a small touched-record plan; no full-world clone per tick and no `await` inside the commit. In particular, cancellation currently removes a building before `refundWood` searches/possibly throws. This review has not demonstrated a reachable failure there, but the new boundary should preflight a valid refund destination rather than rely on a post-mutation exception.

The first genericization does not require nested backpacks, liquid field simulation, procedural gear or a universal recipe graph. The first brewery must declare finite sources, vessel, exact conversion and cancellation policy. There is no permission to invent free water/wood or import a fresh resource ledger to bypass existing conservation.

### 5. Give assignment a query/commit boundary without replacing libcolony

`assignWork` currently collects eligible actors, prioritizes carried obligations, scans personal/shared queues, finds routes, computes costs, optimizes, then commits claims/tasks. Keep that sequence and one optimizer owner. Extract stages by responsibility: eligible workers/policy, candidate discovery, cost/optimizer adapter, and selected-candidate commit. A candidate is a proposal; scarce resources are rechecked at commit, not promised merely because the optimizer chose it.

Do not replace the ordered jobs array with several mutable queues. Priority can remain in the authoritative array while derived maps/indexes serve lookup. Start with per-assignment-pass maps for jobs/sites/herbs/bundles and a single blocked/topology context. They have a simple lifetime and cannot silently go stale between frames. When measurement warrants persistent indexes, the mutation owner updates/invalidate them, and a revision detects stale candidates. UI and save code cannot maintain competing indexes.

Preserve carried obligations before new automatic work, personal/shared semantics, drafted exclusion and the existing Work preferences. Check policy before expensive routing when possible. Later group/zone policy is another eligibility query, not a second scheduler. Bounded approximate candidates need deterministic widening/aging for skipped jobs; top-k nearest-only would starve distant or uncommon work. Measure offered pairs, route calls, rejected commits and completed useful work at 5/25/50/100 actors before replacing data structures. The current `workDirty` gate is valuable but is not itself a scale guarantee.

### 6. Split save decoding, migration, relational validation and storage

`persistence.ts` currently owns all four. Proposed modules are versioned wire schemas, pure migration/normalization, current-domain invariant validators, and the IndexedDB repository. Keep `snapshotFor`/`restoreSnapshot`/`saveWorld` as the small facade so actual main/HUD callers do not all change at once.

The load pipeline stays `unknown → exact old-version schema → pure normalize → current relational invariants → paused runtime`. Old schemas remain strict, old raw values remain recoverable, and reading does not rewrite disk. Writing uses only the newest schema. Continue preserving the IndexedDB compare-and-swap decision and raw recovery/New Clearing distinction; this is genuine durability work already present.

Build lookup maps once for relational validation. Organize validators around the owner invariant—topology/surfaces, work relations, material custody/conservation, organism state—rather than miscellaneous file-size slices. Make job/activity dispatch exhaustive; domain leaf validators check their own targets. Move existing sow/harvest activity checks out of the distant `checkHerbs` tail into the exhaustive work validation dispatch while retaining growth/identity checks in the organism validator. This is relocation of existing coverage, not a claim they were absent.

Do not solve current `any` in `makeClearingSchema`/normalization by spreading more assertions through call sites. Give each wire version an inferred concrete type and explicitly return the current normalized save type. Stable scalar schemas may be reused; semantic variants stay versioned. A schema extraction should preserve existing accepted/rejected examples before any schema-v7 goods migration. No broad conversion of every JS/render file is necessary, but JS implementations on an enforced boundary need `checkJs`/JSDoc or focused TS conversion, not an unchecked facade cast.

## Dependency direction

```text
main/HUD adapter → closed command boundary → admission owner
fixed step → routine policy / assignment / activity orchestration
admission + activity → work lifecycle + domain transitions
assignment → policy/candidate queries + libcolony + claim commit
domain transitions → physical custody + topology/placement queries
all above → model values, content definitions, simulation time

versioned save schemas → normalization → current invariant composition
IndexedDB repository → save facade; it does not run gameplay
render/picking/display → read models; never resource/claim mutation
```

The diagram describes responsibilities, not a mandate for one file per box. A module earns depth by hiding one volatile representation behind a few invariant-preserving operations. Moving the same branches into many tiny files without reducing what callers must know does not achieve this.

## Three initial delivery packets

1. **Checked topology after the compact Go hotfix.** One coupled movement/world/command caller writer. Remove optional world topology, check the actual JS/TS boundary, fix every current caller, and extract the clock facts to eliminate the real cycle. No save or simulation semantics change. Exit: source/caller review plus focused upstairs Go/edge-closure and existing movement/routine laws. Do not rerun the long earned-home browser build.
2. **Closed admission and current work validation.** Same serial domain writer, independent reviewer. Extract checked UI-to-command construction, close `commandProblem` dispatch, and centralize existing job/activity relationship validation without widening v1–v6. Preserve paused admission and old save recovery/CAS behavior. Exit: an added command/activity cannot omit its handler at compile time; malformed real-boundary input rejects without mutation; existing migrated snapshots and representative interrupted tasks retain exact semantics. Keep parser and compiler checks scoped to the seam.
3. **Physical custody extraction using existing shelf and wood work.** One writer across resource/activity/jobs/save consumers; no parallel commodity writer. First source checkpoint moves existing shelf capacity/reservation/pickup/drop/store/ejection behind the physical owner while retaining current save bytes. Second checkpoint brings wood transfer/refund through that owner and removes external direct quantity/location writes. Exit: existing conservation, draft/drop, two-claim conflict, shelf teardown and paused restore outcomes stay exact. This lands a usable module before changing representations. The subsequent lot/schema migration and finite brewery are separate reviewed consumers; do not smuggle them into this behavior-neutral packet.

Delivery may run independent renderer/picking and documentation lanes beside these packets only with exact file custody. One serial owner remains responsible for the coupled domain seam. The root's simulation/content contract remains the design for the next lot/process migration; these packets make that migration possible without another commodity clone.

## Review of the root's joined module plan

Read `current-systems-review-and-module-plan.md` after its creation. Its six owners and landing order agree with the source. No ownership blocker found. In particular, it correctly distinguishes sow/harvest validation relocation from a missing invariant, puts source query facts below construction workflows, preserves the actual scheduler, and permits a bounded first material consumer.

Two details should remain explicit in worker briefs: (1) the new live command parser/typed adapter cannot reuse a broadened latest schema in old wire versions, and (2) an admission result is neither a durable disk receipt nor a completed-job result. The existing `main.js` schedules saving after applied admission, so those distinctions are grounded in the caller rather than theoretical multiplayer requirements.
