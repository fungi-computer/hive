"""Offline analysis of one saved system; never calls any physical binary."""
from pathlib import Path
from fractions import Fraction as F
from decimal import Decimal as D, localcontext
import hashlib,json,math,time

ROOT=Path(__file__).resolve().parent
source=ROOT/'run-capture-v1/coarse-failure.json'
start=time.monotonic()
c=json.loads(source.read_text())
def floats(v):
    if isinstance(v,list): return [floats(x) for x in v]
    return float.fromhex(v)
def exact(v):
    if isinstance(v,list): return [exact(x) for x in v]
    return F(v)
A=floats(c['originalMatrix']); b=floats(c['originalRhs'])
S=floats(c['scaledMatrix']); sb=floats(c['scaledRhs'])
inverse=floats(c['inverse']); x=floats(c['solution']); row_scales=floats(c['rowScales'])
rows=[]
for row in c['rows']:
    rows.append({k:floats(row[k]) for k in ['coefficients_l1_l2_l4_lp_rhsT_rhsp',
                                         'kMinus','kPlus','aMinus','aPlus']})

def assembled(convert):
    out=[[convert(0) for _ in range(16)] for _ in range(16)]
    for j,r in enumerate(rows):
        l1,l2,l4,lp,_,_=map(convert,r['coefficients_l1_l2_l4_lp_rhsT_rhsp'])
        out[j][j]=l1;out[j][j+8]=l2;out[j+8][j+8]=lp
        for d in range(3):
            bit=1<<d;n=j^bit
            k=convert(4)*convert(r['kMinus' if j&bit else 'kPlus'][d])
            a=convert(4)*convert(r['aMinus' if j&bit else 'aPlus'][d])
            out[j][j]-=k;out[j][n]+=k
            out[j+8][j+8]-=a;out[j+8][n+8]+=a
            out[j+8][j]-=l4*k;out[j+8][n]+=l4*k
    return out

def stencil(solution,convert):
    residual=[convert(0) for _ in range(16)];scales=residual.copy()
    for j,r in enumerate(rows):
        l1,l2,l4,lp,rt,rp=map(convert,r['coefficients_l1_l2_l4_lp_rhsT_rhsp'])
        t=solution[j];p=solution[j+8]
        heat=l1*t+l2*p;press=lp*p
        st=abs(rt)+abs(l1*t)+abs(l2*p);sp=abs(rp)+abs(press)
        for d in range(3):
            bit=1<<d;n=j^bit
            k=convert(r['kMinus' if j&bit else 'kPlus'][d])
            a=convert(r['aMinus' if j&bit else 'aPlus'][d])
            ht=k*(solution[n]-t)/convert(.25)
            hp=a*(solution[n+8]-p)/convert(.25)
            heat+=ht;press+=hp+l4*ht
            ht_terms=k*(abs(solution[n])+abs(t))/convert(.25)
            hp_terms=a*(abs(solution[n+8])+abs(p))/convert(.25)
            st+=ht_terms;sp+=hp_terms+abs(l4)*ht_terms
        residual[j]=rt-heat;residual[j+8]=rp-press
        scales[j]=st;scales[j+8]=sp
    return residual,scales

def solve(matrix,rhs):
    """Ordinary independent Gaussian elimination with partial row pivoting."""
    a=[row.copy()+[rhs[j]] for j,row in enumerate(matrix)];n=len(rhs)
    for k in range(n):
        pivot=max(range(k,n),key=lambda j:abs(a[j][k]))
        if not a[pivot][k]: raise ValueError('singular independent system')
        a[k],a[pivot]=a[pivot],a[k]
        for j in range(k+1,n):
            factor=a[j][k]/a[k][k];a[j][k]=type(factor)(0)
            for q in range(k+1,n+1):a[j][q]-=factor*a[k][q]
    result=[type(rhs[0])(0) for _ in rhs]
    for j in range(n-1,-1,-1):
        result[j]=(a[j][n]-sum(a[j][k]*result[k] for k in range(j+1,n)))/a[j][j]
    return result

def matvec(matrix,vec):
    return [sum(row[k]*vec[k] for k in range(16)) for row in matrix]
def matrix_residual(matrix,rhs,vec):
    return [rhs[j]-v for j,v in enumerate(matvec(matrix,vec))]
def metrics(vec):
    residual,scale=stencil(vec,float)
    exact_residual,exact_scale=stencil(exact(vec),F)
    bounds=[512*math.ulp(1.)*v for v in scale]
    ratios=[abs(residual[j])/bounds[j] if bounds[j] else (0 if not residual[j] else None) for j in range(16)]
    exact_ratios=[float(abs(exact_residual[j])/(F(512)*F(math.ulp(1.))*exact_scale[j]))
                  if exact_scale[j] else 0 for j in range(16)]
    return {'maxDoubleGuardRatio':max(v for v in ratios if v is not None),
            'maxExactStencilGuardRatio':max(exact_ratios),
            'doubleGuardPass':all(v is not None and v<=1 for v in ratios),
            'doubleResiduals':residual,'doubleBounds':bounds,'ratios':ratios,
            'exactStencilResiduals':[float(v) for v in exact_residual],
            'maxSolutionRelativeDifferenceFromCaptured':max(abs(vec[j]-x[j])/max(abs(x[j]),1e-300) for j in range(16))}

assert assembled(float)==A,'reconstructed actual assembly differs'
native_residual,native_scales=stencil(x,float)
for j,row in enumerate(c['rows']):
    assert [abs(native_residual[j]),abs(native_residual[j+8])]==floats(row['residualT_residualp'])
    assert [native_scales[j],native_scales[j+8]]==floats(row['scaleT_scalep'])
    assert [512*math.ulp(1.)*native_scales[j],512*math.ulp(1.)*native_scales[j+8]]==floats(row['boundT_boundp'])

Af=exact(A);bf=exact(b);Sf=exact(S);sbf=exact(sb);If=exact(inverse);xf=exact(x)
stencil_A=assembled(F)
exact_solution=solve(Af,bf)
exact_stencil_solution=solve(stencil_A,bf)
assert all(v==0 for v in matrix_residual(Af,bf,exact_solution))
assert all(v==0 for v in matrix_residual(stencil_A,bf,exact_stencil_solution))
with localcontext() as ctx:
    ctx.prec=80
    Ad=[[D.from_float(v) for v in row] for row in A];bd=[D.from_float(v) for v in b]
    decimal_solution=solve(Ad,bd)
    exact_as_decimal=[D(v.numerator)/D(v.denominator) for v in exact_solution]
    decimal_relative=max(abs(decimal_solution[j]-exact_as_decimal[j])/max(abs(exact_as_decimal[j]),D('1e-300')) for j in range(16))

high_precision_inverse_product=matvec(If,sbf)
float_independent=solve(A,b)
refinement_rhs=[native_residual[j]/row_scales[j] for j in range(16)]
correction=matvec(inverse,refinement_rhs)
refined=[x[j]+correction[j] for j in range(16)]

solutions={'captured':x,
 'sameInverseExactDotRounded':[float(v) for v in high_precision_inverse_product],
 'independentBinary64PartialPivotLU':float_independent,
 'exactRationalOriginalMatrixRounded':[float(v) for v in exact_solution],
 'exactRationalOriginalStencilRounded':[float(v) for v in exact_stencil_solution],
 'oneStandardDoubleResidualRefinementWithSameInverse':refined}
inverse_error=[[sum(Sf[i][k]*If[k][j] for k in range(16))-F(i==j) for j in range(16)] for i in range(16)]
matrix_capture_res=matrix_residual(Af,bf,xf)
exact_stencil_res,_=stencil(xf,F)
assembly_effect=[exact_stencil_res[j]-matrix_capture_res[j] for j in range(16)]
report={'scope':'One captured linear system, no physical run',
 'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
 'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
 'assemblyExactlyReproducedInBinary64':True,'allCapturedGuardValuesExactlyReproduced':True,
 'independentMethod':'partial-pivot Gaussian elimination, exact Fraction and 80-digit Decimal, plus binary64 solve',
 'decimalVsExactRationalMaxRelativeError':str(decimal_relative),
 'exactRationalResidualIsZero':True,
 'inverseRightResidualInfinityNorm':float(max(sum(abs(v) for v in row) for row in inverse_error)),
 'maxAssemblyRoundingEffectOnCapturedResidual':float(max(abs(v) for v in assembly_effect)),
 'exactOriginalMatrixResidual':[float(v) for v in matrix_capture_res],
 'assemblyRoundingEffectPerRow':[float(v) for v in assembly_effect],
 'inverseExactDotVsCapturedMaxAbs':float(max(abs(high_precision_inverse_product[j]-xf[j]) for j in range(16))),
 'cases':{name:metrics(vec) for name,vec in solutions.items()},
 'solutionHex':{name:[v.hex() for v in vec] for name,vec in solutions.items()},
 'wallSeconds':time.monotonic()-start}
(ROOT/'OFFLINE-RESULT.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['cases','solutionHex','exactOriginalMatrixResidual','assemblyRoundingEffectPerRow']},indent=2))
for name,m in report['cases'].items():
    print(json.dumps({'case':name,'doubleGuardPass':m['doubleGuardPass'],
                     'maxDoubleGuardRatio':m['maxDoubleGuardRatio'],
                     'maxExactStencilGuardRatio':m['maxExactStencilGuardRatio']}))
