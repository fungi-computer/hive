# Full-viewport controls: first source/rendered checkpoint

Base: `50433b49e2c843abf45bcc304d2035abf0236484`; listed source is an uncommitted candidate on the owned feature branch.

Astra authored the scene/UI/input change. Existing original geometry and single-person simulation remain the current gameplay consumer. Recruitment/typed shared-work ownership is the next part of the active goal, not claimed by this checkpoint.

## Observable result

- Built dist at http://127.0.0.1:5188/; normal viewport 1440×900, narrow resize 390×844.
- Actual world click opens Rowan inspector. B opens build, R rotates ghost, clicks place a waiting wall. Secondary click on oak opens target menu; C commands chopping through real libcolony.
- One felled tree becomes six wood, then hauling/building makes a wall and leaves five loose wood.
- Focus stays on the same order action while status changes. Pause freezes state. Keyboard pan plus zoom preserves picking for a second actual chop; eleven loose wood remain after two trees/one wall. Reset clears work/material.
- 09/10 mobile screenshots prove viewport/layout after resizing; this is not a full touch-control claim.
- `proof.json`: success true, no browser/page/network errors, browser closed.

## Ownership and deletion

- `hud.js` removed. React 19.2.8 renders immutable UI snapshots and keyed orders; no full-list innerHTML replacement or manual per-frame selector/property reconciliation.
- `camera.js` transforms the retained world container and supplies inverse picking; simulation coordinates/art bake stay fixed.
- Rowan label is in a separate screen overlay above scenery.
- `keys.js` uses actual @opentui/keymap 0.5.10 HTML adapter and active binding formatter. No manual key parser. Physical keys occur only in the keymap definition; the retained Botanical browser caller was inspected at 366dc8c1339cf5f5fbd07ffefc6eba8c8fa42c9d.
- Main still owns current single-pawn commands. Direct interruption/queued actor scope, multiple people, scarce claims and known roof refund fix remain active goal work.
- Smaller 16 MiB libcolony passed separate scratch native/browser consumer proofs; shipped vendor bytes are still the accepted release in this checkpoint.

## Evidence

- `.botanical/controls-first-dist/01-full-viewport.png`
- `02-rowan-inspector.png`, `04-contextual-chop.png`, `05-chopping-orders.png`, `07-wall-finished.png`
- `09-mobile-native.png`, `10-mobile-inspector.png`
- `proof.json` and actual committed-candidate `scripts/prove-controls.mjs`
- `page@aa98fb74871e05d6bc428089f3436d62.webm` records the full input sequence; no claim of human uncut review.
- Scoped build u205 and browser u206 passed. Shared art bundle remains 794.98 kB minified; UI/keymap additions are visible in build output. Existing complexity findings are not erased by this checkpoint.

## Source SHA-256

- `index.html`: `217d6b6a314406ae4955f4ea33460ff3c95dff0add9e19a6c427bf52e618f0bd`
- `package.json`: `68e947385f0b14ef9f40c3cc6e7e3f0f0c6863d307c62b4786fe2b31769ac332`
- `package-lock.json`: `1b10b79549053a74e3df4f13fe978f355e3aba34f6eced776e11a9a46ac50fa4`
- `src/main.js`: `a295f9d61b5a896aac39f08898cc77f5d7565294b1ecc04efa78cc569d61b7ed`
- `src/camera.js`: `108218848dabab3c3295c6c3728f1139caeac55977a43158a8f6d064e304ab8d`
- `src/view.js`: `f5d035e2ce66a21734fe90e8bcd3f54b875b6b7045caa77d879b28f1b793c286`
- `src/construction-view.js`: `6a65a91812c6e33f03a4d1dd343b31349b2e897a41c1a7cf8469d02a2a99e437`
- `src/hud.jsx`: `a10fadabb29874ebcf26abd77c5a7df33542a2df759f6490e3fba78583d37b65`
- `src/keys.js`: `e9175bd3c1ec6a0318ef1de5f9f3cb45accb82044b2bbf5b4b98148ab7ab0c97`
- `src/style.css`: `96c570e301239ee95e9d08838d5702d046b96177ca52e405379c9f8da1863ec7`
- `scripts/prove-controls.mjs`: `39d64bfdc9f1af1f15f0332dcfb177122fec47375f9b5bb7adf0394c21d45516`
