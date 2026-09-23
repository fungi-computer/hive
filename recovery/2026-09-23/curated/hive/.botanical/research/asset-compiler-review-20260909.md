# Asset compiler and legacy MCP caller review

Independent read-only review, September 9, 2026. Reviewed the frozen
`src/asset-pipeline/**` and `tools/asset-mcp/assets.mjs` candidate against
`886d542`, the unchanged MCP server/client and browser viewer, and the original
brewhouse/geometry builders. No tests, browser, server or Git operations were
run. Root retains original-art and final evidence acceptance.

## Verdict

Accepted at source level after one blocker and correction. The compiler,
versioned document, original-pack schemas/catalog and legacy MCP operation now
form one compatible authoring path. This does not establish a rendered browser,
hosted route, shared persistent scene, GLB/capture, full Fiend parity or engine
completion. Reported evidence is eleven focused laws (`u3733` after the
runtime-neutral catalog/dispatch correction), focused TypeScript (`u3734` after
the final per-key type correction) and the earlier real stdio result (`u3722`). The
separate Node 24 documentation/package update remains Root-owned and is not part
of this source verdict.

## Source findings

- `original-pack.ts:11-81` owns the four accepted parameter schemas, defaults,
  palette, metadata and catalog order. `legacy-recipe.js:15-42` derives the old
  `kind` grammar from those definitions; `scene-document.ts:26-58` consumes the
  same `originalBuilderSchema`. Bench defaults `1.8/0.75/0.81` and bottle defaults
  `#728e79/1` match `src/studies/brewhouse/props.js:51-60,101-117` and the frozen
  MCP caller.
- The initial candidate could silently drift because definitions, the document
  union and builder switch named supported builders independently. Exact failure:
  adding a definition would make the legacy schema/catalog advertise it while
  the document rejected it; adding only the schema would reach an unsupported
  compile branch. The correction closes that case: `OriginalParameters` maps each
  discriminated builder to its inferred parameter object, and the definition
  literal must contain every key with that key's corresponding Zod output
  (`original-pack.ts:41-81`). Typed `buildOriginal` exhausts `OriginalAsset` with
  a `never` remainder (`original-builders.ts:3-23`). A missing/extra catalog key,
  swapped builder schema or dispatch omission is now a focused TypeScript failure
  while the schema module remains independent of Three. Adding a genuinely new
  procedural original still requires one schema/definition and its typed build
  case; this is explicit behavior maintenance rather than another runtime owner.
- `documentFromRecipe` preserves the legacy resolved recipe and converts yaw
  degrees to the document's local XYZ Euler radians with position unchanged and
  scale `[1,1,1]` (`legacy-recipe.js:44-65`). Thus `180` becomes `Math.PI`; nested
  scene nodes keep local transforms when `scene-geometry.js:75-77` reparents them,
  regardless of saved node order.
- `assets.mjs:14-40` is now only the legacy compatibility/catalog adapter. It
  parses the same external recipe, translates it once and delegates to
  `exportSceneDocument`. The unchanged `mcp-server.mjs:25-56` still exposes the
  same two tools and output envelope; `client-proof.mjs:94-127,185-238` still
  receives the resolved recipe, Three Object JSON and metadata it checks.
- `compileSceneDocument` parses before construction, attaches every subject before
  building, validates actual output after each bounded builder and after final
  hierarchy composition, and returns an idempotent disposer
  (`scene-geometry.js:10-84`). Generic materials and original-material clones are
  compiler-owned. Original unedited materials remain the shared color cache from
  `src/art/geometry.js:3-18`; recolor clones each mesh material before mutation
  (`scene-geometry.js:59-71`). Disposal releases attached geometry and owned
  materials only, leaving the shared palette alive (`scene-geometry.js:17-27`).
- `inspectScene` derives bounds and counts from the actual Three root, rejects
  nonfinite positions/bounds and enforces output ceilings in addition to document
  limits (`scene-inspection.js:3-53`). Empty scenes explicitly return `bounds:
  null`. `exportSceneDocument` hashes the exact UTF-8 bytes of
  `JSON.stringify(scene)` and reports those same byte length, bounds, stats and
  used builder sources (`scene-geometry.js:87-120`). The unchanged client repeats
  the digest/byte checks, and its ObjectLoader consumer compares real output.
- The unchanged viewer fetches and parses the exact `.three.json` bytes, recomputes
  their digest, derives a camera from actual bounds, and disposes loaded geometry,
  materials and renderer (`tools/asset-mcp/viewer.jsx:27-145`). Its current static
  `baseline`/`variant` contract remains compatible. No browser run over the new
  `u3722` artifacts was performed or claimed in this review.

No remaining source blocker was found within this cut.
