# Colony performance on Durable Objects

The performance page uses `createConnectionChoice` and the real remote client.
It does not start a browser simulation Worker and explicitly rejects
`runtime=local`. All 28 fixed size/population presets are authored through
`createColonyPerformancePack` and run under the existing `PublicEngineRegion`,
with its normal transaction, alarm, command identity and observation paths.
A preset and private bearer identify a separate durable world. Existing Colony
multiplayer worlds are not converted or reset.

Build the frontend with `VITE_HIVE_PUBLIC_HOST` pointing at the matching host.
The host must include the finite `/v1/colony-performance-<size>-<workers>` routes
and permit that exact frontend origin. There is no local fallback if it fails.

The page reports server simulation time per elapsed browser time, committed
server revision, observation interval, HTTP/terrain response latency, received
application payload bytes, observed moving workers, felled trees, wood inventory,
and shared renderer work/retention. Windows hold at most 120 samples. HTTP
failures count even when no response arrives. Payload counts exclude HTTP/TLS
headers and incomplete failed response bodies. These are client-observed costs,
not server CPU time. Workers clocks do not advance during synchronous CPU work;
CPU requires Cloudflare platform telemetry and is explicitly unavailable here.

The current workload has 50 finite tree jobs (six wood per tree), concentrated
in the central 57×57 columns. Surface/grass observations remain bounded to the
central 64×64, even when generated world bounds are larger. Neither 512-square
bounds nor a 200-worker selection proves full-world exploration or 200 workers
simultaneously doing useful work. Those are separate workload/streaming outcomes.

## Browser proof

The driver consumes an already built/hosted URL. It does not start a server,
build, deploy, or install dependencies. Use the shared host's `run-proof.sh`.

```sh
node tools/public-engine-host/performance-browser-proof.mjs \
  --base-url https://example.invalid \
  --output .botanical/do-performance-browser \
  --size 256 --workers 8
```

`CHROMIUM_PATH` selects the provisioned Chromium. The proof requires a rendered
canvas, an online server connection, no browser simulation Worker, a remote
socket and terrain responses, 30 observation intervals, actual felled trees,
positive authoritative time progression, and working server pause/resume. It
records browser/request errors and closes its owned browser. Outputs are
`performance-browser.png`, `REPORT.json` and `source-hashes.json`.

A run against local Wrangler/workerd proves DO integration correctness only.
Only a run against the deployed Cloudflare host measures hosted behavior.

## September 20 acceptance checkpoint

Source owner: `hive-worktrees/living-terrain-integration`. Backend commit
`99999eac` plus the accompanying frontend/transport integration.

- `u2713`: nine protocol laws and one narrow clock-authority law passed in the
  isolated backend lane. Public stepping/physical host authority remain denied.
- `u2712` / `dd63103835b64667ba8608e314145fcd`: real local workerd DO protocol
  proof covered distinct preset worlds, pushed observations, idempotent pause,
  terrain/placement, forged-party/auth rejection and resumed time.
- `u2718` / `ac290f52a24b4b68a6bc02bc8bfa5d7b`: 18 frontend/measurement/connection
  tests passed. Movement uses actual `RenderFact.pose.position`; bounded metrics
  exclude duplicate frames and pause gaps.
- `u2720` / `b9cdbd08ed34473a84a851b55e826f62`: 21 remote-client tests passed,
  including v1 terrain queries, payload accounting and network failure telemetry.
- `u2725` / `e821b59f55a04328939303181ca4a247`: actual browser on local workerd,
  256×256 bounds/eight workers, a felled tree, more than 30 live intervals,
  no browser Worker, remote terrain and pause/resume all passed. Screenshot
  reviewed. Report: `.botanical/do-performance-browser-local-v3/REPORT.json`.
- Frontend builds and backend deployment dry-run passed. No package installation.

Prior browser failures remain preserved: the first used an ambiguous status
locator; the second timed out waiting during pause/resume. The instrumented
rerun passed, but the earlier timeout is not explained and hosted confirmation
is still required. No hosted latency/CPU claim follows from these local results.
The wider resident suite has a pre-existing test using the removed native
scope.party field; global typechecking lacks installed Node typings. These are
not reported as passing.

Prepared release: `.botanical/do-performance-release/wrangler.json`, separate
Worker `hive-performance-engine-preview`; frontend built for its workers.dev
endpoint in `.botanical/do-performance-hosted-dist`. The existing public game
backend is not the deployment target. Cloudflare deployment requires the user's
exception to AGENTS.md's explicit no-backend-deploy boundary; approval requested.
