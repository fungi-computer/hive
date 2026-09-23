# Unapplied reporting-only comparator correction

`reporting-only.patch` changes only interval eligibility and labels. The copied
candidate `source/compare-wave.mjs` is intended for the original comparator's
location and relative oracle import; it is not installed and has not been executed.
The original comparator, frozen comparison JSON and native sources/results remain
unchanged. No numerical thresholds or arithmetic metrics are altered.

- Refinement requires both native completed intervals and matching nominal start/end
  times. Otherwise `eligible:false`, `passed:false` and an explicit incomplete or
  unmatched status are emitted.
- Returned-amplitude acceptance requires a completed interval/terminal. Partial
  last-row error is retained under `lastRecordedAmplitudeError`, while
  `returnAmplitudeError` is null until eligible.
- Every case reports coverage; the other observed metric flags explicitly describe
  only that captured interval. Overall case acceptance still requires all original
  native controls, including completion.

`source-pins.json` binds the original comparator, proposed source and exact patch.
Parent review precedes applying or executing this reporting candidate. No solver
invocation is part of this correction.

Parser-only `node --check source/compare-wave.mjs` completed under
`run-u3334.scope` / `de7723390b2f4a0eadd88731fd70d7e2`, exit 0. It did not import the
oracle, compare data or invoke any fluid process.
