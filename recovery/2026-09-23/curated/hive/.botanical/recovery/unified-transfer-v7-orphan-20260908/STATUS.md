# Unified transfer v7 orphan recovery checkpoint

Captured read-only from `/home/levi/src/hive` on 2026-09-08 after the missing-host diagnosis. No process was signalled, no Session command was submitted, and no tracked or untracked working-tree file was staged, reset, cleaned, or rewritten during this capture.

## Repository identity

- Branch: `feat/goblin-bed-and-breakfast-mvp`
- HEAD: `354255ded9913107e8ed85b043df08b6737c8d86`
- Remote feature ref after the independent minimap push: `354255ded9913107e8ed85b043df08b6737c8d86`
- The v7 working diff remains unstaged in the live checkout.

Modified tracked bytes copied under `files/`:

- `scripts/prove.mjs`
- `src/activity.ts`
- `src/actors.ts`
- `src/clearing.ts`
- `src/jobs.ts`
- `src/materials.test.js`
- `src/materials.ts`
- `src/model.ts`
- `src/orders.ts`
- `src/resources.ts`
- `src/routine.ts`

Untracked proof-source bytes copied under `files/`:

- `scripts/prove-caps-style.mjs`
- `scripts/prove-deconstruct-presentation.mjs`
- `scripts/prove-hosted-save-studies-smoke.mjs`
- `scripts/prove-paused-work.mjs`
- `scripts/prove-structure-hit-go.mjs`
- `scripts/prove-upstairs-bedroom.mjs`
- `scripts/prove-work-panel.mjs`

`evidence/working-tree.patch` is a second recovery form for the modified tracked bytes. Relevant accepted/current review notes and the prior v7 run report are copied under `evidence/`. The prior `unified-transfer-runtime-v7` report belongs to a different completed client lifetime and does not settle the current kernel correction.

## Persisted Agent backup

`database/agent.sqlite` was produced with Node's SQLite online backup API from a `readOnly: true` source connection. The backup passed both `PRAGMA integrity_check` and `PRAGMA quick_check` with `ok`.

- Live database at capture: 2,056,192 bytes, SHA-256 `cf766fbb68e3f6258d0ab75c3088e5b41a46ebc6ec06ebf89eef26ca2f51e3fb`
- Transactional backup: 2,056,192 bytes, SHA-256 `31fbfec6c94df380ea772e91a05c783fffcd7deda7875e728ee15b7fe8dcbe9f`

The zero-byte owner file and live owner journal were deliberately not copied as persisted state. No database rows or conversation transcript were emitted into this checkpoint.

## Runtime identity at capture

- Former host PID `3203488`: absent.
- Former wrapper PID `3206941`: absent.
- Connected client PID `3206944`: present, parent PID 1, state `R`, six threads, executable Bun 1.4.2, cwd `/home/levi/src/hive`.
- Listener `127.0.0.1:41342`: absent.
- Native handle/report label retained by the owner: `5339` / `unified-transfer-kernel-recut-20260908`.
- Kernel final report JSON: absent.
- Kernel stdout and stderr: both zero bytes since `2026-09-08T03:21:09.728481414Z`.

The copied `evidence/game-runtime-readonly-REPORT.md` is the bounded source/process diagnosis. High client CPU is observed; its cause is not established.

## Continuation boundary

No safe crash-resume command is currently established. The prior supported client shape was the retained `b2a6cd8` CLI using `run --connect http://127.0.0.1:41342` against Session `main`, but there is now no listener. Starting that command now would create another client, not prove continuation of the orphaned run, so it was not done.

The minimum next lifecycle action is a Game CTO decision on restoring the missing host against the preserved persisted store and Session identity, followed by a correlated Session read/continuation only after the host identity is verified. Whether that can resume the in-flight request rather than begin a new run is unproved. The existing no-stop/no-restart/no-reassignment boundary remains in force until that decision.
