"""Build the isolated native qcc frontend only; never run a fluid caller."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "basilisk/src"
OUT = ROOT / "toolchain-build-v2"
OUT.mkdir(exist_ok=False)
shutil.copyfile(SRC / "config.gcc", SRC / "config")
# These are ordinary generated build metadata, not solver/source alterations.
# Keep the qcc target from expanding documentation/test dependency generation.
for name in ("Makefile.tests", "Makefile.deps"):
    path = SRC / name
    assert not path.exists() or path.read_text() == "# Intentionally empty for isolated qcc-only build.\n"
    path.write_text("# Intentionally empty for isolated qcc-only build.\n")

env = os.environ.copy()
env["BASILISK"] = str(SRC)
env["OMP_NUM_THREADS"] = "1"
env["CFLAGS"] = "-std=c99 -D_XOPEN_SOURCE=700 -D_GNU_SOURCE=1 -O2 -g -Wall -pipe -D_FORTIFY_SOURCE=2"
commands = [
    ["make", "-C", str(SRC / "ast/interpreter"), "-j2", "CC=gcc", "interpreter.o"],
    ["make", "-C", str(SRC / "ast"), "-j2", "CC=gcc", "libast.a"],
    ["make", "-C", str(SRC), "-j2", "CC=gcc", "-o", "Makefile.tests", "-o", "Makefile.deps", "qcc"],
]
receipt = {
    "startedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "invocationId": env.get("INVOCATION_ID"),
    "scope": "Compile ast/libast.a and qcc only; no numerical simulation.",
    "maxMakeJobs": 2,
    "innerGuardSeconds": 120,
    "commands": [],
}
start = time.monotonic()
code = 0
for i, command in enumerate(commands, 1):
    begin = time.monotonic()
    log = OUT / f"command-{i}.log"
    print(json.dumps({"command": command, "log": str(log)}), flush=True)
    with log.open("wb") as output:
        completed = subprocess.run(command, env=env, stdout=output, stderr=subprocess.STDOUT)
    code = completed.returncode
    receipt["commands"].append({"argv": command, "exitCode": code,
                                "wallSeconds": time.monotonic() - begin,
                                "log": log.name})
    (OUT / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt["commands"][-1]), flush=True)
    if code:
        print(log.read_text()[-12000:], flush=True)
        break
receipt["wallSeconds"] = time.monotonic() - start
receipt["exitCode"] = code
receipt["artifacts"] = []
for path in (SRC / "ast/libast.a", SRC / "qcc"):
    if path.exists():
        receipt["artifacts"].append({"path": str(path.relative_to(ROOT)),
                                     "bytes": path.stat().st_size,
                                     "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
(OUT / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2), flush=True)
sys.exit(code)
