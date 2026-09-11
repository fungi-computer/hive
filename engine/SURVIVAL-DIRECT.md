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
