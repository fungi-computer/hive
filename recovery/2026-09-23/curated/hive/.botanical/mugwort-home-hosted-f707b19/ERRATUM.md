# Mugwort hosted-proof erratum

This note supplements `proof.json`; the original JSON is retained byte-for-byte.
Its recorded `frozenTarget.source` label, `bb7c135f`, is the pre-publication
source label. The final published runtime source is `f707b199`.

Read-only `git diff bb7c135f f707b199 -- src/herbs.ts` shows the sole intervening
source change: `HERB_GROWING_TICKS` changed from an exported constant to a
private constant, with its value still `80`. No emitted dist hash changed:

- `dist/index.html`: `faa725db6110a14cbb0139ea1ae10da180cc7b176b18e27d2cadaad89bab1101`
- `assets/game-Dzd4qadi.js`: `0f70af4bf919257a198e2d7ed653fe55ad517c154ed93e37d80b5c08eca2b792`
- `assets/game-CxFQJg3g.css`: `45cbaed4bacf64b93ca69702f0330eab7e15ba41d67f7132c810e79ce96ab87c`
- `assets/art-BZ4FxRqi.js`: `3db8740af8a882feacc52979b8eaf654daed078303c5c7d5383e1f2001f4bed2`

Scope remains narrow: the browser evidence covers one Rowan home path with the
Sedge visitor context. The `20/80/240` timing thresholds are unit-coverage
facts, not a claim of browser-observed intermediate task timing.
