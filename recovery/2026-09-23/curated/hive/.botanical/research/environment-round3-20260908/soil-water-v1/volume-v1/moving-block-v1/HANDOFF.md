# Moving nonlinear 3D soil handoff

The accepted fixed 3×3×3 infiltration packet passed on its first run: `run-u3307.scope`, invocation `abcc29df08ad4f8a8bcaede9f0e60228`, exit0, four groups/2,817 checks. Runtime owner bytes are unchanged from the preceding accepted graph result.

Read [RESULTS.md](RESULTS.md) for actual balances, movement, refinement, work and limits. The main evidence is [run-v1/proof.json](run-v1/proof.json); the directly useful physical timeline is [run-v1/dt3-cells.json](run-v1/dt3-cells.json), 201 frames and 27 cells. It labels pore void as vented capacity, not gas stock. Full face and nonlinear diagnostics remain alongside it.

The finest run used a real 28-unknown solve, 6,272-byte LU matrix, 317 Newton builds and 2,196,810 trailing matrix updates. The finite 1 kg pond emptied within the 339–342 s accepted interval; the centre gained 0.9949265 kg and measurable interior flow occurred on all three axes. Temporal profile differences approximately halved; this is self-refinement, not an independent continuum result. A moving file save at 300 s continued through fresh deterministic pressure reconstruction to the exact unsplit final state. All hard physical and workload limits held; no numerical retries occurred.

Proof SHA256 `c613f5f4f2cacdc5a2a2ae3989b3f6a854613f6cfcd2fa0d581b5f350f081479`; inventory `778aa3076da28bb9cd96fe92d71698ce1f7b555f990480f760c599d43ab7ed69`; dt3 recording `b1586592cccdcfe9d320364f340586de449fdbe8eaa7786cd4a7ff3dc918b27b`. All live/frozen source hashes match. This caller's pinned fixture is `6106b741b9253cd62a2ea07d322928192ade162961623792060dc4926e7c8884`; qualifier is `8ac051da6bb0b52f06cb235a5dcfa7d9eaab512992910e574d669790bbb92ee2`.

Root retains the next shared-owner/geometry-refactor or excavation decision. No extra physical packet, production port, gas/free-water join or world mutation is started. Existing Fallow geometry debt remains explicitly retained; the two new caller files add only four static estimated/no-coverage health advisories and no cognitive hotspot.
