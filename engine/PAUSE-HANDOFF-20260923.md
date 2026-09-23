# Hive game pause handoff — September 23, 2026

Game implementation and proof work paused at Levi's request. This is a checkpoint, not a framework-capacity signoff. The integration branch is `engine/event-driven-scheduler-audit-20260923` at `962fd619` with a clean tracked tree. Do not merge it to main as part of this pause.

## What works

- The pinned local 256×256, 100-worker v3 workload now performs useful distributed work. In 1,800 physical steps it completed 178 finite chains and delivered 1,068 wood, versus 151 chains/906 wood before the navigation-locality correction. At least 90 workers were moving or working in 179/180 one-second samples, versus 132/180 before. It delivered one water portion; three water demands remained pending. This is a local result, not a hosted capacity result. Its source ledger is `.botanical/framework-v3/locality-after-1800.json`.
- The native suite passed 453 tests, with zero failures and one ignored test, at the accepted navigation/WASM checkpoint. Wood and water conservation, current-format restore, and a ten-step restart continuation passed in the v3 run.
- The local workerd host proved scheduled physical steps without a client request, four accepted commands plus one step in a single owner transaction, exact command replay after restart, terminal deterministic faults without alarm retry storms, and bounded transient retries. SQL batching cut a representative 20-occurrence run from 316 to 19 statements and 307 to 156 written rows; transaction wall time was essentially unchanged (2166 to 2150 ms), so this is a storage-operation reduction, not a claimed speedup.
- The separate hosted preview had a paired live join, matching static readback, and showed 100 workers and streamed terrain. Its browser run is **not stable**: repeated WebSocket reconnects follow a server-side `combined visual projection exceeds bound` error. The hosted ten-minute, two-client/slow-client, full scoped-controller, and capacity gates remain open.

## Preserved unfinished work

- The record-reduction cut is preserved, uncompiled and unaccepted, in `/home/levi/src/hive-worktrees/canonical-record-churn-20260923` on `engine/canonical-record-churn-20260923` at `715c4cb6`. Fifteen modified files and two untracked native modules remain intact. Its 2,200-step before ledger is `/tmp/hive-record-churn-before-v3-2200.json`. Do not infer after-performance from this lane.
- The atmosphere record-owner work is clean and preserved in `/home/levi/src/hive-worktrees/air-records-20260923` on `fix/air-records-20260923` at `c3eb9498`. Its independent native laws and 1,800-step before ledger passed; integration and after-byte measurement depend on the other lane's new record format.
- Both authors stopped builds/proofs and released shared build use. Their worktrees, evidence and generated files were left in place.

## Cloudflare cost and shutdown

Cloudflare lists two Hive Durable Object namespaces: `hive-public-engine-demo_PublicEngineRegion` and `hive-performance-engine-preview_PublicEngineRegion`. The latter is the **separate test backend**. On inspection, its 15-second lease was renewed by clients but never checked by the alarm loop; a world that had been started could keep scheduling physical steps after the browser closed. An active clock targets one alarm per 100 ms plus record writes. This was a real ongoing-cost risk, not merely an idle deployed Worker.

At 10:25 UTC I deployed a small parking version to **only** `hive-performance-engine-preview` (Cloudflare version `96ab7f3e-fed3-4b18-b62b-69e230a5dce8`). Its public fetch returns HTTP 503 `performance-preview-paused`; its DO alarm handler deletes the next alarm and closes any socket. It retains the same DO class, migration tag and namespace, so stored test worlds remain available for a future code redeploy. A live HTTP readback returned that exact 503. The parking source/config are preserved under `.botanical/framework-pause-20260923/`. An attempted post-deploy live tail failed to attach because the tail service reset TLS; therefore zero subsequent alarm invocations were **not** independently proven. A scheduled alarm should invoke the new handler once, then stop. Do not describe the parked preview as playable.

Levi then authorized parking the existing game backend as well. At 10:30 UTC I deployed the same alarm-deleting handler to **only** `hive-public-engine-demo` (Cloudflare version `b68b430b-6900-480a-be52-30fd9ea2e390`). Its live endpoint returned HTTP 503 `game-backend-paused`. I saved its previous deployed settings, including the implementation hash and public origin, under `.botanical/game-backend-pause-20260923/` before deploying. Cloudflare still lists both original DO namespaces under their respective Workers, so their data was not deleted. The two backends are now intentionally unavailable to players.

The old Hive Vite preview and its `trycloudflare.com` tunnel were stopped. Two other `cloudflared` processes belong to broader Botanical infrastructure and were left running. No Botanical DO was changed. Same-day Cloudflare DO analytics returned no invocation group for `hive-public-engine-demo` at the initial check, but analytics can lag and is not a billing ledger. Retained namespace/storage may still carry a small storage charge; parking prevents new game work and lets scheduled alarms retire without deleting data. Review actual Cloudflare billing if a precise cost total is needed.

## Safe restart point

Start from the accepted integration branch and the two preserved lanes. First resolve the visual-projection bound as an ownership/budget issue, integrate and prove the changed-record cut, and then run a short same-build local/workerd/hosted check before attempting the frozen ten-minute qualification. Redeploy each normal backend only when intentionally resuming that game or hosted test. Both existing static preview URLs may remain visible, but their backends are parked.
