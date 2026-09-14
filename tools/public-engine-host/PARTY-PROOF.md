# Colony party witness

`party-proof.mjs` is the bounded P1/P2/P3 witness for the current v2 Colony
world route. It uses one world invite, two random participant credentials, one
persisted Wrangler SQLite directory, and at most three Wrangler starts.

The first start enables the existing response-loss test hook. Two concurrent
joins for participant A must commit one binding while both replies are lost.
After the same SQLite state is reopened with the hook disabled, A must recover
the same party and two people. Participant B then joins the same world and must
receive a different party and two different people. The witness also retries A
concurrently, rejects forged cross-party work and host-only pause/native
commands, queues A's dig work, stops using A, renews the shared lease as B,
and checks that the queued work and world projection survive A's reconnect.

The script hashes its source and generated-kernel inventory before starting
Wrangler. Missing or mismatched generated WASM is a preflight failure; it does
not fall back to a source-only or browser runtime. It emits a redacted hash
inventory, witness, and diagnostics under the supplied `.botanical` output.

Run only after the matched generated kernel has been joined and inspected:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
  node tools/public-engine-host/party-proof.mjs \
  .botanical/clearing-repair/party-proof-v1
```

This packet does not itself launch Wrangler while source/artifact matching is
being reviewed. It does not use a browser or create a second world.
