# Released shared font loading boundary

This narrow source snapshot was released by Botanical CTO through Root on
2026-09-09. Hive's installed Caps/Stipe packages predate their public font-loading
exports; upgrading shared dependencies is outside this portable-viewer change.

`caps/fonts.css` is an unchanged copy of Botanical
`packages/caps/src/fonts.css`; it imports the public Stipe loading sheet.
`stipe/fonts.css` and adjacent `stipe/fonts/**` are unchanged copies of
`packages/stipe/fonts.css` and `packages/stipe/fonts/**`. The viewer's Vite config
resolves only that font-sheet import to this snapshot; it bundles relative font
URLs normally and emits the adjacent licenses/provenance. It does not copy the
Caps component package or recreate font-face definitions.

Source SHA256 pins:

- Caps sheet: fb9b33adeb650923322bb2bad1b2f885736b0fe0b777974aa7eae1e320af669f
- Stipe sheet: f6a8f076e6d0173250f1b87fb147908a6f770e6d12f004fd9d4f3371d60c7ba5
- Nunito-VF.ttf: bb55a5ca5c2042335b3991af27c4d0705d0ef41cac6164ac737fd8f2a1e85207
- MapleMono-VF.woff2: e7080ef37fa8b3a38f71446e53e546634c27ce2cfe97673478cafc029d6344ee

See `stipe/fonts/README.md` and both adjacent OFL license files for upstream
font provenance. No bytes were converted, subsetted or modified. Shared
Botanical source remains untouched. Replace this snapshot through an explicit
released-package update when Root accepts one; do not silently resolve it from
a sibling checkout at build time.
