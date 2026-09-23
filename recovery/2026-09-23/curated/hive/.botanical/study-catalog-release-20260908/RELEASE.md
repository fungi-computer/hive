# Study catalog, height/sea and Caps World Lab preview release

- Canonical preview: `https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/`
- Superseding Cloudflare deployment: `c2785d01-33d8-4718-ba2b-2979c42e788a`
- Superseding clean assembled release HEAD: `e1c9c6b` (detached retained worktree)
- Playable game base: `2113dfab05e7d758ef0521cd0471ddce26de8b70`
- World Lab height/sea source: `7709272ebb73dd1c0fcb24d1fd688e10dcfe4c5f`
- Study catalog/chrome source: `d6de84e26d269a4572e0a24c67a115314233be81`
- Caps World Lab controls source: `8b9d2509b682299d7f8cbb08d18b3c021561b6a8`

`run-u2896.scope` built the clean composition. It intentionally excludes the
unfinished recipe/process source now above these commits on the feature branch.
The game bundle was rebuilt because the accepted catalog commit changes the game
menu label from Character study to Studies; this is not a claim that the old and
new game bundles are byte-identical.

The representative catalog/leaf interaction was local served evidence from
`run-u2850.scope`. Hosted evidence is HTTP byte parity only: `run-u2915.scope`
compared all 68 files in the frozen `dist` to the canonical host and separately
matched `/`, `/study`, and `/world-lab.html` to their local HTML bytes. Evidence:
`hosted-parity-final.json`, SHA-256
`eb88f40596762a69b6260039ce85a14277729d898458ca0040f3bec03b2b1ea6`.

This release makes the four-group catalog and current World Lab height/sea
candidate navigable. Water/gas recorded playback pages and the serial Caps
control adapters remain subsequent study work.

The superseding `run-u2952.scope` build adds only the accepted Caps World Lab
control migration to the same clean release line. Its named jump and real
4096/8 to 2048/4 zoom transition were exercised locally by
`run-u2934.scope`, including the 390px render. Hosted evidence remains byte
parity, not hosted browser interaction: `run-u2957.scope` matched all 68
regular files in the frozen `dist` and the three canonical routes. Evidence:
`hosted-parity-caps-world-lab.json`, SHA-256
`854d56e2632941f449f6af7377b43a0abc54bbbc6eeaa7339947fe007aef031a`.
