# Pinned upstream source inspection

Source commit: 867b2147fc0e8bfa28e873d576c5e4b186ec3b2f (libcolony v1.0.0).
Files were fetched from raw.githubusercontent.com at that exact commit into
this ignored directory; the original algorithm, Embind bridge and JS post-wrapper
were not edited. The successful smaller rebuild is documented in
../libcolony-rebuild/README.md.

- Makefile line 7 sets INITIAL_MEMORY=327680000 and TOTAL_STACK=160000000.
  The measured 327,680,000-byte release buffer therefore directly matches its
  explicit total linear-memory build setting. It includes stack and heap;
  its length is not a measurement of live application heap consumption.
- src/colony.h line 59 explicitly calls the solver Hungarian, O(n^3).
  Optimize starts at line 195, constructs a dense double value[NX][NY] matrix
  at line 218, keeps linear auxiliary arrays at lines 236-243 and 289, and
  uses labels/slack and alternating paths to augment the matching.
- src/colony_js_post.js lines 40-48 compact character/task strings to integer
  indices for the actual bridge. Line 52 invokes C_Optimize; no alternate
  optimizer is involved.
- src/colony_js.cc line 30 binds C_Optimize directly to colony::Optimize.

For five people and 100 distinct candidate tasks, the matrix itself is
8 × 5 × 100 = 4,000 bytes. Stack use also includes linear arrays and call frames;
the assignment vector, bindings and runtime need additional memory. This is not
a claim that a whole optimizer instance needs only 4 KB. Matrix dimensions and
offered edges must stay bounded as the game grows.

Smaller stack and linear-memory settings need no algorithm change for the
bounded workload tested. Reducing INITIAL_MEMORY alone while retaining the
160,000,000-byte stack would not be the appropriate rebuild.

Primary source links (GitHub line numbers match the files on disk):

- https://github.com/mafik/libcolony/blob/867b2147fc0e8bfa28e873d576c5e4b186ec3b2f/Makefile#L7
- https://github.com/mafik/libcolony/blob/867b2147fc0e8bfa28e873d576c5e4b186ec3b2f/src/colony.h#L59
- https://github.com/mafik/libcolony/blob/867b2147fc0e8bfa28e873d576c5e4b186ec3b2f/src/colony.h#L195
- https://github.com/mafik/libcolony/blob/867b2147fc0e8bfa28e873d576c5e4b186ec3b2f/src/colony.h#L218
- https://github.com/mafik/libcolony/blob/867b2147fc0e8bfa28e873d576c5e4b186ec3b2f/src/colony_js_post.js#L40
- https://github.com/mafik/libcolony/blob/867b2147fc0e8bfa28e873d576c5e4b186ec3b2f/src/colony_js.cc#L30
