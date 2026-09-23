"""Compile the pinned coarse candidate and qualifier; execute neither."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,time
ROOT=Path(__file__).resolve().parent
SRC=ROOT.parent.parent.parent/'sph-library-fit/basilisk-native-v1/basilisk/src'
OUT=ROOT/'build-v1'
def pin(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
checkpoint=json.loads((ROOT/'EXECUTABLE-CHECKPOINT.json').read_text())
for name,value in checkpoint['files'].items():
    assert pin(ROOT/name)==value,name
for name,value in checkpoint['upstream'].items():
    assert pin(SRC/name)==value,name
OUT.mkdir(exist_ok=False)
for name in checkpoint['files']:
    shutil.copyfile(ROOT/name,OUT/name)
shutil.copyfile(ROOT/'EXECUTABLE-CHECKPOINT.json',OUT/'EXECUTABLE-CHECKPOINT.json')
env=os.environ.copy();env['BASILISK']=str(SRC);env['OMP_NUM_THREADS']='1'
commands=[
    [str(SRC/'qcc'),'-O2','-Wall','algebra.c','-o','algebra','-lm'],
    [str(SRC/'qcc'),'-O2','-Wall','-events','-source','sealed-heat.c'],
    [str(SRC/'qcc'),'-O2','-Wall','sealed-heat.c','-o','sealed-heat','-lm']]
receipt={'scope':'Compile only; algebra/physics not run','invocationId':env.get('INVOCATION_ID'),'commands':[]}
start=time.monotonic();code=0
for i,cmd in enumerate(commands,1):
    begin=time.monotonic()
    with (OUT/f'command-{i}.log').open('wb') as log:
        code=subprocess.run(cmd,cwd=OUT,env=env,stdout=log,stderr=subprocess.STDOUT).returncode
    record={'argv':cmd,'exitCode':code,'wallSeconds':time.monotonic()-begin}
    receipt['commands'].append(record);print(json.dumps(record),flush=True)
    if code:
        print((OUT/f'command-{i}.log').read_text()[-20000:],flush=True);break
receipt.update({'exitCode':code,'wallSeconds':time.monotonic()-start,
 'sourceUnchanged':all(pin(ROOT/n)==v for n,v in checkpoint['files'].items()),
 'upstreamUnchanged':all(pin(SRC/n)==v for n,v in checkpoint['upstream'].items())})
receipt['files']={p.name:pin(p) for p in sorted(OUT.iterdir()) if p.is_file()}
(OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='files'}),flush=True)
sys.exit(code if receipt['sourceUnchanged'] and receipt['upstreamUnchanged'] else 2)
