# Finite inert thermodynamics — qualified first checkpoint

2026-09-08. This directory implements and qualifies one immutable finite chamber
quantity owner. It does **not** implement spatial low-Mach gas, finite-reservoir
exchange, oxygen, combustion, gas initialization, topology edits or digging.
All older solver, world and exported visual data remain unchanged.

## Evidence and source

The parent read and accepted the full first source shape before numerical work.
One source-read correction before the proof tightened definition admission:
overflowing `1 + R/cv` now rejects at definition construction, rather than waiting
until a chamber is created. No method or coefficient changed after this proof.

Ordinary guarded command from Hive:

```
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node .botanical/research/environment-round3-20260908/gas-heat/finite-thermo-v1/qualify.mjs
```

`run-u2916.scope`, invocation `b210b04fac5147b29fd69a785232e2d5`, terminal **exit 0**.
One numerical invocation, no failed/replaced run. Six groups, 108 assertions,
58 deliberate invalid-input/operation rejections passed. The scenario wrapper
counted 17 main operation calls; this excludes direct setup/codec/validation calls
and some direct operations, so it is not a complete invocation/work counter.

Measured **in-process** wall time 0.00988696 s, CPU 0.009901 s, final RSS 56,336,384 B.
These include qualification/setup/file operations after the timer starts, exclude
Node startup/imports, and are **not a throughput or gameplay-performance claim**.
The proof stayed below its 10 s budget and completed inside the retained tool call.

| File | SHA256 |
| --- | --- |
| `thermodynamics.mjs` | `b2a58ea2488b91c8ca49db32bff6e5bdf2734977cd89b14da198d0289cd6db4c` |
| `definitions.mjs` | `536a5cd870d3bed14ceda3b21a01110a0b32dcd24b19d93f556d7f5cfca13ff3` |
| `qualify.mjs` | `2e417a7ca1d07a61a9b5a1bc6056e395cd5d08467b93e4de2f4f1ae98a5d0e46` |
| `CONTRACT.md` | `04c94a20efa85d69b2e10706d0f87e8ffbb8eb4c00e7c71303052cb7457cb9ad` |
| `qualification-v1.json` | `a7c0328a5f1c29451ea6d8deac2aa9e9db92222f2d200df48240e2917e77048f` |
| `source-inventory.json` | `0b20f56b31676a23a0c82ecc8a6db9e71b322377eaeb40419f457d85c88c0e28` |

The real caller is `qualify.mjs`, not a browser or gameplay adapter. It imports
the actual quantity owner and data definition; no equation copy stands in for
an invoked operation. Analytic references use independently declared mole amounts
and degrees of freedom, and piston work additionally uses a converged pressure
integral.

## Physical checks and numerical results

One mole of inert air at 320 K and one mole of inert helium at 320 K produce the
same pressure at the same volume, with respective capacity ratios 1.4 and 5/3.
The two-mole mixture uses one mole of each: mass 0.032972602 kg, `C_v=4 R_u`,
`C_p=6 R_u`, and gamma 1.5. Mixture moles, density, pressure, `cp-cv=R_mix`,
temperature and `H=U+pV` agree with those independent expected quantities.

The principal mixture starts at 300 K, 0.05 m³ and 9,977.355141783888 J of internal
energy. Adding `4 R_u * 30` joules raises it to 330 K. The joule receipt exposes
an actual first-law floating residual of **−4.547473508864641e−13 J**.

Expanding that unheated mixture to 0.1 m³ has two different tested outcomes:

| Operation | Temperature | Work by gas | Mass/internal-energy behavior |
| --- | --- | --- | --- |
| Isolated free expansion to uniform final equilibrium | 300 K | 0 J | Species and U retained exactly; pressure halves |
| Reversible adiabatic piston | 212.13203435596427 K | 2,922.2996627220336 J | Species retained; U decreases by recorded work |

Piston `p V^gamma` relative error is **2.04e−16**. The independently integrated
pressure curve uses composite Simpson quadrature over the same 0.05→0.1 m³ path:
64/128/256 panels give 2,922.299683430077 / 2,922.299664017009 /
2,922.2996628029764 J. Successive differences shrink by approximately 16, verifying
the reference's expected fourth-order convergence before comparison. The finest
integral differs from the candidate's work by **8.0943e−8 J**, relative **2.77e−11**.
The piston out/back fixture returns U exactly and has zero net work for these
numbers; this is not a claim that arbitrary floating-point cycles are exact.

Heat additions commute for admitted intermediates. Heat and piston ordering do
not: the selected 500 J / 1.5× volume sequence differs by **91.75170953613633 J**,
within 5.97e−13 J of the independently expected difference. Discarding a returned
candidate leaves the input untouched. Applying the heat operation twice adds heat
twice. Free compression is rejected; there is no invented inverse for an
irreversible free expansion and no new retry/command subsystem.

A deliberately large-energy rounding case starts at 6.651570094522593e13 J. A
requested 0.123456789 J heat addition changes representable U by **0.125 J** and
records the **0.001543211 J** residual. This is below one U-scaled machine epsilon
but is not zero. A nonzero heat addition smaller than the representable U change
rejects explicitly. No clamping silently consumes a source.

The requested and stored joules are **not interchangeable**. This checkpoint is
an explicitly floating thermodynamic reference, not exact finite donor/receiver
conservation. Before joining a two-body transfer, its actual cell scales require
a declared representability/error policy or compensated quantity representation.
Widening a tolerance or treating the residual as an unexplained source/sink would
not close that requirement.

## Admission, ownership and persistence

- Definitions are copied and deeply frozen; modifying the caller's original
  definition after construction changes neither identity nor behavior.
- States and operation receipts are copied/frozen including nested species and
  before/after receipt facts. Attempted writes reject; original objects remain
  unchanged after discarded candidates and rejected operations.
- Invalid/zero/negative/nonfinite species mass, V and U, unknown or duplicate
  species, unresolvable derived pressure/capacity, invalid constants and unsupported
  energy convention reject. Absent species represent zero; empty vacuum does not
  enter this model.
- Cooling/heating and piston targets outside the explicit 200–600 K definition
  envelope reject. That interval and constant capacities are declared approximations,
  not real-air/helium accuracy certification or pressure-range qualification.
- Actual `chamber-state.json` and `definition.json` are written, read and decoded.
  A continued piston operation after reload is exactly equal to uninterrupted
  continuation. Definition order canonicalizes; changed constants at the **same
  version** and a changed version both reject old encoded states. Corrupt JSON,
  extra derived fields and duplicate species reject. No load rewrite or migration
  from Boussinesq is attempted.

## Source-focused Fallow disposition

Fallow 3.20.0 ran with this directory as root, `.fallowrc.json` declaring the real
`qualify.mjs` entry, `--no-cache --threads 1`, and stdout redirected to each retained
JSON report. No source or export was changed after this scan.

| Scope | Guarded run / invocation | Result |
| --- | --- | --- |
| Owner `thermodynamics.mjs` | u2917 / `ba11ca66c18b48f3ba7774491f26cb74` | exit 0; one unused export and four moderate estimated CRAP advisories |
| Definition `definitions.mjs` | u2918 / `60e626fb244d47aa9ebd69dad32d30ea` | exit 0; no target findings |
| Actual caller `qualify.mjs` | u2919 / `5ceb9a8d702a4d35af6ce42d8edca3e4` | exit 0; one moderate estimated CRAP advisory in the invalid-input group |

All three files are reachable from the declared proof entry. There are no detected
cycles, unresolved imports, duplication groups or security findings in these
reports. Syntactic dynamic-dispatch limitations remain; this is not a security or
formal correctness certification.

The unused `OWNER_VERSION` export is truthful public format metadata with no
external importer in this tiny caller. It remains an advisory; no valid export
or proof entry was deleted to make reachability green. The owner CRAP advisories
are `record`, `name`, `ownDefinition`, and `derive`; cyclomatic complexity is 5–6,
cognitive complexity 2–4, and body sizes 5–34 lines. The caller advisory is the
26-line invalid-input group, cyclomatic/cognitive 5. **All CRAP figures use
estimated absent coverage, not measured uncovered branches.** The actual numerical
proof exercises these paths, but no coverage percentage is claimed. Their
responsibilities are already separate; no forwarding wrappers or suppressions
were added to hide the estimates. Source/caller inspection found no blocker.

## Next physical boundary

The contract designs source-enthalpy exchange without implementing it. A finite
reservoir's temperature changes during discharge; simply moving a mass fraction
and the same fraction of U does not represent an open-control-volume enthalpy
stream. The next experiment must choose that process and its pressure/work/rate
conditions, conserve both finite reservoirs atomically, and independently qualify
the reference. Joining that result to spatial low-Mach divergence/pressure and
actual changed voxel volume remains subsequent work.
