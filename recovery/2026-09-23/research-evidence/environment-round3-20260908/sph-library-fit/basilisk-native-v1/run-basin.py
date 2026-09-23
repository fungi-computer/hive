"""One guarded physical packet. Prepared for review; not executed at this checkpoint."""
from pathlib import Path
import hashlib
import json
import math
import os
import re
import resource
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "caller-build-v1"
EXPECTED = {
    "basin": "08bfb3585a886a4cf1f78b7e5ae3b87a9a4c36f5155adb34d0a1c778779fcc6b",
    "basin.c": "d9c156d9d6ff1d1aa763daf1f7976c8a36d922029bc3cd4e124192017c8a66b0",
    "basin-observation.h": "0544aa933596eec97403d8df452a77a6dfea579fbe7eed987be10419f261e1d8",
}
for name, digest in EXPECTED.items():
    assert hashlib.sha256((BUILD / name).read_bytes()).hexdigest() == digest, name
OUT = ROOT / "result-v1"
OUT.mkdir(exist_ok=False)
env = os.environ.copy()
env["OMP_NUM_THREADS"] = "1"
started = time.monotonic()
timed_out = False
with (OUT / "stdout.log").open("wb") as stdout, (OUT / "stderr.log").open("wb") as stderr:
    try:
        native = subprocess.run([str(BUILD / "basin")], cwd=OUT, env=env,
                                stdout=stdout, stderr=stderr, timeout=28)
        code = native.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        code = None
elapsed = time.monotonic() - started
rows, parse_errors, nonfinite_tokens = [], [], []
for line in (OUT / "stdout.log").read_text().splitlines():
    if not line.startswith("HIVE_BASIN "):
        continue  # retain the ordinary upstream performance footer in stdout.log
    payload = line[len("HIVE_BASIN "):]
    # Preserve C nonfinite diagnostic tokens as strings, never zero/clamp them.
    tokens = re.findall(r'(?<=:)(-?nan|-?inf)(?=[,}])', payload)
    nonfinite_tokens.extend(tokens)
    payload = re.sub(r'(?<=:)(-?nan|-?inf)(?=[,}])', r'"\1"', payload)
    try:
        rows.append(json.loads(payload))
    except json.JSONDecodeError as error:
        parse_errors.append({"error": str(error), "line": line})
observations = [r for r in rows if r.get("kind") == "observation"]
steps = [r for r in observations if r.get("phase") == "completed-timestep"]
terminals = [r for r in rows if r.get("kind") == "terminal"]
contiguous = bool(steps)
last = 0.0
for i, step in enumerate(steps, 1):
    begin, end, dt = (step.get(k) for k in ("intervalBeginSeconds", "velocityTimeSeconds", "dtSeconds"))
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (begin, end, dt)):
        contiguous = False
        continue
    contiguous &= step.get("step") == i and abs(begin - last) <= 1e-12 and end > begin
    contiguous &= abs(end - begin - dt) <= 1e-12 and dt <= .001*(1 + 1e-12)
    last = end
controls = {
    "nativeCompleted": code == 0 and not timed_out,
    "allRowsDecoded": not parse_errors,
    "noNonfiniteDiagnostics": not nonfinite_tokens,
    "oneInitialObservation": sum(r.get("step") == 0 for r in observations) == 1,
    "allNativePhysicalControls": bool(observations) and all(r.get("valid") is True for r in observations),
    "contiguousActualIntervals": contiguous,
    "reachedDeclaredTime": abs(last - .1) <= 1e-12,
    "oneHonestTerminal": len(terminals) == 1 and terminals[0].get("completedInterval") is True,
}
receipt = {
    "scope": "One native 2D unit-depth stationary aligned-wall basin; no 3D/motion/restart qualification.",
    "invocationId": env.get("INVOCATION_ID"),
    "sourceAndBinary": EXPECTED,
    "runnerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "archiveSha256": "a629017cabad6626d71c782510f1d70b078eae44cc1c594c3e6b6fbb808164ae",
    "innerNativeCeilingSeconds": 28,
    "nativeExitCode": code, "timedOut": timed_out, "wallSeconds": elapsed,
    "nativePeakRssKiB": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
    "controls": controls, "passed": all(controls.values()),
    "nonfiniteTokens": nonfinite_tokens, "parseErrors": parse_errors, "rows": rows,
}
(OUT / "result.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({k: v for k, v in receipt.items() if k != "rows"}, indent=2))
sys.exit(0 if receipt["passed"] else 1)
