# Retained Dashboard fonts

Stipe retains Dashboard's Nunito sans and Maple Mono monospace stacks from
Botanical revision `b6eabe5dfd3cac9514025d26abbe9a92b083f10b`,
`packages/fungi-computer/dashboard/src/index.css` (font theme and font face) and
`packages/fungi-computer/dashboard/index.html` (Nunito Google Fonts link). Caps'
normal stylesheet imports Stipe's typography tokens. Website hosts opt into the
shared `@fungi.computer/caps/fonts.css` loading sheet through their asset
bundler, which resolves and emits these files without external requests. The
ordinary Stipe sheet contains no font URLs, preserving Tailwind-only consumers
and captured HTML builds that do not transport font assets.

`MapleMono-VF.woff2` is an unchanged copy of that revision's
`packages/fungi-computer/dashboard/public/fonts/MapleMono-VF.woff2`. Its
retained face declares normal weights 200–800. The upstream
[Maple Mono license](https://github.com/subframe7536/maple-font/blob/main/OFL.txt)
is included as `MapleMono-OFL.txt`.

`Nunito-VF.ttf` is the unchanged normal variable font from
[Google Fonts](https://github.com/google/fonts/blob/main/ofl/nunito/Nunito%5Bwght%5D.ttf),
retrieved September 9, 2026. Its Git blob is
`2ec1f4b0676c83ef33049db87b311171699e9192`; Google Fonts metadata identifies
upstream Nunito commit `8c6a9bb9732545b9ed53f29ec5e1ab0ff53c4e6f`. The full
asset covers Latin, extended Latin, Cyrillic, extended Cyrillic and Vietnamese,
with a 200–1000 weight axis. Stipe exposes normal weights 200–900, covering both
the Dashboard and retained Hub marketing page. The original Dashboard fetched
400, 500, 600, 700 and 800 from Google Fonts; self-hosting the same family
replaces that network dependency. The upstream
[license](https://github.com/google/fonts/blob/main/ofl/nunito/OFL.txt) is
included as `Nunito-OFL.txt`. Neither retained loading path supplied an italic
face; these assets preserve that scope.

Both fonts remain SIL OFL 1.1, separate from Stipe's MIT code license. No font
bytes were modified, subsetted or converted. The Nunito file was renamed only
for a simple asset URL.

SHA-256:

```text
MapleMono-VF.woff2  e7080ef37fa8b3a38f71446e53e546634c27ce2cfe97673478cafc029d6344ee
Nunito-VF.ttf      bb55a5ca5c2042335b3991af27c4d0705d0ef41cac6164ac737fd8f2a1e85207
MapleMono-OFL.txt  cdb01cb2c0ac2d618ad3fc082275cf3cbe6145a58d558709ec083ce69c702cf0
Nunito-OFL.txt     580df76c95a1ec5ab878ceb25bb3d85c6a076804e9c970c8c6972aea775fdf65
```
