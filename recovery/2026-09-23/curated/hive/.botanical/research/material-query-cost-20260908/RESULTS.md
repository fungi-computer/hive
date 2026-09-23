# Material-query cost evidence

The initial proof-wrapper invocation on 2026-09-08 did not execute the benchmark:

```text
Failed to find executable ./node_modules/.bin/tsx: No such file or directory
```

The offline `npm exec --offline -- tsx --version` fallback also did not execute
the benchmark because the package was unavailable in npm's cache (`ENOTCACHED`).

The first built-in Node run correctly refused to measure because the live
`src/materials.ts` changed after the source hash check. The final run imports the
exact `857f504:src/materials.ts` snapshot stored beside this evidence.

Completed invocation (exit 0, retained `systemd-run` scope `run-u2025.scope`):

```bash
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
  node --experimental-strip-types \
  .botanical/research/material-query-cost-20260908/measure-available-portions.mts
```

The script imported the adjacent exact snapshot of
`857f504:src/materials.ts`, SHA-256
`f398af41c19e5de5051adbef990b251a928b04934af6f590123496acd90aed68`,
under Node `v24.20.0`. Each case has 40 warm-up calls, then 21 timed samples;
the reported value is the warm median nanoseconds per `availablePortions` call.
Each lot is a deterministic ground wood lot of quantity two. The proportional
case reserves quantity one from every other lot.

| Lots | Existing reservations | Median ns/call | Returned wood | Checksum |
| ---: | ---: | ---: | ---: | ---: |
| 20 | 0 | 3,030 | 40 | 420 |
| 20 | 10 | 3,945 | 30 | 320 |
| 200 | 0 | 119,441 | 400 | 40,200 |
| 200 | 100 | 277,621 | 300 | 30,200 |
| 2,000 | 0 | 10,709,180 | 4,000 | 4,002,000 |
| 2,000 | 1,000 | 26,795,676 | 3,000 | 3,002,000 |

This measures only the `eligible-ground` wood `availablePortions` query. It does
not measure assignment, routing, optimizer work, browser rendering, capacity, or
frame rate. The returned quantity and checksum assertions passed for every timed
sample.

## Retained proof record

No rerun was performed for this record. Available retained metadata:

- proof wrapper scope: `run-u2025.scope`
- systemd invocation ID: `1378ba3835374c60a15a5c897e5c417c`
- retained terminal session ID: `40620`
- final process exit: `0`
- exact elapsed duration is unavailable from the retained completion record

Initial wrapper stdout:

```text
f398af41c19e5de5051adbef990b251a928b04934af6f590123496acd90aed68  .botanical/research/material-query-cost-20260908/materials-857f504.ts
Running as unit: run-u2025.scope; invocation ID: 1378ba3835374c60a15a5c897e5c417c
```

Final benchmark stdout:

```json
{
  "benchmark": "availablePortions eligible-ground wood",
  "commit": "857f50416ab092f4fa5e107577795136f5318efd",
  "sourceHash": "f398af41c19e5de5051adbef990b251a928b04934af6f590123496acd90aed68",
  "runtime": "v24.20.0",
  "warmupCallsPerCase": 40,
  "samplesPerCase": 21,
  "cases": [
    {
      "lots": 20,
      "reservations": 0,
      "loopsPerSample": 500,
      "medianNanosecondsPerCall": 3030,
      "returnedQuantity": 40,
      "checksum": 420
    },
    {
      "lots": 20,
      "reservations": 10,
      "loopsPerSample": 500,
      "medianNanosecondsPerCall": 3945,
      "returnedQuantity": 30,
      "checksum": 320
    },
    {
      "lots": 200,
      "reservations": 0,
      "loopsPerSample": 80,
      "medianNanosecondsPerCall": 119441,
      "returnedQuantity": 400,
      "checksum": 40200
    },
    {
      "lots": 200,
      "reservations": 100,
      "loopsPerSample": 80,
      "medianNanosecondsPerCall": 277621,
      "returnedQuantity": 300,
      "checksum": 30200
    },
    {
      "lots": 2000,
      "reservations": 0,
      "loopsPerSample": 8,
      "medianNanosecondsPerCall": 10709180,
      "returnedQuantity": 4000,
      "checksum": 4002000
    },
    {
      "lots": 2000,
      "reservations": 1000,
      "loopsPerSample": 8,
      "medianNanosecondsPerCall": 26795676,
      "returnedQuantity": 3000,
      "checksum": 3002000
    }
  ]
}
```
