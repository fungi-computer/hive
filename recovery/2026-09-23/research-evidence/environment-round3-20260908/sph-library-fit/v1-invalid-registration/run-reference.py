from pathlib import Path
import hashlib
import json
import os
import resource
import subprocess

root = Path(__file__).resolve().parent
rows = []
for mode in ['freefall', 'compression', 'tank']:
    result = subprocess.run([str(root / 'reference'), mode], cwd=root,
                            env={**os.environ, 'OMP_NUM_THREADS': '1'},
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=15)
    (root / f'{mode}-v1.stdout').write_text(result.stdout)
    (root / f'{mode}-v1.stderr').write_text(result.stderr)
    lines = [line for line in result.stdout.splitlines() if line.startswith('{')]
    row = {'mode': mode, 'exit': result.returncode,
           'result': json.loads(lines[-1]) if lines else None}
    rows.append(row)
    print(json.dumps(row), flush=True)
record = {'scope': 'native reference; unmodified pinned upstream, fixed clock, one thread; no game/WASM claim',
          'source': 'f3f677140761db7637b5443beb54f19f1f835ed4',
          'sha256': {name: hashlib.sha256((root/name).read_bytes()).hexdigest()
                     for name in ['reference.cpp', 'reference', 'compile-reference.py', 'run-reference.py']},
          'results': rows, 'maxChildRssKiB': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss}
(root / 'reference-v1.json').write_text(json.dumps(record, indent=2)+'\n')
raise SystemExit(0 if all(row['exit']==0 for row in rows) else 1)
