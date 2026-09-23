from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent
includes = [root / 'eigen', root / 'upstream'] + [
    root / 'build/extern/install' / name / 'include'
    for name in ['NeighborhoodSearch', 'GenericParameters', 'Discregrid']]
libs = [root / 'build/lib' / name for name in
        ['libSPlisHSPlasH.a', 'libUtilities.a', 'libMD5.a', 'libtinyexpr.a', 'libpartio.a', 'libzlib.a']]
libs += [root / 'build/extern/install' / name / 'lib' / lib for name, lib in
         [('NeighborhoodSearch', 'libCompactNSearch.a'), ('Discregrid', 'libDiscregrid.a')]]
diagnostic = '--diagnostic' in sys.argv
trace = '--trace' in sys.argv
command = ['/usr/bin/c++', '-std=c++17', '-O3', '-march=native', '-DNDEBUG',
    '-DUSE_DOUBLE', '-DUSE_CompactNSearch', '-DEIGEN_DISABLE_UNALIGNED_ARRAY_ASSERT',
    *[f'-I{p}' for p in includes], str(root / 'reference.cpp'),
    '-Wl,--start-group', *map(str, libs), '-Wl,--end-group', '-fopenmp', '-pthread',
    *(['-fsanitize=address', '-g', '-rdynamic'] if diagnostic else []),
    *([str(root/'crash-trace.cpp'), '-g', '-rdynamic', '-no-pie', '-ldl'] if trace else []),
    '-o', str(root / ('reference-trace' if trace else 'reference-asan' if diagnostic else 'reference'))]
log_path = root / ('compile-reference-trace.log' if trace else 'compile-reference-asan.log' if diagnostic else 'compile-reference.log')
with log_path.open('w') as log:
    result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
if result.returncode:
    print('\n'.join(log_path.read_text().splitlines()[:18]))
raise SystemExit(result.returncode)
