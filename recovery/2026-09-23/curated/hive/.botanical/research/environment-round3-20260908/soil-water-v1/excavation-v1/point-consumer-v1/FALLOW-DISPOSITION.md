# Scoped static check before the packet

Run-u3470 / `12393b4d3eb84afc87883318ceee56a4` exited 0 after all four module
syntax checks and Fallow over these four source files, with `qualify.mjs` as
entry. No numerical execution was part of that command. The actual report is
`fallow.json`; missing local node_modules warning is retained, no install made.

Zero dead files/exports, cycles or clones. Five inherited health findings:
`validateExcavationHistory`, `validateLedger`, `validate`, the fixed fixture and
`pitContacts`. The last retains cognitive 19; the others exceed estimated CRAP
without imported coverage. The new qualifier has no health finding. These
scores are not a claim that the existing physical tests provide no coverage.

No new source blocker was found. This narrow point-consumer revision intentionally
does not combine the demonstrated query fix with contact/validator restructuring.
The prior accepted solver's compileFaces/darcyFaces debts remain outside this
four-file scan; they were not removed by reducing the scan boundary. Existing
recorded acceptance and later decomposition obligations remain intact.
