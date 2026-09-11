# Survival direct movement experiment

Levi approved September11: change the existing survival page, not a fifth demo.
Preserve colony/formation/raft destination controls and RTS cannon behavior.

Native Rust owns continuous collision movement. Browser prediction invokes the
same exported pure step; it never advances hunger, goods, combat or saved state.
Numbered20ms input samples are batched up to5 per command. Server clocks alone
consume samples, at most their elapsed budget, with no banked idle movement time.
A bounded50-sample native queue and matching client replay horizon prevent
unbounded latency accumulation. Holding diagonal keys normalizes speed.

Explicit begin-direct stream claims control of one body and clears destination
navigation. Later input must match that stream and next contiguous sequence.
Acknowledgement means consumed by a physical tick, not accepted HTTP or queued.
Canonical stream/frontier/queue survive current-format save and DO restart.
Region exact command receipts retain retry identity; no second receipt store.
New native format4 rejects older saves; no migration or silent deletion.

The client replaces its prediction base with each committed pose, discards only
consumed inputs, then replays the remainder through Rust. Render buffering still
applies to other actors. Pause/disconnect/blur stop input, and reconnect/new-world
starts a fresh stream so old input cannot become new movement. Ground-only direct
control is the bounded first cut; supported-deck direct control explicitly rejects,
while existing click-to-walk on the raft is unchanged.

Survival gets a prediction toggle for comparison. Test native collision/diagonal
speed/clock-budget/ack/save laws; actual shared client inputs and delayed receipts
on existing survival; local DO replay/restart retains authority. Do not claim no
rubber-banding, general multiplayer acceptance or hardware capacity from a fast
HTTP reply. Facing retains the last movement direction during a zero-displacement
sample; packet gaps must not choose a default atlas direction.

## September11 implementation and acceptance

Native source61194a0/9dca514 was reviewed and corrected at integrationa9cea36.
Root removed a remaining whole-world weight scan from each tick, corrected native
queue-capacity accounting and safe sequence typing, and fixed the fixture that
incorrectly submitted50 samples as one5-sample-limited batch. u5227 compile red
and u5230 fixture red are retained. Six native laws passed in u5230; corrected
flood/frontier law passed u5233. Client animation/input9laws, native WASM build,
strict engine/host types passed u5233. Two refusal/stream-replacement laws and
one strict admission law passed u5240. No broad old gameplay matrix.

u5238 used the actual built WASM prediction export with delayed admission:
prediction before acknowledgement, replay of only unacknowledged input, convergence,
wall stop at x1.48 and native save equality passed. The maintained local DO driver
then passed two owned starts, direct consumed frontier5, paused independent world,
exact lost-command retry, and request-free restart. These are not an internet
latency-capacity guarantee.

Public backendba594ece-f3f0-4770-98a4-6b353715c908 pins implementation
606927d02064c9455ab1ee9b7745e36582545fbfc215a96e0e4c0da195422f29.
Frontend6141a1e2 passed144 served hashes. u5243 browser stopped on a fixture-only
route.continue/unroute race; corrected u5247 passed held HTTP admission with server
pose unchanged, subsequent acknowledged fractional position x0.4/frontier10,
prediction toggle and further movement, errors[]. King viewed before/predicted/
acknowledged images: the predicted and acknowledged positions agree visibly.
No software-renderer FPS or no-rubber-banding claim follows.

Client3f1f274 additionally resets prediction on explicit restore/reset epoch changes;
this is a source-reviewed lifecycle correction, not a new native movement rule.
RTS cannon, formation orders and pirate destination logic are unchanged.
The locker is now a real occupied cell in the existing survival scene.

Limits: direct actors are currently ground-only point bodies; dynamic collisions,
cross-region control and adversarial multiplayer input budgets are not qualified.
The existing Region retains4096 ordinary command receipts; indefinite continuous
play needs an accepted bounded input-receipt retirement policy. No receipts are
silently deleted here. Idle generates no direct-input commands. This is the
bounded public movement experiment, not final multiplayer-engine acceptance.


## Sustained movement correction (September 11)

Levi rejected the short movement result as playable: initial prediction feels
better, then stutters. The latest first-cut frontend is 6d276e7b-c384-4d31-9ad4-7c0778d730be
(u5253 normal Wrangler completion, scope inactive/dead); this is not sustained acceptance.

Root and independent Luna source review found clock requests capturing a stale
player revision. An intervening input could retire the ordered occurrence without
advancing physical time. Private clock requests now rely on the existing occurrence
frontier, retaining ordinary optional player revision checks. A real SQLite owner
law covers100 interleaved inputs/ticks, reopen and identical occurrence retries.

u5255 fixed that source issue but sustained native input still reached50 outstanding
samples. u5257 stopped on strict typing before native launch. u5258, after bounded
five-step anchored clock catch-up, still reached50. All scopes and8789 were closed.
Actual local command durations67–291ms exposed the serial five-sample HTTP ceiling.
These reds are preserved; no failed candidate was deployed.

The recut coalesces only adjacent, not-yet-issued direct inputs for the same body
and stream, up to the existing50-sample horizon. Issued command bodies/IDs remain
immutable across retry. Other commands remain ordering barriers. Structural
admission and Rust accept that bounded batch; authoritative time still limits
movement, not batch size. u5260 fixed-clock flood law and rebuilt actual WASM
passed. This does not expand replay distance or grant client physical authority.


Joined transport/admission laws and strict host types passed u5268; its inherited
three-active-world native fixture still filled the replay horizon. Saved state
showed the controlled world's admitted95 samples already processed, so backlog
was in transport rather than native unconsumed steps. HTTP commands reached528ms
under that local workload. This remains a local multi-world capacity limitation.
The sustained branch was corrected to own only the targeted Survival world; the
ordinary separate-world fixture remains intact. u5270 passed400 samples over eight
seconds, maximum20 unacknowledged samples, all400 consumed, one actual workerd start,
no client errors; scope/listener8789 closed. This is not rendered smoothness or
population capacity acceptance. Root reuses checkedAction for transport batching;
there is no second structural action validator.
