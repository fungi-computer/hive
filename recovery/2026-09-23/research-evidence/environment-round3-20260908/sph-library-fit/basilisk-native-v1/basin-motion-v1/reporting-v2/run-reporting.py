"""One reporting-only comparison of immutable existing native captures."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import time

root = Path(__file__).resolve().parent
study = root.parent
raw = study / "result-v1/native-result.json"
source = root / "source/compare-wave.mjs"
oracle = root / "source/oracle/oracle.mjs"
pins = json.loads((root / "source-pins.json").read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


assert sha(raw) == "0e1e60df0db21cdfe3a0d1e0f21673163ce7aa4fc1628415f697525e7c60b3a4"
assert sha(study / "compare-wave.mjs") == pins["originalComparatorSha256"]
assert sha(source) == pins["candidateComparatorSha256"]
assert sha(oracle) == "1b9ae075cc53816831945a0f9f8f023f6bf395da53352ac4dfe8ceeb02076c84"
out = root / "result"
out.mkdir(exist_ok=False)
started = time.monotonic()
call = subprocess.run(["node", str(source), str(raw), str(out / "comparison.json")],
                      capture_output=True, timeout=10, check=False)
(out / "stdout.log").write_bytes(call.stdout)
(out / "stderr.log").write_bytes(call.stderr)
result = json.loads((out / "comparison.json").read_text())
fine = next(c for c in result["cases"] if c["caseName"] == "fine")
controls = {
    "originalOverallFailureRetained": call.returncode == 1 and result["passed"] is False,
    "refinementIneligible": result["refinement"]["eligible"] is False and result["refinement"]["passed"] is False,
    "fineReturnNotClaimed": fine["accuracy"]["returnedAmplitude"] is False and fine["returnAmplitudeError"] is None,
    "fineCoverageIncomplete": fine["coverage"]["completedInterval"] is False,
    "stderrEmpty": call.stderr == b"",
    "rawCaptureUnchanged": sha(raw) == "0e1e60df0db21cdfe3a0d1e0f21673163ce7aa4fc1628415f697525e7c60b3a4",
}
receipt = {
    "scope": "Reporting-only; no native execution. Original numerical failure preserved.",
    "invocationId": os.environ.get("INVOCATION_ID"),
    "comparatorExitCode": call.returncode,
    "wallSeconds": time.monotonic() - started,
    "controls": controls,
    "sourceSha256": sha(source), "rawSha256": sha(raw),
    "comparisonSha256": sha(out / "comparison.json"),
}
(out / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
sys.exit(call.returncode if all(controls.values()) else 2)
