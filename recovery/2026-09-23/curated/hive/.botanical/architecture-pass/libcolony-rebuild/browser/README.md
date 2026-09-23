# Chromium consumer proof for the smaller libcolony build

Passed using existing accepted game dist at http://127.0.0.1:5188/.
The loaded application bundle was /assets/game-5BOkycM6.js. Document SHA-256:
6992dec33375c28339b6e05828e74b605c14c0e76edf468fad62998bea94b6d7.

Only /vendor/libcolony/colony.js and /vendor/libcolony/colony.wasm browser
requests were intercepted, each once, to supply the smaller build. All application
assets and gameplay code came from the existing server. This is a browser
compatibility/consumer probe, not hosted artifact parity or a full home regression.
No tracked source, vendor files, server assets, or provider resources changed.

Actual input selected Rowan in the scene, selected oak-1 at (3,4), and clicked
Order chopping. Observation confirmed the live Rowan assignment while chopping;
then the tree was felled, exactly six wood appeared, cargo stayed zero, the
job list emptied, and the assignment became null. Exactly one chop command was
recorded. The real browser loader's libcolony HEAPU8 stayed at 16,777,216 bytes.
No page errors, console errors, failed requests, or HTTP error responses occurred.

Chromium 151.0.7922.34, installed Playwright browser revision 1234; existing
portable browser libraries were selected explicitly. No browser/library packages
were installed. Two preliminary browser-launch environment failures are preserved
in initial-launch-failure.txt; neither reached the application.

Reproduce from /home/levi/src/hive while the accepted dist server remains on 5188:

```sh
bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh env CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/playwright-libs/root/usr/lib/x86_64-linux-gnu node /home/levi/src/hive/.botanical/architecture-pass/libcolony-rebuild/browser/probe.mjs
```

result.json includes original/chopping/finished observations, artifact hashes,
intercepted request identities, browser version and closed-browser confirmation.
tree-felled.png is the inspected resulting still. The normal finally block closed
the browser context and browser. scope-collection.txt records run-u196, run-u198
and successful run-u200 as not-found/inactive/dead. The existing human/static
preview server was not stopped.

Rebuilt asset SHA-256 (same files previously proved in local workerd):

- JS: 60ab2e98baa488a39848e2a576bafcce48f33aa49fe995de907613c9915fafa0
- Wasm: 33d78e3451179d1e17d283837066a819d94ec0bba239dda4c6ce19edb7fcc0e9

Public vendor hashes were rechecked after this proof and still match the
unmodified original release PROVENANCE.md.
