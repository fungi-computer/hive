"""Independent run groups preserve expensive/failed evidence incrementally."""
import argparse
import copy
import json
import math
import resource
import time
from pathlib import Path
from experiment import make_fixture,initial,advance,run_case,RHO,CP,ROOT


def checks():
    results={}
    f=make_fixture(mode='cycle')
    ordinary,_,_,receipt=run_case(f,duration=500)
    restarted,_,_,_=run_case(f,duration=500,restart=True,reorder=True)
    results['restart_and_edge_order_exact']=ordinary==restarted
    assert results['restart_and_edge_order_exact']
    results['last_integrated_face_receipt']=receipt
    closed=make_fixture(mode='floor_closed')
    s,_,_,_=run_case(closed,duration=300)
    upstairs=[i for i,c in enumerate(closed['cells']) if c['z']>=3]
    results['closed_floor_upstairs_smoke_kg']=sum(s['smoke'][i] for i in upstairs)
    assert results['closed_floor_upstairs_smoke_kg']==0
    # Full tick splits exactly at known command/source frontier.
    s=initial(f); s['time']=119.5
    one,r=advance(f,s,1.)
    first,_=advance(f,s,.5); two,_=advance(f,first,.5)
    results['forcing_split_fields_exact']=all(one[k]==two[k] for k in ('smoke','heat','smoke_source_kg','heat_source_J'))
    assert results['forcing_split_fields_exact']
    # Negative anomaly is legal. Transport preserves passive scalar range.
    passive=make_fixture(mode='sealed'); s=initial(passive);s['time']=120.
    s['smoke']=[c['volume']*(i%3)*1e-5 for i,c in enumerate(passive['cells'])]
    s['heat']=[RHO*CP*c['volume']*((i%3)-1)*5 for i,c in enumerate(passive['cells'])]
    total_s=sum(s['smoke']);total_h=sum(s['heat'])
    for _ in range(100): s,_=advance(passive,s,1.)
    theta=[h/(RHO*CP*c['volume']) for h,c in zip(s['heat'],passive['cells'])]
    concentration=[v/c['volume'] for v,c in zip(s['smoke'],passive['cells'])]
    results['passive_signed_anomaly']=dict(min_theta=min(theta),max_theta=max(theta),
        min_smoke_concentration=min(concentration),max_smoke_concentration=max(concentration),
        smoke_error=abs(sum(s['smoke'])-total_s),heat_error=abs(sum(s['heat'])-total_h))
    assert min(theta)>=-5-1e-10 and max(theta)<=5+1e-10
    assert min(concentration)>=-1e-14 and max(concentration)<=2e-5+1e-14
    # Energy-conserving pairwise clamps can collectively overdraw a hot center.
    old=[1.,0.,0.,0.,0.];naive=old[:]
    # Each unit-capacity pair independently limits its proposed dt=1 transfer
    # to that pair's equilibrium amount, while all proposals read one snapshot.
    pair_transfers=[min(old[0]-old[i],(old[0]-old[i])/2) for i in range(1,5)]
    naive[0]-=sum(pair_transfers)
    for i,q in enumerate(pair_transfers,1):naive[i]+=q
    stable=[1.,0.,0.,0.,0.]
    for _ in range(5):
        old=stable[:]; transfers=[.2*(old[0]-old[i]) for i in range(1,5)]
        stable[0]-=sum(transfers)
        for i,q in enumerate(transfers,1):stable[i]+=q
    results['thermal_star']=dict(pair_clamped=naive,aggregate_substepped=stable,
        pair_conserves=sum(naive)==1,aggregate_conserves=abs(sum(stable)-1)<1e-14)
    assert min(stable)>=0 and max(stable)<=1
    # A sealed exchanger carries heat but neither circuit's material.
    ca,cw=1206.,4180.;ta,tw=310.,290.;energy=ca*ta+cw*tw
    q=.4*(ta-tw)/(1/ca+1/cw); ta2=ta-q/ca;tw2=tw+q/cw
    results['sealed_exchanger']=dict(air_T_before=ta,water_T_before=tw,
        air_T_after=ta2,water_T_after=tw2,heat_transferred_J=q,
        energy_error_J=abs(ca*ta2+cw*tw2-energy),water_mass_transfer_kg=0.,gas_mass_transfer_kg=0.)
    # Frozen upstream enthalpy for a large withdrawal can violate admissibility.
    # This is a rejected explicit proposal, not the exact rigid-tank blowdown.
    cv,cp,t=718.,1005.,300.;u=cv*t
    rows=[]
    for dm in (.5,.8):
        enthalpy_u=u-dm*cp*t
        rows.append(dict(withdrawn_kg=dm,inventory_limit_passes=dm<=1,
            using_internal_energy_for_outflow_T=t,
            frozen_enthalpy_remaining_U_J=enthalpy_u,
            frozen_enthalpy_remaining_T=enthalpy_u/((1-dm)*cv),
            pressure_work_missing_if_u_advected_J=dm*(cp-cv)*t))
    results['rigid_gas_outflow_counterexample']=rows
    assert rows[1]['frozen_enthalpy_remaining_U_J']<0
    # Amount and energy cannot both survive an unaccounted air-volume overwrite.
    results['flooding_counterexample']=dict(initial_air_m3=1.,water_added_m3=.2,
        initial_background_air_kg=1.2,fixed_density_air_after_kg=.96,
        unaccounted_air_loss_kg=.24,required='reject sealed displacement or add coupled gas mass/pressure/work model')
    return results


def main():
    p=argparse.ArgumentParser();p.add_argument('group',choices=['checks','half','quarter','time','sensitivity']);a=p.parse_args()
    path=ROOT/f'{a.group}-results.json';results=dict(group=a.group,cases={})
    start=time.perf_counter()
    if a.group=='checks':results.update(checks())
    else:
        if a.group=='half': cases=[(mode,.5,1.,.01,1.) for mode in ('sealed','high','local','tall')]
        elif a.group=='quarter':
            # The separately retained 384-cell sealed run already completed.
            # Bound the finest follow-up to the useful source-local candidate.
            cases=[('local',.25,1.,.01,1.)]
        elif a.group=='time':cases=[(mode,1.,dt,.01,1.) for mode in ('high','local') for dt in (.5,.25)]
        else:
            cases=[(mode,1.,1.,mix,drag) for mode in ('sealed','high','local')
                   for mix,drag in ((.01,.1),(.01,10.),(0.,1.),(.05,1.))]
        for mode,dx,dt,mix,drag in cases:
            f=make_fixture(dx,mode,mix,drag);s,row,trace,receipt=run_case(f,dt,trace=True)
            key=f'{mode}:dx={dx}:dt={dt}:mix={mix}:drag={drag}'
            results['cases'][key]=dict(**row,dt=dt,trace=trace)
            if a.group in ('half','quarter') and mode=='local':
                (ROOT/f'{a.group}-local-final-state.json').write_text(json.dumps(s,indent=2)+'\n')
                (ROOT/f'{a.group}-local-final-flux.json').write_text(json.dumps(receipt,indent=2)+'\n')
            path.write_text(json.dumps(results,indent=2)+'\n')
            print(json.dumps(dict(case=key,**row)),flush=True)
    results['total_seconds']=time.perf_counter()-start
    results['peak_process_rss_KiB']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    path.write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps(dict(complete=True,group=a.group,seconds=results['total_seconds'])),flush=True)


if __name__=='__main__':main()
