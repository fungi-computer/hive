# Reporting correction executed against the existing capture

Parent approved the separate reporting copy after its source review. The historical
`REPORTING.md` and its source-only pins remain intact. The copy now has the exact
qualified oracle at `source/oracle/oracle.mjs`; the original comparator and raw
physical result remain untouched.

The one `run-proof.sh python3 run-reporting.py` call was `run-u3341.scope`, invocation
`40eef50f2db04e9fafa3f27ef1e03c98`, **exit 1 as expected**. Reporting wall was 0.23634 s.
All six reporting controls passed: failed overall physical result retained,
refinement ineligible/false, fine return null/false, incomplete fine coverage
explicit, empty stderr, and exact unchanged raw-input hash.

Output is `result/comparison.json`, SHA256
`bbfdc0648789e94b9b679dd2410e54d3fd7bed904a2a70b4399fde4645c0fb23`.
The raw input remains `0e1e60df0db21cdfe3a0d1e0f21673163ce7aa4fc1628415f697525e7c60b3a4`.
Source remains the reviewed candidate
`e6e1fe204b72af072d6f15a62a80980cb1258517c31cdfb3e925cd04d050f2f8`.
`result/receipt.json` and stdout/stderr preserve the exact call and controls.

This corrects false partial-interval labels. It does not alter numerical values,
thresholds, physical acceptance or create a fluid rerun.
