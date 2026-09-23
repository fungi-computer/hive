"""Independent bounded displacement/thermal transaction; NOT a fluid solver.

The prescribed water intrusion has no momentum or pressure feedback. A vented
fixed-reference-density extension and analytic ideal-gas counterexamples are
deliberately different models. No gas/heat sibling code is copied here.
"""
import copy
import hashlib
import json
import math
import platform
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RHO_A, CP_A, CV_A, R_A = 1.2, 1005.0, 718.0, 287.0
RHO_W, CP_W, TREF = 1000.0, 4180.0, 293.15


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def initial():
    return dict(model="vented-piston-reference-density-v1", geometry_revision=1,
                time_s=0.0, forcing_cursor=0, void_m3=1.0, water_m3=.2,
                water_anomaly_J=0.0, gas_m3=.8, air_kg=RHO_A*.8,
                smoke_kg=.008, air_anomaly_J=RHO_A*.8*CP_A*10,
                ledger=dict(water_in_m3=0.0, water_anomaly_in_J=0.0,
                            air_out_kg=0.0, smoke_out_kg=0.0, air_anomaly_out_J=0.0),
                history=dict(last_displacement_m3=0.0))


def propose(old, delta_water_m3, dt_s, route="open", inlet_temperature_K=283.15):
    if old["model"] != "vented-piston-reference-density-v1":
        raise ValueError("unsupported model")
    if route != "open":
        raise ValueError("needs compatible exhaust; sealed compression is unsupported")
    if not 0 < delta_water_m3 < old["gas_m3"] or dt_s <= 0:
        raise ValueError("positive displacement with remaining gas required")
    new = copy.deepcopy(old)
    fraction = delta_water_m3 / old["gas_m3"]
    receipt = dict(geometry_revision=old["geometry_revision"], from_time_s=old["time_s"],
                   to_time_s=old["time_s"]+dt_s, forcing_cursor=old["forcing_cursor"],
                   base_digest=digest(old), route=route, water_in_m3=delta_water_m3,
                   water_anomaly_in_J=delta_water_m3*RHO_W*CP_W*(inlet_temperature_K-TREF),
                   air_out_m3=delta_water_m3, air_out_kg=RHO_A*delta_water_m3,
                   smoke_out_kg=old["smoke_kg"]*fraction,
                   air_anomaly_out_J=old["air_anomaly_J"]*fraction,
                   mechanical_energy_model="prescribed motion; reference-density thermal anomaly only")
    new["water_m3"] += delta_water_m3
    new["gas_m3"] -= delta_water_m3
    new["water_anomaly_J"] += receipt["water_anomaly_in_J"]
    for state_key, receipt_key in (("air_kg", "air_out_kg"), ("smoke_kg", "smoke_out_kg"),
                                   ("air_anomaly_J", "air_anomaly_out_J")):
        new[state_key] -= receipt[receipt_key]
    for key in new["ledger"]:
        new["ledger"][key] += receipt[key]
    new["time_s"] = receipt["to_time_s"]
    new["history"]["last_displacement_m3"] = delta_water_m3
    return dict(state=new, receipt=receipt)


def close(a, b, label):
    if not math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-10):
        raise ValueError(f"{label}: {a} != {b}")


class Admission:
    """Validation continuation owns scratch only; one final whole-state commit.

    No quantity allocation or physical output repair occurs at this boundary.
    The bounded validation quota is operational evidence, not solver work proof.
    """
    def __init__(self, old, proposal):
        self.base_digest = digest(old)
        self.proposal = copy.deepcopy(proposal)
        self.cursor = 0

    def resume(self, committed, quota):
        if digest(committed) != self.base_digest:
            raise ValueError("stale committed state/revision")
        r, n = self.proposal["receipt"], self.proposal["state"]
        checks = [
            (r["base_digest"] == self.base_digest, "base digest"),
            (r["geometry_revision"] == committed["geometry_revision"] == n["geometry_revision"], "geometry revision"),
            (r["from_time_s"] == committed["time_s"] and r["to_time_s"] == n["time_s"] and n["time_s"] > committed["time_s"], "interval"),
            (r["forcing_cursor"] == committed["forcing_cursor"] == n["forcing_cursor"], "forcing cursor"),
            (r["route"] == "open" and n["model"] == committed["model"], "model / exhaust"),
            (0 < n["gas_m3"] and 0 <= n["water_m3"] and n["air_kg"] >= 0 and n["smoke_kg"] >= 0, "positive stocks"),
        ]
        numeric = [
            (n["water_m3"]+n["gas_m3"], n["void_m3"], "occupied void"),
            (n["void_m3"], committed["void_m3"], "fixed physical tank"),
            (n["water_m3"]-committed["water_m3"], r["water_in_m3"], "water delta"),
            (committed["gas_m3"]-n["gas_m3"], r["air_out_m3"], "moving-volume continuity"),
            (r["air_out_m3"], r["water_in_m3"], "coupled volume"),
            (r["air_out_kg"], RHO_A*r["air_out_m3"], "reference density export"),
            (n["air_kg"], RHO_A*n["gas_m3"], "reference density successor"),
            (r["smoke_out_kg"], committed["smoke_kg"]*r["air_out_m3"]/committed["gas_m3"], "well-mixed tracer export"),
            (r["air_anomaly_out_J"], committed["air_anomaly_J"]*r["air_out_m3"]/committed["gas_m3"], "well-mixed thermal export"),
            (n["water_anomaly_J"]-committed["water_anomaly_J"], r["water_anomaly_in_J"], "water thermal input"),
            (n["history"]["last_displacement_m3"], r["water_in_m3"], "history successor"),
        ]
        for state_key, receipt_key in (("air_kg", "air_out_kg"), ("smoke_kg", "smoke_out_kg"), ("air_anomaly_J", "air_anomaly_out_J")):
            numeric.append((committed[state_key]-n[state_key], r[receipt_key], state_key))
        numeric.extend((n["ledger"][k]-committed["ledger"][k], r[k], "ledger "+k) for k in committed["ledger"])
        total = len(checks)+len(numeric)
        while quota > 0 and self.cursor < total:
            if self.cursor < len(checks):
                good, label = checks[self.cursor]
                if not good:
                    raise ValueError(label)
            else:
                close(*numeric[self.cursor-len(checks)])
            self.cursor += 1
            quota -= 1
        if self.cursor < total:
            return committed, "pending"
        return copy.deepcopy(n), "committed"


def expect_reject(old, proposal):
    before = digest(old)
    try:
        Admission(old, proposal).resume(old, 1000)
    except ValueError as error:
        assert digest(old) == before
        return str(error)
    raise AssertionError("candidate unexpectedly accepted")


def main():
    old = initial()
    candidate = propose(old, .25, 10)
    new, status = Admission(old, candidate).resume(old, 1000)
    assert status == "committed"
    cold = initial()
    cold["air_anomaly_J"] *= -1
    cold_next, cold_status = Admission(cold, propose(cold, .25, 10)).resume(cold, 1000)
    assert cold_status == "committed" and cold_next["air_anomaly_J"] < 0
    close(cold_next["air_anomaly_J"]/(RHO_A*CP_A*cold_next["gas_m3"]), -10, "negative anomaly remains valid")
    close(new["gas_m3"], .55, "gas volume")
    close(new["smoke_kg"]/new["gas_m3"], old["smoke_kg"]/old["gas_m3"], "concentration")
    close(new["air_anomaly_J"]/(RHO_A*CP_A*new["gas_m3"]), 10, "gas temperature unchanged")
    # Repeated bounded pauses expose only the old checkpoint. Reloading the
    # complete pending validation continuation or rebuilding it is equivalent.
    work = Admission(old, candidate)
    pending_count = 0
    while True:
        observed, status = work.resume(old, 3)
        if status == "committed":
            break
        pending_count += 1
        assert digest(observed) == digest(old)
        saved = json.loads(json.dumps(work.__dict__))
        work = Admission(old, candidate)
        work.__dict__.update(saved)
    assert observed == new
    stale = copy.deepcopy(old)
    stale["geometry_revision"] += 1
    try:
        Admission(old, candidate).resume(stale, 1000)
        raise AssertionError("stale edit accepted")
    except ValueError:
        pass
    rejects = {}
    bad = copy.deepcopy(candidate)
    bad["state"]["air_kg"] = old["air_kg"]
    rejects["shrink_volume_keep_fixed_density_air_mass"] = expect_reject(old, bad)
    bad = copy.deepcopy(candidate)
    bad["receipt"]["air_out_m3"] = 0.0
    rejects["reuse_divergence_zero_fixed_volume_solve"] = expect_reject(old, bad)
    bad = copy.deepcopy(candidate)
    bad["state"]["air_anomaly_J"] = 0.0
    rejects["erase_air_heat"] = expect_reject(old, bad)
    for route in ("closed", "unknown"):
        try:
            propose(old, .25, 10, route)
            raise AssertionError("unsupported route accepted")
        except ValueError as error:
            rejects[route+"_displacement"] = str(error)
    cw = new["water_m3"]*RHO_W*CP_W
    ca = new["gas_m3"]*RHO_A*CP_A
    tw = TREF+new["water_anomaly_J"]/cw
    ta = TREF+new["air_anomaly_J"]/ca
    total_h = new["water_anomaly_J"]+new["air_anomaly_J"]
    teq = TREF+total_h/(cw+ca)
    tnaive = (tw+ta)/2
    defect = (cw+ca)*(tnaive-TREF)-total_h
    assert tw < teq < ta and abs(defect) > 1e6
    # Exact analytic ideal-gas counterexample, positive pressure work accounted
    # in an external actuator. This is not a coupled hydraulics implementation.
    v1, v2, t1, p1 = .8, .55, 303.15, 101325.0
    gas_mass = p1*v1/(R_A*t1)
    gamma = CP_A/CV_A
    t2 = t1*(v1/v2)**(gamma-1)
    p2 = p1*(v1/v2)**gamma
    u1, u2 = gas_mass*CV_A*t1, gas_mass*CV_A*t2
    work_on = u2-u1
    close(p2*v2, gas_mass*R_A*t2, "ideal gas EOS")
    close(work_on, (p2*v2-p1*v1)/(gamma-1), "adiabatic work integral")
    # Constant-pressure isothermal vented ideal-gas displacement, not same
    # thermodynamic model as the approximate anomaly state above.
    dm = p1*(v1-v2)/(R_A*t1)
    du = -dm*CV_A*t1
    h_export = dm*CP_A*t1
    w = p1*(v1-v2)
    close(du, -h_export+w, "enthalpy + moving boundary work")
    incorrect_delta_u = -dm*CV_A*t1+w
    assert abs(incorrect_delta_u-du) > 25000
    output = dict(scope=__doc__, runtime=platform.python_version(),
                  initial=old, accepted_vented=new, receipt=candidate["receipt"],
                  budget_interruptions=pending_count, restarted_validation_exact=True,
                  negative_air_thermal_anomaly_accepted_J=cold_next["air_anomaly_J"],
                  rejected=rejects, geometry_revision_invalidates_pending=True,
                  thermal=dict(water_K=tw, air_K=ta, water_capacity_J_K=cw,
                               air_capacity_J_K=ca, weighted_equilibrium_K=teq,
                               unweighted_equilibrium_K=tnaive, naive_energy_defect_J=defect),
                  sealed_adiabatic=dict(gas_mass_kg=gas_mass, before_pressure_Pa=p1,
                                       after_pressure_Pa=p2, before_K=t1, after_K=t2,
                                       external_work_on_gas_J=work_on),
                  ideal_vented=dict(delta_internal_energy_J=du, enthalpy_export_J=h_export,
                                   boundary_work_on_gas_J=w, wrong_internal_export_energy_defect_J=incorrect_delta_u-du),
                  limits="Prescribed intrusion, single well-mixed tank, no flow resistance, liquid momentum, gas-network evolution, phase change or production/runtime claim. Validator checks this closed example, not arbitrary physical correctness.")
    path = HERE/(sys.argv[1] if len(sys.argv)>1 else "independent-results.json")
    path.write_text(json.dumps(output, indent=2, allow_nan=False)+"\n")
    print(json.dumps(output, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
