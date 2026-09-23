# Numerical field domain binding

2026-09-08. Root's actual voxel-section consumer exposed a missing identity
component: equal-shaped fields in different world locations shared numerical
geometry identity. The correction extends only the existing `geometry` owner
with checked nonblank `domainId`, default `isolated-study`, included in its
canonical geometry identity. There is no simulation algorithm change or new
saved-field owner. Historical metric source remains frozen at a72a3a28….

New frozen consumer: `binding-checkpoint/solver.mjs`, SHA-256
`09176c849556cdb01d5b6a63eada6eef9514948fda48f5e225a222a4c865c8d5`.
Root's section compiler supplies the complete world/space/base identity and
origin/axis/window in that opaque ID; revision remains separately bound.

The one section qualification ran under `run-u2701.scope`, invocation
`2e0753c878974ae6b4ed7dcb94e6baf8`, observed normal exit0 in0.180 s internal
wall time. It proves actual generated air/solid mapping, negative-origin metric
centers, world-y/solver-z orientation, isolated carve/stale-state rejection,
foreign origin/axis/world rejection and exact same-domain continuation. It also
reproduces the old missing-domain admission using preserved metric bytes.

Full evidence and source pins are in
`../worldgen/section-proof/{REPORT.md,result-v1.json,source-snapshots/}`.
No metric/Taylor–Green suite or house run was repeated for this identity change.
No post-dig gas initialization, displacement, 3D solver or game runtime was added.
