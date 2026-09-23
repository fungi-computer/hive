# Smaller hair and a correct tool grip

Astra personally authored this small art correction from shipped 1993508.
Game-delivery remains sole tracked source/Git/deploy owner. This ignored study
does not change the hosted preview.

Levi liked the larger expressive hair, but asked to tone it back a little.
The copper locks are 10% narrower/shallower and 14% shorter, with modestly
reduced sway and trailing angle. Face-framing hair and the established palette,
body proportions, kneeling work and cat animation remain as authored.

Levi also reported everyone gripping tools by their heads. The common
workGear caller placed each head almost exactly at the palm (tool offset
-0.14/-0.15 plus head offset+0.14). The tool origin now sits inside the palm;
its shaft crosses the grip and the head lies beyond the fist. Both Rowan and
Sedge use that same geometry for their mallet and axe. This changes no job,
gear simulation, animation frame counts or renderer scale.

## Actual proof and personal art review

Hair-only proof-v1: run-u513.scope, invocation263363fbb4864cf89c0ca93955f3dcd5,
native session27905 polled to normal exit0. Preserved before tool changes.

Combined proof-v2-grip: run-u514.scope, invocation75369566c5314b99bb3eec15a46983d5,
native session84988 polled to normal exit0. Actual Three bake into Pixi at game
2x; eight observed indices for the seven displayed pose rows, paused frame
and canvas freeze, stable source hashes and no browser errors. All Sedge modes
in four facings have minimum 10px transparent canvas padding.

Astra personally viewed the intended-scale comparison, all front phase strips,
four-facing comparison and Sedge eight-mode/four-facing sheet. The smaller
silhouette and handle grip read correctly. The saved WebM is motion evidence;
this does not claim to have watched the uncut recording or proven hosted parity.
Recording: proof-v2-grip/page@731976f5873600996ed0761ce6b9161c.webm.
Source review is separate in source-review.md when completed.

## Integration

Only the workGear and copperHair delta belongs in src/art/figures.js.
figures-for-integration.js translates the isolated import back to ./geometry.js.
Check the base before applying the patch; preserve unrelated changes.
Base tracked SHA256: ad27d9da24bbed68110538ec9f8bb7c481e49830f3e76e1a72474.
Candidate tracked SHA256: a5911f99b0608bc7bb41a9684886ac69fef6e9b24a727b2f99c2a387dd1fc5c4.
Isolated source SHA256: 4489f7c0e28c5301a57cb8f303cdcdf308d669ef80aa2eabde441614d7961fb6.

Delivery owns routine source/caller review and the next coherent preview update.
Do not turn this asset-only correction into a full-home browser rerun.

Existing local page: http://127.0.0.1:5187/.botanical/hair-trim/index.html
Run from Hive with the existing authorized browser environment and proof runner:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node .botanical/hair-trim/prove.mjs .botanical/hair-trim/<new-evidence>
```

**Astra changed-art acceptance:** combined v2 is accepted after personal source,
caller and native/game-scale sequence inspection. Sol source review found no
material blocker. Numeric alpha padding covers Sedge only; Rowan build/chop/idle
were visually inspected and use the same workGear. Default idle/walk/pickup/
deliver still depict the inherited axe; deciding when it is stowed belongs to
a future carried/equipped-item behavior, not this grip correction.

No source-test expansion or full-home proof is needed for this art-only delta.
Actual hosted integration remains delivery-owned and has not yet been claimed.
