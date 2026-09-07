# libcolony v1.0.0

Upstream: https://github.com/mafik/libcolony
Tag commit: 867b2147fc0e8bfa28e873d576c5e4b186ec3b2f
Release: https://github.com/mafik/libcolony/releases/download/v1.0.0/colony_js.zip
License: MIT, included verbatim. `colony.js` and `colony.wasm` are unmodified
release bytes. Demo HTML and demo sprites are not shipped.

SHA-256:

- release zip: 7caea3e8428b4e8d4f8695014b4a111686b8406d5c59344f17b74add5e7d504e
- colony.js: 2f31c9b940595268842c30eb02a5249227b4c3c93467c5f19d23d438b75c5fd6
- colony.wasm: 08a46ee9b5c6135ae165bdd4f5983a8ce28ad70d6da63cac0a53e79067077ef1

The browser loader sets `Module.onRuntimeInitialized` before loading the classic
script. The game uses `compute_cost({travel_time, work_time, priority})` and
`optimize([{character, task, cost}])`. Assignment keys are application-owned IDs.
The optimizer returns selected assignments; game state owns movement and work.
