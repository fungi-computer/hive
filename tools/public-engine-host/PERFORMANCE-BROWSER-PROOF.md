# Colony performance browser proof

`performance-browser-proof.mjs` checks an already built or hosted performance
page. It does not start a server, build the frontend, run Wrangler, or install
packages. The supplied base URL may be the site origin or the page itself; the
driver opens `/engine/colony-performance.html?size=...&workers=...`.

```sh
node tools/public-engine-host/performance-browser-proof.mjs \
  --base-url https://example.invalid \
  --output .botanical/clearing-repair/performance-browser-proof \
  --size 128 --workers 32
```

`CHROMIUM_PATH` selects the provisioned Chromium. Size presets are 64, 128,
256, and 512; worker presets are 4, 8, 16, 32, 50, 100, and 200. The proof
requires a rendered Pixi canvas, no page/request errors, positive observed
wood output from the page's finite workload of 50 trees (six wood each), and
a finite measured simulation tick. Worker count is recorded as configuration;
idle workers are never used as a capacity claim.

The output directory receives `performance-browser.png`, `REPORT.json`, and
`source-hashes.json`. The report names the selected preset and exact workload,
records measured values and errors, and owns browser/context closure in a
`finally` block.
