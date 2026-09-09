# First native Goblin region fixture

Declared before first runtime launch. Default createClearing(seed42), initially
paused; unchanged real optimizer. Player home/shared dig at (7,9,level0), one
admitted job with no tick/terrain change. Exact retry returns original receipt.
Host cannot issue player order; player cannot advance. Host advance120 while
paused advances0 and emits no world-advanced event. Player explicitly unpauses.
Host advances10, save/restart with pawn task and running state preserved, then
advances50. Require tick60, exactly one edited voxel and one soil unit. Restart
again and retry both original order and completed advancement; require identical
snapshot/receipts without another tick, job or physical effect. No direct quarry
edit, alternate assignment algorithm, UI/browser or hosted scope.

Results: four focused source laws passed u3937
(130caa5b2ffb47038a73ec0a4fcae9d6); root source strict types passed u3939
(98dcc03346b545f6a094c0eb1ec8b0a2). Host strict types using generated Worker
declarations passed u3948 (a23885b22ba943bd9ee31679e9d51c1d).

First native v1/u3942 failed at first running advance. V2/u3946 retained the
previously obscured error body: the harness constructor had omitted the optimizer
argument. Corrected constructor awaits loadOptimizer(staticWasm) inside
blockConcurrencyWhile before opening the region. No simulation workaround.
Both failed SQLite/log directories are preserved.

Corrected native v3 PASSED u3949 (8d57ec26927c4acfb7e44d8cee12b5e1).
Evidence .botanical/engine-do/goblin-20260909-v3 contains receipt/source hashes,
working-before-restart.json, final.json and sanitized runtime logs. Exactly
one admitted job at tick0, running pawn task preserved at tick10, one terrain
edit/soil unit at tick60; exact replay after second abrupt process restart.
All three owned listeners closed. No hosted/browser/full-engine claim.

Identity correction after v3: loader returns immutable structural build identity
(JS SHA256:Wasm SHA256), and Goblin captures its methods and includes the declared
build in program identity. No nominal provenance requirement. Registered code is
trusted; arbitrary supplied Wasm modules are not authenticated by a string.
Five focused laws passed u3964 (420846b9dbe44407b236015d66047f18), including actual
loader + native SQLite mismatched-program reopen rejection without mutation.
Strict host/transitive source types passed u3965
(d98f2a995b0d47c3a0a8d59afbffd1f4). V3 physical run was not repeated.
Transitive current runtime closure (40 files, external Zod, no unresolved imports)
is pinned in .botanical/engine-do/goblin-identity-20260909/transitive-source-inventory.json.
Earlier v3 receipt hashes remain historical evidence, not post-correction hashes.
Limits: native proof killed processes only after committed checkpoints; maximum
advance120 is a step-count limit, not a measured CPU budget. No hosted claim.


## Paired field/pail native fixture (prepared, not yet run)

The optional `--fixture field` selects a fixed host-configured initial program
and distinct `goblin-field-proof-v1` DO/region identity. Default `dig` retains its
original identity and trace; it is not rerun for this packet. The field program
identity includes the maintained optimizer build and its authored fixture version.
No request can upload state, select a fixture, choose a principal or mutate debug
state. The same local ephemeral credentials bind player/host/debug capabilities.

`goblin-field-fixture.ts` is shared with the accepted Node paired law. It builds
one valid authored intermediate: real excavated pit `[0,14,128]` and one soil
lot, completed station with conserved embedded wood, the original pail holding
2 units withdrawn from the finite authored spring, Rowan holding that pail in
its existing draw phase at the real rim. Host initialization records the actual
field binding/node as supply. The pit starts dry; all original finite water is
retained. This proves transaction/restart, not earned seepage, construction,
excavation or acquisition. The three WASM caller laws retain those separate
field-sourcing observations.

The bounded trace uses existing synchronous receipt fault injection and storage
sync. First reject player return, then fail receipt insertion after return's
candidate mutation: original state/events must survive abrupt restart. Commit
return2 while withholding its acknowledgement, restart and replay the same
command: pit2/pail0, tick0 and one receipt. Next reject player advancement, then
fail the ordinary one-tick draw receipt: paid state/events must survive restart.
Commit the same actual draw tick with lost acknowledgement, restart and replay:
tick1, phase deliver, pail2, net field exchange0, same checked portion IDs and no
sink. One final ordinary tick continues movement without another draw or charge.
Whole snapshots/events and field/material balance facts are saved before/after
all four restarts. The two lost acknowledgements are harness503 after actual
storage sync; process termination occurs after committed evidence, not inside a
physical instruction or an unconfirmed transaction. Five owned runtime starts
maximum, cleanup after first failure, no automatic retry loop or dig trace.

Ready command, only after Root/Delivery release:

```
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node tools/engine-do/goblin-proof.mjs --output .botanical/field-region-host/native-v1 --fixture field
```

The output directory must be new; its retained SQLite is never reused from a
prior proof. Each owned process/listener closure and sanitized log remains in
the receipt. No browser, deployment, benchmark, provider or public backend claim.
