# Cut-rendering handoff — September 16, 2026

Authoritative branch: `engine/clearing-edge-integration-20260914`

Accepted source checkpoint: `62277448` (`Stabilize cut terrain ordering`), on
top of the serial R1/R2/R3 commits listed below. This document records a pushed
source checkpoint, not hosted parity or completion of the full repair goal.

## Integrated source

The current serial stack is:

| Commit | Outcome |
| --- | --- |
| `d9ddaac8` | Cut-level rendering and Ingnomia contract. |
| `61095624` | Prepared smoke advance without cloning complete smoke state. |
| `fc58a066` | Canonical cell faces and consecutive ordered terrain meshes. |
| `e2ae22d7` | Bounded, revisioned terrain-material chunk observation. |
| `f8bdb9d1` | Bounded client chunk cache, invalidation and recovery. |
| `e5deee73` | Terrain ordering and appearance contracts. |
| `8e67cc10` | Live client cutover to terrain faces. |
| `62277448` | Actor/face contact corrections, useful cycle diagnostics, legal Pixi mesh state, and working browser-local Colony scope. |

The latest checkpoint keeps canonical terrain faces and the shared camera. Top
and bottom faces declare supporting geometry; side faces declare upright
boundaries. Compact actors compare from their support point rather than their
entire billboard curtain. Adjacent terrain faces cannot manufacture body/contact
edges. Cyclic failures now report the actual cycle and geometry. Local Colony
startup uses `colonyPack`; the authenticated Durable Object path remains the
owner of `colonyServerPack` and its scope.

## Evidence at `62277448`

- `run-u1917.scope`: terrain qualification, **21/21 passed**. Covers the flat,
  pit, cave, lake and stairs fixture; canonical projection; actor/face cases;
  deterministic ordered batches; deep chunk demand; cache invalidation; stale
  replies; presentation chunks; cave water; and structure projection.
- `run-u1918.scope`: real Chromium browser-local Colony opened with HTTP 200,
  a 958×966 canvas, `Browser local · saves stay here`, and no page errors.
  Receipt and screenshot remain in ignored local evidence at
  `.botanical/cut-render-browser-proof-handoff/`.
- `run-u1921.scope`: `tsc --noEmit` exited zero.
- `run-u1922.scope`: Vite production build completed, 1,201 modules transformed.
  Rollup emitted only the existing misplaced pure-comment warnings from the
  linked Zod dependency.

The generated kernel used by the browser/build was rebuilt in this worktree from
the current Rust source. Its recorded WASM SHA-256 is
`57592fe294f33461f53d520305b52788041320b09505a6f014ec47e893617ae7`.

## Deliberately rejected work

A trial represented each transparent dual-grid grass patch as an independent
horizontal ordering plane, then attempted to derive ordering corners from its
art-emission vertices and special-case cliff contact. That mixed artwork internals
with world ordering and still produced live interleaving errors. The trial was
removed before `62277448`; no `terrainCoverRecords`, `terrain-cover` relation,
emission-vertex ordering, or height-tolerance rule survives in this checkpoint.

Grass direction is recorded without an implementation claim in
[Living ground](../../../docs/decisions/living-ground-grass-and-water-art.md):
substrate, floors and living cover remain separate facts; visible grass uses the
four-neighbor dual grid; each baked grass patch is an ordinary positioned object
in the shared isometric sorter. There are no grass-specific depth rules,
actor-foot handling, front/back layers or per-blade entities.

## Known incomplete work

The browser-local frame is operational, but the cut renderer still uses the
temporary five-color terrain atlas. It does **not** preserve the retained
dual-grid terrain detail and is visually rejected for release. No hosted preview
was deployed from this checkpoint. The complete goal still requires:

1. restore attractive original terrain art through ordinary declared sortable
   objects and safe consecutive batches, without reviving whole-level pictures;
2. personally inspect the small flat/pit/cave/lake/stairs fixture at multiple cut
   levels before expanding acceptance to the Clearing;
3. qualify cut scrolling, cave water, construction invalidation, matching picking,
   current save/reload and same-world multiplayer;
4. measure native simulation, observation/wire and browser rendering separately
   on active 32/100/200-worker pages;
5. deploy and verify one coherent accepted client/backend pair, recording source,
   artifact, rollback, hosted interaction and visual receipts.

Do not treat the successful local startup or unit fixture as proof of those
remaining outcomes. Do not reintroduce a per-pixel depth path, independent client
simulation, whole-level bake, or a special grass sorter.

## Resume boundary

Read [section 13](13-cut-level-rendering.md), then inspect the current face,
sorter and batch callers before editing. Begin from the visually rejected atlas,
not from the removed grass experiment. The next review checkpoint is a personally
inspected fixture image with original terrain character and zero ordering errors.

Rollback for only the latest correction is `8e67cc10`. The pre-cut-render stack
tip is `9ad0b212`. Neither rollback is a release recommendation; each identifies
the exact source boundary.
