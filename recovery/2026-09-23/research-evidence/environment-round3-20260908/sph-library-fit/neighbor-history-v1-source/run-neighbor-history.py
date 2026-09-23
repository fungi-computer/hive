"""One bounded neighbor-history diagnostic, preserving failed restart criteria."""
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
out = root / (sys.argv[1] if len(sys.argv) > 1 else 'neighbor-history-v1')
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



def compare(left_name, right_name):
    left, right = decode(out / left_name), decode(out / right_name)
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
    return {'byteExact': left['raw'] == right['raw'], 'metadataExact': same_header,
            'identityObjectStateExact': identity_equal, 'withinDeclaredTolerance': bool(all_within), 'byIdFields': fields}


def compare_neighbors(left_name, right_name):
    a = json.loads((out / (left_name+'-first-neighbors.json')).read_text())
    b = json.loads((out / (right_name+'-first-neighbors.json')).read_text())
    left = {row['id']: row['pointSets'] for row in a['rows']}
    right = {row['id']: row['pointSets'] for row in b['rows']}
    same_membership = left.keys() == right.keys()
    different_order = 0
    example = None
    for identity, sets in left.items():
        for point_set, sequence in enumerate(sets):
            other = right[identity][point_set]
            same_membership &= sorted(sequence) == sorted(other)
            different_order += sequence != other
            if sequence != other and example is None:
                example = {'particleId': identity, 'pointSet': point_set, 'left': sequence, 'right': other}
    return {'sameMembership': bool(same_membership), 'sameOrder': different_order == 0,
            'differentSequences': different_order, 'firstDifference': example,
            'leftCompletedStep': a['completedStep'], 'rightCompletedStep': b['completedStep']}


record = {
    'scope': 'same native binary, three fresh processes: ordinary, restored, cache-reset control; fixed tank/dt, Z-sort disabled; no game/WASM/portable-save claim',
    'upstream': 'f3f677140761db7637b5443beb54f19f1f835ed4',
    'captureRule': 'first completed step <=500 with max(abs(density/divergence warm field)) >1e-15',
    'targetStep': 750,
    'tolerances': tolerances,
    'sourceSha256': {name: sha(root / name) for name in
                     ['reference.cpp', 'reference-checkpoint.h', 'reference', 'compile-reference.py', 'run-neighbor-history.py']},
    'results': [],
}
start = time.monotonic()
try:
    if sys.byteorder != 'little':
        raise ValueError('this study decoder explicitly requires the recorded little-endian host')
    for mode in ['restart-write', 'restart-read', 'restart-reset']:
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
    exact_restore = checkpoint['raw'] == restored['raw']
    exact_reset_checkpoint = checkpoint['raw'] == decode(out / 'cache-reset-checkpoint.bin')['raw']
    record['comparison'] = {
        'immediateRestoreByteExact': exact_restore,
        'resetControlCheckpointByteExact': exact_reset_checkpoint,
        'ordinaryVsRestartFirst': compare('uninterrupted-first-step.bin', 'restarted-first-step.bin'),
        'resetVsRestartFirst': compare('cache-reset-first-step.bin', 'restarted-first-step.bin'),
        'ordinaryVsRestartFinal': compare('uninterrupted-final.bin', 'restarted-final.bin'),
        'resetVsRestartFinal': compare('cache-reset-final.bin', 'restarted-final.bin'),
        'ordinaryVsRestartNeighbors': compare_neighbors('uninterrupted', 'restarted'),
        'resetVsRestartNeighbors': compare_neighbors('cache-reset', 'restarted'),
    }
    # This diagnostic has a separate hypothesis; it does not relabel the
    # preserved ordinary restart tolerance failure as acceptance.
    record['diagnosticHypothesisPass'] = bool(
        exact_restore and exact_reset_checkpoint and
        record['comparison']['resetVsRestartFirst']['byteExact'] and
        record['comparison']['resetVsRestartFinal']['byteExact'] and
        record['comparison']['ordinaryVsRestartNeighbors']['sameMembership'] and
        not record['comparison']['ordinaryVsRestartNeighbors']['sameOrder'])
    record['ordinaryRestartLawPass'] = record['comparison']['ordinaryVsRestartFinal']['withinDeclaredTolerance']
    dataset_path = out / 'tank-positions.json'
    dataset = json.loads(dataset_path.read_text())
    if len(dataset['frames']) != 76 or dataset['frames'][0]['step'] != 0 or dataset['frames'][-1]['step'] != 750:
        raise ValueError('viewer frame coverage')
    if len(dataset['particleIds']) != 512 or len(dataset['boundarySamplesM']) != 3986:
        raise ValueError('viewer geometry coverage')
    for frame in dataset['frames']:
        if len(frame['positions']) != 512 or not all(math.isfinite(v) for p in frame['positions'] for v in p):
            raise ValueError('viewer particle state')
    dataset['sourceSha256'] = record['sourceSha256']
    dataset['upstreamRevision'] = record['upstream']
    dataset['fixtureFingerprintPurpose'] = 'FNV-1a native-byte non-security same-host fixture identity'
    dataset['recordingScope'] = 'passive rounded viewer positions from ordinary native tank; exact checkpoint files are separate'
    dataset['restartStatus'] = {'ordinaryLawPass': record['ordinaryRestartLawPass'],
                                'neighborDiagnosticPass': record['diagnosticHypothesisPass']}
    dataset_path.write_text(json.dumps(dataset,separators=(',',':'))+'\n')
    record['viewer'] = {'file': dataset_path.name, 'frames': len(dataset['frames']),
                        'particles': 512, 'boundarySamples': 3986, 'sha256': sha(dataset_path),
                        'bytes': dataset_path.stat().st_size}
    record['pass'] = record['diagnosticHypothesisPass']
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
                      'ordinaryRestartLawPass': record.get('ordinaryRestartLawPass'),
                      'comparison': {key: {name: value for name, value in row.items() if name not in ['byIdFields', 'firstDifference']}
                                     for key, row in record.get('comparison', {}).items() if isinstance(row, dict)},
                      'viewer': record.get('viewer'), 'error': record.get('error')}), flush=True)
raise SystemExit(0 if record['pass'] else 1)
