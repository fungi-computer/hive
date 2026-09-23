# Reduced-gravity comparison stopped at the unchanged stock tolerance

**No moving-water or refinement qualification.** The one authorized packet stopped
on its coarse case at step 202. The original 1e-10 m³/m stock tolerance was crossed;
fine was not started after that native failure. No parameter, threshold, native
source or compiled byte was changed, and there was no retry.

- `run-u3386.scope`, invocation `aa2b090c5bdc4d8badaa39dd4d0aca3b`, terminal exit 1.
- Original combined native guard: 28 s; actual captured packet wall: 2.86920 s.
- Coarse native exit 1, not timeout, at velocity time 0.140560653355 s and nominal
  fraction time 0.140194667428 s; 2700 cells, 0.02 m spacing.
- Fine: not started; no period/late return/fine-grid result is claimed.
- Binary remains `b36aa5ceea5e791257369c137eed1abab29cfccc9205e375c499598c248a3b5f`.
- Raw receipt: `result-v1/native-result.json`, SHA256
  `f621ddd06083c788de87f26a986af46b58a5bfe63851f3792f8eca51e518ecad`.

## Actual failure and native cleanup

At step 201, water drift from its measured initial value was -9.98534588348e-11
m³/m and acceptance still passed. At step 202 it reached **-1.00454977670e-10**
m³/m. Water stock was 0.5399999998995509 m³/m and air stock was
0.5400000001004609 m³/m, so both original absolute 0.54-stock checks fail too.

This was **not** hidden native clipping: across all 203 initial/end records,
signed cleanup, absolute cleanup and cumulative cleanup amounts were exactly zero.
All pre- and post-force fractions were inside [0,1], and measured post-stock
equaled the independently accumulated expected post-clamp stock in every record.
The loss was already present in the pre-force stock. No attribution to an earlier
native update is established by this capture alone.

The pressure solve, clock, geometry, finite values, column/PLIC checks and wall
normal velocities passed through the final row. All wall-normal velocities were
recorded as zero. Final projection used six iterations with residual
0.000105798707 versus target 0.000186642797. The additional cleanup-accounted
balance fails the same volume limit because cleanup is zero; it does not excuse
or replace the original failed stock gate.

All 203 force records pair with their ordinary post-state record. Records decoded
without errors, stderr was empty, and there were no unpaired observations or
nonfinite values. `result-v1/force-accounting.json` retains each separate control.

## Motion over the captured interval only

| Metric | Reduced-gravity captured interval |
|---|---:|
| Signed fundamental time RMS / a | 0.000241157 |
| Maximum profile L2 / a | 0.003355294 |
| Maximum higher-mode residue L2 / a | 0.003354330 |
| Maximum staggered energy error / E0 | 0.000935899 |
| Maximum kinetic-energy error / E0 | 0.001072900 |
| Maximum PLIC potential-energy error / E0 | 0.000695896 |
| Last cell speed | 0.009535520 m/s |
| Last face speed | 0.008761922 m/s |
| Last K | 0.00457739609 J/m |
| Last PLIC PE | 0.00523084688 J/m |

These partial shape/energy errors are within the original coarse limits, but the
failed stock gate and incomplete interval prevent acceptance. There are no zero
crossings, completed period or return; the corrected comparator reports return
null and refinement ineligible/false.

An arithmetic comparison with the already frozen direct-gravity rows uses exactly
the same 203 recorded steps/times through 0.140194667428 s. On that shared early
interval, maximum profile error is 0.0456730 for direct gravity versus 0.00335529
for reduced gravity; maximum staggered energy error is 0.132266 versus 0.000935899
E0. This is evidence for a much better early response using the maintained force
mechanism. It is not a full-period comparison, a passing method or a reason to
relax the failed conservation tolerance.

## Physical pressure, coverage and cost

The actual pressure records use the reviewed reduced-to-physical transform with
an explicit q gauge. At the last row, physical support was 5303.752821953673 N/m,
actual weight 5303.756879015778 N/m, and vertical momentum
-0.00546013083701 kg m/s per metre. Bottom/top wall phase checks passed. These are
recorded dynamic quantities, not a new imposed support=Mg accuracy test. Mixed
pressure cells remain explicitly excluded from pointwise pressure extrema.

Coarse native terminal reports 2.72757 s including observation: projection
1.72448 s, VOF 0.524892 s and initial/end observer 0.0837707 s. These are nested
times; the pre-force diagnostic scan is included in total but outside the old
observer component timer, as disclosed in the compile checkpoint. Native-child
batch peak RSS was 19,200 KiB. One short failed shared-host fixture does not
establish production throughput.

`result-v1/qualification-summary.json` contains the compact scope, first failure,
exact force facts, captured metrics and shared-interval arithmetic. The original
direct-gravity source/failure and corrected reporting copy remain unchanged.
The compiled reduced candidate, runner, accounting reader and all failed output
are frozen pending root's next decision. No further physical work was started.
