# Paused colony work and allowed-work core seam

Read-only snapshot hashes:

- `model.ts` `5a0e94917a1760d3e5a631438a7f747607844759236f6185814973375baf65e9`
- `orders.ts` `657ec84eb9c00d5d9a04eb2def9af3e316989cfeacd7f522bf4ec93c6a3e0e49`
- `clearing.ts` `bd103183c9de87e389d4d44280925dcb98de9846c0a8d69673b29c18265ad01d`
- `jobs.ts` `c283111fba76a8b28938d8be14e5a8fb2533dcfb64c25d521a0cf4d51da49549`
- `activity.ts` `4601e02bcb956cf03734df4de2cd69087011666e5ef632f806dd4501c3064200`
- `resources.ts` `961fb09bc024cb45f6fb26e18f5121e10155d74dc7933ab8c007e3f43a70d122`
- immediate caller `main.js` `ec19dc58d4502976ce61c134d06e66a6c46611d10bbfd8f34eb572ea5a2e4e07`
- laws `clearing.test.js` `36c1438a416daa8783d62c592f0b0d021ad45ecb49cc8db6fa6de7156e51aaf2`

## Smallest safe ownership split

`orders.ts` already owns command validation and mutation
(`commandProblem`/`acceptCommand`, lines 10-44 and 162-203). Let it own one
ordered `admitCommands(state, commands): CommandResult[]` batch operation as
well. It should validate and apply each command sequentially, so a later command
sees every earlier result. This preserves the existing duplicate-chop behavior,
job priority, and deterministic `nextId` allocation without a queue framework.

`clearing.step` should then own time only: paused means no tick increment, rest
drain, routine update, activity movement/work, matching, cat movement, or feed
advance. Those effects are currently coupled after the pause rejection at
`clearing.ts:83-107`. Admission must not call `assignWork`; it may create jobs or
sites and set `workDirty`, but actual libcolony matching waits for the first
resumed step.

Use the boundary between completed simulation ticks as the command timestamp.
While running, the caller drains and admits its pending ordered batch immediately
before the next step; while paused, it admits the batch immediately and renders
the result without calling `step`. Record all commands admitted at that
boundary with the current completed `state.tick`; the existing array order is
sufficient to order several batches at the same tick. Replay becomes: at tick N,
admit the recorded commands for N in their stored order, then advance to N+1.
This also represents designations made at tick 0 before any time passes.

For a replay log, retain accepted state transitions rather than rejected input
attempts. Today every attempted command is appended before validation
(`clearing.ts:95-97`) and rejection mutates `state.notice`
(`orders.ts:166-169`), which makes a paused rejection impossible to replay from
the command list unless pause/UI attempts also become domain events. The smaller
shape is: return rejection through `CommandResult`, let the caller display its
reason, and append only applied commands to the ordered replay log. No command
ID or event-sourcing layer is needed for this local boundary.

The running caller currently flushes pending commands only under `!state.paused`
(`main.js:447-488`), so simply relaxing `commandProblem` would leave accepted
paused clicks pending invisibly. The paused path must call the same admission
owner immediately; result/meta handling should be shared with the running flush,
not reimplemented as a second validator.

## Explicit paused-command policy

Pause freezes time, not command admission. Remove the blanket rejection at
`orders.ts:11`; shared chop/build, allowed-work changes, direct work/rest,
cancel/next, routine, recruitment, Draft, Go and Undraft all pass through the
same normal validation and ordered admission while paused.

Some commands intentionally mutate the paused snapshot. Direct work and Draft
call the existing interruption path, which may release a claim or place carried
wood at the actor's current cell. Cancel may additionally remove a site and
refund delivered wood (`orders.ts:46-70,79-88`). Routine disable may cancel an
active routine job. These are command effects, not elapsed travel or work; they
must occur once on admission and remain frozen afterward. The invariant is that
admission never increments `tick`, calls `advanceWork`/`assignWork`, drains rest,
moves the cat, or advances the feed.

Shared ordinary work remains `actors: null`, so it needs no selection. Direct
orders continue to require an explicit nonempty actor scope. Paused state itself
must not alter either rule.

## Allowed-work state and eligibility

The smallest persistent model is a closed `WorkType = "chop" | "haul" |
"build"` and one `Record<WorkType, boolean>` on each actor, defaulting true to
preserve current behavior. A typed command naming actor, party, work type, and
enabled value makes panel changes participate in the same ordered admission and
replay path. Plants can add a real type when their activity exists.

Apply permissions only to automatic shared work (`job.scope.actors === null`).
Current actor-scoped jobs are explicit player queues and remain ahead of shared
designations (`jobs.ts:219-240`). Recommended explicit policy:

- an actor-scoped queued order overrides allowed-work but waits for the current
  activity;
- an actor-scoped direct order overrides allowed-work and keeps its existing
  interruption behavior;
- routine sleep is outside Chop/Haul/Build and remains controlled by its own
  schedule flag.

This keeps “allowed work” an automatic-work preference rather than a second
authorization system. If product instead wants disabled work to prohibit forced
orders, that must be surfaced as a rejection; it should not be inferred inside
the optimizer.

Draft is the explicit exception to ordinary direct work: an ordinary direct
chop/build/rest command naming a drafted actor should be rejected with “Undraft
to work,” because Draft promises movement control and no ordinary work. Shared
designations remain valid while actors are drafted and wait for any eligible
undrafted worker.

Gate each shared candidate by its resulting `Activity.kind` immediately before
`offer`, not by `Job.kind`:

| Candidate activity | Permission |
| --- | --- |
| `chop` | Chop |
| `pickup` | Haul |
| `build` | Build |
| `deliver` for existing cargo | Always finish committed haul |
| `sleep` | Not in this panel |

This distinction is required by `buildOption`: the same build job yields a
`build` candidate when `site.delivered === recipe.wood`, but otherwise searches
for wood and yields `pickup` (`jobs.ts:43-83`). It lets a Haul-enabled,
Build-disabled person supply a site and a Haul-disabled, Build-enabled person
construct it.

Existing cargo is offered for delivery before personal/shared work and excludes
that actor from other offers (`jobs.ts:209-217,222-246`). Preserve that rule
regardless of a later Haul toggle. Permissions are checked only when starting
new automatic activity: disabling Haul while walking to a claimed pile leaves
the task and claim intact; pickup transfers the same units into cargo; delivery
then remains the actor's sole candidate until completed or explicitly
interrupted. Disabling Build or Chop likewise lets the current activity finish
and blocks only its next automatic assignment. A toggle should set `workDirty`
but must not call `interruptWork`, `dropCarried`, or delete `state.claims`.

## Minimal Draft, Go and Undraft seam

Add only `drafted: boolean` to `Actor`. The existing `Body.path`, `leg`,
`mode: "walk" | "idle"`, `route`, `beginWalk`, and `walk` already represent and
identify direct movement while a drafted actor has no task
(`movement.js:4-57`); a second move target, Job, libcolony task, new activity
kind, combat state, or pathfinder would duplicate that state.

Add closed command variants for Draft/Undraft over an explicit actor scope and
Go with a destination cell. All three belong to `orders.ts` admission and the
existing command consumer. `acceptCommand` should gain explicit cases plus an
exhaustive `never` fallback, so a future command cannot omit its mutation. No
`Activity` variant is needed because Go is direct player movement rather than
colony work.

Draft applies to every actor in scope atomically:

1. Call `interruptWork` once for each newly drafted actor.
2. Set `drafted = true` and leave the actor idle at its current logical cell.
3. Retain every job, tree/site work value, delivered material, and standing
   routine setting.

`interruptWork` already deletes the actor's claim, drops cargo into a physical
pile at the actor, clears activity/path/assignment, and marks work dirty
(`activity.ts:19-34`, `resources.ts:51-69`). Draft therefore preserves the wood
total and interrupted job without separate cleanup. Because logical position
changes only when a full walking leg completes, drafting mid-leg clears
`leg/path` and the renderer snaps from its interpolated point back to the last
logical cell (`movement.js:44-67`). This is the concrete cost of reusing current
movement; it does not justify continuous-position state.

While drafted, exclude the actor from `assignWork`'s idle roster
(`jobs.ts:182-192`) and from night-job creation (`routine.ts:31-49`). Existing
routine jobs may remain queued until Undraft or normal dawn cleanup. In
`clearing.step`, advance a drafted actor whose mode is `walk` through a tiny
direct-move branch before/aside from `advanceWork`; a drafted actor with no path
holds its cell. This keeps ordinary activity and direct movement ownership
disjoint.

Go requires every named actor to be drafted. Resolve `route(person,
destination, blockedCells(state))` for all selected actors before mutating any;
with the current single `CommandResult`, reject the whole command if any route
is null. A destination equal to an actor's current cell is an applied hold and
needs no walk. Otherwise replace only that actor's previous draft path and call
`beginWalk`. While paused this changes mode/path but not position or `leg`.

On a later step, use the existing `walk` result:

- `moving`: retain the path;
- `arrived`: leave `drafted = true`, set idle, and hold;
- `blocked`: keep the path/leg clearing already performed by `walk`, leave the
  actor drafted and idle, and report
  that the move stopped. Do not silently resume work or add automatic rerouting.

Current collision policy is soft because `blockedCells` excludes actors
(`world.js:41-50`). The smallest multi-selection Go sends each actor independently
to the clicked cell and allows overlap. Formation slots or exclusive pawn cells
remain a product choice only when gameplay requires them.

Undraft clears any draft path, sets the actor idle, sets `drafted = false`
and `workDirty = true`. It does not recreate jobs: the retained personal/shared
queues and progress are already the source of truth. On the next unpaused
assignment pass, automatic work observes allowed-work; actor-scoped explicit
queues retain their existing priority. Undrafting while paused performs no
assignment until time resumes.

The unavoidable choices are group-Go atomicity and soft pawn overlap. The
recommendations above preserve one result per command and current movement;
neither requires a group-order or formation subsystem.

## Falsifying checkpoint

1. Pause an active two-person state and capture tick, positions, paths, work,
   rest, tree/site progress, claims, cargo, feed, demand, cat, and optimizer call
   count. Admit in one ordered boundary two shared commands for the same tree
   followed by a valid blueprint. Observe applied/rejected/applied in that order,
   `actors: null`, unchanged captured time state, no optimizer call, and only the
   accepted commands in the replay log at the same completed tick. Resume one
   step and observe exactly one tick plus the first actual libcolony assignment.
   Replay admission-at-N then step and require full state equality.

2. Using real chop output and build commands, give person A Haul=true/Build=false
   and person B Haul=false/Build=true. A must reserve, pick up, and deliver the
   exact wood; B must then build the supplied site. Disable A's Haul once while
   its pickup claim exists and once after cargo exists: neither toggle may
   change the claim/cargo, route, task, physical conservation total, or job, and
   the committed delivery must finish. A later unsupplied site must not give A a
   new pickup when Haul is disabled. Conversely B must receive no pickup edge
   and must receive the ready build edge. Capture the actual optimizer offers or
   selected results to prove the activity-level filter rather than only the
   eventual outcome.

3. With Chop disabled for one person, prove a shared chop designation excludes
   that person's edge. Then exercise the chosen explicit-order policy: a queued
   actor-scoped chop still waits and runs, while a direct actor-scoped chop still
   interrupts and runs. This prevents a future UI from silently changing the
   meaning of the panel.

4. Start with a selected actor traveling under a real claimed haul, with its
   build job and partial site/tree progress retained. Pause and admit Draft.
   Assert the same tick/logical position/rest/feed/cat state, no optimizer call,
   cleared task/assignment/path, released claim, cargo dropped once at that exact
   cell, exact material conservation, unchanged job and progress, and
   `drafted=true`. A Go onto a tree/rock rejects atomically with no path mutation;
   a reachable Go stores the real route but position and leg remain frozen until
   resume. After arrival the actor holds through ordinary jobs and a night
   routine boundary. Undraft while paused, resume once, and observe actual
   libcolony matching choose the next eligible retained job. Repeat with two
   selected actors where only one route is blocked to prove whole-command
   rejection, and replay same-tick Draft/Go/Undraft ordering to full state
   equality.

This uses the existing actor/job/activity owners, fixed-step owner, resource
claims, and actual libcolony optimizer. It does not require a replacement store,
scheduler, or task DSL.
