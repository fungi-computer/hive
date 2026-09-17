# Mixed voxel draw review

Local route: `/engine/mixed-render-review.html`

The route loads the checked static-art and living-terrain packs, builds the
Stage 1 mixed factual fixture, compiles it with `compileVoxelDrawStream`, then
hands the ordered stream to the existing Pixi Sprite, Graphics and retained
terrain Mesh owners. Static sprites retain the checked alpha silhouettes used
by picking. The build-guide toggle only changes review visibility; its 49
records remain in the compiled stream and focused proof.

The shipped art bank has one fixed north camera, matching production. The pure
compiler test retains the four-camera by four-object matrix. Browser evidence
keeps the north camera and rotates the authored stair/object through supported
facings:

- `mixed-render-review-north.png`
- `mixed-render-review-bed.png`
- `mixed-render-review-object-east-stair.png`
- `mixed-render-review-object-west-stair.png`

This is a review harness beside production. It does not cut the production
client over from the legacy sorter.
