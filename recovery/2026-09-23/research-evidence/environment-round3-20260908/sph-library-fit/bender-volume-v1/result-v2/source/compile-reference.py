"""Compile only this new fixture against the frozen accepted native library."""
from pathlib import Path
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent
frozen = root.parent.parent / 'stable-order-v1'
pins = {
    'build/lib/libSPlisHSPlasH.a': '68cb48d6331e3a86c695ee69edd8ccc6e8023fad30b4faa2bf017897e11d4d87',
    'build/extern/install/NeighborhoodSearch/lib/libCompactNSearch.a': '1bb78be2e724e6d8da0f1a9ea04409c8bbe4e577faea8267139ce0c93623c8ad',
}
for name, expected in pins.items():
    actual = hashlib.sha256((frozen / name).read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError(f'frozen library changed: {name}')
includes = [frozen / 'eigen', frozen / 'upstream'] + [
    frozen / 'build/extern/install' / name / 'include'
    for name in ['NeighborhoodSearch', 'GenericParameters', 'Discregrid']]
libs = [frozen / 'build/lib' / name for name in
        ['libSPlisHSPlasH.a', 'libUtilities.a', 'libMD5.a', 'libtinyexpr.a', 'libpartio.a', 'libzlib.a']]
libs += [frozen / 'build/extern/install' / name / 'lib' / lib for name, lib in
         [('NeighborhoodSearch', 'libCompactNSearch.a'), ('Discregrid', 'libDiscregrid.a')]]
command = ['/usr/bin/c++', '-std=c++17', '-O3', '-march=native', '-DNDEBUG',
           '-DUSE_DOUBLE', '-DUSE_CompactNSearch', '-DEIGEN_DISABLE_UNALIGNED_ARRAY_ASSERT',
           *[f'-I{p}' for p in includes], str(root / 'reference.cpp'),
           '-Wl,--start-group', *map(str, libs), '-Wl,--end-group', '-fopenmp', '-pthread',
           '-o', str(root / 'reference')]
(root / 'compile-command.json').write_text(json.dumps(command, indent=2) + '\n')
with (root / 'compile.log').open('x') as log:
    result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
if result.returncode:
    print((root / 'compile.log').read_text()[:5000])
raise SystemExit(result.returncode)
