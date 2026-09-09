# Local region durability proof

This isolated Wrangler consumer binds one SQLite Durable Object to the existing
region owner and original quarry program. It is a local harness, not production
authentication, a public world administration API, or an autonomous alarm service.

`POST /command` accepts the region owner's checked `{id, expectedRevision, command}`
envelope. Per-run writer and spectator bearer secrets map to server-chosen
principals. A separate debug secret permits `GET /debug` committed snapshot/events
and one-request fault injection. No caller-supplied principal is accepted.

The before-commit fault throws inside native `transactionSync`, at receipt insertion
after state/events writes. The after-commit fault waits for native `storage.sync()`
and returns a failed acknowledgment. The proof will kill only its own Wrangler
process group and restart the same named object with the same SQLite persistence.
Secrets and generated runtime config are ephemeral and are not retained in proof
artifacts. Maintained `wrangler.json` uses strict JSON so the harness can parse it
before allocating its private temporary directory. Source config has no credentials and is not a deployment instruction.

The region owner enforces finite retained receipt, event, state and byte capacities.
This proof does not establish autonomous wake, Watchdog integration, or Goblin
game completion.
