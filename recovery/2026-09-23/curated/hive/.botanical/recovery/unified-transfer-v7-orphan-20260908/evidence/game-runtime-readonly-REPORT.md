# Read-only game Shiitake host/client diagnosis

Observed 2026-09-08 05:25:31–05:26:52 UTC. No signal, abort, prompt, restart,
relaunch, replacement, tool call in the game Session, credential read, database
query, game source edit or handle 5339 interaction occurred.

## Finding

The supplied endpoint `http://127.0.0.1:41342` is currently unavailable, not a
responsive host with observed provider/tool progress. The current neutral
`createShiitakeClient(...).session('main').read({limit:20})` failed in 35ms at
05:25:31 and 67ms at 05:26:52. `ss -lntp 'sport = :41342'` showed no listener
at both observations. Source read first: `packages/shiitake/src/client.ts`,
`remote-client.ts`, `http-routes.ts`, and local host composition. No SSE parser
was written or used; only the existing read-only neutral client was invoked.

The only exact CLI process matching endpoint 41342 in the second `/proc`
observation is PID 3206944, Bun 1.4.2, cwd `/home/levi/src/hive`, explicitly a
`--connect` client. No corresponding `--listen` CLI process was found. There
is no listener to support the previously supplied live seq 470 claim here.

That client's user+system CPU ticks rose from 283625 at 05:25:49.641Z to
288458 at 05:26:51.695Z. At 100 Hz this is 48.33 CPU seconds over 62.05 wall seconds,
about 78% of one CPU core. It was runnable in both samples, so accumulated CPU
alone is not the evidence. Its parent changed from wrapper 3206941 to PID 1
between those observations. This is an orphaned, actively CPU-consuming
connected client while the endpoint is absent. It is not proof of useful
model/tool work or a diagnosis of the exact instruction consuming CPU.

The kernel final report JSON is absent. Its stdout/stderr files remain 0 bytes
from 03:21:09Z. The existing launcher writes final JSON only after its connected
client exits. Therefore report absence alone never established a live model
run; in the present process state its completion/report path is also compromised.
The previous runtime-v7 report is a different completed client lifetime and
cannot settle this kernel correction.

## What is not known

The original host PID, why/when it disappeared, why the wrapper lost ownership,
and the client's hot loop were not established. There was no live Session
snapshot to compare, no current provider/tool request observation, and no
matching answer to the earlier interview was claimed. The old seq 470 state
cannot be promoted into current progress. Host/CPU conclusions are bounded to
these observations and the supplied endpoint; a host relocated to a different
endpoint would require its owner's explicit identity update.

## Next owner action

Game CTO/Delivery should reconcile their stale host/pane/Session identity and
native handle 5339 ownership against these observations while preserving valuable
partial game source and persisted Agent data. Do not send another prompt to
this unavailable endpoint or interpret the spinning client as an active worker.
They own deciding the next lifecycle action under their current permissions;
this report requests no automatic stop/restart and performed none. Botanical
runtime follow-up should investigate why a disconnected neutral client consumes
CPU and how its owner/report wrapper exited, using this exact bundle and
process evidence rather than modifying game source.

## Evidence

- `read-1.json`, `read-2.json`: exact bounded neutral read outcomes.
- `process-1.json`, `process-2.json`: safe process metadata; no argv contents,
  environment or credentials.
- `reports.json`: report presence, byte counts and completed-wrapper fields;
  no conversation transcript or worker stdout emitted.
- `read.mjs`: observer script. Its 8 second deadline would exit only the observer
  if the read hung; both reads failed immediately. `client.close()` releases
  observer resources only, never the remote host.

## Bounded source follow-up

The exact deployed bundle's `dist/one-shot-run.js:consumeSessionSettlement`
awaits the Session iterator until a correlated durable terminal arrives.
Its deployed `@fungi.computer/shiitake/dist/remote-client.js:remoteEventTarget`
subscribes to named `snapshot`, `frame` and application `runtime-error` events,
but not native EventSource `error` or `open` events. Transport failure therefore
is not surfaced through that application-error branch; reconnect behavior is
left to the runtime's EventSource. The corresponding current source owners are
`apps/tui/src/one-shot-run.ts` and
`packages/shiitake/src/remote-client.ts`.

This identifies the right neutral-client/one-shot transport seam to reproduce
next. It does not locate the sampled CPU consumption or establish that an
EventSource error should mean durable command failure. The future diagnostic
must distinguish transient reconnect from a missing owner, while preserving
correlation and never manufacturing a successful or failed run_terminal from
transport loss alone. Bun1.4.2's EventSource behavior versus the adapter's
pending-iterator lifecycle needs an isolated reproduction before a source fix.
