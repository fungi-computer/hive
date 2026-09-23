# v7 recovery: retained source decision

## Narrow supersession and executed retirement — 2026-09-08

The investigation boundary's issuer explicitly approved retiring only the revalidated orphan connected client PID3206944 and transferring the preserved dirty v7 seam to one existing visible Game owner under Game Delivery. This lifts the no-abort/no-reassignment hold only for that process and source handoff. It does **not** authorize the prospective host-reopen command below, automatic reconciliation, replay, or a prompt against the old store/Session.

Root revalidated start ticks20725832 (2026-09-08 03:21:09.32 UTC), PPID1, Hive cwd, exact retained b2a6cd8 CLI run/connect command, kernel/recut task markers and absent41342listener immediately before signaling. A held PID file descriptor bound each signal to that exact process, never a group/pane. SIGTERM at06:22:27 was ineffective after8s; identity was revalidated again before SIGKILL at06:23:12. PID-fd exit notification then fired and `/proc/3206944` was absent. All11preserved dirty source/proof file hashes and the live agent.sqlite hash were identical before/after; the listener remained absent. The saved online backup and earlier evidence were untouched. This is an interrupted/incomplete kernel outcome, not successful work or Session completion.

Exact records beside the original recovery checkpoint: `.botanical/recovery/unified-transfer-v7-orphan-20260908/retirement-20260908T062227Z.json` and `retirement-20260908T062312Z-final.json`. Delivery retains Git/proof/deploy and must record the actual successor's explicit file-custody acknowledgment. The source analysis below is retained as historical decision evidence; its proposed host reopen remains unauthorized.

Read-only review of Hive’s `unified-transfer-v7-orphan-20260908/STATUS.md`, Botanical’s `game-runtime-readonly/REPORT.md`, retained `.botanical/tui-scroll-fix-b2a6cd8` JavaScript, and corresponding current source. No host/client/Session/provider command, process signal, SQL query, lease acquisition, or source mutation occurred. The existing no-abort/no-restart/no-reassignment boundary remains active.

## Decision

**The retained CLI supports reopening the same persisted store and Session. It does not establish transparent continuation of the interrupted provider/tool execution.** Reopening is a mutating recovery action with automatic reconciliation, not “start an endpoint so we can inspect first.” Approval must cover that behavior explicitly.

The exact live database is:

`/home/levi/src/hive/.fungi/agents/local_store_vefejtaolu5com1viq49p/agent.sqlite`

A read-only file hash still equals STATUS’s live hash `cf766fbb68e3f6258d0ab75c3088e5b41a46ebc6ec06ebf89eef26ca2f51e3fb`. The separately preserved online backup remains untouched. No database contents were printed.

## Prospective command — approval only, not executed

Run as a normally retained human-facing TUI host, preserving existing pane custody/focus:

```sh
/home/levi/src/Botanical-next/apps/tui/node_modules/.bin/bun \
  /home/levi/src/Botanical-next/.botanical/tui-scroll-fix-b2a6cd8/dist/cli.js \
  --cd /home/levi/src/hive \
  --db /home/levi/src/hive/.fungi/agents/local_store_vefejtaolu5com1viq49p/agent.sqlite \
  --model gpt-5.6-terra \
  --listen http://127.0.0.1:41342
```

The retained `dist/cli.js:248` parser accepts this combination. Do **not** add `resume`: `validateFungiListenerMode` rejects `resume --listen`. Do not use `run --connect` as recovery; it submits a prompt through a new client. **Model correction:** Game CTO’s retained-owner identity report explicitly records host PID `3203488` with `--model gpt-5.6-terra`. The proposal now preserves that reported configuration; omitting it would silently select the local host default Sol. This review independently verified parser support, but has not located the original host launch record in the provided Hive recovery/handoff files: STATUS records the PID without argv, the completed run report records only a connected client, and Botanical’s diagnosis deliberately excludes argv. The exact safe launch-record path remains requested from the owner; Terra is owner-reported rather than independently attributed to a local launch file here.

The exact retained parser exposes `--model`/`-m`, `--db`, `--cd`/`-C`, `--last`, `--connect`, and `--listen`, with strict parsing. It exposes **no reasoning-effort flag or Codex `-c` option**. The retained local adapter passes the selected model to the ordinary model source. Do not invent an effort argument; the vanished host’s effective provider reasoning default has not been established, and no provider/configuration/credential read was performed.

`localDatabasePaths` in retained `@fungi.computer/local/dist/private-local-runtime-host.js:35` resolves an explicit `--db` to an existing real file. Without it, startup generates a fresh Cairn store directory under `<invocationRoot>/.fungi/agents/`; cwd does **not** select the old store. `--cd` separately fixes filesystem/tool/instruction authority to Hive. `initialSessionId = "main"` and the HTTP host expose that same persisted Session. Using the backup path would create a separate owner/lease path; do not treat a second live copy as continuation.

## Ownership and automatic recovery

The retained local owner acquires `<db>.owner.sqlite` using SQLite `BEGIN EXCLUSIVE`, timeout zero, **before** opening the main DB/runtime. An occupied lease fails rather than stealing ownership. A zero-byte sidecar does not prove availability; do not delete it or probe by acquiring it during this read-only hold. Main opening enables foreign keys and constructs the ordinary store/tools/model/instructions. Current source has the same boundaries in `runtimes/local/src/private-local-runtime-host.ts:100/126/484`.

Automatic work starts at `localRuntimeOwner.bind`’s `schedule()` and the retained Shiitake coordinator’s post-bind `requestWake`. `private-local-shiitake-host.js:33` opens the runtime owner **before** binding the HTTP listener. Consequently a failed listener bind can occur after recovery has already changed state; no guarantee exists that identity inspection happens first.

The retained coordinator supplies Watchdog `isAlive: false`. On its cold tick, a persisted running claim is requeued only if its saved recovery policy has remaining recoveries; otherwise Watchdog settles it `interrupted` (`watchdog/dist/effect.js:86–115`). Ready queued work can then execute. Active goals continue automatically only after completed work with the exact completed terminal; interrupted work does not automatically produce another goal run (`session-goal.js:75–109`). Actual saved queue/recovery/goal state was not queried here, so this review cannot predict which branch will occur.

The executor checks the accepted roster/grant/contribution contract before executing. Reopening neither restores an in-memory provider connection nor proves exactly-once tool effects. It also does not resurrect the missing wrapper or guarantee the orphan client receives its correlated terminal/report. Retain those evidence limits.

## Minimum authorized next step

This is a proposal only: **the explicit no-restart/no-reassignment boundary must first be lifted by its issuer. The user’s no-restart instruction has not been rescinded by this recommendation or Game CTO’s delivery authority.** Request a narrowly scoped lift for one same-store host reopen including automatic recovery; after that lift, the owner rechecks endpoint absence and retained configuration. Verify the acquired database/endpoint/Session identity, then perform a correlated neutral Session read; do not immediately resubmit the kernel prompt or start another writer. Keep old source/backup/evidence intact and report actual settlement separately from useful code completion.

If automatic reconciliation is unacceptable, this CLI has no supported “open persisted host without executing/reconciling” mode. The safer source-continuation option is an explicit boundary lift that retires/fences the orphaned writer and transfers the preserved dirty v7 seam to one named successor, leaving this store archival until runtime recovery is separately authorized. That is a custody change, not transparent Session recovery, and is not authorized or performed by this note.
