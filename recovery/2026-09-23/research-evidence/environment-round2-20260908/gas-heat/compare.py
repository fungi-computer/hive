"""Read completed evidence and apply the unchanged declared acceptance rules."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def read(name):return json.loads((ROOT/name).read_text())
base=read('results.json')['cases']
half={r['mode']:r for r in read('half-results.json')['cases'].values()}
quarter={r['mode']:r for r in read('quarter-bounded-partial-results.json')['cases'].values()}
if (ROOT/'quarter-results.json').exists():
    quarter.update({r['mode']:r for r in read('quarter-results.json')['cases'].values()})
out=dict(candidate_status='needs_correction',production_solver_selected=False,
         ventilation_behavior_demonstrated=base['local']['useful_ventilation'],
         temporal=[],spatial=[],layout=[],sensitivity=[])
for r in read('time-results.json')['cases'].values():
    b=base[r['mode']]
    errors={k:abs(b[k]-r[k])/max(abs(r[k]),1e-30) for k in ('upper_exposure','exported_fraction')}
    out['temporal'].append(dict(mode=r['mode'],dt=r['dt'],errors_vs_dt1=errors,
                               pass_5_percent=max(errors.values())<=.05))
for a,b in ((base,half),(half,quarter)):
    for mode in sorted(a.keys()&b.keys()):
        first,last=a[mode],b[mode]
        errors={k:abs(first[k]-last[k])/max(abs(last[k]),.01*b['sealed']['upper_exposure'] if k=='upper_exposure' else 1e-30)
                for k in ('upper_exposure','exported_fraction')}
        out['spatial'].append(dict(mode=mode,from_dx=first['dx'],to_dx=last['dx'],
                                   errors_relative_to_finer=errors,
                                   pass_15_percent=max(errors.values())<=.15))
for group in (base,half,quarter):
    sealed=group['sealed']['upper_exposure']
    for mode,row in group.items():
        if mode=='sealed':continue
        improvement=1-row['upper_exposure']/sealed
        out['layout'].append(dict(mode=mode,dx=row['dx'],exported_fraction=row['exported_fraction'],
                                  clear80_time=row['clear80_time'],upper_exposure_improvement=improvement,
                                  passes_gameplay_targets=row['exported_fraction']>=.8 and improvement>=.25))
sens=list(read('sensitivity-results.json')['cases'].values())
for row in sens:
    if row['mode']=='sealed':continue
    sealed=next(r for r in sens if r['mode']=='sealed' and r['mixing']==row['mixing'] and r['drag']==row['drag'])
    out['sensitivity'].append(dict(mode=row['mode'],mixing=row['mixing'],drag=row['drag'],
        exported_fraction=row['exported_fraction'],upper_exposure=row['upper_exposure'],
        sealed_upper_exposure=sealed['upper_exposure'],
        exposure_improvement=(1-row['upper_exposure']/sealed['upper_exposure']) if sealed['upper_exposure']>1e-12 else None))
rows=list(base.values())+list(half.values())+list(quarter.values())+sens+list(read('time-results.json')['cases'].values())
out['largest_measured_errors']=dict(smoke_kg=max(r['mass_error_kg'] for r in rows),
    signed_thermal_J=max(r['heat_error_J'] for r in rows),
    divergence_m3_s=max(r['max_divergence_m3_s'] for r in rows))
out['time_passes']=all(r['pass_5_percent'] for r in out['temporal'])
out['spatial_passes']=all(r['pass_15_percent'] for r in out['spatial'])
out['closure_qualification']='Darcy interior drag/mixing not calibrated for unobstructed rooms; sensitivity is model uncertainty, not a physical confidence interval.'
out['quarter_high_not_completed']='Full three-case quarter group was deliberately stopped after completed sealed baseline; local received its own bounded run. No finest high-vent result claimed.'
out['quarter_local_complete']='local' in quarter
out['candidate_accepted']=out['time_passes'] and out['spatial_passes'] and out['ventilation_behavior_demonstrated']
(ROOT/'decision-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2),flush=True)
