# Transfer checkpoint — partial finite-work lifecycle

Modified: src/activity.ts, src/jobs.ts, src/water-delivery.ts, src/orders.ts.
New: src/engine/work/lifecycle.ts and lifecycle.test.js. No deletions.
Exact hashes and transitive source dependencies: transfer-inventory.json.

The payload-blind lifecycle owner joins one work record with acquisition,
attachment, park and release over the existing material owner. jobs no longer
pushes water operation metadata before acquisition or compensates failed
acquisition by filtering operations. Food and water use the same record/claim
admission. activity/orders cleanup removes the work record only after successful
material cancellation; parked vessel work retains its record/claim. Independent
finite ore fixture proves failed admission/illegal drop leave state unchanged and
legal release conserves5 units. No second material ledger or work map.

This is NOT completed execution extraction. Water/consume progress and game
phase branches still exist. Configuration currently lives beside water-delivery;
move it to the composed execution boundary with the full owner. Lifecycle is one
internal responsibility, not intended to become another public helper collection.

Evidence:12 laws u3985/1d3a601b5ee34cfc8ce690d2e5fcff29 (independent lifecycle+
needs),5 focused actual-libcolony water laws u3987/61971492998d4e4cb433908684a8a436,
strict source types u3986/65abbdd3b4774d34abd478f6018893f5. No browser/native DO
rerun, Fallow scan, full work executor or product acceptance claimed here.

Levi's latest supersession permits breaking current API/schema and rejects
compatibility shims/adapters. Next worktree shape will make one generic execution
record own phase/progress and reject obsolete saved format; no planned legacy
conversion/projection is retained. Preserve old source as checkpoint evidence.
Freeze for Root to create/move into isolated engine worktree. No new writes after
freeze notification until Root supplies verified destination/root/branch.
