"""Bounded gas/heat experiment. Importable standard-library-only research API.

make_fixture(dx=1,mode='high',mixing=.01,drag=1) -> JSON geometry/config
initial(fixture) -> JSON canonical state
advance(fixture,state,dt) -> (JSON successor, JSON integrated face receipt)
No file writes on import; main writes only its owned research directory.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import resource
import time

ROOT = Path(__file__).resolve().parent
RHO, CP, TREF, G = 1.2, 1005., 293.15, 9.81


def make_fixture(dx=1., mode='high', mixing=.01, drag=1.):
    assert dx in (1., .5, .25) and drag > 0 and mixing >= 0
    nx, nz = round(4/dx), round(6/dx)
    cells = []
    for z in range(nz):
        for x in range(nx):
            cells.append(dict(id=f'c:{z:03}:{x:03}', x=(x+.5)*dx,
                              z=(z+.5)*dx, volume=2*dx*dx))
    edges = []
    def edge(i,j,kind,area,distance,dz=0.,gate='always'):
        edges.append(dict(id=f'{kind}:{i:04}:{j:04}',i=i,j=j,kind=kind,
                          area=area,length=distance,dz=dz,gate=gate))
    for z in range(nz):
        for x in range(nx):
            i=z*nx+x
            if x+1<nx:
                edge(i,i+1,'interior',2*dx,dx)
            if z+1<nz:
                is_floor=abs((z+1)*dx-3)<1e-9
                if not is_floor or x*dx>=3:
                    edge(i,i+nx,'interior',2*dx,dx,dx,
                         'stair' if is_floor else 'always')
    def port(name,side,lo,hi,width=.5):
        for z in range(nz):
            overlap=max(0.,min((z+1)*dx,hi)-max(z*dx,lo))
            if overlap:
                i=z*nx+(0 if side=='left' else nx-1)
                edge(i,-1,name,width*overlap,dx/2,gate='vent')
    if mode in ('high','low','local','lower_high','floor_closed','cycle'):
        port('inlet','left',0,1)
        if mode=='low': port('exhaust','right',0,1)
        elif mode=='local': port('exhaust','left',2,3)
        elif mode=='lower_high': port('exhaust','right',2,3)
        else: port('exhaust','right',5,6)
    elif mode=='single':
        # Single pressure port: impossible sustained throughflow, intentionally.
        i=(nz-1)*nx+nx-1
        edge(i,-1,'single',.5,dx/2,gate='vent')
    elif mode=='tall':
        port('tall','left',0,3,width=.5/3)
    elif mode!='sealed':
        raise ValueError(mode)
    return dict(version='gas2-darcy-orifice-v1',dx=dx,nx=nx,nz=nz,
                mode=mode,mixing=mixing,drag=drag,cells=cells,
                edges=sorted(edges,key=lambda e:e['id']))


def initial(f):
    return dict(version=f['version'],time=0.,step=0,
                smoke=[0.]*len(f['cells']),
                heat=[RHO*CP*c['volume']*5 for c in f['cells']],
                initial_heat_J=sum(RHO*CP*c['volume']*5 for c in f['cells']),
                smoke_source_kg=0.,heat_source_J=0.,
                smoke_export_kg=0.,heat_export_J=0.,air_export_m3=0.,air_import_m3=0.,
                upper_exposure=0.,lower_exposure=0.,
                clear80_time=None,max_divergence=0.,max_courant=0.,max_theta=5.,
                pressure_iterations=0,linear_iterations=0,substeps=0)


def active_edges(f,t):
    def allowed(e):
        if e['gate']=='vent':
            return t>=120 and not (f['mode']=='cycle' and 300<=t<420)
        if e['gate']=='stair':
            return f['mode']!='floor_closed' and not (f['mode']=='cycle' and t<60)
        return True
    return [e for e in sorted(f['edges'],key=lambda e:e['id']) if allowed(e)]


def pcg(diag, pairs, rhs, pins):
    n=len(rhs)
    b=[0. if i in pins else rhs[i] for i in range(n)]
    def product(x):
        y=[diag[i]*x[i] for i in range(n)]
        for i,j,k in pairs:
            if i not in pins and j not in pins:
                y[i]-=k*x[j]; y[j]-=k*x[i]
        for i in pins: y[i]=x[i]
        return y
    x=[0.]*n; r=b[:]
    z=[r[i]/diag[i] if i not in pins else 0. for i in range(n)]
    p=z[:]; rz=sum(a*b for a,b in zip(r,z))
    if max(map(abs,r),default=0)<1e-12: return x,0
    for iteration in range(1,4*n+40):
        ap=product(p); pap=sum(a*b for a,b in zip(p,ap))
        assert pap>0,('pcg',pap)
        alpha=rz/pap
        x=[a+alpha*b for a,b in zip(x,p)]
        r=[a-alpha*b for a,b in zip(r,ap)]
        if max(map(abs,r))<1e-11: return x,iteration
        z=[r[i]/diag[i] if i not in pins else 0. for i in range(n)]
        rz_new=sum(a*b for a,b in zip(r,z)); beta=rz_new/rz
        p=[a+beta*b for a,b in zip(z,p)]; rz=rz_new
    raise ArithmeticError('linear pressure convergence failed')


def pressure_fluxes(f,s,edges):
    n=len(f['cells']); theta=[h/(RHO*CP*c['volume']) for h,c in zip(s['heat'],f['cells'])]
    drives=[]; adjacency=[[] for _ in range(n)]; outside=set()
    for e in edges:
        i,j=e['i'],e['j']
        drives.append(RHO*G*e['dz']*(theta[i]+(theta[j] if j>=0 else 0.))/(2*TREF))
        if j>=0: adjacency[i].append(j); adjacency[j].append(i)
        else: outside.add(i)
    seen=set(); pins=set()
    for root in range(n):
        if root in seen: continue
        stack=[root]; component=set()
        while stack:
            i=stack.pop()
            if i in component: continue
            component.add(i); stack.extend(adjacency[i])
        seen.update(component)
        if not component.intersection(outside): pins.add(min(component))
    def evaluate(p,jacobian=False):
        q=[]; residual=[0.]*n; diag=[0.]*n; pairs=[]
        for e,drive in zip(edges,drives):
            i,j=e['i'],e['j']; dp=p[i]-(p[j] if j>=0 else 0.)+drive
            if e['kind']=='interior':
                k=e['area']/(f['drag']*e['length']); flow=k*dp
            else:
                # Smooth near zero only; eps is 0.00001 Pa, not a flow source.
                eps=1e-5; a=.7*e['area']*math.sqrt(2/RHO)
                r=dp*dp+eps*eps
                flow=a*dp/r**.25
                k=a*(.5*dp*dp+eps*eps)/r**1.25
            q.append(flow); residual[i]+=flow; diag[i]+=k
            if j>=0:
                residual[j]-=flow; diag[j]+=k; pairs.append((i,j,k))
        return q,residual,diag,pairs
    p=[0.]*n; linears=0
    for iteration in range(1,61):
        q,residual,diag,pairs=evaluate(p,True)
        error=max(map(abs,residual))
        if error<2e-10: return q,error,iteration,linears
        delta,k=pcg(diag,pairs,[-v for v in residual],pins); linears+=k
        rate=1.
        while rate>2**-20:
            trial=[a+rate*b for a,b in zip(p,delta)]
            _,test,_,_=evaluate(trial)
            if max(map(abs,test))<error: p=trial; break
            rate*=.5
        else: raise ArithmeticError(('pressure line search',error))
    raise ArithmeticError(('pressure convergence',error))


def advance(f,state,dt):
    """All forcing/topology stops and stability substeps are inside this owner.

    Receipt covers exactly [old time,new time]; entries are signed i->j paired
    exchanges. Symmetric mixing has zero net air but nonzero scalar transfer.
    Positive boundary amounts export; negative amounts import.
    """
    s=copy.deepcopy(state); end=s['time']+dt; receipt={}; diagnostics=[]
    while s['time']<end-1e-12:
        edges=active_edges(f,s['time']); q,div,ni,li=pressure_fluxes(f,s,edges)
        volumes=[c['volume'] for c in f['cells']]; rates=[0.]*len(volumes); mixes=[]
        for e,flow in zip(edges,q):
            i,j=e['i'],e['j']
            mix=f['mixing']*e['area']/e['length'] if j>=0 else 0.
            mixes.append(mix)
            rates[i]+=max(flow,0.)+mix
            if j>=0: rates[j]+=max(-flow,0.)+mix
        rate=max(a/b for a,b in zip(rates,volumes))
        h=min(end-s['time'],.4/rate if rate else dt)
        for event in (60.,120.,300.,420.):
            if s['time']<event< s['time']+h: h=event-s['time']
        delta_s=[0.]*len(volumes); delta_h=[0.]*len(volumes)
        for e,flow,mix in zip(edges,q,mixes):
            i,j=e['i'],e['j']; donor=i if flow>=0 else j
            sv=s['smoke'][donor]/volumes[donor] if donor>=0 else 0.
            hv=s['heat'][donor]/volumes[donor] if donor>=0 else 0.
            ds=h*(flow*sv+mix*(s['smoke'][i]/volumes[i]-(s['smoke'][j]/volumes[j] if j>=0 else 0.)))
            dh=h*(flow*hv+mix*(s['heat'][i]/volumes[i]-(s['heat'][j]/volumes[j] if j>=0 else 0.)))
            delta_s[i]-=ds; delta_h[i]-=dh
            if j>=0: delta_s[j]+=ds; delta_h[j]+=dh
            else:
                s['smoke_export_kg']+=ds; s['heat_export_J']+=dh
                s['air_export_m3']+=h*max(flow,0.); s['air_import_m3']+=h*max(-flow,0.)
            r=receipt.setdefault(e['id'],dict(id=e['id'],i=i,j=j,air_m3=0.,smoke_kg=0.,heat_J=0.))
            r['air_m3']+=h*flow; r['smoke_kg']+=ds; r['heat_J']+=dh
        for i,c in enumerate(f['cells']):
            if s['time']<120 and c['x']<1 and c['z']<1:
                weight=c['volume']/2
                smoke=1e-5*h*weight; heat=1000*h*weight
                delta_s[i]+=smoke; delta_h[i]+=heat
                s['smoke_source_kg']+=smoke; s['heat_source_J']+=heat
        s['smoke']=[a+b for a,b in zip(s['smoke'],delta_s)]
        s['heat']=[a+b for a,b in zip(s['heat'],delta_h)]
        assert min(s['smoke'])>=-1e-14
        # Fixed physical 1x1x2 m breathing neighborhoods, not a moving grid cell.
        for key,xlo,zlo in (('upper_exposure',0.,4.),('lower_exposure',2.,1.)):
            ids=[i for i,c in enumerate(f['cells']) if xlo<=c['x']<xlo+1 and zlo<=c['z']<zlo+1]
            concentration=sum(s['smoke'][i] for i in ids)/sum(volumes[i] for i in ids)
            s[key]+=h*concentration
        s['time']+=h; s['substeps']+=1
        if s['time']>=120 and s['clear80_time'] is None and s['smoke_export_kg']>=.8*.0012:
            s['clear80_time']=s['time']
        s['max_divergence']=max(s['max_divergence'],div)
        s['max_courant']=max(s['max_courant'],h*rate)
        s['max_theta']=max(s['max_theta'],max(a/(RHO*CP*v) for a,v in zip(s['heat'],volumes)))
        s['pressure_iterations']+=ni; s['linear_iterations']+=li
    s['time']=end; s['step']+=1
    return s,dict(start=state['time'],end=end,faces=sorted(receipt.values(),key=lambda e:e['id']))


def summarize(f,s,seconds):
    mass_error=abs(sum(s['smoke'])+s['smoke_export_kg']-s['smoke_source_kg'])
    heat_error=abs(sum(s['heat'])+s['heat_export_J']-s['initial_heat_J']-s['heat_source_J'])
    assert mass_error<1e-10 and heat_error<1e-5 and s['max_divergence']<1e-8
    return dict(mode=f['mode'],dx=f['dx'],mixing=f['mixing'],drag=f['drag'],
                cells=len(f['cells']),faces=len(f['edges']),
                exported_fraction=s['smoke_export_kg']/s['smoke_source_kg'],
                clear80_time=s['clear80_time'],upper_exposure=s['upper_exposure'],
                lower_exposure=s['lower_exposure'],max_theta_K=s['max_theta'],
                mass_error_kg=mass_error,heat_error_J=heat_error,
                carrier_net_error_m3=abs(s['air_export_m3']-s['air_import_m3']),
                max_divergence_m3_s=s['max_divergence'],max_courant=s['max_courant'],
                substeps=s['substeps'],pressure_iterations=s['pressure_iterations'],
                linear_iterations=s['linear_iterations'],runtime_seconds=seconds,
                snapshot_bytes=len(json.dumps(s)),
                state_hash=hashlib.sha256(json.dumps(s,sort_keys=True).encode()).hexdigest())


def run_case(f,dt=1.,duration=900.,restart=False,reorder=False,trace=False):
    f=copy.deepcopy(f)
    if reorder: f['edges'].reverse()
    s=initial(f); t0=time.perf_counter(); rows=[]; last=None
    for k in range(round(duration/dt)):
        if restart and k==round(duration/dt)//2: s=json.loads(json.dumps(s))
        s,last=advance(f,s,dt)
        if trace and (k+1)%max(1,round(30/dt))==0:
            rows.append(dict(time=s['time'],smoke_kg=sum(s['smoke']),
                             exported_kg=s['smoke_export_kg'],upper_exposure=s['upper_exposure'],
                             heat_J=sum(s['heat'])))
    return s,summarize(f,s,time.perf_counter()-t0),rows,last


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--quick',action='store_true')
    parser.add_argument('--output',default='results.json'); args=parser.parse_args()
    results=dict(predeclared='PREDECLARED.md',cases={},traces={})
    states={}
    modes=['sealed','single','high','low','local','lower_high','tall','floor_closed','cycle']
    if args.quick: modes=['sealed','high','local','tall']
    for mode in modes:
        s,row,trace,_=run_case(make_fixture(mode=mode),trace=True)
        states[mode]=s;results['cases'][mode]=row;results['traces'][mode]=trace
        print(json.dumps(dict(case=mode,**row)),flush=True)
        (ROOT/args.output).write_text(json.dumps(results,indent=2)+'\n')
    sealed=results['cases']['sealed']['upper_exposure']
    for row in results['cases'].values():
        row['upper_exposure_improvement_fraction']=1-row['upper_exposure']/sealed
        row['useful_ventilation']=row['exported_fraction']>=.8 and row['upper_exposure_improvement_fraction']>=.25
    results['peak_process_rss_KiB']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    (ROOT/args.output).write_text(json.dumps(results,indent=2)+'\n')
    (ROOT/'sample-fixture.json').write_text(json.dumps(make_fixture(mode='high'),indent=2)+'\n')
    (ROOT/'sample-state.json').write_text(json.dumps(states['high'],indent=2)+'\n')
    print(json.dumps(dict(complete=True,output=args.output)),flush=True)


if __name__=='__main__': main()
