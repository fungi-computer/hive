# A very small game — original Devil and demon study

Astra personally authored `figures.js` and the Three-to-fixed-bake-to-Pixi
caller in `main.js`. The existing camera, bake, lighting and geometry primitives
are reused directly. No reference images/models enter these assets. This is an
isolated ignored study, not a change to the game, tracked art or current preview.
Game-delivery retains source/Git/deploy custody; its controls work continues.

Levi explicitly requests a major Devil character/chess opponent plus demons.
The Devil and familiar can speak directly to the player in an otherworldly
layer, where chess/tarot may also open a path into magic. The exact costumes,
temporary lesser-demon names and the displayed line are Astra proposals.
The board has no chess rules, the line is scripted, and no AI integration exists.

## Source and presentation

- `figures.js`: courtly Devil with curled horns, tailcoat and a offered pawn;
  small winged Moth page; broad ram-horned Cinder porter with handbell. Original
  courtyard and 4x4 table provide context. Eight poses per cycle, four facings,
  idle/walk/offer; 288 creature textures at 80x80 pixels.
- `main.js`: existing fixed camera and bake, Pixi tableau and native lineup with
  Rowan/Bramble for scale. Table scene uses offer frames; buttons change lineup
  poses and facings. The stage and lineup share the displayed phase; pause stops
  both. No simulation engine or new art framework.
- `index.html`: review surface at game 2x, with readable native-pixel export.
- `prove.mjs`: bounded native Luna preparation, personally read and corrected by
  Astra so pause samples the actually paused frame rather than racing the click.

Existing server:
http://127.0.0.1:5187/.botanical/devil-study/index.html

From this clone, use a new evidence directory for any new run:

```sh
CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell \
LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/browser-libs/root/usr/lib/x86_64-linux-gnu \
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
node .botanical/devil-study/prove.mjs .botanical/devil-study/proof-v1
```

## Observed first shape

`proof-v1`: root-owned `run-u507.scope`, invocation
`86688f6fbff64c6892965b9b11ac0b8b`, native exec session `69128`, retained and
polled to normal exit0. No peer process was stopped. Source hashes remained
stable; all eight walk phases observed; pause froze frame and court pixels;
resume and pose/turn buttons worked; texture padding minimum10px; no browser
errors. `proof.json` records source hashes and all texture extents/pixel hashes.

Astra personally viewed `01-intended-scale.png`, native lineup, Devil and imp
gesture phase sheets, porter walk phases and representative all-facing sheets.
This supports the original first-shape art direction; it is not a claim to have
watched the entire uncut WebM, proved hosted behavior, or integrated characters
into the world. Recorded video:
`proof-v1/page@435084e14454706dc42d81622e611e3c.webm`.

No new helper library, dependency, Git commit or deployment was made by root.
Any future publication belongs to delivery and should remain an optional study,
without adding unused textures to game startup. Foliage is the next personally
owned art study; it is still unimplemented here.

## Reviewed v2 correction

Terra's source review found the imp's left arm forced to the offer pose. It now
uses the actual selected pose. The carried piece remains intentionally present.
Controls explicitly animate only the three visitors; Rowan/Bramble are still
scale references. Astra personally viewed the v2 intended-scale scene and imp
walk/offer phase sheets and accepts these changed pixels for an optional study.

`proof-v2/proof.json` records stable source hashes, eight observed walk indices,
pause/pixel freeze and no browser errors, with all exported sheets and recording.
Runner was `run-u511.scope`, invocation `7368950181d14014b63f6c91d6e11871`,
native session `56630`. Its final native tool response was lost at context
truncation; the session is now collected. JSON assertions are recorded, but no
recovered native exit code is claimed for v2. No rerun is required for that
reporting limitation. v1's normal exit0 remains separately recorded above.

Current original creature source SHA256:
`3419a5ce0c519a955d208f553c84b67adaf82c7119d4a0b1cddc77c5fbad2b52`.
V2 recording: `page@e52e87bff3fbfaae59488417a17b08c8.webm`.
No claim of watching its uncut video or of hosted game integration.
