# Connected soil-volume fixed packet — execution record

2026-09-08, owned ignored `soil-water-v1/volume-v1/` only. Root completed source/caller review and authorized this one fixed packet. No physical source, fixture, tolerance or work-limit change occurred between that acceptance and execution. The only added tool configuration was `.fallowrc.json`, declaring `qualify.mjs` as the real entry.

All automated commands used `/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh`, which owns a systemd scope with ten-minute outer limit and five-second shutdown grace. Each command also used `timeout -k 5s 30s`. Every terminal completed directly during its retained initial tool call; no background proof remains.

| Check | Scope / invocation | Exit | Actual command inside the guard |
| --- | --- | --- | --- |
| Syntax | `run-u3275.scope` / `160ae1b253224440a4c0300e930f6e4d` | 0 | `bash -c 'for file in *.mjs; do node --check "$file" || exit; done'` |
| Fallow | `run-u3276.scope` / `e49cdf1bd4b34e508e1601510c71938f` | 0 | `/home/levi/src/Botanical-next/node_modules/.bin/fallow --root . --format json --no-cache --threads 1 --output-file fallow.json` |
| Physical packet, first and only invocation | `run-u3277.scope` / `36cfb84349734b95aa7fad4f170144f5` | 0 | `bash -c 'node qualify.mjs run-v1 > run-v1-terminal.txt 2>&1; proof_status=$?; cat run-v1-terminal.txt; exit "$proof_status"'` |

Physical stdout is retained in `run-v1-terminal.txt`: passed, six groups, 3,484 checks. Its elapsed field is609.852176 ms, sampled after the final proof write. The earlier measurement stored in `run-v1/proof.json` is606.442856 ms. These are two timestamps in the same invocation, not two runs.

Fallow completed in464 ms according to its report and warned that this isolated study directory has no local `node_modules`; no package was installed. It found zero dead files/exports, cycles, unresolved imports or clones, and31 health advisories. The source has genuine `compileFaces` cognitive46 and fixture `saturatedPathDescriptor` cognitive16 hotspots. The other reported risk scores use static estimated coverage with no imported execution coverage. This is disclosed maintenance debt, not a fully green health claim. No Fallow suppression or refactor was used to change this fixed physical candidate.

The qualifier copied and hashed twelve current source/contract files plus five unchanged column-reference modules before its first numerical group. After execution every live and frozen source was rehashed against the saved inventory: zero mismatches. No numerical rerun was made while inspecting results. One read-only JSON inspection initially used unavailable `python`; the same file inspection was then performed with `python3`. This was not a solver invocation.

| Artifact | SHA256 |
| --- | --- |
| `run-v1/proof.json` | `df8a665a83a5910db4e143b42dad38ceeb435ea8e94ea3a082ecf9ce17dacd65` |
| `run-v1/source-inventory.json` | `758c4e36c5eee17863293beb48839e0fa9cdafa9f63382f477a0fd05f8b78319` |
| `run-v1-terminal.txt` | `d512e8d016e952aa4ef037b99032e11aa01ccd3092c6e448a09f001bfda1866e` |
| `fallow.json` | `b595f8f8341999055dd494e43bc4b4098b8723498ab67b312dfc2e28acb80b17` |
| `.fallowrc.json` | `82d0f27170191b083434f45e5e34a53eab226ea1ee1c9ac71dae28f22e8f719e` |
