"""One static packet, no dynamics or hidden threshold/resolution retries."""
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

names = ['SOURCE-FIT.md', 'FIRST-SHAPE.md', 'geometry.h', 'continuum.h',
         'map-input.h', 'probes.h', 'native-volume-leaf.inc', 'leaf-provenance.json',
         'reference.cpp', 'reference', 'compile-reference.py', 'compile-command.json',
         'run-proof.py']
record = {
    'scope': 'static real Bender2019 map/contact consumer; fixed 540kg / 600 fluid particles, inverted complete box, no timestep',
    'upstream': 'f3f677140761db7637b5443beb54f19f1f835ed4',
    'grids': [[18, 19, 18], [36, 38, 36]],
    'queriesPerGrid': 18,
    'nativeMapAuthoring': 'verbatim retained volume-function leaf uses mapped SDF field0; native Gauss rule30; sparse required-node input only, full field topology',
    'witnesses': 'mapped SDF versus direct inverted mesh versus independent analytic box, each direct rule30 and query-only rule50; independent continuum GL48',
    'controls': {'meshSdfM': 1e-12, 'fineOffSurfaceSdfDivR': .01,
                 'fineVolumeInterpolationDivR3': .01, 'rule30Rule50VolumeDivR3': .01,
                 'contactPositionM': 1e-14, 'positiveState': 'exact', 'restoration': 'exact'},
    'physicalQualification': 'unqualified; a passing static map/control packet is not passing hydrostatics or a port',
    'sources': {name: sha(root / name) for name in names},
    'frozenColdOracle': sha(root.parent / 'boundary-consistency-v1/result-v1/result.json'),
    'frozenPhysicalFailure': sha(root.parent / 'physical-voxel-v1/result-v1/result.json'),
    'frozenLibraries': {name: sha(root.parent / 'stable-order-v1' / name) for name in
                        ['build/lib/libSPlisHSPlasH.a',
                         'build/extern/install/NeighborhoodSearch/lib/libCompactNSearch.a',
                         'build/extern/install/Discregrid/lib/libDiscregrid.a']},
    'pass': False,
}
(out / 'source').mkdir()
for name in names:
    shutil.copy2(root / name, out / 'source' / name)
start = time.monotonic()
try:
    result = subprocess.run([str(root / 'reference'), str(out)], cwd=root,
                            env={**os.environ, 'OMP_NUM_THREADS': '1'},
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=28)
    (out / 'stdout').write_bytes(result.stdout)
    (out / 'stderr').write_bytes(result.stderr)
    record['exit'] = result.returncode
    rows = [json.loads(line) for line in result.stdout.decode().splitlines() if line.startswith('{')]
    record['probes'] = [row for row in rows if row.get('kind') == 'probe']
    record['maps'] = [row for row in rows if row.get('kind') == 'grid']
    record['result'] = next((row for row in rows if row.get('kind') == 'result'), None)
    current = (out / 'initialization.csv').read_text().splitlines()
    prior = (root.parent / 'boundary-consistency-v1/result-v1/initialization.csv').read_text().splitlines()
    record['fluidInitializationByteEqual'] = current == [line for line in prior if line.startswith('kind,') or line.startswith('fluid,')]
    record['pass'] = (result.returncode == 0 and record['result'] is not None
                      and record['result']['pass'] and record['fluidInitializationByteEqual']
                      and len(record['maps']) == 2 and len(record['probes']) == 36)
    for p in record['probes']:
        exact = p['independentContinuum48']['solid']
        p['measuredNativeVsPhysicalDensityError'] = p['nativeBoundaryDensity'] - exact['density']
        p['measuredNativeVsPhysicalGradientErrorPerM'] = [a-b for a, b in zip(p['nativeBoundaryGradientOperatorPerM'], exact['gradientPerM'])]
        p['attribution'] = 'measured total operator discrepancy; map/SDF/quadrature errors reported separately, not assumed zero'
except subprocess.TimeoutExpired as error:
    (out / 'stdout').write_bytes(error.stdout or b'')
    (out / 'stderr').write_bytes(error.stderr or b'')
    record['error'] = '28s native ceiling reached; fixed static packet incomplete, no retry'
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
