# Hive kernel

This is the headless Rust/WASM foundation for Hive hosts. It uses Bevy ECS for
all authoritative entity state (`ExternalId`, `PhysicalPosition`,
`MaterialInventory`, and `AuthoredComponents`), but only stable string IDs and current-format snapshots cross
the host boundary. Runtime game components are versioned data schemas and are
written in batches. Movement and material transfer/consumption remain
engine-owned operations; game component writes cannot mutate them.

The initial TS/host ABI is batched records: entity IDs are strings; positions
are finite `f64` x/y/z values; authored values are number, boolean, string,
entity ID, null, or entity ID array. `assign::optimize` ports the libcolony assignment contract: only finite legal
edges are considered, matching maximizes cardinality, then minimizes cost, and
stable external IDs resolve equal-cost choices. Exceeding `max_edges` returns a
bounded failure instead of silently dropping candidates. The upstream algorithm and attribution remain in
`vendor/libcolony/` under the MIT license.

The snapshot format is version 1. Unsupported versions must be rejected by the
host. Snapshot data is sorted by stable ID and component/material key so a host
can hash and durably commit it. Bevy handles are intentionally not serialized.
