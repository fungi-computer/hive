"""Reviewed fixed serial pair only. No compile, parameter sweep or hidden rerun."""
from pathlib import Path
import hashlib
import json
import os
import re
import resource
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build-v1"
OUT = ROOT / "result-v1"
pins_bytes = (ROOT / "source-pins.json").read_bytes()
pins = json.loads(pins_bytes)
for item in pins["files"]:
    assert hashlib.sha256((ROOT / item["path"]).read_bytes()).hexdigest() == item["sha256"], item["path"]
compiled = json.loads((BUILD / "receipt.json").read_text())
assert compiled["exitCode"] == 0
assert compiled["reviewedSourcePinsSha256"] == hashlib.sha256(pins_bytes).hexdigest()
for item in compiled["files"]:
    assert hashlib.sha256((BUILD / item["path"]).read_bytes()).hexdigest() == item["sha256"], item["path"]
for name in ("wave.c", "wave-observation.h"):
    assert (BUILD / name).read_bytes() == (ROOT / name).read_bytes()
OUT.mkdir(exist_ok=False)
env = os.environ.copy()
env["OMP_NUM_THREADS"] = "1"
started = time.monotonic()
cases = []
for case_name in ("coarse", "fine"):
    remaining = 28 - (time.monotonic() - started)
    if remaining <= 0:
        break
    case_dir = OUT / case_name
    case_dir.mkdir()
    begin = time.monotonic()
    timed_out = False
    with (case_dir / "stdout.log").open("wb") as stdout, (case_dir / "stderr.log").open("wb") as stderr:
        try:
            run = subprocess.run([str(BUILD / "wave"), case_name], cwd=case_dir, env=env,
                                 stdout=stdout, stderr=stderr, timeout=remaining)
            code = run.returncode
        except subprocess.TimeoutExpired:
            timed_out = True
            code = None
    elapsed = time.monotonic() - begin
    rows, parse_errors, nonfinite_tokens = [], [], []
    for line in (case_dir / "stdout.log").read_text().splitlines():
        if not line.startswith("HIVE_WAVE "):
            continue
        payload = line[len("HIVE_WAVE "):]
        # Retain C nonfinite diagnostics as strings, including array entries.
        pattern = r'(?<=[\[:,])\s*(-?(?:nan|inf))\s*(?=[,}\]])'
        nonfinite_tokens.extend(re.findall(pattern, payload))
        payload = re.sub(pattern, lambda m: '"' + m.group(1) + '"', payload)
        try:
            rows.append(json.loads(payload))
        except json.JSONDecodeError as error:
            parse_errors.append({"error": str(error), "line": line})
    item = {"caseName": case_name, "exitCode": code, "timedOut": timed_out,
            "wallSeconds": elapsed, "remainingCeilingAtStartSeconds": remaining,
            "stdoutBytes": (case_dir / "stdout.log").stat().st_size,
            "stderrBytes": (case_dir / "stderr.log").stat().st_size,
            "nonfiniteTokens": nonfinite_tokens, "parseErrors": parse_errors, "rows": rows}
    cases.append(item)
    (case_dir / "capture.json").write_text(json.dumps(item, indent=2) + "\n")
    if timed_out:
        break
native_wall = time.monotonic() - started
receipt = {"scope": "One fixed 2D wave fixture, two serial meshes; no ledge/3D/restart qualification.",
           "invocationId": env.get("INVOCATION_ID"), "combinedNativeCeilingSeconds": 28,
           "nativeCaptureWallSeconds": native_wall,
           "nativePeakRssKiBBatch": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
           "reviewedSourcePinsSha256": hashlib.sha256(pins_bytes).hexdigest(),
           "binarySha256": hashlib.sha256((BUILD / "wave").read_bytes()).hexdigest(),
           "compilerReceiptSha256": hashlib.sha256((BUILD / "receipt.json").read_bytes()).hexdigest(),
           "cases": cases}
(OUT / "native-result.json").write_text(json.dumps(receipt, indent=2) + "\n")
# Mathematical comparison occurs after native budget/peak-RSS capture.
with (OUT / "comparison.log").open("wb") as output:
    try:
        comparison = subprocess.run(["node", str(ROOT / "compare-wave.mjs"),
            str(OUT / "native-result.json"), str(OUT / "comparison.json")],
            cwd=ROOT, stdout=output, stderr=subprocess.STDOUT, timeout=15)
        compare_code = comparison.returncode
    except subprocess.TimeoutExpired:
        compare_code = 124
summary = {"invocationId": receipt["invocationId"], "comparisonExitCode": compare_code,
           "nativeCaptureWallSeconds": native_wall, "nativePeakRssKiBBatch": receipt["nativePeakRssKiBBatch"],
           "caseExitCodes": [{"case": c["caseName"], "exitCode": c["exitCode"],
                              "timedOut": c["timedOut"]} for c in cases]}
(OUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
print((OUT / "comparison.log").read_text()[-16000:])
sys.exit(0 if compare_code == 0 else 1)
