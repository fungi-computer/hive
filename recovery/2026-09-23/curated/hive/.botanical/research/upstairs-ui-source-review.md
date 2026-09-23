# Upstairs UI source review

Read-only review of the settled upstairs UI diff and immediate callers. The
source blockers from the first pass are resolved or reclassified:

- **Depth finding reclassified — browser obligation, not blocker.**
  `depthKey` in `src/view.js:19-27` includes `(at.level * 0.35)`. Therefore
  `src/view.js:403` gives an upper actor `0.35 + 0.45 = 0.80`, while
  `src/construction-view.js:141-145` gives an upper floor `0.35 + 0.20 =
  0.55`; the source ordering lower actor < upper floor < upper actor is
  correct, while the lower foreground tree remains later. Browser proof should
  still place all three at one footprint and inspect the visual result.

- **Cutaway finding resolved.** The upstairs cutaway now derives interiors
  per level, so the prior ground-only `indoors(state)` concern is closed.
  Browser proof should still show selected-upper cutaway with an upper actor and
  a blocking wall.

No additional source blocker found in this pass: level/tool ownership and
level-change tool retention are typed through the XState machine; camera
projection/inverse share STOREY_HEIGHT and selected level; floor drag and stair
single-anchor footprint are routed through construction footprint/placement;
finished-site hit ownership, actor/herb/bundle/site labels, stair interpolation,
and Chop/box/right-click/Draft-Go/persistent-tool paths remain wired. Browser
proof is still required for inverse-pick parity, three-cell ghost coherence,
occlusion, labels, and preserved gestures.
