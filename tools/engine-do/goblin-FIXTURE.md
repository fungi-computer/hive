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
