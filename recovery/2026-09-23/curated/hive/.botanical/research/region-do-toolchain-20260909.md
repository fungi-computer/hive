# Region DO local toolchain and public Watchdog consumption

Read-only qualification, 2026-09-09, native Asset Product PM. No Worker/DO started,
no package built or installed, no shared source changed, no deployment/model
calls. Commands below are the proposed Root proof path, not executed evidence.

## Smallest runtime choice

Use Hive's existing Node24 + Wrangler4.127.1. Its installed package pins
workerd1.20260828.1 and Miniflare5.20260828.0-alpha. Avoid a separately upgraded
Miniflare/Vitest runtime for this cut. Existing tools/asset-mcp/http-proof.mjs
already demonstrates the local owned-process pattern: preflight free loopback
port; spawn Wrangler in its own process group; collect logs; bounded readiness;
SIGINT and await owned exit; verify listener closure. Adapt that lifecycle to a
separate Root region proof, retaining its state directory between phases.

Minimal separate Worker config: name `hive-region-local-proof`, main pointing to
Root's worker, compatibility_date `2026-09-04`, binding
`durable_objects.bindings=[{name:"REGIONS",class_name:"Region"}]`, and migration
`migrations=[{tag:"v1",new_sqlite_classes:["Region"]}]`. No remote binding flag.
Stable worker/class/binding/object names and same persist directory are required
across restart. `REGIONS.idFromName("fixed-proof-region")` supplies stable object
identity; allocating a fresh unique ID would test another SQLite database.

Example owned launch (Root supplies actual config path):

```sh
node node_modules/wrangler/bin/wrangler.js dev --local \
  --config tools/region-do/wrangler.jsonc --ip 127.0.0.1 --port 5198 \
  --inspector-port 0 --show-interactive-dev-session=false \
  --persist-to .botanical/region-do-proof/state
```

Run the orchestration script through the standard run-proof.sh ten-minute scope,
not two unrelated unmanaged servers. Start A, transact, await confirmed write,
stop A completely, start B with exactly the same config/path/ID, inspect canonical
rows. Never delete state between those phases or run both against the path.
Actual SQLite persistence/restart remains to be exercised by Root's new owner.

## Fault points and alarms

The owner seam is native `ctx.storage.sql` and bound
`operation => ctx.storage.transactionSync(operation)`. For before-commit proof,
throw deliberately INSIDE the synchronous transaction after writing candidate
region/checkpoint/receipt/Watchdog rows; let the exception escape that closure.
Then inspect after restart: none of those writes may survive. Do not await or
catch-and-swallow inside transactionSync.

For after-commit/before-delivery proof, complete the transaction, await
`ctx.storage.sync()`, then fail the request/abort the object before delivering
its result. Replay the same command identity against the reopened owner and
check one settled durable result, not a second physical mutation. This is a
precise fault barrier; killing an arbitrary process after an arbitrary sleep
does not identify which side of commit was tested. Keep fault selection a
local-proof-only host seam, not a public operation or engine saved callback.
The `sync` API flushes pending writes; thrown synchronous transactions roll back.
[Cloudflare SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
confirms both contracts.

For genuine alarms use `storage.setAlarm(Date.now()+shortDelay)` in the owner,
then poll durable alarm results with a bounded deadline. Arm a future alarm,
stop/reopen before its due time, and verify persisted wake if the specific test
needs restart recovery. Each DO has one alarm; handlers are at-least-once and
throwing handlers retry. The durable receipt must tolerate replay. A direct
RPC call to `alarm()` does not prove actual alarm dispatch. No new scheduler is
needed: Botanical's retained AlarmClock investigation owns wake multiplexing.
[Cloudflare alarm API](https://developers.cloudflare.com/durable-objects/api/alarms/).

## Direct Miniflare option, if Root needs controlled eviction

The actual installed declaration/source exports `Miniflare`,
`convertV4MiniflareOptions`, `dispatchFetch`, `getDurableObjectNamespace`,
`dispose`, and `unsafeEvictDurableObject(scriptName,className,{name})`.
Miniflare5 uses `resourcePersistencePath`; do not copy old undocumented
`durableObjectsPersist` examples. Its public V4 converter accepts the familiar
`modules`, `scriptPath`, `name`, compatibilityDate, and
`durableObjects:{REGIONS:{className:"Region",useSQLite:true}}` shape and returns
the new options shape. Set `resourcePersistencePath` to an absolute owned path;
await dispose before reconstructing with the same options. Direct Miniflare
expects runtime-ready modules; Wrangler already supplies bundling, so prefer
Wrangler unless eviction control justifies the extra harness.

`unsafeEvictDurableObject` calls dev control after confirming worker/class. It
is explicitly an unsafe testing seam, not domain lifecycle. SQLite inspection
`unsafeGetDurableObjectStorage(...).exec(...)` requires
`unsafeInspectDurableObjects:true`; it executes inside the target object and
may start it. Prefer owner read operations for invariant evidence. No public
forced-alarm/test-clock API appears in this installed Miniflare declaration.
Do not treat unsafeTriggerHandlers (Worker scheduled triggers) as DO alarms.

Source checked: node_modules/miniflare/dist/src/index.d.ts (Miniflare around1083,
InstanceOptions around830, V4 converter and useSQLite declarations) and index.js
(actual eviction/storage inspection implementation around113878). Wrangler CLI
source handles new_sqlite_classes and maps local persist path into Miniflare's
resourcePersistencePath. Botanical installed Cloudflare types also expose DO
transactionSync/sync/setAlarm and state.abort; those declarations are API
corroboration, not proof of this new worker's runtime behavior.

## Watchdog: public package path and actual missing artifact

Current Botanical packages/watchdog/dist exists. Public `.` exports Promise
`Watchdog.make`, `/effect` exports the Effect owner. It consumes a structural
owner `{sql:{exec(...)->cursor.toArray()}, transactionSync}` rather than a
custom SQL engine. Bind transactionSync to the actual DO storage receiver.
`transactional.enqueueAcceptedJob`, readQueueHead and cancellation projection
can join the SAME region transaction; async ingest/tick/wake are not substitutes
for atomic region+queue admission. Wake recomputation stays outside the sync
transaction and must use the eventual accepted AlarmClock host.

The compiled public entry imports only its relative dist modules and `effect/*`;
internal identities import the public `@fungi.computer/cairn` root. Current
Watchdog manifest declares Cairn `workspace:*` and Effect3.22.1. Cairn exports
root/id/words and depends on nanoid5.1.16 plus Zod4.2.1. No Watchdog or Cairn
`.tgz` was found in inspected Botanical .botanical and /tmp paths, and the
advertised .botanical/watchdog-pack/cairn-pack directories are absent. Retained
pnpm file-package installations and current dist are NOT a released packed
artifact or proof of current distribution contents.

Request Botanical-owned `pnpm pack` outputs from accepted dist for BOTH packages
(their package scripts already define the pack destinations). pnpm packaging
must rewrite workspace:* to ordinary version dependency. Root should inspect
both tar manifests and pin hashes. Consume both immutable tarballs as explicit
file dependencies in the isolated Hive tool package, as with Caps/Stipe; keep
Cairn explicitly resolved to its local released tarball and lock public Effect,
Nanoid and Zod transitives. Do not copy a Botanical workspace manifest with
workspace:* into npm, import ../Botanical-next source, or fork Watchdog storage.
No dependency edits/builds/packaging were performed in this review. Packet
availability and actual installed import/bundle proof remain outstanding with
the release owners, not silently assumed from source.
