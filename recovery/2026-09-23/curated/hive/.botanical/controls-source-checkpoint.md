# Full-viewport controls: reviewed interim

Revision: `016b1a02b009e798165bd4ba11653093cf4ee1c6` on `feat/goblin-bed-and-breakfast-mvp`, pushed and remote ref verified. This is the single-person controls checkpoint of the active two-person home goal. It does not claim recruitment or direct actor interruption is implemented.

CTO personally reviewed normal/narrow pixels in `.botanical/controls-reviewed-dist/`, the actual input proof and the source, and accepted unchanged controls for this preview. No claim of human uncut-video review. First candidate evidence and inventory remain in `controls-first-dist/` and `controls-source-checkpoint-first.md`.

## Source ownership

- Astra authored `main.js`, `camera.js`, `hud.jsx`, `keys.js`, `style.css` and scene changes. `hud.js` was removed: keyed React snapshots replace imperative full-list DOM rebuilding. Camera/inverse picking share one transform; Rowan's name is rendered above scenery at readable screen scale.
- The actual OpenTUI 0.5.10 HTML adapter owns physical key matching and active hint formatting. React 19.2.8 owns retained DOM identity. Existing fixed ticks, gameplay, original Three-to-Pixi geometry and selected libcolony remain the current owners.
- The integrated 16 MiB libcolony JS/Wasm are reproducible from unchanged upstream header/Embind/post-JS source through `scripts/build-colony.sh`, Emscripten 3.1.46. Public `PROVENANCE.md` records all five hashes and old release hashes. The exact compiler command was rerun successfully. No optimizer substitution.
- `scripts/prove-controls.mjs` is wired to `npm run prove:controls`; full-home and study proofs now use the actual camera projection and visible contextual panels. All previous outcome assertions remain.

## Evidence and scope

- Final build u231 (HTML-only favicon correction after u212; all game/art/CSS/Wasm bytes unchanged): `game-OuPMsWtq.js`, `art-CjEZlbHC.js`. It includes the final portrait nearest-neighbor correction. Preserve `dist` through upload/hosted parity.
- Seven simulation tests passed with integrated vendor (u208); source rebuild hashes reproduced (u209).
- Reviewed built controls proof (u211): contextual chop -> stump/six wood -> haul -> finished wall/five loose wood; second chop after pan/zoom -> eleven loose wood. Actual order-status change retains same focused control; closing it returns world focus; camera change cancels a placement drag; paused HUD records zero mutations; held keys/native checkbox/390×844 fresh layout pass; heap 16,777,216 bytes; errors empty. Its final hosted result is recorded below.
- `.botanical/architecture-pass/controls-regression/study/proof.json`: final-dist original study four facings, animated figures, pause, native/narrow presentation and Back-link real libcolony chop, six wood, cleared assignment; no errors (u214).
- Full-home final-dist regression in `.botanical/architecture-pass/controls-regression/home/` completed all home/rest/night/dawn/reset/mobile/material assertions, then failed its final errors assertion on an implicit `/favicon.ico` 404. The response location was reproduced in `resource-diagnostic.json`. Explicit `data:,` favicon declarations now prevent that missing request; the failure is preserved.
- `.botanical/controls-hosted-final/proof.json` on the final preview: success true, errors empty, browserClosed true, heap 16,777,216, actual focus change/native checkbox, paused HUD mutations zero. All 11 screenshots and uncut video retained. Its process later ended143 after success output; no clean process-exit claim (run-u236).
- `.botanical/controls-hosted-study/proof.json`: final hosted study and Back-link actual chop pass, errors empty, exit0 (run-u238).
- `.botanical/controls-hosted-integrity.json`: independently fetched every dist file, 23/23 HTTP200 with matching hashes for this revision (u235). Artifact parity is distinct from gameplay proof.
- Final hosted full-home run-u237 unexpectedly received SIGTERM at 06:57:12 UTC after roughly 2m55s, before finishing. Neither proof owner requested that stop; journal provides no cause. Partial evidence is preserved separately. This interrupted run is not a full-home hosted pass; CTO notified. Earlier intentionally superseded run-u227 is also retained separately.
- Native final deployment b877aec4-5b40-49d9-af87-292228d5c511 succeeded. Stable URL: https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/ .

## Review disposition

Scoped Sol input review found no residual blocker after focus return, camera-intent cancellation and shortcut eligibility fixes. CTO independent `.botanical/cto-controls-audit.json` / `cto-controls-health.json` remain visible: `drawSites` cognitive 41 inherited; `hudModel` cognitive 33 mixes display/notice/tutorial and is to be separated by concept before adding actors; flat `send` cyclomatic 22/cognitive 7 and visible `Hud` JSX 161 lines/cognitive 10 are justified local shapes. The upstream wrapper/generated bundle clone is retained verbatim. The vendor wrapper is also an external `em++ --post-js` pathname consumer; the ordinary proof package script now exposes the browser proof entry. Upstream header has original trailing whitespace; our source whitespace check passes excluding unchanged vendor bytes. The shared art bundle warning remains 794.98 kB, not a zero-warning claim.

Roof-cancellation reachable refunds, typed actor/job scope, scarce claims and recruitment remain active goal work. Paper-doll equipment, storage-providing gear, deep crafting/books, magical night palette ramps, foliage, upper floors and later worlds are recorded in PROTOTYPE/ARCHITECTURE; none are claimed by this interim.

## Source inventory

All tracked files and SHA-256 values are recorded in `.botanical/controls-source-inventory.json` for this exact revision.

## New reference notes

Astra inspected LutLight2D README, pinned shader and generator at fc346b267069ff7557d8bf0dd19f411beab064ba, with current art/view caller comparison in `.botanical/research/lutlight-notes.md`. Bounded mod discovery inspected RPG Style Inventory, CE, Pick Up And Haul, Medieval Overhaul and Human Resources source; exact refs and distinctions are retained in `.botanical/research/gear-notes.md`. No new shipped code/assets/dependency from these references.

## Isolated hosted full-home rerun

The authorized traced rerun completed normally against the unchanged 016b1a0
preview: `.botanical/controls-hosted-home-traced-1788765178/`, run-u256.scope,
invocation 846ee17059584589a97c8cde636e3c59, native session 35188, process exit0.
Proof JSON records errors empty, all 17 home sites finished, rest/night/dawn,
reset and mobile layout. Signal traces record no SIGTERM/SIGINT/SIGHUP.
Launch ancestry is retained. This normal run closes the full-home regression
claim; it does not establish the historical cause of the earlier terminations.
Earlier interrupted artifacts and their separate process outcomes remain intact.
