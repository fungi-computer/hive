# Disposable libcolony workerd probe

Accepted source: cb80c55fe9932c2e01c7570ed855266d03cb9695.
Only ignored scratch files were authored. No production source/configuration,
dependencies, Durable Object bindings, authentication, or provider deployment
were changed. Wrangler's first failed invocation wrote its ordinary local log
under ~/.config/.wrangler/logs; later invocation logs are redirected here.

Run from /home/levi/src/hive:

```sh
bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node /home/levi/src/hive/.botanical/architecture-pass/host-probe/probe.mjs
```

The harness starts native `wrangler dev --local`, makes the HTTP request inside
the same bounded systemd scope, asserts the two-character assignment, terminates
the child process group with TERM, and waits for exit. No server is retained.
`scope-collection.txt` records all three completed scopes as not-found/inactive/dead.

Installed versions: Node v24.20.0, Wrangler 4.127.1, workerd 1.20260828.1,
Miniflare 5.20260828.0-alpha. Scratch compatibility date: 2026-09-04.

The worker imports the exact upstream JS release as text and the exact Wasm as
a static compiled module. An eager startup wrapper supplies the release's
`Module.instantiateWasm` callback. It also shadows `process` with undefined,
because workerd exposes a process object which causes this old release to select
its Node/require path. The upstream source bytes are unchanged. Only the shipped
`compute_cost` and `optimize` functions produce the tested assignment.

Recorded hashes match public/vendor/libcolony/PROVENANCE.md:

- JS: 2f31c9b940595268842c30eb02a5249227b4c3c93467c5f19d23d438b75c5fd6
- Wasm: 08a46ee9b5c6135ae165bdd4f5983a8ce28ad70d6da63cac0a53e79067077ef1

Attempts and preserved receipts:

1. run-u179.scope, exit 1: requested 2026-09-07 compatibility date rejected;
   runtime reports newest supported date 2026-09-04. `runtime.log`, `result.json`.
2. run-u181.scope, exit 1: at 2026-09-04, unchanged environment detection selects
   Node and throws `ReferenceError: require is not defined`.
   `runtime-2026-09-04.log`, `result-2026-09-04.json`.
3. run-u183.scope, exit 0: same adapter with a `process` wrapper parameter;
   runtime initialized and GET / returned HTTP 200. Expected costs were 2/13
   for wife gather/build and 10/3 for husband gather/build. Chosen assignments
   were wife→gather (2), husband→build (3).
   `runtime-2026-09-04-process-shadow.log`,
   `result-2026-09-04-process-shadow.json`.

Material limit: the response reports `colony.HEAPU8.length = 327680000` bytes
(312.5 MiB) of Wasm linear addressable memory. Cloudflare documents a 128 MB
isolate memory limit including JavaScript and Wasm. This local run does not
establish production memory accounting or capacity. It proves that the exact
optimizer API can execute through this small workerd adapter. It does not prove
the release fits production memory limits, nor full simulation throughput,
multiple Durable Objects per isolate, persistence, hibernation, or deployment.
The current production compatibility date also remains untested by this installed
runtime. Stop here; do not infer deployment readiness from HTTP 200.

References:

- https://developers.cloudflare.com/workers/runtime-apis/webassembly/
- https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-eval-during-startup
- https://developers.cloudflare.com/workers/platform/limits/#memory
