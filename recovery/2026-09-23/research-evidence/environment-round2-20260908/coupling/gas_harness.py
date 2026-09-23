"""Consume sibling physical gas solver; single-process storage/restart evidence."""
import copy
import hashlib
import importlib.util
import json
import math
import platform
import random
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOLVER = HERE.parent/"gas-heat/experiment.py"
sys.dont_write_bytecode = True  # Read sibling implementation; never write its cache.
spec = importlib.util.spec_from_file_location("gas_round2", SOLVER)
gas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gas)


def digest(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def partition_restore(f, s, parts, order):
    """Actually discard decoded arrays and rebuild from independently decoded shards.

    Original physical cell IDs survive. Partition address is never face identity.
    This is storage decomposition only: pressure still solves the whole component.
    """
    per_axis = math.isqrt(parts)
    shards = {}
    owner = {}
    for i, c in enumerate(f["cells"]):
        px = min(per_axis-1, int(c["x"]/4*per_axis))
        pz = min(per_axis-1, int(c["z"]/6*per_axis))
        key = (px, pz)
        owner[i] = key
        shards.setdefault(key, []).append(dict(index=i, id=c["id"], cell=c,
                                               smoke=s["smoke"][i], heat=s["heat"][i]))
    # Each physical face may be observed from both endpoints in decoded shards.
    blobs = []
    for key, cells in shards.items():
        faces = [e for e in f["edges"] if owner[e["i"]] == key or (e["j"] >= 0 and owner[e["j"]] == key)]
        blobs.append(json.dumps(dict(cells=cells, faces=faces)))
    if order == "reverse":
        blobs.reverse()
    elif order == "shuffle":
        random.Random(817).shuffle(blobs)
    header = json.loads(json.dumps({k:v for k,v in s.items() if k not in ("smoke", "heat")}))
    config = json.loads(json.dumps({k:v for k,v in f.items() if k not in ("cells", "edges")}))
    del shards
    cells, edges = {}, {}
    duplicate_observations = 0
    for blob in blobs:
        chunk = json.loads(blob)
        for c in chunk["cells"]:
            assert c["index"] not in cells
            cells[c["index"]] = c
        for e in chunk["faces"]:
            if e["id"] in edges:
                assert edges[e["id"]] == e
                duplicate_observations += 1
            edges[e["id"]] = e
    config["cells"] = [cells[i]["cell"] for i in sorted(cells)]
    # Keep traversal permutations at the actual solver caller: active_edges must
    # canonicalize them, while the solver's numerical arithmetic is untouched.
    config["edges"] = list(edges.values())
    if order == "reverse": config["edges"].reverse()
    if order == "shuffle": random.Random(911).shuffle(config["edges"])
    header["smoke"] = [cells[i]["smoke"] for i in sorted(cells)]
    header["heat"] = [cells[i]["heat"] for i in sorted(cells)]
    return config, header, dict(shards=len(blobs), duplicate_face_observations=duplicate_observations,
                               bytes=sum(len(x) for x in blobs), canonical_faces=len(edges))


def validate(f, old, new, receipt):
    assert receipt["start"] == old["time"] and receipt["end"] == new["time"]
    n = len(f["cells"])
    delta_s, delta_h, divergence = [0.]*n, [0.]*n, [0.]*n
    ids = set()
    outside_s, outside_h = 0., 0.
    physical = {e["id"]:e for e in f["edges"]}
    for r in receipt["faces"]:
        assert r["id"] not in ids
        ids.add(r["id"])
        e = physical[r["id"]]
        assert (e["i"],e["j"]) == (r["i"],r["j"])
        i,j = r["i"],r["j"]
        delta_s[i]-=r["smoke_kg"]; delta_h[i]-=r["heat_J"]; divergence[i]+=r["air_m3"]
        if j>=0:
            delta_s[j]+=r["smoke_kg"]; delta_h[j]+=r["heat_J"]; divergence[j]-=r["air_m3"]
        else:
            outside_s+=r["smoke_kg"]; outside_h+=r["heat_J"]
    source_time = max(0., min(120.,new["time"])-min(120.,old["time"]))
    for i,c in enumerate(f["cells"]):
        if c["x"]<1 and c["z"]<1:
            delta_s[i] += 1e-5*source_time*c["volume"]/2
            delta_h[i] += 1000*source_time*c["volume"]/2
    smoke_error = max(abs(a-b-d) for a,b,d in zip(new["smoke"],old["smoke"],delta_s))
    heat_error = max(abs(a-b-d) for a,b,d in zip(new["heat"],old["heat"],delta_h))
    carrier_error = max(map(abs,divergence))
    assert smoke_error < 1e-12 and heat_error < 1e-7
    assert carrier_error < max(1e-8, 3e-10*(new["time"]-old["time"]))
    assert abs(new["smoke_export_kg"]-old["smoke_export_kg"]-outside_s)<1e-12
    assert abs(new["heat_export_J"]-old["heat_export_J"]-outside_h)<1e-7
    return smoke_error, heat_error, carrier_error


def geometry_digest(f):
    return digest({**f,"edges":sorted(f["edges"],key=lambda e:e["id"])})


def apply_geometry_edit(old_f, new_f, state):
    if len(old_f["cells"])!=len(new_f["cells"]) or any(
        (a["id"],a["volume"])!=(b["id"],b["volume"])
        for a,b in zip(old_f["cells"],new_f["cells"])):
        raise ValueError("fixed-volume gas model cannot accept displaced/removed air cells")
    return copy.deepcopy(new_f),copy.deepcopy(state)


class BoundCandidate:
    def __init__(self,f,old,new,receipt):
        self.geometry=geometry_digest(f)
        self.base=digest(old)
        self.new=copy.deepcopy(new)
        self.receipt=copy.deepcopy(receipt)
        self.cursor=0

    def resume(self,f,committed,quota):
        if geometry_digest(f)!=self.geometry or digest(committed)!=self.base:
            raise ValueError("stale geometry or committed frontier")
        # Interrupted validation may retain this serializable scratch or rebuild
        # from the last committed checkpoint. Physical solve already completed.
        while quota>0 and self.cursor<len(self.receipt["faces"]):
            face=self.receipt["faces"][self.cursor]
            assert all(math.isfinite(face[k]) for k in ("air_m3","smoke_kg","heat_J"))
            self.cursor+=1;quota-=1
        if self.cursor<len(self.receipt["faces"]):return committed,"pending"
        validate(f,committed,self.new,self.receipt)
        return copy.deepcopy(self.new),"committed"


def run_case(base_f, base_s, parts, order, restart=False):
    f,s,storage = partition_restore(base_f,base_s,parts,order)
    revision, trace, receipt_trace, worst = 1, [], [], [0.,0.,0.]
    closed = False
    for k in range(40):
        if k in (18,26):
            before = digest(s)
            closed = not closed
            f["mode"] = "floor_closed" if closed else "high"
            revision += 1
            assert digest(s) == before
        if restart and k==11:
            # Decode actual serialized state+geometry checkpoint; no references
            # to old arrays or pressure warm start survive.
            payload=json.dumps(dict(f=f,s=s,revision=revision))
            del f,s
            restored=json.loads(payload)
            f,s,revision=restored["f"],restored["s"],restored["revision"]
        old_digest=digest(s)
        new,receipt=gas.advance(f,s,1.)
        assert digest(s)==old_digest
        errs=validate(f,s,new,receipt)
        worst=[max(a,b) for a,b in zip(worst,errs)]
        s=new
        trace.append(digest(dict(s=s,revision=revision)))
        receipt_trace.append(digest(receipt))
    return dict(parts=parts,order=order,restart=restart,storage=storage,
                trace=trace,receipt_trace=receipt_trace,worst_residuals=worst,final=s)


def main():
    started=time.perf_counter()
    solver_hash=hashlib.sha256(SOLVER.read_bytes()).hexdigest()
    f=gas.make_fixture(dx=1.,mode="high",mixing=.01,drag=1.)
    seed=gas.initial(f)
    for _ in range(118): seed,_=gas.advance(f,seed,1.)
    cases=[run_case(f,seed,p,o) for p in (1,4,16) for o in ("forward","reverse","shuffle")]
    assert all(c["trace"]==cases[0]["trace"] and c["receipt_trace"]==cases[0]["receipt_trace"] for c in cases)
    restarted=run_case(f,seed,16,"shuffle",True)
    assert restarted["trace"]==cases[0]["trace"] and restarted["receipt_trace"]==cases[0]["receipt_trace"]
    before=gas.advance(f,seed,1.5)[0]
    whole,whole_receipt=gas.advance(f,before,1.)
    split1,part1=gas.advance(f,before,.5)
    split2,part2=gas.advance(f,split1,.5)
    # Number of API calls is intentionally different; future physical quantities,
    # exposure and actual numerical substep/iteration diagnostics must agree.
    assert {k:v for k,v in whole.items() if k!="step"} == {k:v for k,v in split2.items() if k!="step"}
    validate(f,before,whole,whole_receipt)
    validate(f,before,split1,part1);validate(f,split1,split2,part2)
    # Candidate geometry binding is a reviewed admission boundary outside solver.
    edited=copy.deepcopy(f)
    edited["edges"]=[e for e in edited["edges"] if e["gate"]!="stair"]
    candidate,new_receipt=gas.advance(f,seed,1.)
    committed=copy.deepcopy(seed)
    adapter=BoundCandidate(f,seed,candidate,new_receipt)
    try:
        adapter.resume(edited,committed,10000)
        raise RuntimeError("stale physical candidate accepted")
    except ValueError: pass
    assert committed==seed
    edited,unchanged=apply_geometry_edit(f,edited,seed)
    assert unchanged==seed
    after_edit,edit_receipt=gas.advance(edited,unchanged,1.)
    validate(edited,unchanged,after_edit,edit_receipt)
    # Smaller free volume cannot be passed as an ordinary fixed-volume edit.
    flooded=copy.deepcopy(f);flooded["cells"][0]["volume"]-=.25
    try:
        apply_geometry_edit(f,flooded,seed)
        raise RuntimeError("unsupported gas displacement accepted")
    except ValueError: pass
    adapter=BoundCandidate(f,seed,candidate,new_receipt)
    interruptions=0
    while True:
        result,status=adapter.resume(f,seed,3)
        if status=="committed":break
        interruptions+=1
        assert result==seed
        scratch=json.loads(json.dumps(adapter.__dict__))
        adapter=BoundCandidate(f,seed,candidate,new_receipt)
        adapter.__dict__.update(scratch)
    assert result==candidate
    try:
        adapter.resume(f,result,10000)
        raise RuntimeError("physical candidate double committed")
    except ValueError:pass
    # Balance-preserving forged face still violates a local successor relation.
    forged=copy.deepcopy(new_receipt)
    edge=next(e for e in forged["faces"] if e["j"]>=0)
    edge["smoke_kg"]+=1e-4
    try:
        validate(f,seed,candidate,forged)
        raise RuntimeError("forged internal redistribution accepted")
    except AssertionError: pass
    # Solver output cannot be independently clipped even if smoke stays >=0.
    clipped=copy.deepcopy(new_receipt)
    edge=max(clipped["faces"],key=lambda e:abs(e["air_m3"]))
    edge["air_m3"]*=.5
    try:
        validate(f,seed,candidate,clipped)
        raise RuntimeError("divergence-changing clip accepted")
    except AssertionError: pass
    refinement=[]
    init120=gas.advance(f,seed,2.)[0]
    for dt in (1.,.5,.25):
        state=copy.deepcopy(init120)
        for _ in range(round(30/dt)):
            state,r=gas.advance(f,state,dt)
        refinement.append(dict(dt=dt,state=state))
    fine=refinement[-1]["state"]
    errors=[dict(dt=row["dt"],smoke_L1_kg=sum(abs(a-b) for a,b in zip(row["state"]["smoke"],fine["smoke"])),
                 heat_L1_J=sum(abs(a-b) for a,b in zip(row["state"]["heat"],fine["heat"]))) for row in refinement]
    assert solver_hash==hashlib.sha256(SOLVER.read_bytes()).hexdigest(),"solver changed during proof"
    output=dict(scope=__doc__,solver_sha256=solver_hash,
                runtime=platform.python_version(),elapsed_seconds=time.perf_counter()-started,
                partition_cases=cases,restart=restarted,partition_and_full_receipt_traces_equal=True,
                forcing_boundary_119_5_to_120_5_physical_state_exact=True,
                stale_geometry_candidate_rejected_by_adapter=True,
                fixed_volume_flooding_rejected_by_adapter=True,
                internal_smoke_forgery_rejected=True,independent_air_face_clipping_rejected=True,
                physical_receipt_validation_interruptions=interruptions,
                validation_scratch_reload_exact=True,double_commit_rejected=True,
                dt_continuation_comparison=errors,
                limits="24 physical cells / 48 m³. Storage partition reconstruction plus whole-component physical pressure solve. No independent subdomain solves, sparse scheduling, distributed transaction, changed-volume gas solver, cross-engine replay or production capacity proof. dt comparison is 30 s continuation from one common120 s state, not full source/refinement convergence.")
    out=HERE/(sys.argv[1] if len(sys.argv)>1 else "gas-results.json")
    out.write_text(json.dumps(output,indent=2,allow_nan=False)+"\n")
    print(json.dumps({k:v for k,v in output.items() if k not in ("partition_cases","restart")},indent=2))


if __name__=="__main__": main()
