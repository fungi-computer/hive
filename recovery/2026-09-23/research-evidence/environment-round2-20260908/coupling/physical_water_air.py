"""One actual LI receiver → an explicitly separate vented-displacement extension.

Actual round-two fixed-volume gas API is imported only for rejection at its
admission adapter. It does not solve changing gas volume or receive fake air.
"""
import copy
import hashlib
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
from coupling_fixture import initial, propose, Admission, RHO_A, CP_A, TREF
from gas_harness import gas, apply_geometry_edit

HERE=Path(__file__).resolve().parent
receiver_path=HERE/(sys.argv[1] if len(sys.argv)>1 else "water-receiver.json")
output_path=HERE/(sys.argv[2] if len(sys.argv)>2 else "physical-water-air-results.json")
water=json.loads(receiver_path.read_text())
assert water["deltaWaterM3"]>0
old=initial()
old.update(void_m3=water["oldWaterM3"]+2.,water_m3=water["oldWaterM3"],gas_m3=2.,
           air_kg=2.*RHO_A,smoke_kg=.02,air_anomaly_J=2.*RHO_A*CP_A*10,
           geometry_revision=water["geometryRevision"],time_s=water.get("fromTimeSeconds",0.))
candidate=propose(old,water["deltaWaterM3"],water["dtSeconds"],inlet_temperature_K=TREF)
new,status=Admission(old,candidate).resume(old,1000)
assert status=="committed"
assert abs(new["water_m3"]-water["newWaterM3"])<1e-12
assert abs(candidate["receipt"]["air_out_m3"]-water["deltaWaterM3"])<1e-12
assert abs(new["air_kg"]+new["ledger"]["air_out_kg"]-old["air_kg"])<1e-12
rejected=[]
for route in ("closed","unknown"):
    try:
        propose(old,water["deltaWaterM3"],water["dtSeconds"],route)
        raise AssertionError("unsupported gas route accepted")
    except ValueError: rejected.append(route)
fixed=gas.make_fixture(dx=1.,mode="high")
fixed_state=gas.initial(fixed)
flooded=copy.deepcopy(fixed)
flooded["cells"][0]["volume"]-=water["deltaWaterM3"]
try:
    apply_geometry_edit(fixed,flooded,fixed_state)
    raise AssertionError("fixed-volume solver accepted physical water intrusion")
except ValueError: rejected.append("fixed-volume-model")
result=dict(scope=__doc__,water_receipt_sha256=hashlib.sha256(receiver_path.read_bytes()).hexdigest(),
            water=water,gas_before=old,gas_after=new,receipt=candidate["receipt"],rejected=rejected,
            limitation="One accepted water substep mapped to a hypothetical vented cavity with2m³ initial free air. Prescribed linear intrusion and ideal exhaust at ambient pressure; no gas-network dynamics, finite exhaust resistance, sealed/compressible coupling or globally joined environment simulation.")
output_path.write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps({k:v for k,v in result.items() if k not in ("gas_before","gas_after")},indent=2))
