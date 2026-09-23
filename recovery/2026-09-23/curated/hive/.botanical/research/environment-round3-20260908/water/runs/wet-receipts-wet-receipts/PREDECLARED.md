# Round-three water checkpoint, declared before execution

This tests an optimization of the pinned full-SWE method, not a new physical
solver. The dense source SHA256 is recorded in reference/manifest.json. Rejected
LI methods are preserved upstream and are not ported into this candidate.

## Equivalence and physical guardrails

- Compare dense reference, reusable-workspace dense candidate and exactly-dry
  active candidate at every accepted interval. State quantities V, both momenta,
  last reported face flux, time, collection, geometry revision and event flags,
  plus all signed face exchanges, withdrawals and diagnostics must agree exactly
  as finite JavaScript numbers. Signed zero differences have no physical meaning.
- Compare JSON checkpoint/restart continuation exactly, including geometry and
  momenta. No snapshot aliases reusable arrays. Input/history must be untouched
  after rejected intervals. Exercise geometry edit between accepted intervals.
- Stepped rest, dry dam-break, stepped stream with closed/open diversion and a
  bounded demand. Gate at 2 s and a pond-lowering edit at 5 s exercise activity
  wakeup; this accelerated edit schedule is a new short implementation check,
  not the earlier 600/1200 s downstream-consequence experiment.
- Voxel beds have fixed 0.1 m increments. Horizontal refinement subdivides the
  same terraces. A separate cell-center geometry comparison must establish that
  n=64 samples are exactly the same physical terraces as n=32; do not quantize a
  sloped sample differently on each grid. This is one-bed depth-averaged SWE:
  no exposed free-fall waterfall, stacked fluid column, cavern or pressure pipe
  acceptance is claimed.
- Relative quantity error <=1e-10 and negative depth no less than -1e-12 m.
  Stepped lake rest depth/momentum drift <=1e-11. The frictionless dry dam-break
  normalized L1 profile bound remains 8%, not a comparison-only pass.

## Performance boundary

Each candidate owns one bounded reusable workspace and two state buffers.
Substeps allocate zero size-proportional typed arrays by source inspection and
instrumented allocation sites. O(1) receipts/state objects still exist. The
stepper exposes borrowed arrays, and retained checkpoint serialization is a
separate explicitly allocating operation. Inputs are cloned at construction or
replace, not within step. Consumers must not mutate borrowed state or geometry.

Exactly dry means V=0 and mx=my=0; face q is conservatively included as history
even though SWE q is reporting-only. No positive film is deleted or slept. Every
wet solid/exterior face pressure is evaluated. Active order stays canonical.
Activity construction still scans every cell/face and zeroes scratch; this does
not establish sparse-world work or residency. stableDt remains a common global
CFL calculation. All three methods use the same external interval and forcing.

Targets: halve expensive face evaluations for a roughly 10%-wet dynamic channel;
no more than 10% elapsed regression versus original dense when fully wet; zero
O(N/E) typed allocation per substep. Report elapsed distributions, evaluation
counts, persistent/workspace bytes and process memory separately. Compare
workspace-only and active costs so speedup cannot be falsely attributed solely
to skipping faces. Short repeated batches on this shared host are provisional,
not device budgets. First qualification and timing invocations target <60 s.
No longer sweep without coordination with Game CTO.

## Bounded wet-receipt followup, declared after first qualification/timing

The eight-second first qualification barely wets the pond and never satisfies
downstream demand. Those zero receipts do not prove the nonzero withdrawal or
wet-edit path. A separate 32², 120-second open/divert/dig and closed pair uses a
2-second gate opening and a 40-second excavation. Require >1 m³ already in the
pond at excavation and exact preservation of every cell volume at that edit;
require >1 m³ final pond and collected demand in the open case, positive paired
withdrawal receipts, zero pond stock in the closed case. Replay at 60 seconds
must remain exact. Deleting canonical SWE momenta from that checkpoint must
change a subsequent interval by >1e-6 m³ L1. This is a state discrimination test,
not a new long-horizon shortage/accuracy criterion. Original failed consequence
criteria remain failed. No timestep, refinement or physical parameter is tuned.
