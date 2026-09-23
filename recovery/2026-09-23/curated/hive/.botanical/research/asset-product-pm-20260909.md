# Asset product PM checkpoint — 2026-09-09

Native goal thread 01a084d5-bc74-7663-878c-48e3a6203787 ACTIVE, no budget.
Custody NEW src/asset-pipeline/** only, plus this ignored record. Frozen
886d542 tools/art/studies/runtime/dependencies remain untouched.

## First source shape

scene-document.ts owns version 1, revision, strict data-only nodes, explicit
local meters/Y-up/XYZ Euler radians/scales, four original builder references,
group/box/cylinder, nullable per-node color. Group-only parent refs, unique IDs,
acyclic hierarchy, depth8/count24 and finite bounded dimensions. Original builder
parameter schema is a temporary new-module checkpoint; MCP's existing schema
must migrate to this owner before we claim a finished shared authoring path.

scene-editor.ts owns ordered add/transform/material/remove batches, expected
revision, detached candidate validation and one revision increment. Every
intermediate operation must produce a valid hierarchy. Failure never mutates
source. Remove cleans all descendants regardless of document ordering. Material
is a value owned by a geometry node, never inherited from a group. A retry with
stale revision rejects. No history, persistence, undo, public ID or authority
exists here; future persistence must compare-and-commit document+history together.

scene-geometry.js is an UNACCEPTED parked source checkpoint added just before
Root's stop-expansion message arrived. It imports unchanged original builders,
compiles generic shapes, clones edited original materials and disposes only
owned clones/geometries. No existing caller uses it. Root may exclude it from
this cut. Original geometry and art acceptance remain Root's authority.

## Proof

run-u3674: four document laws pass.
run-u3676: five laws pass, including actual original bench/bottle + box/cylinder
geometry reproduction through save/reload and shared-material isolation.
No browser, rendered art, hosted route, full-suite or Fiend parity claim.
Independent reviewer assigned by Root; corrections/acceptance pending.

## Exact caller join after source freeze release

`tools/asset-mcp/assets.mjs` currently owns definitions, legacy recipe schema,
per-asset builder loop, bounds inspection, JSON export and disposal. Keep its
legacy external input compatible by translating resolved defaults to version1
nodes: original asset reference, parentId null, position copied, yaw converted
degrees->local radians, scale [1,1,1], material null. Replace its duplicated
parameter definitions with the new originalBuilderSchema and build/export loop
with accepted scene compiler/export owner. Preserve current catalog metadata,
SHA256 exact exported UTF8 bytes and artifact UUID caveat. MCP registration and
stdio/HTTP transports remain adapters to the same owner. Browser future editing
calls applySceneBatch through actual persistence; it does not retain another
transport-local scene truth. Existing game/bake callers continue unchanged until
Root reviews that subsequent shared export join.

Read actual assets.mjs, mcp-server callers, original props.js/geometry.js and
brewhouse main/composition. Shared geometry.js materials are cached by color;
arbitrary edit colors must never enter or mutate that shared palette cache.
Full Fiend28 catalog remains a target, not this narrow source result.

Focused strict document/editor TypeScript check run-u3677 passed. Retained actual
`.botanical/asset-mcp/fallow.json` reviewed: assets.mjs cognitive7, one estimated
coverage risk42; no clones/cycles. Five actual static/proof/Worker entrypoints and
seven parent-supplied deps remain valid advisories. New source is not covered by
that historical audit; no clean current Fallow claim.

Independent scene_document_review found no pure-owner correctness blocker.
Requested depth clarification is corrected in source: depth counts nodes on the
root-to-leaf path, including endpoints. Added exact 8-node acceptance/9-node
rejection law. Reviewer confirms original schema duplication remains migration
debt; compiler and its geometry law remain outside that review/acceptance.

## Accepted handoff

Root explicitly ACCEPTED the source-only document/editor checkpoint following
independent review and depth correction. The bounded goal is complete; source
custody is released to Root for integration. Five document laws passed in
run-u3690, alongside a separately unaccepted compiler law. The compiler
scene-geometry.js and its geometry test remain PARKED and are excluded from
acceptance. Root owns the next original-pack/caller extraction assignment and
frozen-launch release. Temporary parameter duplication is explicit; there is no
MCP integration, hosted editing, full Fiend parity or engine-completion claim.

# Shared-owner integration candidate

New native goal ACTIVE in same Session 01a084d5-bc74-7663-878c-48e3a6203787:
make versioned document, original pack definitions and reviewed compiler the
actual owner behind compatible original-asset MCP, with real export/render.
Root authorized src/asset-pipeline/**, assets.mjs and focused asset proof files;
source candidate only, original hosted886d542 remains immutable.

Current checkpoint is FROZEN pending Root independent compiler/caller review.
No browser yet. Single original-pack.ts parameter/default/palette/catalog owner;
scene-document imports its typed builder union. legacy-recipe.js preserves
resolved recipe shape/defaults and converts degrees to local XYZ radians.
assets.mjs removes its old duplicated parameter/build/inspection/disposal logic
and delegates shared export. scene-geometry.js owns compile/export lifecycle,
scene-inspection.js owns actual output bounds/count budgets, original-builders.js
resolves the four original factories without copied art. Document edits remain
pure, batch revision check is unchanged. Per-node original recolor clones material
and leaves shared cached original palette untouched.

Converted new test from .ts to .js per existing repository test convention,
removing Node test type import from root TypeScript inputs without config changes.

Evidence: u3719 six prior laws pass; u3720 eleven laws pass (legacy defaults,
180-degree yaw, exact JSON SHA/byte count, ObjectLoader bounds/counts, nested
local transforms with arbitrary node order, original sibling/cache isolation,
partial failure disposes9 constructed geometries and9 clones but no cached
material, max24 instances of each original below actual budgets, empty bounds).
u3721 focused strict schema/editor/pack TS passes. Existing real stdio client
u3722 passes7 checks and writes baseline/variant artifacts to
.botanical/asset-mcp/shared-owner-20260909. Existing server/transport unchanged.
This is source/local protocol/export evidence, not rendered or remote evidence.

Runtime contract owed for Root serial edits: tools/asset-mcp/package.json engines
node >=24; README Run section explicitly Node24+ native erasable TypeScript.
New source imports TS schemas directly, so it cannot retain older Node20 claim.
No loader/build framework added. This does not relabel frozen886d542 runtime.
Root agrees proposal and owns those two files.

Independent compiler review found one blocker: schema/definition/dispatch supported
keys could drift. Reviewer accepted exhaustive-parity alternative to importing
geometry into pure schema data. Root released that bounded correction: named
parameter schemas now feed both union and metadata; originalDefinitions object
literal uses satisfies Record<OriginalAsset['builder'], ...>; dispatcher is now
original-builders.ts, accepts OriginalAsset and checks never in default branch.
Focused TS includes both files (and --allowJs for unchanged original JS callers),
u3732 passes. Eleven focused laws rerun u3733 passes. Correction refrozen for
reviewer immediate reread; browser remains pending. All other compiler/caller
contracts were reviewed without findings. No public-art/hosted claims.

Reviewer narrowed remaining schema correspondence hole: broad z.ZodType checked
keys but permitted bench/bottle parameter schemas to swap. Corrected definitions
to mapped OriginalAsset per-key parameter output types; u3734 focused TS passes.
This is the fixed four-builder packet with explicit exhaustive dispatch, not a
registry framework: adding a new geometry builder requires typed schema,
definition and handler; composing/changing supported builders is configuration.
Root allows direct routine correction with reviewer and one existing focused
browser render/download proof after exact source acceptance (normal+390).

Exact source correction ACCEPTED by independent reviewer; no remaining bounded
source blocker. Review retained in asset-compiler-review-20260909.md.

Browser proof u3740 PASSES through existing headless_shell1243 and
LD_LIBRARY_PATH=/tmp/hive-proof-libs/root/usr/lib/x86_64-linux-gnu. Artifacts:
.botanical/asset-mcp/shared-owner-render-20260909-headless/{proof.json,
baseline-native.png,variant-native.png,normal.png,narrow-390.png}.
Both match exact MCP artifact SHA;51 draws/1220triangles each,13448/11942 opaque
pixels, fitted geometry, changed image, real rotation, exact download, normal
and390px containment, zero browser errors. Root personal art/caller review pending.
Earlier u3735/u3739 terminated before page launch using full Chrome with missing
libnspr4/libcups host libs; failed receipts retained at separate render/retry
paths. No installs or source changes were needed for correct existing headless
runtime. All proof processes ended normally or terminal launch failure.

Root personally viewed all four u3740 images and proof.json and ACCEPTED original
art/caller presentation plus corrected shared owner. Root serially updated
Node>=24 package/lock metadata and README, with no dependency versions changed.
ALL SOURCE CUSTODY RELEASED to Root: original-pack.ts, original-builders.ts,
legacy-recipe.js, scene-document.ts, scene-editor.ts, scene-geometry.js,
scene-inspection.js, scene-editor.test.js, scene-geometry.test.js under
src/asset-pipeline plus tools/asset-mcp/assets.mjs. Superseded candidate-only
scene-editor.test.ts/original-builders.js removed. No further browser/proof/source
work by PM. Goal remains ACTIVE at Root instruction until affected HTTP/bundle
and selective commit/handoff settles; Root will explicitly release completion.

Root local HTTP u3742 passes; Fallow u3743 has no clones but applySceneBatch
cognitive27. Root released scene-editor.ts only for actual responsibility split.
Read actual shared-owner-fallow.json findings. Refactored private removeSubtree
(descendant cleanup), applySceneOperation (one admitted mutation, exhaustive
union), and public applySceneBatch (parse/clone, revision admission, ordered
intermediate validation, one revision increment). Existing Zod validation and
revision/unknown-node error behavior unchanged; no tests/source entrypoints
removed for static unused advisories. Existing six editor laws u3754 pass;
focused TS including typed pack/dispatch/editor u3755 passes. No browser/HTTP
reruns or compiler/art edits. Corrected scene-editor.ts custody released to Root.
