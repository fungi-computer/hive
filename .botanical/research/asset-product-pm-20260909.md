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
