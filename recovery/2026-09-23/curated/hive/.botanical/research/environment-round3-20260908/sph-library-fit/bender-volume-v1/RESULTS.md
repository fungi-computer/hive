# Bender static packet v1: first failure retained

The fixed packet ran exactly once under the shared proof guard:

- Unit `run-u3090.scope`.
- Invocation `99ae7c2c684e42c4bffc3632902617cd`.
- Wrapper terminal exit1; native exit-6 (SIGABRT).
- Native execution/capture/parse1.494195629 seconds; maximum child RSS22012KiB.
- Native28s ceiling was not reached. No retry, refinement or dynamic step ran.

The first exception was:

```
negative interpolated effective volume
```

It arose in `MapInput::build` while preflighting the first/coarse map after its
distance and volume fields were constructed. The preflight rejects `v<0` for
each fixed query. It ran before any reported query, contact observation or
second map. The actual maintained contact routine therefore has **not been
tested by this run**. Empty stdout, exact stderr, source/binary/recipe hashes
and initial particle CSV are retained under `result-v1/`.

The exact initial600-particle positions, IDs, masses and volumes match the
previous physical fixture's CSV fluid rows byte-for-byte. This was not a
different density, radius, wall geometry or water inventory. The original
compile-only failure and corrected compile are also retained; compilation
success did not establish map correctness.

## What this establishes

At least one first-grid query produced a negative interpolation result after
the actual native volume-authoring leaf had supplied a nonnegative integral
at the required map nodes. Cubic interpolation is not positivity-preserving;
negative interpolation weights are a plausible cause. That causal diagnosis
still needs the actual query, coefficients and shape-function values, which
this exception did not record.

The exception is an **instrumentation limit as well as a failed positivity
check**: it omitted the query coordinates, mapped signed distance, effective
volume magnitude and required coefficients. We cannot honestly identify the
location or severity, distinguish roundoff from appreciable undershoot, or
attribute it to physical-model error from this output alone.

The actual maintained consumer accepts a volume only in the branch
`0 < mappedDistance < supportRadius`, then only when volume is positive. A
negative interpolated volume at a bulk/out-of-support query could therefore
be unused by the contact caller. This harness currently applies its positivity
preflight to all fixed queries. Whether this failure concerns that unused
region or an active physical boundary remains unknown. Do not label it a
failed Bender pressure solve or excuse it as harmless without measurement.

## Not measured

- Fine-grid SDF/volume errors and rule30/rule50 sensitivity.
- Native boundary density or gradient operator versus the physical solid union.
- Contact displacement, momentum, kinetic or potential-energy changes.
- Positive-distance no-motion and temporary-probe restoration laws.
- Map authoring versus contact-call cost; only whole failed-process timing exists.

The previous Akinci physical failure and qualified cold oracle remain unchanged.
This run does not strengthen or weaken the separate stable-order restart claim.
No dynamic hydrostatic acceptance criterion has been relaxed.

## Smallest next investigation proposed, not executed

First preserve this complete v1 result. Add structured preflight observations:
query name/coordinates, actual mapped distance, interpolated volume, required
coefficient range and interpolation-weight range. Record whether the real
caller would enter its positive-distance volume branch. Assert coefficient
presence/finite values separately from interpolation positivity.

Keep the original negative-volume check as a recorded failed control. Instead
of throwing before diagnostics, a proposed follow-up could retain that failure
flag and finish the **same fixed** two-grid packet, allowing the actual linked
consumer to show its unchanged reject/zero behavior. Do not clamp coefficients,
move walls, substitute direct SDF into the native leaf, tune thresholds or
silently remove the failed criterion to produce exit0. This is a proposed
observability correction requiring the CTO's next instruction, not an already
executed second run or a new numerical method.
