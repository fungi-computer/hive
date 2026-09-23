# Technonomicon card reference

Inspected 2026-09-07 from the live site and a depth-one clone of the public
repository. This is an art and presentation reference only. No Astro
dependency, renderer, card asset, or game source was added.

## Pinned source and live attribution

- Live site: [technonomicon-red.vercel.app](https://technonomicon-red.vercel.app/).
  The homepage identifies the issue as Friday—April 19, 2024 and visibly
  presents the two Technonomicon cards.
- Source: [technomancy-dev/technonomicon](https://github.com/technomancy-dev/technonomicon)
  at full HEAD `358387ea30afc75db7d419cd12cba3616b9d22d7`, commit date
  `2024-04-19T18:47:01+02:00`, subject `oops, increase breakpoint`.
- Local source paths are under the ignored
  `.botanical/research/technonomicon/repo/` clone. The relevant content is
  [`src/content/cards/technonomicon.mdx`](repo/src/content/cards/technonomicon.mdx);
  the two wrappers are
  [`NormalCard/Card.astro`](repo/src/components/Cards/NormalCard/Card.astro)
  and
  [`HoloFullArtCard/Card.astro`](repo/src/components/Cards/HoloFullArtCard/Card.astro).

The live HTML was fetched directly and the two deployed CSS files were saved
under the ignored research directory. The live page contains the same card
copy, image URL, aspect ratio, wrapper-specific classes, and normal/holographic
variants visible in the pinned source. The live HTML uses `holo-undefined-card`
and `undefined-card` transition names because the source wrappers read
`markdown.data.title` while this card's frontmatter defines `name`; that is a
source/rendering observation, not a requested fix.

The repository HEAD and live deployment can be compared as content evidence,
but no deployment commit, build timestamp, or version metadata is exposed here.
An HTTP `Date`, cached page, or visual difference would not establish that the
live site is newer than `358387ea30afc75db7d419cd12cba3616b9d22d7`. This note
makes no such inference.

## Producer → wrapper → rendered result

`technonomicon.mdx` is the producer. Its frontmatter supplies `name`,
`tagline`, `art`, `mark`, and `type: product`; its MDX body composes `Top`,
`Name`, `Tagline`, `Mark`, `Art`, `BoxNumber`, `BoxList`, `Body`, `Tip`, and
`Button`. The art URL is an Unsplash photo declared in frontmatter
(`photo-1561084746-f360502e5abe`), a gargoyle reference image, not a Hive game
asset and not copied into this repository.

The article `src/content/articles/introducing-cards.mdx` retrieves that one
card entry twice and passes it to `HoloFullArtCard/Card.astro` and
`NormalCard/Card.astro`. Each wrapper calls `await markdown.render()` with its
own component map and suppresses `<More>` for the compact card surface. The
same MDX therefore produces two DOM compositions:

- **Holo:** `aspect-[63/88]`, full-bleed `object-cover` art, glass/backdrop
  panels, holographic gradient text, a centered holographic button, and the
  literal `Holy Sh*t` mark from its wrapper.
- **Normal:** the same aspect ratio and copy, but a neutral gradient shell,
  inset/offset art, gradient-clip text, a `wow` mark from the MDX slot, and a
  solid accent button anchored at the bottom.

The live HTML confirms the wrapper-specific class composition: `.holographic`,
`.holographic-text`, `.glass`, `.font-display`, `.aspect-[63/88]`, the two
different mark strings, and the same Unsplash URL appear in the two adjacent
cards. The deployed CSS defines the display font as `Basteleur Bold` with a
UI-serif fallback, the text body as `Basteleur Moonlight` with a UI-serif
fallback, animated 300% gradients, glass backdrop blur, and the 63/88 card
ratio. The live CSS also loads `Young Serif`, `Lithops`, and both Basteleur
font files from `/fonts/`.

## Smallest reusable Hive idea

Reuse the separation of authored content from a presentation wrapper, not the
Astro implementation. For an original Hive card illustration, let a small
Three-authored subject scene bake to a fixed low-resolution texture, then pass
that image and typed display facts into a declarative React/Caps card shell.
Caps can own native buttons, labels, focus, and readable panel primitives once
its host compatibility is accepted; Hive retains the card's subject meaning,
copy, game policy, and image ownership. A normal and a rare-recruit variant
could share one content record while choosing different local wrappers (for
example, a readable everyday card and a restrained foil/altar card).

Keep the visual law bounded: one aspect ratio, one deliberate typography
hierarchy, one art crop, and one clear action or identity line. Do not import
the Unsplash gargoyle, copy the Technonomicon CSS, add a new renderer, or build
all 22 cards before one original Three → low-resolution bake → declarative card
is readable at intended scale.

Levi's adjacent future intent is recorded for later direction: Major Arcana
three-dimensional subject scenes, rare-recruit cards, and occult chess/cards,
shrines, and cults. Those are authored content directions, not current game
systems, card-count commitments, or permission to change the active home
pipeline.
