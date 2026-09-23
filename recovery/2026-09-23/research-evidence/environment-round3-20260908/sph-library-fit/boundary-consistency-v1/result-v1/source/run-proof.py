"""One zero-time boundary diagnostic. Oracle failure is retained, never refined here."""
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
    'scope': 'cold unchanged 600-fluid/2722-boundary initialization; independent cubic half-space/solid-union/air support integrals, 17 fixed probes; no time steps or method switch',
    'upstream': 'f3f677140761db7637b5443beb54f19f1f835ed4',
    'orders': [24, 48],
    'oracleThresholds': {'endpoint': 1e-12, 'density': 1e-4, 'gradientTimesR': 5e-4,
                         'correctedVolumeNormalization': 1e-10},
    'sources': {name: sha(root / name) for name in
                ['PROPOSAL.md', 'geometry.h', 'continuum.h', 'reference.cpp', 'reference',
                 'compile-reference.py', 'compile-command.json', 'run-proof.py']},
    'failedTankResultSha256': sha(root.parent / 'physical-voxel-v1/result-v1/result.json'),
    'frozenLibraries': {name: sha(root.parent / 'stable-order-v1' / name) for name in
                        ['build/lib/libSPlisHSPlasH.a', 'build/extern/install/NeighborhoodSearch/lib/libCompactNSearch.a']},
    'pass': False,
}
(out / 'source').mkdir()
for name in record['sources']:
    shutil.copy2(root / name, out / 'source' / name)
start = time.monotonic()
try:
    result = subprocess.run([str(root / 'reference'), str(out)], cwd=root,
                            env={**os.environ, 'OMP_NUM_THREADS': '1'},
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=8.5)
    (out / 'stdout').write_bytes(result.stdout)
    (out / 'stderr').write_bytes(result.stderr)
    record['exit'] = result.returncode
    rows = [json.loads(line) for line in result.stdout.decode().splitlines() if line.startswith('{')]
    record['probes'] = [row for row in rows if row.get('kind') == 'probe']
    record['result'] = next((row for row in rows if row.get('kind') == 'result'), None)
    record['pass'] = result.returncode == 0 and record['result'] is not None and record['result']['pass']
    # Derived errors are labels over frozen observations, not another solver.
    for p in record['probes']:
        exact = p['continuum48']
        def difference(left, right):
            return {'density': left['density']-right['density'],
                    'gradientPerM': [a-b for a, b in zip(left['gradientPerM'], right['gradientPerM'])]}
        p['fluidQuadratureError'] = difference(p['nativeFluid'], exact['fluid'])
        p['boundaryRepresentationError'] = difference(p['nativeBoundary'], exact['solid'])
        p['queryLutFluidDifferenceSameVolumes'] = difference(p['nativeFluid'], p['directCubicFluidSameVolumes'])
        p['queryLutBoundaryDifferenceSameVolumes'] = difference(p['nativeBoundary'], p['directCubicBoundarySameVolumes'])
        p['expectedCombinedDensity'] = exact['fluid']['density']+exact['solid']['density']
        p['actualCombinedDensity'] = p['nativeFluid']['density']+p['nativeBoundary']['density']
except subprocess.TimeoutExpired as error:
    (out / 'stdout').write_bytes(error.stdout or b'')
    (out / 'stderr').write_bytes(error.stderr or b'')
    record['error'] = '8.5s native ceiling reached; cold oracle incomplete'
except Exception as error:
    record['error'] = f'{type(error).__name__}: {error}'
finally:
    record['nativeCaptureParseSeconds'] = time.monotonic() - start
    record['maxChildRssKiB'] = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    record['evidenceSha256'] = {p.name: sha(p) for p in out.iterdir() if p.is_file()}
    (out / 'result.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({'pass': record['pass'], 'exit': record.get('exit'),
                      'seconds': record['nativeCaptureParseSeconds'],
                      'result': record.get('result'), 'error': record.get('error')}), flush=True)
raise SystemExit(0 if record['pass'] else 1)
