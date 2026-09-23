"""One approved coarse basin; preserve failure, never tune or rerun here."""
from pathlib import Path
import hashlib
import json
import os
import resource
import shutil
import subprocess
import time

root = Path(__file__).resolve().parent
out = root / 'result-v1'
out.mkdir(exist_ok=False)
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

record = {
    'scope': '600-particle closed 1m x 1.08m x 1m metric basin, 0.54m initial water; unmodified frozen DFSPH equations with accepted stable neighbor ordering; no game, portability, hydrostatic convergence or ledge claim',
    'upstream': 'f3f677140761db7637b5443beb54f19f1f835ed4',
    'fixture': {'waterMassKg': 540, 'waterVolumeM3': .54, 'waterHeightM': .54,
                'innerBoxM': [1, 1.08, 1], 'fluidGrid': [10, 6, 10],
                'boundarySubdivisions': [20, 24, 20], 'dt': .001, 'steps': 1000},
    'criteria': {'massDriftKg': 1e-9, 'centerIntrusionM': 1e-6, 'capHits': 0,
                 'impulseClosureRelativeMgDt': 1e-7, 'supportRelativeMg': .05,
                 'horizontalForceRelativeMg': .02, 'lateRmsSpeedMS': .05,
                 'lateComYErrorM': .027, 'lateComXZErrorM': .01,
                 'energyGrowthRelativeInitial': .02, 'bulkDensityMeanAbsoluteError': .03},
    'sources': {name: sha(root / name) for name in
                ['PROPOSAL.md', 'geometry.h', 'reference.cpp', 'reference', 'compile-reference.py', 'compile-command.json', 'run-proof.py']},
    'frozenLibrarySha256': {
        name: sha(root.parent / 'stable-order-v1' / name) for name in
        ['build/lib/libSPlisHSPlasH.a', 'build/extern/install/NeighborhoodSearch/lib/libCompactNSearch.a',
         'stable-neighbor-order.patch']},
    'pass': False,
}
(out / 'source').mkdir()
for name in record['sources']:
    shutil.copy2(root / name, out / 'source' / name)
start = time.monotonic()
try:
    result = subprocess.run([str(root / 'reference'), str(out)], cwd=root,
                            env={**os.environ, 'OMP_NUM_THREADS': '1'},
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=27)
    (out / 'stdout').write_bytes(result.stdout)
    (out / 'stderr').write_bytes(result.stderr)
    record['exit'] = result.returncode
    rows = [json.loads(line) for line in result.stdout.decode().splitlines() if line.startswith('{')]
    record['initial'] = next((row for row in rows if row.get('kind') == 'initial'), None)
    record['frames'] = [row for row in rows if row.get('kind') == 'frame']
    record['result'] = next((row for row in rows if row.get('kind') == 'result'), None)
    record['pass'] = result.returncode == 0 and record['result'] is not None and record['result']['pass']
except subprocess.TimeoutExpired as error:
    (out / 'stdout').write_bytes(error.stdout or b'')
    (out / 'stderr').write_bytes(error.stderr or b'')
    record['error'] = '27s native process ceiling; physical qualification incomplete'
except Exception as error:
    record['error'] = f'{type(error).__name__}: {error}'
finally:
    record['wallSeconds'] = time.monotonic() - start
    record['maxChildRssKiB'] = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    record['evidenceSha256'] = {p.name: sha(p) for p in out.iterdir() if p.is_file()}
    (out / 'result.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({'pass': record['pass'], 'exit': record.get('exit'),
                      'wallSeconds': record['wallSeconds'], 'initial': record.get('initial'),
                      'result': record.get('result'), 'error': record.get('error')}), flush=True)
raise SystemExit(0 if record['pass'] else 1)
