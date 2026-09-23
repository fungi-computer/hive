"""Compile-only recipe. Caller must use run-proof plus the reviewed build ceiling."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent.parent / "basilisk/src"
OUT = ROOT / "build-v1"
PINS = json.loads((ROOT / "source-pins.json").read_text())
for item in PINS["files"]:
    assert hashlib.sha256((ROOT / item["path"]).read_bytes()).hexdigest() == item["sha256"], item["path"]
for item in json.loads((ROOT / "SOURCE-INVENTORY.json").read_text())["files"]:
    assert hashlib.sha256(Path(item["path"]).read_bytes()).hexdigest() == item["sha256"], item["path"]
assert hashlib.sha256((SRC / "qcc").read_bytes()).hexdigest() == "b7429c88f8e39253015d549bfdbd18ce6253833992ff08e3bf738cb1a3521828"
OUT.mkdir(exist_ok=False)
for name in ("wave.c", "wave-observation.h", "wave-reduced-observation.h", "compile-wave.py", "source-pins.json"):
    shutil.copyfile(ROOT / name, OUT / name)
env = os.environ.copy()
env["BASILISK"] = str(SRC)
env["OMP_NUM_THREADS"] = "1"
commands = [
    [str(SRC / "qcc"), "-O2", "-Wall", "-events", "-source", "wave.c"],
    [str(SRC / "qcc"), "-O2", "-Wall", "wave.c", "-o", "wave", "-lm"],
]
receipt = {"scope": "Compile only of isolated reduced-gravity caller; no fixed wave case executed.",
           "invocationId": env.get("INVOCATION_ID"),
           "reviewedSourcePinsSha256": hashlib.sha256((ROOT / "source-pins.json").read_bytes()).hexdigest(),
           "commands": []}
started = time.monotonic()
code = 0
for index, command in enumerate(commands, 1):
    begin = time.monotonic()
    log = OUT / f"command-{index}.log"
    try:
        with log.open("wb") as output:
            result = subprocess.run(command, cwd=OUT, env=env, stdout=output,
                                    stderr=subprocess.STDOUT, timeout=max(.001, 115 - (begin - started)))
        code = result.returncode
    except subprocess.TimeoutExpired:
        code = 124
    receipt["commands"].append({"argv": command, "exitCode": code,
                                "wallSeconds": time.monotonic() - begin, "log": log.name})
    print(json.dumps(receipt["commands"][-1]), flush=True)
    if code:
        print(log.read_text()[-12000:], flush=True)
        break
receipt["exitCode"] = code
receipt["wallSeconds"] = time.monotonic() - started
receipt["files"] = [{"path": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
                     "bytes": p.stat().st_size} for p in sorted(OUT.iterdir()) if p.is_file()]
(OUT / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2), flush=True)
sys.exit(code)
