# Deploying the Clearing

The maintained release command is:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
  bash engine/scripts/release-clearing-preview.sh all
```

Run it from the accepted, pushed Hive worktree. It builds the root site first and
the engine entry second, deploys the Durable Object backend with the exact public
Clearing origin, uploads the static client to the `clearing-garden` preview alias,
and compares every served byte with `dist/` through both the immutable version URL
and the public alias.

For a client-only release whose backend contract and implementation are unchanged:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
  bash engine/scripts/release-clearing-preview.sh client
```

The script refuses to start from dirty tracked source or a commit absent from all
remote-tracking branches. It records the prior frontend/backend state, source SHA,
artifact hashes, Wrangler output and full HTTP readback under
`.botanical/clearing-releases/`.

An upload is **not a release** until both immutable and alias readbacks match all
files. Wrangler exit zero, a printed preview URL, or `No targets deployed` is not
success. If the alias retains old bytes, the script exits nonzero and preserves
the evidence. Do not run browser acceptance or announce the public URL in that
state.

The targets are fixed:

- client: `fungi-goblin-bnb`, preview alias `clearing-garden`
- backend: `hive-public-engine-demo`
- public game: <https://clearing-garden-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony?game=colony>
- backend origin: <https://hive-public-engine-demo.levi-fe0.workers.dev>

The credential file is passed to Wrangler with `--env-file`; never print, source,
copy or commit it. The complete manual recovery procedure and acceptance ledger
remain in
[`engine/implementation/clearing-repair/05-delivery.md`](engine/implementation/clearing-repair/05-delivery.md).
