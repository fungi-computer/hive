# Network library qualification — September 11

Actual isolated install and source review at4ef8a8f. No game dependencies changed,
no live deployment, no browser/DO acceptance claimed. Reproducer and exact lock:
tools/network-library-qualification/. Run npm ci there, then node qualify.mjs.
The retained reproducer intentionally fails at the Geckos rotation defect.

## Decisions

**PartySocket1.3.0: qualified for bounded transport integration.** ISC package,
public partysocket WebSocket export. Actual ws8.21.3 TCP server on an ephemeral
loopback port: echo before disconnect, terminate server-side peer, same client
reconnects, echo after reconnect, explicit close prevents another connection.
u5188 passed this portion. Library owns transport reconnect, not durable receipts,
world identity, authentication, command retry or prediction. Set bounded retries
and maxEnqueuedMessages0 so the game command owner retains queued intent; don't
let transport silently replay stale gameplay commands. Browser/DO authentication
and sustained latency behavior remain integration work, not proven here.

**Geckos snapshot-interpolation1.1.1: reject as current replacement.** BSD-3-Clause.
Actual source _interpolate JSON deep-copies newer state and finds each entity in
older state with Array.find (quadratic matching in the general case). At4Hz its
default buffer is750ms. These are poor starting points for our scale and latency.
More decisively, actual u5188 failed angular interpolation of yaw(rad): parser
match /\\w\\(([\\w]+)\\)/ captures only w(rad), then interpolates property w,
leaving yaw unchanged. Linear x interpolation passed. This is an actual package
behavior, not evidence that our existing buffer is adequate. No patch, rename
shim or vendored fork is introduced. Pause, epoch resets and parent-local support
composition would still be ours; those weren't qualified by this failed run.

**PartyServer0.5.10: do not adopt for this correction.** ISC, depends on nanoid
and Workers types peer. Installed dist defines Server extends DurableObject,
private connection manager, startup lifecycle and alarm()->onAlarm() ownership.
Default hibernate false. Our existing PublicEngineRegion already owns startup,
Region transactions and durable wake. Adopting this would entail replacing that
host lifecycle, not composing a small independent connection utility. No actual
DO run was justified for a source-disqualified fit. Reconsider only if replacing
host lifecycle has a demonstrated benefit; no claim that PartyServer itself is
broken or unsuitable for a new app.

## Evidence and limitations

Isolated npm install of exact versions completed, seven packages, audit reported
zero vulnerabilities at install time (not a general security certification).
First u5187 failed because the fixture echoed ws Buffer as binary and received a
Blob; corrected fixture preserves isBinary. u5188 then passed PartySocket behavior
and failed Geckos yaw assertion. Both commands exit1 overall, both scopes read
inactive/dead/empty. Socket/server cleanup is in finally and completed before the
Geckos failure. No successful whole-suite claim. No render-speed or population
claim. Prediction still needs the real Rust motion/processed-input contract.

Recommended next dependency: PartySocket only, after real host auth/receipt join.
Do not replace interpolation with Geckos on the strength of its README. Qualify
another small interpolation implementation or correct our bounded timeline with
explicit server-time, jitter, pause and moving-support laws. Native DO WebSocket
API remains the current server-side fit; no second networking framework.
