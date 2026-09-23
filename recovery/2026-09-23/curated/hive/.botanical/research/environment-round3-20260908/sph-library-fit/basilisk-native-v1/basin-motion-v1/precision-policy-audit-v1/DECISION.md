# Keep the maintained solver; separate experimental tolerance from game precision

**Adoption decision:** retain Basilisk's existing C two-phase, conserving VOF and
reduced-gravity implementation as the water reference/candidate. The last stop is
not evidence that we need to invent another fluid solver or port equations to a
different language. Its 0.10045 microlitre drift is compatible with the finite
projection residual and native VOF compression term. It is far below meaningful
gameplay quantities. The original experiment nevertheless remains failed; no
test threshold, source, compiled byte or recorded result is changed by this audit.

This is a source/decision audit with arithmetic from already saved rows. There
was no compiler, fluid invocation, fine-grid completion or new benchmark.

## Exact source mechanism

The paths below are relative to the pinned `../../basilisk/src` directory.

1. `poisson.h:481–517`, `project`, forms a right-hand side `div(uf*)/dt`, solves
   the native variable-coefficient Poisson problem with tolerance `TOLERANCE/dt²`,
   then corrects every face by `-dt*alpha*grad(p)`.
2. `poisson.h:501–507` explicitly defines TOLERANCE as the maximum **fractional
   cell-volume change per timestep**, `|div(uf)|*dt`. It is dimensionless here.
   It is not a bound in cubic metres on cumulative total phase volume.
3. `poisson.h:354–390` computes the residual using the same conservative face
   gradient/difference stencil. For this fixed full-cell Cartesian case, after
   projection `div(uf) = dt*residual`, up to floating arithmetic.
4. `vof.h:278–286` updates f with both conservative face flux and
   `cc*(uf_right-uf_left)` compression. At `vof.h:332–339` the source explicitly
   qualifies exact multidimensional conservation by requiring an exactly
   non-divergent transport field.
5. `vof.h:355` sets `cc=(f>0.5)` before the directional sweeps. It retains that cc
   through the alternating sweeps at `vof.h:370–375`. On our closed, fixed grid,
   face fluxes telescope in the domain sum. Their remaining compression sum is
   proportional to the cc-weighted divergence, not the unweighted domain sum.

For this unit-depth 2D fixture, ignoring floating summation terms only:

```
Delta V_water = signed boundary volume flux
              + dt_advection * sum_cells(cc * V_cell * div(uf_transport))
              + any separately measured native clamp correction
```

Zero wall flux can make the **unweighted** total divergence cancel without making
the cc-weighted water contribution zero. Water can lose a minute amount while
air gains it. Native `NO_1D_COMPRESSION` is not a ready-made fix for this f law: its
conditionals affect associated tracer updates, while the f compression update
remains. No macro or kernel change is proposed.

The next VOF step uses the previous completed projected uf. Therefore the bound
for step 202 uses step 201's divergence and the next advection dt, not the final
step 202 projection residual. This timing distinction is respected below.

## What the saved numbers establish

At the final completed projection, recorded maximum divergence is
7.744167557655751e-8 /s; residual times its dt is
7.744167556665160e-8 /s. Across all captured rows, the largest difference between
those two measures is 5.15e-17 /s. That is direct evidence of the stated native
finite-residual relationship in this candidate.

The measured last-step water change is -6.01518834742e-13 m³/m. The conservative
full-domain bound `dt202 * 1.08 * maxAbsDiv201` is 6.09709786937e-11 m³/m. Summing
that bound over the captured history gives 1.37779757856e-8 m³/m, larger than the
observed cumulative 1.00454977670e-10 drift. The observed drift is thus entirely
compatible with this mechanism and the configured tolerance.

This is not an exact signed error closure: the saved records lack each pre-VOF
cc-weighted divergence integral and signed boundary flux ledger. We cannot prove
from maxima alone that this term accounts for every lost bit. All native clamp
amounts were measured as zero, however, and the loss already existed before the
force/clamp event. No hidden clamp correction or force-stage mass repair explains
it.

Practical size, for the fixture's one metre depth:

| Quantity | Actual drift magnitude |
|---|---:|
| Cubic metres | 1.00455e-10 |
| Litres | 1.00455e-7 |
| Millilitres | 0.000100455 |
| Microlitres | 0.100455 |
| Water mass | 0.100455 mg |
| Fraction of the initial 540 litres | 1.86028e-10 |
| Parts per billion | 0.186028 |

## Where our cutoff came from

I proposed the absolute `1e-10 m³ per metre` gate in
`../../../grid-alternative-fit-v1/SOURCE-FIT.md:198–203` for the original short
stationary basin discriminator, alongside a numerically identical but differently
dimensioned `TOLERANCE=1e-10`. It was an experimental engineering threshold.
`../PROPOSAL.md:129–131` carried that absolute gate into the longer moving wave.
The retained proposals distinguish proposed limits from rigorous accuracy bounds.

It was **not** a direct Levi requirement, a gameplay volume quantum or a bound
derived from the accumulated native projection error. Sharing the digits 1e-10
did not make the two controls equivalent. Keeping it fixed preserved an honest
experiment; promoting its failure into a verdict against mature fluid algorithms
would be a mistake. The prior large wave-energy defect was materially different;
the maintained reduced-gravity path substantially improved that early response.

## Recommended game-facing policy, for an explicit future contract

1. **Exact gameplay transfers remain exact.** Current `src/materials.ts:1016`
   preflights a positive integer portion and shared source/destination capacity;
   `drawPailWater`/`pourPailWater` at 1112/1134 use that owner. Current water units
   are game quantities, not an established SI conversion. Do not weaken these
   debit/credit, custody, retry or save laws because a continuous solver is
   approximate. The future SI amount per game unit must be defined explicitly.
2. **Give numerical transport a physical error budget.** Select an absolute floor
   and relative tolerance against a declared regional stock/throughput scale and
   simulated-time horizon. A defensible initial game-qualification proposal is
   `B = min(0.01*q, q/1e6 + 1e-6*Vscale)`, where q is the smallest meaningful
   gameplay water transfer in m³. This combines about one-part-per-million bulk
   accuracy with a ceiling below one percent of a gameplay transfer. The constants
   are proposed product engineering targets, not a retroactive scientific pass.
   For illustration only, q=1 litre and Vscale=540 litres gives B=0.541 ml; the
   actual game has not yet declared a one-litre unit. A 30-minute gameplay-loop
   window is a reasonable first qualification horizon; it proves nothing about
   unlimited operation or worlds not measured.
3. **Keep physical exchanges and numerical error distinct.** Account initial
   stock, explicit inflow/outflow, vessels, soil/gas phase exchange and deliberate
   sinks separately from the signed VOF compression/residual term, native clamp,
   remap and floating remainder. The latter are audit quantities, never spendable
   water or fictitious evaporation. Never silently top up f to make a report pass.
4. **One coupling owner commits one transfer amount.** Debit environmental water
   and credit the vessel through the same admitted operation, with one explicit
   unit conversion and any conversion remainder owned and persisted there. Do
   not round donor and receiver independently or create a second writable water
   inventory to conceal solver drift. Claims and rendering cannot create stock.
5. **Use the budget to select native accuracy deliberately.** With fixed full
   cells, the conservative contribution is bounded by
   `sum(dt_adv * Vcc * maxAbsDiv_transport)`; actual signed accounting is tighter.
   Native pressure tolerances should be chosen from that budget and measured
   cost, together with wave/force accuracy. Blindly reducing TOLERANCE or dt can
   waste compute and does not establish physical accuracy. A volume-budget miss
   is a reported numerical limit, not permission to invent water or discard
   elapsed authoritative time.
6. **Persistence cannot erase error history.** Preserve exchange receipts and
   cumulative signed/absolute numerical accounting across save/load and region
   eviction. A declared diagnostic window may roll; accumulated uncertainty
   cannot be reset or made spendable by reloading. Shape, pressure, momentum,
   boundary/edit and save consistency remain separate qualification questions.

The immediate adoption choice is to keep the maintained C implementation and
correct our precision contract before spending more time tightening an arbitrary
gate. No production fluid integration or new numerical packet is authorized by
this note. The original scientific failure stays unchanged and plainly labeled.
