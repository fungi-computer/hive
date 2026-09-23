"""Discriminate aperture counterflow and lost horizontal information."""
import json
import time
from experiment import ROOT,make_fixture,initial,active_edges,pressure_fluxes,advance,summarize

results={}
for dx in (1.,.5,.25):
    f=make_fixture(dx,'tall');s=initial(f);s['time']=120.
    edges=active_edges(f,s['time']);q,div,_,_=pressure_fluxes(f,s,edges)
    rows=[dict(z=f['cells'][e['i']]['z'],area_m2=e['area'],flow_m3_s=flow)
          for e,flow in zip(edges,q) if e['j']==-1]
    out=sum(max(r['flow_m3_s'],0.) for r in rows)
    into=sum(max(-r['flow_m3_s'],0.) for r in rows)
    results[str(dx)]=dict(aperture_subfaces=rows,outflow_m3_s=out,inflow_m3_s=into,
                          net_m3_s=out-into,max_cell_divergence_m3_s=div)
    assert out>0 and into>0 and abs(out-into)<1e-8

f=make_fixture(mode='local');variants=[]
for x in (.5,3.5):
    s=initial(f);s['time']=120.
    i=next(i for i,c in enumerate(f['cells']) if c['x']==x and c['z']==2.5)
    s['smoke'][i]=.001;s['smoke_source_kg']=.001
    final,receipt=advance(f,s,1.)
    variants.append(dict(smoke_x_m=x,lower_upper_layer_smoke_kg=.001,
        lower_upper_layer_heat_J=sum(h for h,c in zip(s['heat'],f['cells']) if 1.5<=c['z']<3),
        first_second_smoke_export_kg=final['smoke_export_kg']))
results['same_two_layer_aggregate_different_vent_capture']=variants
assert variants[0]['first_second_smoke_export_kg']>0
assert variants[1]['first_second_smoke_export_kg']==0
results['meaning']='A horizontally uniform layer alone loses source-to-vent proximity; this is not an implementation or rejection of CFAST plume/vent submodels.'
(ROOT/'aperture-results.json').write_text(json.dumps(results,indent=2)+'\n')
# New discriminating condition, not a revised acceptance target: remove the
# predeclared warm-house reservoir and report whether the result depended on it.
results['initially_ambient_house']={}
for mode in ('sealed','high','local'):
    f=make_fixture(mode=mode);s=initial(f)
    s['heat']=[0.]*len(s['heat']);s['initial_heat_J']=0.;s['max_theta']=0.
    started=time.perf_counter()
    for _ in range(900):s,_=advance(f,s,1.)
    row=summarize(f,s,time.perf_counter()-started)
    results['initially_ambient_house'][mode]=row
    print(json.dumps(dict(case='ambient:'+mode,**row)),flush=True)
(ROOT/'aperture-results.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results),flush=True)
