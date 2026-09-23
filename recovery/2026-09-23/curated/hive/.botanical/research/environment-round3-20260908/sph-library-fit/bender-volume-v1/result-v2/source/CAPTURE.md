# v2 capture correction, source only

v1 remains byte-for-byte frozen, including its top-level source files, failed
result and HANDOFF inventory. This separate source-v2 directory changes only
static observations and evidence paths. No second numerical packet has run.

The original `v < 0` control now increments a failed-control count instead of
throwing before query observations. Final `numericalControls` and `pass` remain
false if any fixed query violates it. It is not clamped, remapped or excused
because the consumer ignores it.

The same native volume leaf receives the same mesh/SDF, integration radius,
quadrature and interpolation-node set. Its returned coefficients are copied
into a study-only key/value table for range observations; those copies never
feed the map, interpolation or native contact method. This adds diagnostic
allocation/time, which is not a change in solver cost or a performance result.

Each query reports the actual interpolated volume, analytic and mapped distance,
coefficient and interpolation-weight ranges, failed/nonfailed positivity, the
native accepted/ignored branch and the existing complete contact state/impulse
observations. Geometry, mass, thresholds, both grids, all18 probes, native leaf,
contact-call source, independent oracle and numerical28s timeout are unchanged.

The runner writes only result-v2, includes the v1 failure hash and snapshots this
new source/binary. The compile recipe still uses the same frozen libraries;
only its relative path changes because this is a nested source directory.
No dynamics, hidden retry, library build or boundary-method substitution exists.
