from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parent
environment = {**os.environ, 'OMP_NUM_THREADS': '1', 'CMAKE_BUILD_PARALLEL_LEVEL': '2'}
commands = [
    ['cmake', '-S', str(root/'upstream'), '-B', str(root/'build'), '-G', 'Ninja',
     '-DCMAKE_BUILD_TYPE=Release', '-DSPH_LIBS_ONLY=ON', '-DUSE_DOUBLE_PRECISION=ON',
     '-DUSE_OpenMP=OFF', '-DUSE_DEBUG_TOOLS=OFF', '-DUSE_AVX=OFF',
     '-DUSE_THIRD_PARTY_METHODS=OFF', '-DCMAKE_POLICY_VERSION_MINIMUM=3.10',
     '-DEIGEN3_INCLUDE_DIR='+str(root/'eigen')],
    ['cmake', '--build', str(root/'build'), '--target', 'SPlisHSPlasH', '--parallel', '2'],
]
for index, command in enumerate(commands):
    path=root/('configure-candidate.log' if index==0 else 'build-candidate.log')
    print(f'candidate build stage {index+1}/2; log {path.name}', flush=True)
    with path.open('w') as log:
        result=subprocess.run(command,cwd=root,env=environment,stdout=log,stderr=subprocess.STDOUT,timeout=480)
    if result.returncode:
        print('\n'.join(path.read_text().splitlines()[-24:]),flush=True)
        raise SystemExit(result.returncode)
print('separate candidate library built; frozen reference unchanged',flush=True)
