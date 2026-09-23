# Premature SIGTERM: exact launch metadata

Recorded 2026-09-07. No sender/cause established. Current collected-unit defaults are not historical configuration evidence. No rerun while CTO investigates.

## Root controls: run-u236.scope

Enclosing `functions.exec` had no pragma and awaited `Promise.allSettled` of two `tools.exec_command` calls: integrity235 and controls236. Both yielded a native session after1000ms. No enclosing shell cleanup or timeout command.

Actual controls cmd:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh env LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/browser-libs/root/usr/lib/x86_64-linux-gnu CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell npm run prove:controls -- https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/ .botanical/controls-hosted-final
```

`tools.exec_command` supplied yield_time_ms1000, max_output_tokens1400, cwd inherited `/home/levi/src/hive`; no timeout/tty/sandbox override. Launch returned chunk645d96, session10218, wall_time_seconds1.001570967; scope invocation67a3508ac0a1417998eb8139763668fc. The later empty `tools.write_stdin` poll of10218 returned chunkb2ff60, exit143, after the script's full success JSON was printed. The final proof.json contains success true, errors[], browserClosed true. This is assertion evidence, not a clean process-exit receipt.

## Agent home: run-u237.scope

The proof agent reports its enclosing `functions.exec` had no pragma and awaited `Promise.allSettled` of home237 and study238 exec_command calls. Exact home cmd:

```sh
bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh env CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/playwright-libs/root/usr/lib/x86_64-linux-gnu npm run prove -- https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/ .botanical/controls-hosted-home
```

exec_command workdir `/home/levi/src/hive`, yield_time_ms1000, max_output_tokens1000; no timeout/tty/sandbox override. Result chunkd438ff, session81673, wall_time_seconds1.001149122, invocation6111a18989e24e519d2f7111c356059b. Journal start06:54:17 UTC, end06:57:12, no timeout/OOM/stop cause logged. Agent later polled with functions.exec pragma yield1000/max1000 calling `tools.write_stdin({session_id:81673,chars:"",yield_time_ms:45000,max_output_tokens:1000})`; result chunk9722b4, wall_time_seconds0.05044125, exit143, no output. Partial images/video preserved; no full-home pass.

## Cleanup source and explicit actions

Current runner source, read at launch, execs systemd-run --user --scope --collect --expand-environment=no with RuntimeMaxSec=10min, TimeoutStopSec=5s, KillMode=control-group. These are source settings, not a reconstructed historical unit record.

The home and study scripts each finally call only `await context.close(); await browser.close();`. The controls script does the same, then records browserClosed, writes proof.json and prints the result. No added process kill, trap or general shell cleanup surrounds these runs.

Astra/root issued no stop/kill command in this turn. The proof agent's only explicit stop was `systemctl --user stop run-u227.scope` during the earlier requested favicon correction hold. Neither owner issued stop/kill for236 or237, nor a broad browser/npm process pattern.

Study238 exited0; integrity235 exited0. Full-home237 is interrupted, controls236 has successful finalized assertion evidence followed by process143. Prior full-home213 completed all gameplay assertions but failed final errors[] on a separately reproduced missing favicon request; its failure remains distinct from this interruption.
