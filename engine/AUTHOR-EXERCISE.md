# Survival fatigue author exercise

This exercise adds `survival.fatigue` entirely in the TypeScript game pack. It
stores a bounded fatigue value and the previous observed pose. The `survival`
system joins `Survivor`, `Condition`, `Position`, `Body`, and `Fatigue`; when
the queried position differs from the stored pose, fatigue rises by five units
per simulated second, otherwise it recovers by two. The presentation exposes
the value as the `Fatigue` fact alongside the existing hunger, wellbeing, and
material facts. The movement action remains kernel-owned, so input intent alone
cannot increase fatigue.

The public API was sufficient for this rule: a namespaced component, a bounded
query join, a transactional authored write, and a presentation inspection are
all ordinary authoring operations. The common SDK does not currently export a
`Body` definition, so this pack declares the public `hive.body` shape locally
to query its membership. That creates a duplicate schema registration at the
authoring boundary; a shared SDK export should remove the repetition without
changing the simulation owner. This source exercise has not yet been proven
against the native/WASM kernel.

The focused physical proof to add at the kernel/consumer boundary is:

1. Load a survivor with position `(0,0,0)`, body speed `1`, fatigue `0`, and a
   matching stored pose.
2. Submit a move to `(2,0,0)` and advance a fractional step. Assert the queried
   position is between the endpoints and the next fatigue value is greater
   than zero.
3. Advance while stationary and assert fatigue decreases without going below
   zero.
4. Save, restore, and repeat the stationary step; assert the value and stored
   pose are deterministic.
