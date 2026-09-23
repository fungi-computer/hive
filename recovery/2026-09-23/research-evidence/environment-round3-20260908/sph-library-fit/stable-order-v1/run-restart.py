"""One fixed-tank, fresh-process restart law; no diagnostic-suite rerun."""
from pathlib import Path
import hashlib
import json
import math
import os
import resource
import struct
import subprocess
import sys
import time

root = Path(__file__).resolve().parent
out = root / (sys.argv[1] if len(sys.argv) > 1 else 'restart-result-v1')
out.mkdir(exist_ok=False)
deadline = time.monotonic() + 25
header = struct.Struct('<8s7IQ4d')
particle = struct.Struct('<3I9d')
names = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'mass', 'pressureWarm', 'divergenceWarm']
# Declared before running; exact identity/stocks/clock, tight same-build numerical
# tolerance for floating reductions after neighbor-cache reconstruction.
tolerances = {name: {'absolute': 1e-10 if name in ['x', 'y', 'z'] else
                    1e-9 if name in ['vx', 'vy', 'vz'] else
                    0 if name == 'mass' else 1e-12,
                    'relative': 0 if name == 'mass' else 1e-9}
              for name in names}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode(path):
    data = path.read_bytes()
    fields = header.unpack_from(data)
    magic, version, scalar_bytes, endian, count, boundary_count, completed, target, key, clock, dt, volume, density = fields
    if (magic, version, scalar_bytes, endian) != (b'HDFSPH1\0', 1, 8, 0x01020304):
        raise ValueError('unexpected native checkpoint format')
    if len(data) != header.size + count * particle.size:
        raise ValueError('checkpoint size mismatch')
    rows = {}
    for i in range(count):
        values = particle.unpack_from(data, header.size + i * particle.size)
        identity, obj, state, *numbers = values
        if identity in rows or not all(map(math.isfinite, numbers)):
            raise ValueError('invalid identity/numeric snapshot')
        rows[identity] = {'object': obj, 'state': state, 'values': numbers}
    return {'header': fields, 'rows': rows, 'raw': data}


record = {
    'scope': 'stable neighbor order on every ordinary query; small owner law plus two fresh continuation processes using the same native binary; one fixed tank, fixed dt, Z-sort disabled; no game/WASM/portable-save claim',
    'upstream': 'f3f677140761db7637b5443beb54f19f1f835ed4',
    'captureRule': 'first completed step <=500 with max(abs(density/divergence warm field)) >1e-15',
    'targetStep': 750,
    'tolerances': tolerances,
    'sourceSha256': {name: sha(root / name) for name in
                     ['reference.cpp', 'reference-checkpoint.h', 'reference', 'compile-reference.py', 'run-restart.py', 'neighbor-order-law.h', 'stable-neighbor-order.patch', 'build/lib/libSPlisHSPlasH.a']},
    'results': [],
}
start = time.monotonic()
try:
    if sys.byteorder != 'little':
        raise ValueError('this study decoder explicitly requires the recorded little-endian host')
    for mode in ['neighbor-order-law', 'restart-write', 'restart-read']:
        result = subprocess.run([str(root / 'reference'), mode, str(out)], cwd=root,
                                env={**os.environ, 'OMP_NUM_THREADS': '1'},
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=max(.01, deadline - time.monotonic()))
        (out / f'{mode}.stdout').write_text(result.stdout)
        (out / f'{mode}.stderr').write_text(result.stderr)
        lines = [line for line in result.stdout.splitlines() if line.startswith('{')]
        row = {'mode': mode, 'exit': result.returncode, 'pidBoundary': 'subprocess completed before next was launched',
               'result': json.loads(lines[-1]) if lines else None}
        record['results'].append(row)
        print(json.dumps(row), flush=True)
        if result.returncode != 0:
            raise RuntimeError(f'{mode} did not complete the physical law')

    checkpoint, restored = decode(out / 'checkpoint.bin'), decode(out / 'restored.bin')
    left, right = decode(out / 'uninterrupted-final.bin'), decode(out / 'restarted-final.bin')
    exact_restore = checkpoint['raw'] == restored['raw']
    identity_equal = left['rows'].keys() == right['rows'].keys()
    same_header = left['header'] == right['header']
    fields = {}
    all_within = identity_equal and same_header
    for index, name in enumerate(names):
        max_abs = 0.0
        mismatched_bits = 0
        outside = 0
        for identity, a in left['rows'].items():
            b = right['rows'][identity]
            identity_equal &= a['object'] == b['object'] and a['state'] == b['state']
            x, y = a['values'][index], b['values'][index]
            delta = abs(x - y)
            max_abs = max(max_abs, delta)
            mismatched_bits += struct.pack('<d', x) != struct.pack('<d', y)
            bound = tolerances[name]['absolute'] + tolerances[name]['relative'] * max(abs(x), abs(y))
            outside += delta > bound
        fields[name] = {'maxAbsoluteDifference': max_abs, 'differentBitPatterns': mismatched_bits,
                        'particlesOutsideTolerance': outside}
        all_within &= outside == 0
    all_within &= identity_equal
    record['comparison'] = {'immediateRestoreByteExact': exact_restore,
                            'finalFileByteExact': left['raw'] == right['raw'],
                            'finalMetadataExact': same_header, 'identityObjectStateExact': identity_equal,
                            'finalWithinDeclaredTolerance': bool(all_within), 'byIdFields': fields}
    record['pass'] = exact_restore and all_within
except subprocess.TimeoutExpired as error:
    (out / 'timeout.stdout').write_bytes(error.stdout or b'')
    (out / 'timeout.stderr').write_bytes(error.stderr or b'')
    record['error'] = f'25-second bounded packet timed out: {error.cmd[1]}'
    record['pass'] = False
except Exception as error:
    record['error'] = f'{type(error).__name__}: {error}'
    record['pass'] = False
finally:
    record['wallSeconds'] = time.monotonic() - start
    record['maxChildRssKiB'] = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    record['evidenceSha256'] = {p.name: sha(p) for p in sorted(out.iterdir()) if p.is_file()}
    (out / 'result.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({'pass': record['pass'], 'wallSeconds': record['wallSeconds'],
                      'comparison': record.get('comparison'), 'error': record.get('error')}), flush=True)
raise SystemExit(0 if record['pass'] else 1)
