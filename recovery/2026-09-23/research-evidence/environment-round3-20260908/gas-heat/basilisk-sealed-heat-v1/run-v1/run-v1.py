"""One authorized native finite-heater packet; never compiles or retries."""
from pathlib import Path
import hashlib
import json
import math
import os
import re
import resource
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent.parent / 'sph-library-fit/basilisk-native-v1/basilisk/src'
OUT = ROOT / 'run-v1'

def pin(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def finite(value):
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, dict):
        return all(finite(v) for v in value.values())
    if isinstance(value, list):
        return all(finite(v) for v in value)
    return True

handoff = json.loads((ROOT / 'COMPILE-HANDOFF.json').read_text())
checkpoint = json.loads((ROOT / 'source-checkpoint-v3.json').read_text())
for name, expected in handoff['files'].items():
    assert pin(ROOT / name) == expected, name
for name, expected in checkpoint['upstream'].items():
    assert pin(SRC / name) == expected, name
OUT.mkdir(exist_ok=False)
for name in ['run-v1.py', 'COMPILE-HANDOFF.json', 'source-checkpoint-v3.json']:
    shutil.copyfile(ROOT / name, OUT / name)
env = os.environ.copy()
env['OMP_NUM_THREADS'] = '1'
command = [str(ROOT / 'build-v2/sealed-heat')]
receipt = {'scope': 'One fixed sealed 512-cell room, finite 100 J heater, 2 s horizon.',
           'invocationId': env.get('INVOCATION_ID'), 'argv': command,
           'binary': pin(ROOT / 'build-v2/sealed-heat'), 'runner': pin(Path(__file__)),
           'outerGuardSeconds': 30, 'nativeInnerWallCapSeconds': 25,
           'subprocessTimeoutSeconds': 28, 'numericalRuns': 1}
(OUT / 'admission.json').write_text(json.dumps(receipt, indent=2) + '\n')
start = time.monotonic()
before = resource.getrusage(resource.RUSAGE_CHILDREN)
timed_out = False
with (OUT / 'stdout.log').open('wb') as stdout, (OUT / 'stderr.log').open('wb') as stderr:
    try:
        result = subprocess.run(command, cwd=OUT, env=env, stdout=stdout,
                                stderr=stderr, timeout=28)
        native_exit = result.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        native_exit = None
elapsed = time.monotonic() - start
after = resource.getrusage(resource.RUSAGE_CHILDREN)
receipt.update({'nativeExitCode': native_exit, 'timedOut': timed_out,
                'wallSeconds': elapsed,
                'userCpuSeconds': after.ru_utime - before.ru_utime,
                'systemCpuSeconds': after.ru_stime - before.ru_stime,
                'maxChildRssKiB': after.ru_maxrss})

# Raw files already exist before parsing or any acceptance assertion.
errors, records, timer_lines = [], [], []
for number, line in enumerate((OUT / 'stdout.log').read_text().splitlines(), 1):
    if not line.strip():
        continue
    if line.startswith('HIVE_HEAT '):
        try:
            record = json.loads(line[len('HIVE_HEAT '):])
            if not isinstance(record, dict) or not finite(record):
                errors.append(f'non-object or nonfinite record on line {number}')
                continue
            records.append(record)
        except (ValueError, TypeError) as error:
            errors.append(f'malformed record on line {number}: {error}')
    elif re.fullmatch(r'# Multigrid, \d+ steps, [\d.e+\-]+ CPU, [\d.e+\-]+ real, [\d.e+\-]+ points.step/s, \d+ var', line):
        timer_lines.append(line)
    else:
        errors.append(f'unrecognized native stdout line {number}: {line}')
stderr = (OUT / 'stderr.log').read_text()
if stderr.strip():
    errors.append('native stderr is nonempty: preserved warnings/errors reject this packet')
if native_exit != 0 or timed_out:
    errors.append(f'native run did not exit successfully: {native_exit}, timeout={timed_out}')
observations = [r for r in records if r.get('kind') == 'observation']
terminals = [r for r in records if r.get('kind') == 'terminal']
if any(r.get('valid') is not True for r in observations):
    errors.append('native observation rejected its fixed physical/solver screens')
if len(terminals) != 1 or not terminals[0].get('completed') or terminals[0].get('exitCode') != 0:
    errors.append('missing successful completed terminal')
if not any(r.get('phase') == 'final' and r.get('completedSeconds') == 2 for r in observations):
    errors.append('missing exact final completed 2 s observation')
unchanged = all(pin(ROOT / n) == e for n, e in handoff['files'].items())
upstream_unchanged = all(pin(SRC / n) == e for n, e in checkpoint['upstream'].items())
if not unchanged or not upstream_unchanged:
    errors.append('pinned source/binary/upstream changed')
receipt.update({'accepted': not errors, 'errors': errors, 'records': records,
                'nativeTimerLines': timer_lines, 'sourceUnchanged': unchanged,
                'upstreamUnchanged': upstream_unchanged})
receipt['files'] = {p.name: pin(p) for p in sorted(OUT.iterdir()) if p.is_file()}
(OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2, allow_nan=False) + '\n')
print(json.dumps({k: v for k, v in receipt.items() if k not in ['records', 'files']}, indent=2))
if observations:
    print(json.dumps({'lastObservation': observations[-1]}, indent=2))
sys.exit(0 if receipt['accepted'] else 1)
