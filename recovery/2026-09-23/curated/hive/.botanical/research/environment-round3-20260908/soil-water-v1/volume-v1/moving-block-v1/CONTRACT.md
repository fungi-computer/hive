# Moving nonlinear layered soil block — fixed source contract

New caller/recording only, 2026-09-08. Root accepted this fixture direction. Import the exact already-proved `../volume.mjs` owner and its unchanged graph/Newton/LU/closure/retention dependencies. Do not refactor, change a tolerance, add a boundary law or edit the frozen `volume-v1/run-v1` packet. No execution before root reads the complete caller.

## Geometry and finite stock

Twenty-seven soil voxels: x,z=-1..1; y=-3..-1, in the actual `[1,.54,1]` metre metric. The block is 3×1.62×3 m. Middle layer y=-2 uses the existing synthetic reference retention with only Ks changed to 1e-6 m/s; upper/lower Ks=1e-4 m/s. These are test coefficients, not soil calibration.

One top-centre exterior face `(0,-1,0),y+` connects a finite pond of area 1 m², initially exactly 1 kg (depth .001 m). All other exterior faces are closed, with no source, seepage drain or soil label creating water. The pond has one port and may become empty under the accepted wet/dry law.

Initial soil water comes from the explicit canonical hydrostatic total head H=-1.6 m. At the top/middle/bottom centres the heads are -1.33, -.79, -.25 m: every soil cell is unsaturated and inside the unchanged finite head envelope. Head is only a fixture recipe for computing finite initial M; the saved state still owns only M. Ks changes do not alter hydrostatic equilibrium. Adding the localized finite pond breaks that rest through one real face. No gas/free-water owner is implied; the accepted isothermal vented-soil assumptions remain.

## Fixed numerical packet and acceptance before execution

Run 600 s at maximum timesteps 12, 6, 3 s: 50, 100, 200 nominal steps. Keep all existing hard caps: 512 accepted steps, 72 unknowns, 30 million completed trailing matrix updates and 250000 residual calls per request. The fixture has 28 unknowns; an actual LU matrix must therefore be 6272 bytes. No hidden coefficient floor or reduced strict mass law is introduced. Named nonlinear retries remain permitted by the unchanged owner and must be reported; this packet must not silently enlarge limits if retries use them up.

Each run must satisfy all actual per-step mixed, constitutive, Darcy, paired, total, root-compatibility, chord and complementarity laws from the accepted owner. The caller independently reconstructs paired stock from the recorded one-face ledger at every accepted step, rather than treating success as proof. All pores and the finite pond remain inside strict bounds. A face is present only for a neighbouring soil cell or the one explicit pond port; recorded closed exterior faces participate in no ledger. Every exterior face is explicitly accounted for as closed or that single port.

The run must finish with the finite pond empty and the central upper cell having gained at least .1 kg. This is a declared first fixture expectation, not a pre-existing measurement; if 600 s is insufficient the packet fails and its actual state is preserved without changing the horizon automatically. Real interior cumulative absolute transfers must exceed 1e-5 kg independently on x, y and z. Boundary infiltration alone cannot satisfy the vertical criterion. Actual LU work and nonzero Newton iterations must demonstrate a genuinely moving connected block.

The physical geometry and initial state are invariant under x reflection, z reflection and x/z exchange. Every accepted soil mass must respect those symmetries within 2e-7 kg. This tolerance is stated before execution and accommodates bounded floating closure, not a physical asymmetric source. Record the actual maximum and its time, rather than rounding away discrepancies.

For time refinement use the soil theta profile at 600 s. Let E12/6=max|theta12-theta6| and E6/3=max|theta6-theta3|. Require E6/3 <=.8*E12/6+1e-11. This is time self-convergence of the same nonlinear owner at a fixed coarse physical mesh, not an independent continuum/mesh-convergence result. Exact pond exhaustion times are not claimed: record the first accepted dry endpoint per run and its bracket.

On the dt3 path, run separately to 300 s, save an actual file, construct a fresh owner and decode, then continue 300 s to 600 s. Require byte-identical final canonical state against the unsplit dt3 run. Require the saved state to have a meaningful nonzero interior face transfer in its last accepted step (>1e-7 kg), so this checks a moving restart rather than another hydrostatic save. No unsaved pressure warm start is allowed.

## Recording and failure boundary

Before any numerical group, copy/hash this caller, fixture, contract and every imported accepted dependency. Persist each completed run with full receipts/work and a cell-oriented recording: stable node IDs, voxel and metre positions, definition IDs, initial mass/theta, each accepted mass/theta, pore air, and actual incident face-transfer summaries. The recordings are for later Delivery visualization; this task does not add a webpage or normalize small changes into fake large water stocks.

The recorded `poreAirM3` means available vented pore void capacity. It is not a finite gas mass or a conserved gas inventory; the gas owner has not been joined here.

Persist performance window scope, all residual and symmetry maxima, per-axis interior transport, pond-dry bracket and closure diagnostics. Whole-process CPU/RSS includes recording/comparison work and cannot be advertised as solver-only speed. The existing `compileFaces` Fallow cognitive46 debt remains unchanged and disclosed.

Use one fresh output directory, shared `run-proof.sh` and 30-second inner guard after source review. Stop on the first physical/caller failure, preserving exact pins and uncommitted solver diagnostics. No automatic rerun or fixture search. No excavation, atmosphere, world terrain, production or scalable-world claim.
