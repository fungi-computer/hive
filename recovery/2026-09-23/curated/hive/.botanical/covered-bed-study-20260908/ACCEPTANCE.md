# Covered-bed original-art acceptance — 2026-09-08

**Accepted by Astra for the settled-use appearance only.** I authored the geometry and personally inspected `render-v1/native.png` and the complete `render-v2/native.png`: Rowan and Sedge, both bed directions, native 1× and the current default desktop 2×, plus all eight authored breathing phases. The shaped quilt and exposed heads/hair keep the cozy sleeping read. This supersedes the rejected whole-body lift and diagnostic mesh-index partition; neither enters production.

Original accepted heads are reused with closed eyes for this presentation. Sedge's sleeping hair remains visible, with no hat on the pillow. Hidden body/limbs are not drawn through the cover. `bed.js` provides explicitly named back/cover construction; no mesh-index inference. All three baked parts share the existing 112×112 prop camera, targetY1.1 and its projected origin anchor. Bed direction owns facing. Physical contact, position and exit remain game-owned.

## Exact evidence

- `run-u1819.scope`, invocation `5e67076d639f488fa1ce5d1491135de5`, native `66698`, terminal exit0: initial appearance, six empty-bed stage/direction images byte-equal to the existing builder, sixteen representative existing-pose images byte-equal, four composed rows, eight physical pointer selections distinguishing occupant and bedding, animation advance and pause, errors[].
- `run-u1824.scope`, invocation `ffba8eff16b14a30b4694351404f182f`, native `45135`, terminal exit0: same art with all eight motion phases exported and their alpha bounds checked. Each direction has five distinct cover images across its eight symmetric phases. Empty and existing-pose comparisons, pointer checks and pause pass again. This was the bounded missing motion export, not a full gameplay rerun.
- `render-v2/proof.json` contains exact source hashes before/after, bounds, parity hashes and physical-click results. `bed.js` SHA256 `3080be2ba98eaa27c71870e2cd3cddfeb70e57049bc4b98a690bcc470581bc7f`; `figures.candidate.js` SHA256 `eceba055282fc601b9bf5dc74b65db7ae1ff7b440cdf405c2985e73938c0667f`. Existing tracked figures remained `f6e9743dad6aec1b166e6482d775d5e0a83583c84ed1ce5a3914af6014fac0f1` and home `2ec1527ff1c167aaa948a16efc33cbcba15fd1621ce59495d1674e89479b3378`.

All sessions are terminal. No tracked art, runtime, build, Git or deployment changed. This is not live bed contact, entry/exit animation, shadow/label layout, debug-overlay correctness or hosted gameplay proof.

## Next caller handoff

Hold these accepted source assets here until the coupled bed/contact slice is ready; current goods/storage/brewing does not wait. The eventual patch should move the named bed builder into its art module and reuse it from `home.js`, plus add the covered-sleeper presentation to the existing figure authoring owner. Do not ship the entire copied study figure file or duplicate the bed's geometry in two production builders. The actual bake hookup and composed view caller are part of that serial handoff; no new art approval is needed for unchanged accepted geometry.

The independent source reader and my immediate-caller read found specific integration obligations. `view.js:449` unconditionally writes each actor display while `construction-view.js:162` separately writes the bed: one reconciliation must choose ordinary versus contact presentation before those branches. Preserve actor/site identities and separate visible part masks. Reparenting the full existing actor container would also move its floor shadow/ring/progress, while its label is separately stage-owned. Contact exit cannot leave a second body or a stale target.

`visual-hit-geometry.js:158` binds one texture and target per display. Its current debug layer copies local transforms and checks local visibility at lines193–222, so nested contact parts require hierarchy-aware transform/visibility handling through that owner. The standalone study exercises actual Pixi pointer input with the existing silhouette primitive; it does not prove that full debug owner correction.

Settled contact rendering derives provider/slot/phase. `sleep` mode alone cannot describe an occupant waiting to exit after Draft. Movement remains the sole owner of interpolated position/path/leg; entry/exit visual transitions are still to be authored and reviewed. The composed bed still needs its real support-before-body and foreground-object ordering. Stair-rail and cat-on-furniture interleavings remain separate consumers.
