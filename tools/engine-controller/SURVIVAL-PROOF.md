# Survival second-pack controller witness

Survival is the second existing pack on the same public engine host. The
controller is a consumer module over `/v1/survival`; it does not add a game,
host route, state owner or Survival-specific transfer implementation. Its grant
is fixed to `survival-player`, its observation contains only the Survival pack's
projected hunger, wellbeing and bread facts, and its command schema admits only
`takeFood` and `eatFood`. The existing pack applies native transfer, consumption
and hunger behavior. The Region owns command identity, committed results and
restart recovery.

The module uses `createRegionControllerModule` and the same
`runtime.mts` path as Pirates and Quarry: Botanical's actual Mycelium module,
lease and `execute` capability over Code Mode, with no guest outbound network.
The outer worker holds the public game credential and selects the endpoint;
guest code cannot choose the pack, principal, actor, token, command name outside
the grant, or physical clock.

Run from the repository root under the ordinary proof guard:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node tools/engine-controller/survival-proof.mjs .botanical/survival-controller-proof
```

The proof bundles the unchanged public engine worker and its native WASM, then
runs a persistent local workerd SQLite Region. It is designed to reject an
unauthorized execute caller and an ungranted command, observe the eight-unit
starting lot, transfer one bread to the survivor, lose the execute response,
restart and retry the same receipt, consume that bread, and recover the terminal
seven-unit state and identical receipts after another restart. It records source
and WASM identities. A fresh output directory is required for each build.

## Evidence and limits

In this owner worktree, the focused TypeScript check passed. The local workerd
proof could not run because the isolated base commit has neither ignored
`engine/generated/hive_kernel.js` nor `engine/generated/hive_kernel_bg.wasm`.
The controller proof deliberately builds the actual public worker and reads its
WASM; replacing those with a fake kernel would not prove second-pack reuse or DO
recovery. No package install or Rust build was performed in this lane, and no
proof result is claimed for Survival here. The earlier sprint checkpoint's
Pirates result remains evidence for Pirates on its recorded source/WASM hashes;
it does not qualify this Survival controller.

This is an execution-capability witness, not a full Shiitake model/session run.
The maintained integration seam exists: Hive supplies a scoped
`ModuleRegistration`, and Shiitake's maintained run scope adds instruction
modules to its Mycelium runtime and exposes that lease's `executeTool` to the
model. The missing joined capability for a full-session claim is a live
Shiitake accepted run configured with this Hive controller module, the
corresponding provider/model, and a recorded accepted command/result. No such
provider-backed run was available or invoked in this lane. Hosted parity is
also unproved.
