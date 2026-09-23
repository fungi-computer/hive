"""One fixed algebra packet. Any mismatch stops; raw records are retained."""
from pathlib import Path
import hashlib,json,math,os,resource,subprocess,sys,time
ROOT=Path(__file__).resolve().parent
BUILD=ROOT/'build-v2'
OUT=ROOT/'algebra-run-v1'
def pin(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def finite(x):
    if isinstance(x,float): return math.isfinite(x)
    if isinstance(x,dict): return all(finite(v) for v in x.values())
    if isinstance(x,list): return all(finite(v) for v in x)
    return True
build=json.loads((BUILD/'receipt.json').read_text())
assert build['exitCode']==0 and build['sourceUnchanged'] and build['upstreamUnchanged']
assert pin(BUILD/'algebra')==build['files']['algebra']
OUT.mkdir(exist_ok=False)
env=os.environ.copy();env['OMP_NUM_THREADS']='1'
cases=[('laws',None),('geometry','unsupported room/grid'),
 ('dirichlet','correction boundary is not sealed homogeneous Neumann'),
 ('periodic','correction boundary is not sealed homogeneous Neumann'),
 ('nonfinite','coarse coefficients/RHS'),('changed-boundary','correction boundary changed'),
 ('singular','singular coarse matrix')]
receipt={'scope':'Actual-native-field algebra, no physical evolution',
 'invocationId':env.get('INVOCATION_ID'),'binary':pin(BUILD/'algebra'),
 'runner':pin(Path(__file__)),'cases':[]}
start=time.monotonic();before=resource.getrusage(resource.RUSAGE_CHILDREN);failure=False
for mode,reason in cases:
    case=OUT/mode;case.mkdir()
    if time.monotonic()-start>=10:
        receipt['budgetFailureBeforeCase']=mode;failure=True;break
    begin=time.monotonic()
    with (case/'stdout.log').open('wb') as stdout,(case/'stderr.log').open('wb') as stderr:
        try:
            code=subprocess.run([str(BUILD/'algebra'),mode],cwd=case,env=env,
                stdout=stdout,stderr=stderr,timeout=min(3,10-(begin-start))).returncode
        except subprocess.TimeoutExpired:
            code=None
    record={'mode':mode,'nativeExitCode':code,'wallSeconds':time.monotonic()-begin,
            'stdout':pin(case/'stdout.log'),'stderr':pin(case/'stderr.log')}
    out=(case/'stdout.log').read_text();err=(case/'stderr.log').read_text();errors=[]
    if reason:
        if code!=3 or err.strip()!=f'HIVE_COARSE_REJECT: {reason}' or out.strip():
            errors.append('expected exact rejection/exit with no success output')
    else:
        if code!=0 or err.strip(): errors.append('nonzero exit or native diagnostic')
        records=[]
        for line in out.splitlines():
            prefix=next((p for p in ['HIVE_ALGEBRA ','HIVE_HEAT '] if line.startswith(p)),None)
            try:
                if prefix is None: raise ValueError('unrecognized output')
                value=json.loads(line[len(prefix):])
                if not isinstance(value,dict) or not finite(value): raise ValueError('nonfinite/non-object')
                records.append(value)
            except ValueError as error: errors.append(str(error))
        if not any(v.get('checks',0)>0 and v.get('fixtures')==3 for v in records):
            errors.append('missing completed law record')
        record['records']=records
    record['accepted']=not errors;record['errors']=errors
    receipt['cases'].append(record)
    (case/'receipt.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record),flush=True)
    if errors: failure=True;break
after=resource.getrusage(resource.RUSAGE_CHILDREN)
receipt.update({'wallSeconds':time.monotonic()-start,
 'childCpuSeconds':after.ru_utime+after.ru_stime-before.ru_utime-before.ru_stime,
 'maxChildRssKiB':after.ru_maxrss,'binaryUnchanged':pin(BUILD/'algebra')==build['files']['algebra']})
receipt['accepted']=not failure and receipt['wallSeconds']<=10 and receipt['binaryUnchanged']
(OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='cases'}),flush=True)
sys.exit(0 if receipt['accepted'] else 1)
