# Full-viewport proof adaptation receipt

2026-09-07. The only tracked changes made in this lane are `scripts/prove.mjs` and `scripts/prove-study.mjs`. They use the current viewport coordinates from `__GOBLIN.project`, open the relevant Build/Orders/Character/Menu controls through actual input, use `#chop` for oak commands, and reserve `#task` for Done placing. All original gameplay, conservation, pause, night/dawn, reset, study, and empty-error assertions remain. Neither script changes simulation state through the read-only debugging API. Parent committed the reviewed scripts in `068787afb3815891e9aa0cac026655b2d81d93d3` while verification was in progress. There have been no subsequent script changes.

Runtime: Node.js v24.20.0; installed Playwright Chromium revision1234, browser151.0.7922.34; portable browser library path shown in commands. Current local dist contains game-OuPMsWtq.js and the integrated16 MiB libcolony build. Exact script and dist hashes are in `input-hashes.txt`.

All browser runs use the required run-proof wrapper, which creates a collected user systemd scope with a10-minute deadline and control-group cleanup. The scripts close their browser/context in `finally`.

## Local study: passed

```sh
bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh env CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/playwright-libs/root/usr/lib/x86_64-linux-gnu npm run prove:study -- http://127.0.0.1:5188/study.html .botanical/architecture-pass/controls-regression/study
```

Scope run-u214 exited0 and was collected. `study/proof.json` preserves four facings, animation, pause, desktop/mobile native zoom, silhouette bounds, actual Back navigation, real libcolony chop assignment, six wood, cleared assignment, and errors[]. Stills and video are alongside it.

## Local full home: gameplay passed; final console assertion failed

```sh
bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh env CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/playwright-libs/root/usr/lib/x86_64-linux-gnu npm run prove -- http://127.0.0.1:5188/ .botanical/architecture-pass/controls-regression/home
```

Scope run-u213 exited1 and was collected. The run reached17-mobile, then failed the final unchanged errors[] assertion. All earlier full-home, rest, pause, queued work, standing night routine, dawn, reset, mobile overflow, and material-conservation assertions passed. `home/failure.json`, `home/failure.png`, all17 checkpoints and full video remain intact. This is a failed overall run, not a passing error-free result.

The short read-only page-load diagnostic `diagnose-resource.mjs` in scope run-u224 exited0 and was collected. `resource-diagnostic.json` identifies the sole error as Chromium's automatic `http://127.0.0.1:5188/favicon.ico` lookup returning404. No resource interception or error filtering was added. The video diagnostic still `home/waiting-control.png` was extracted under collected scope run-u221. The apparent placement wait was normal ongoing progress; no control or reset correction was needed.

## Published full-home run

Parent authorized the exact unchanged proof against the published preview after identifying the local favicon request:

```sh
bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh env CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/playwright-libs/root/usr/lib/x86_64-linux-gnu npm run prove -- https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/ .botanical/controls-hosted-home
```

Scope run-u227 was explicitly stopped at the parent's request before completion, because the parent chose to fix the missing favicon at its HTML owner before the final hosted regression. `systemctl --user stop run-u227.scope` terminated only the owned control group; exit143, scope collected. The interrupted process reported `page.screenshot: Target page, context or browser has been closed` while its failure handler was interrupted. Partial stills/video are preserved under `.botanical/controls-hosted-home-pre-favicon/`. This interrupted run is not a pass. No proof assertions or error filtering changed. A final run will use actual hosted requests and actual input, with no vendor interception, after the parent's updated preview is ready.

## Final revision

Parent published `016b1a02b009e798165bd4ba11653093cf4ee1c6`, adding only explicit `data:,` favicon declarations to index/study HTML. All game, art, CSS, and Wasm assets are unchanged; `final-input-hashes.txt` records final inputs. The original proof scripts remain unchanged.

Final hosted study scope run-u238 exited0: `../../controls-hosted-study/proof.json` preserves all original assertions and errors[]. Command is the study command above with URL `https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/study.html` and output `.botanical/controls-hosted-study`.

Final hosted full-home scope run-u237 used the hosted full-home command above but was unexpectedly interrupted with exit143 at06:57:12, 2m55s after its06:54:17 start. It produced checkpoints through07-wall-finished, no failure.json or assertion stderr. This lane did not terminate that scope. The journal has no deadline/timeout entry and confirms collection. Partial evidence and the scope journal are preserved under `.botanical/controls-hosted-home-interrupted-u237/`; this is not a passing run. Cause and rerun pending.
