# Official archive versus reviewed snapshot

The complete official archive is SHA256
`a629017cabad6626d71c782510f1d70b078eae44cc1c594c3e6b6fbb808164ae`,
9,617,283 compressed bytes, retrieved 2026-09-08 from the official URL. Its
HTTP Last-Modified is 2026-08-28 12:21:13 GMT. It is an archive identity, not an
invented darcs commit. All 1,891 archive entries were validated before extraction:
one basilisk/ root, no absolute/traversal/device entries, and links resolving
inside that root. Python's tar data filter was also applied.

Of the 53 real source bodies in the earlier read snapshot, 52 match exactly.
All reviewed solver, VOF, pressure, boundary, event, dump, compiler/parser,
immediate test, INSTALL and COPYING files are identical.

Only Makefile.defs differs: the newer online read snapshot exports PYTHON_PLOT
and uses it in two plot recipes, while this archive invokes python directly.
Those plot rules are outside the qcc-only build and the headless basin caller.
The numerical source decision is unchanged. Exact hashes are recorded in
read-snapshot-comparison.json; no source was substituted from the online copy.

For the isolated build, config is a copy of the archive's config.gcc. Empty
Makefile.tests/Makefile.deps are explicitly generated build metadata so qcc-only
compilation does not expand documentation/test dependencies. The build invokes
only ast/libast.a followed by qcc, with at most two compile jobs and no test,
viewer, GPU, MPI, package-install or shell-startup work.
