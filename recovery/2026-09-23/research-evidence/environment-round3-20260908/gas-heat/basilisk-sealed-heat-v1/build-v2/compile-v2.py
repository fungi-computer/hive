"""Compile the reviewed native caller; never execute its resulting binary."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent.parent / 'sph-library-fit/basilisk-native-v1/basilisk/src'
OUT = ROOT / 'build-v2'

def pin(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

checkpoint = json.loads((ROOT / 'source-checkpoint-v3.json').read_text())
for name, expected in checkpoint['owned'].items():
    assert pin(ROOT / name) == expected, name
for name, expected in checkpoint['upstream'].items():
    assert pin(SRC / name) == expected, name
OUT.mkdir(exist_ok=False)
for name in ['sealed-heat.c', 'sealed-heat-observation.h', 'CONTRACT.md',
             'source-checkpoint-v3.json', 'compile-v2.py']:
    shutil.copyfile(ROOT / name, OUT / name)

env = os.environ.copy()
env['BASILISK'] = str(SRC)
env['OMP_NUM_THREADS'] = '1'
commands = [
    [str(SRC / 'qcc'), '-O2', '-Wall', '-events', '-source', 'sealed-heat.c'],
    [str(SRC / 'qcc'), '-O2', '-Wall', 'sealed-heat.c', '-o', 'sealed-heat', '-lm'],
]
receipt = {'scope': 'Compile only. Native gas binary not executed.',
           'invocationId': env.get('INVOCATION_ID'), 'commands': []}
start = time.monotonic()
exit_code = 0
for number, command in enumerate(commands, 1):
    begin = time.monotonic()
    log = OUT / f'command-{number}.log'
    with log.open('wb') as output:
        result = subprocess.run(command, cwd=OUT, env=env,
                                stdout=output, stderr=subprocess.STDOUT)
    exit_code = result.returncode
    record = {'argv': command, 'exitCode': exit_code,
              'wallSeconds': time.monotonic() - begin, 'log': log.name}
    receipt['commands'].append(record)
    print(json.dumps(record), flush=True)
    if exit_code:
        print(log.read_text()[-16000:], flush=True)
        break
receipt['exitCode'] = exit_code
receipt['wallSeconds'] = time.monotonic() - start
receipt['upstreamUnchanged'] = all(pin(SRC / n) == e
                                 for n, e in checkpoint['upstream'].items())
receipt['files'] = {p.name: pin(p) for p in sorted(OUT.iterdir()) if p.is_file()}
(OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'exitCode': exit_code, 'wallSeconds': receipt['wallSeconds'],
                  'upstreamUnchanged': receipt['upstreamUnchanged']}), flush=True)
sys.exit(exit_code if receipt['upstreamUnchanged'] else 2)
