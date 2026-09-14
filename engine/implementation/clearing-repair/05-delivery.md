# Integration, qualification and publication

[Packet index](README.md)

## Evidence ledger / acceptance IDs

Write actual result, source pin, command, scope, exit and evidence path for each ID
into the existing sprint checkpoint. Blank means unproved. A skipped test is not a
pass. Runtime fixtures use real GameSession/WasmKernel or native Rust owner; fake
provider arrays supplement but cannot replace physical evidence.

| ID | Required scenario and assertions | Owning fixture/source |
| --- | --- | --- |
| J1 | interrupted approach releases exact worker; old result cannot stop/complete new attempt | sdk/work-system.test.ts + native work_attempt laws |
| J2 | blocked carrying -> real lot retained, no labor lock, no duplicate delivery; manual move not overridden | sdk/delivery.test.ts + runtime/colony-work-contact.test.ts |
| J3 | no contacts then reopened contact -> original job completes once, unrelated eligible work runs | same runtime fixture; prove physical obstruction really finished |
| J4 | all dig/tree/resource/water/process/construction/deconstruction providers use same attempt owner | affected current provider laws + source deletion audit |
| J5 | operation commit/lost ack/current-format restore/exact replay preserves progress, quantity, reference uniqueness | runtime/session-region-records.test.ts + native DO fixture |
| C1 | floor under brewer AND bed completes, identities/ports/contents unchanged | games/colony-construction.test.ts |
| C2 | paid different finish replaces same support face, cancel/retry/save safe, no support gap | new native floor replacement laws + real Colony test |
| C3 | alternate legal contact works; sealed/missing/frame/unsupported outcomes typed | native interaction_contact + SDK real consumer |
| P1 | two credentials one world -> two parties/four people; same credential duplicate/concurrent join and commit-before-reply-loss -> same pair | public-engine-host party-join.test.ts with real SQLite Region |
| P2 | no cross-party commands, claims or material spending; raw native actions/global pause rejected at HTTP and Region, including forged scope; host-tick work retains task party | party command + native material/attempt laws |
| P3 | A disconnects, B renews existing world lease, A work advances with no per-party presence check; reconnect same IDs/progress | one bounded actual DO two-client witness |
| P4 | Draft/Undraft visible, selection no side effect, Go requires Draft, mixed-party selection rejected | shared client controls + command tests |
| D1 | physical/art datum agrees for bed/brewer/stair all directions | construction-visuals + original-model transform laws |
| D2 | point/line/bounds sorter gives the same order for every input permutation; static relations cache and moving relations refresh | isometric sorter laws |
| D3 | person behind/front furniture and stair bottom/mid/landing, upper/lower storeys/cutaways; original art remains intact | bounded actual original-art capture, lead viewed |
| D4 | shared final draw order plus alpha silhouette determines entity click, including nonpickable occluder; terrain tools still reach support planes; previews don't steal selection | client picking law + D3 input |
| D5 | no per-pixel depth runtime, per-frame terrain rebake/readback or all-world comparison; static invalidation and moving-neighborhood cost are bounded | source deletion audit, sorter counters and short measured fixture |
| R1 | actual engine HTML/JS/WASM/bank hashes served; correct DO API origin and credentials | exact artifact HTTP readback + bounded game join |

Useful baseline: corrected simple runtime floor fixture in work-contact-repair
ran `run-u7158`, exit0, 1/1, no browser/build. Its earlier `7e74e0c` fixture had
incorrect support coordinate/stale query assumptions; do not treat that source as
accepted. Root corrections remain dirty there and must be committed before reuse.
Preserve every existing red; do not rewrite evidence as if it was a game defect.

## Source gates and practical commands

Use the existing wrapper for all automated proof work:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh COMMAND ARGUMENTS
```

Before running, inspect actual running scopes/processes. Retain returned session
and poll through terminal; report exit/cleanup. Do not wait on historical notes.
No per-command approval gate is added for authorized work. Stop only owned tasks.

Add one maintained `engine/scripts/qualify-clearing-repair.mjs` runner for the
changed tests (esbuild bundle TS tests using existing installed dependency,
platform=node, ESM, packages=external; node --test executes them). Do not install
tsx or skip missing WASM. Reuse the source-matched generated artifacts; build native
once after joined Rust changes through `engine/scripts/build-kernel.sh`. That
script owns toolchain pins; do not override with a guessed globally installed Rust.
Runner named groups: work, construction, parties, drawing, joined. Record exact
file list in runner. Missing file/artifact fails; groups never silently fall back
to whole test suite. Joined runs affected files once, not all history.

Native targeted laws use maintained cargo environment and `cargo test --manifest-path
engine/kernel/Cargo.toml --locked --jobs 2 <named-filter>`. Run relevant strict
engine/host tsconfigs after joined contracts/callers. Read root package/tsconfig
before naming the actual command; no skipLibCheck workaround. Run diff check and
installed touched-code Fallow command, retain/report advisories. Don't delete valid
entrypoints or add ignores to hide architectural hotspots.

Focused retest only where a correction invalidates evidence. One GPU feasibility
fixture + one joined original-art/game input witness is intended, not a matrix of
unchanged browser runs. Test current native/runtime/provider and host behavior
separately enough to identify a failure, then integrate the coherent slice.

## Format/recovery decision

WorkAttempt, floor replacement, parties and native spawn change persisted schemas.
Implement explicit version increments in their actual owners and Session/game
format when required; update session-record-store validation and native
record_bundle/snapshot path together. Unsupported old worlds fail clearly with
no writes. Never call start/reset after restore fails. Preserve their bytes and
existing invitation tokens; never silently bind old people to a new anonymous
player or treat old outcome coordinates as new attempt IDs.

Before deployment inventory whether the existing preview backend has worlds whose
format becomes unsupported. Record backup/readback and exact rollback artifact.
The lead must report that consequence and obtain any additional user direction
needed to convert/reset those worlds; this packet does NOT authorize a migration.
Do all source/build/qualification/artifact preparation first so any needed decision
is concrete. Do not call the goal complete if required existing-world continuity
is still unresolved. If user chooses new-world interim, label it explicitly and
retain old state; no compatibility runtime is introduced just to hide the choice.

Current-format recovery proof is mandatory regardless: inject failure after native
mutation before SQL commit, after SQL commit before reply, during join, and between
work effect and outcome reconciliation. Reopen same store, replay exact operation,
assert canonical stock/progress/membership. Existing Region receipt and resident
begin/accept/discard paths own this. No new transaction coordinator.

## Release procedure

Use existing authorized Clearing frontend and hive-public-engine-demo backend.
Freeze source commit and actual generated WASM/source provenance. Build root Vite
FIRST, engine Vite SECOND (root clears dist). Require actual dist/engine/colony
entry and its module; never SPA-fallback to retained root Clearing. Inspect
scripts/build-colony.sh/current Vite configuration before the final exact command.
Require VITE_HIVE_PUBLIC_HOST at build time; check compiled request origin.

Prepare backend via tools/public-engine-host/prepare.mjs, actual preview origin,
implementation hash and correct asset arguments. Never deploy the blank template.
Current machine credential env is
`/home/levi/src/Botanical-next/.botanical/credentials/cloudflare.env`; use existing
Wrangler --env-file option, never print/source-log/copy its contents. Preserve exact
host target. No shared Botanical edits, website writer or new deployment service.

Publish frozen bytes only after acceptance. Record source SHA, WASM and artifact
hashes, deployment versions, previous rollback, and exact served HTTP readback.
Verify one actual hosted world join/command path uses Rust/DO, two distinct
participants and correct art bank; localhost success alone isn't hosted parity.
Return playable link and what remains unproved. The goal completes only when all
explicit requirements and acceptance IDs have authoritative evidence.

### Exact Clearing preview commands

The backend and frontend use different Wrangler operations. Do not substitute one
for the other.

Freeze and build from the accepted worktree. The root build runs first; the engine
build adds the real `/engine/colony` entry afterward. Both builds receive the
public DO host at compile time:

```sh
VITE_HIVE_PUBLIC_HOST=https://hive-public-engine-demo.levi-fe0.workers.dev pnpm build
VITE_HIVE_PUBLIC_HOST=https://hive-public-engine-demo.levi-fe0.workers.dev ./node_modules/.bin/vite build --config engine/vite.config.js
```

Prepare and deploy the DO backend with its generated configuration. The prepare
step binds the exact frontend origin and hashes the authoritative program. This is
an ordinary backend deployment, so it uses `wrangler deploy`:

```sh
node tools/public-engine-host/prepare.mjs \
  .botanical/clearing-repair/RELEASE/backend \
  https://clearing-garden-fungi-goblin-bnb.levi-fe0.workers.dev
./node_modules/.bin/wrangler deploy \
  --config .botanical/clearing-repair/RELEASE/backend/wrangler.json \
  --env-file /home/levi/src/Botanical-next/.botanical/credentials/cloudflare.env
```

The frontend is a named preview alias. `wrangler deploy` only creates an unattached
version for this `workers_dev: false` project and prints `No targets deployed`.
That output is a failed publication. Publish the accepted static bytes with the
alias operation instead:

```sh
./node_modules/.bin/wrangler versions upload \
  --preview-alias clearing-garden \
  --config wrangler.jsonc \
  --env-file /home/levi/src/Botanical-next/.botanical/credentials/cloudflare.env
```

Record both the immutable `Version Preview URL` and `Version Preview Alias URL`.
An exit-zero upload does not prove that the alias serves the new bytes. Verify the
entire frozen directory through the alias before running a browser witness:

```sh
node engine/scripts/verify-static-preview.mjs \
  dist \
  https://clearing-garden-fungi-goblin-bnb.levi-fe0.workers.dev \
  .botanical/clearing-repair/RELEASE/http-readback.json
```

Any mismatch stops the release. In particular, compare the asset names referenced
by local and served `dist/engine/colony.html`; a version-specific URL serving new
assets while the alias serves old assets is not hosted parity. Never rerun the
playable browser proof against that stale alias. Keep the previous frontend and
backend version IDs as the rollback pair before changing either host.
