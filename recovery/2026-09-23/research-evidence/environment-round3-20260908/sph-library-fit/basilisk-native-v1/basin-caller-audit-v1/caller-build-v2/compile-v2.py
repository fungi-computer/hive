"""Compile and retain generated C for review; never execute the basin."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent / "basilisk/src"
OUT = ROOT / "caller-build-v2"
OUT.mkdir(exist_ok=False)
for name in ("basin.c", "basin-observation.h"):
    shutil.copyfile(ROOT / "source-v2" / name, OUT / name)
shutil.copyfile(Path(__file__), OUT / "compile-v2.py")
env = os.environ.copy()
env["BASILISK"] = str(SRC)
env["OMP_NUM_THREADS"] = "1"
commands = [
    [str(SRC / "qcc"), "-O2", "-Wall", "-events", "-source", "basin.c"],
    [str(SRC / "qcc"), "-O2", "-Wall", "basin.c", "-o", "basin", "-lm"],
]
receipt = {"scope": "Compile only; basin binary not executed.",
           "invocationId": env.get("INVOCATION_ID"), "commands": []}
started = time.monotonic()
code = 0
for i, command in enumerate(commands, 1):
    begin = time.monotonic()
    log = OUT / f"command-{i}.log"
    with log.open("wb") as output:
        result = subprocess.run(command, cwd=OUT, env=env, stdout=output, stderr=subprocess.STDOUT)
    code = result.returncode
    receipt["commands"].append({"argv": command, "exitCode": code,
                                "wallSeconds": time.monotonic() - begin, "log": log.name})
    print(json.dumps(receipt["commands"][-1]), flush=True)
    if code:
        print(log.read_text()[-12000:], flush=True)
        break
receipt["exitCode"] = code
receipt["wallSeconds"] = time.monotonic() - started
receipt["files"] = [{"path": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                     "bytes": path.stat().st_size}
                    for path in sorted(OUT.iterdir()) if path.is_file()]
(OUT / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2), flush=True)
sys.exit(code)
