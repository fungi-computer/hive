# Sedge hydration diagnosis

`run-u3609.scope` ran `trace-sedge-hydration.mjs` through the mandated proof
wrapper against the current real libcolony Wasm. It reproduced the missing
Sedge hydration outcome through tick 1126: the operation was retained at
`phase: "pour"` with water in the operation pail while Sedge walked between
the spring access cells and no outcome was recorded.

The retained initial JSON trace was too verbose because it recorded the decay
value at every tick and retained mutable task/operation references. The script
now snapshots those fields and records only transition changes. It was not
rerun, preserving the requested single diagnostic execution.
