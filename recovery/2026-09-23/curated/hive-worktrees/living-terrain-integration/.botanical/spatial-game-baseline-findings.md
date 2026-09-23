# Actual clearing browser baseline — 2026-09-20

Source worktree: living-terrain-integration. Existing production build at localhost:5197, not source dev fixture. Proof script spatial-game-baseline-proof.mjs; final receipt run-u2567, invocation 65d3f316c22341c5bdffca044edcca43, exit0. All source remained read-only. Results JSON and initial PNG beside this document.

## Observed

- Actual clearing loads original art. Initial screenshot shows dense grass and raised-ground diagonal bands. No pageerrors across completed sequence.
- Initial diagnostics can report only8 records before terrain arrives; final steady scene11127. A records>0 readiness test is insufficient.
- Pause is async: wait until Resume button appears before asserting frozen state.
- UI in this production build has no Select Rowan/Sedge shortcut buttons. Clicking526,514 at1440x1000 selects Guest; no worker movement proof was achieved.
- Build menu exact labels: Build bed, Build wall, stair north. Bed costs2wood/3s; wall4wood/4s; stairs6wood/6s. Starter store48wood. Real construction must complete; placement plan alone is not finished-art proof.
- Four Rotate camera right actions execute. Rotation can temporarily leave8 records while residency rebuilds. Need wait for complete camera generation before pixel proof.
- Toggle cutaway then Lower voxel layer changes14→13. Higher voxel layer/PageUp restores. PageDown lowers.
- Canvas focus,36ArrowRight,36ArrowLeft pans864px away/back. Back record count11127. This run stayed at layer13, so do not claim initial/back identical view.
- Old ordering counters since fourth camera rotation: staticRebuild22,staticRebuildMs6182,applyOrder22,applyOrderMs1977.8 after pan-back. Individual static rebuild roughly150–350ms on software Chromium. This is not device FPS; shared host also ran an art export. Dynamic insert samples generally much smaller.
- One repeated screenshot timed out under software rendering; final proof only captures initial screenshot and records all subsequent UI/diagnostics states. It does not visually certify all rotations/cuts.

## Practical final integration proof

1. Load real clearing with diagnostics. Await ready, correct camera generation, no pending residency, stable frame revision. Pause via UI and wait Resume.
2. Capture subjects, their projected feet, camera pan/zoom/turn, current level/cutaway, complete ordered primitive IDs, primitive counts separate from batch counts, terrain cover states and residency status.
3. Build via real UI/Whistle commands at real admitted terrain cells: bed, wall, stair. Resume and await construction phase finished. Store48wood should cover these. Pause again. Never inject a visual-only fixture into runtime.
4. Select actual worker via read-only diagnostics projected position plus real canvas click; assert selected ID. Right-click a picked visible terrain destination and resume; await real pose movement around both sides/ends of bed and walls. Stairs need actual supported traversal rather than an arbitrary actorAt pose.
5. In each of4camera views, compare rendered opaque-overlap samples against independent world separation/contact expectations. Check actual scene picking yields frontmost visible object; do not use sorter output as oracle.
6. Capture stable paused image/order/state. Pan864px away, wait residency; change cut layer away/back, restore level and cutaway, pan back, wait current-generation completion. Compare identity/order and affected pixels, allowing only declared cosmetic animation. Check residency does not remove simulation state.
7. Exercise available cover mutation through canonical owner; preserve full/short per-cell state and four-cell masks. No existing colony mow command was found: do not claim a rendered checkbox proves mowing gameplay.
8. Compare renderer costs independently: retained static rebuild counts, dynamic relation work, ordered-list apply costs, Pixi batch counts and memory. Prove stationary paused frames do not rebuild; pan within retained geometry should not recompile unchanged primitives unnecessarily.
9. Build, publish actual clearing through confirmed Cloudflare tunnel and repeat short public URL load/control/parity proof. Keep preview server alive via retained process handle; detached nohup was killed by tool lifecycle in baseline attempts.
