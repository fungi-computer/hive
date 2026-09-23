"""Ignored-only numerical falsifier, not a Hive runtime or calibrated fire model.

Two storeys, each two vertical cells; two columns resolve a circulation loop.
Boussinesq resistance-network air flux; conservative first-order scalar transport.
No dependencies, browser, source imports, or modifications outside this directory.
"""
import copy
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RHO, CP, TREF, G, V = 1.2, 1005.0, 293.15, 9.81, 1.0
C = RHO * CP * V


def solve(a, b):
    """Small dense pivoted solve; experiment only, no scaling claim."""
    n = len(b)
    a = [row[:] + [b[i]] for i, row in enumerate(a)]
    for k in range(n):
        pivot = max(range(k, n), key=lambda i: abs(a[i][k]))
        assert abs(a[pivot][k]) > 1e-14
        a[k], a[pivot] = a[pivot], a[k]
        div = a[k][k]
        a[k] = [v / div for v in a[k]]
        for i in range(n):
            if i != k:
                factor = a[i][k]
                a[i] = [x - factor * y for x, y in zip(a[i], a[k])]
    return [row[-1] for row in a]


def edges(inlet=False, vent=False, stair=True, boundary_mix=0.0):
    result = []
    for height in range(4):
        result.append((f"h{height}", 2*height, 2*height+1, 0.0, .2, .0005))
        if height < 3 and (height != 1 or stair):
            for col in range(2):
                result.append((f"v{height}{col}", 2*height+col,
                               2*(height+1)+col, 1.0, .2, .0005))
    if inlet:
        result.append(("inlet", 1, -1, 0.0, .2, boundary_mix))
    if vent:
        result.append(("vent", 7, -1, 0.0, .2, boundary_mix))
    return sorted(result)


def pressures_and_fluxes(theta, graph):
    a = [[0.0] * 8 for _ in range(8)]
    rhs = [0.0] * 8
    drives = []
    adjacency = [[] for _ in range(8)]
    external = set()
    for _, i, j, dz, k, _ in graph:
        average = (theta[i] + (theta[j] if j >= 0 else 0.0)) / 2
        drive = RHO * G * dz * average / TREF
        drives.append(drive)
        a[i][i] += k
        rhs[i] -= k * drive
        if j >= 0:
            a[j][j] += k
            a[i][j] -= k
            a[j][i] -= k
            rhs[j] += k * drive
            adjacency[i].append(j)
            adjacency[j].append(i)
        else:
            external.add(i)
    seen = set()
    for root in range(8):
        if root in seen:
            continue
        stack, component = [root], set()
        while stack:
            i = stack.pop()
            if i in component:
                continue
            component.add(i)
            stack.extend(adjacency[i])
        seen.update(component)
        if not component.intersection(external):
            pin = min(component)
            a[pin] = [0.0] * 8
            a[pin][pin], rhs[pin] = 1.0, 0.0
    p = solve(a, rhs)
    q = [k*(p[i]-(p[j] if j >= 0 else 0.0)+drive)
         for (_, i, j, _, k, _), drive in zip(graph, drives)]
    divergence = [0.0] * 8
    for (_, i, j, _, _, _), flow in zip(graph, q):
        divergence[i] += flow
        if j >= 0:
            divergence[j] -= flow
    return q, max(abs(x) for x in divergence)


def initial():
    return dict(tick=0, smoke=[0.0]*8, heat=[0.0]*8,
                smoke_in=0.0, heat_in=0.0, smoke_out=0.0, heat_out=0.0,
                max_divergence=0.0, max_courant=0.0, peak_upper=0.0,
                peak_vent_flow=0.0, exposure=0.0)


def step(s, dt, mode, reorder=False):
    time = s["tick"] * dt
    # A vent command at 30 s changes physical graph, not a removal timer.
    graph = edges(inlet=mode in ("throughflow", "floor_closed"),
                  vent=(time >= 30 and mode != "sealed"),
                  stair=mode != "floor_closed",
                  boundary_mix=.02 if mode == "single_vent_mixing" else 0.0)
    if reorder:
        graph = sorted(reversed(graph))  # Stable edge identity contract.
    theta = [x / C for x in s["heat"]]
    q, divergence = pressures_and_fluxes(theta, graph)
    s["max_divergence"] = max(s["max_divergence"], divergence)
    # Each path advects background carrier, smoke and heat together. Symmetric
    # mixing is explicitly two equal carrier-volume exchanges, with zero net air.
    transfers = []
    for (name, i, j, _, _, mixing), flow in zip(graph, q):
        if name == "vent":
            s["peak_vent_flow"] = max(s["peak_vent_flow"], abs(flow))
        transfers.append((i, j, max(flow, 0.0) + mixing))
        transfers.append((j, i, max(-flow, 0.0) + mixing))
    outgoing = [0.0] * 8
    for i, _, rate in transfers:
        if i >= 0:
            outgoing[i] += rate
    courant = dt * max(outgoing) / V
    s["max_courant"] = max(s["max_courant"], courant)
    assert courant <= .4  # These parameters need one substep. Never clip q alone.
    for field, exported in (("smoke", "smoke_out"), ("heat", "heat_out")):
        old = s[field]
        delta = [0.0] * 8
        for i, j, rate in transfers:
            amount = rate * dt * old[i] / V if i >= 0 else 0.0
            if i >= 0:
                delta[i] -= amount
            if j >= 0:
                delta[j] += amount
            else:
                s[exported] += amount
        s[field] = [value + change for value, change in zip(old, delta)]
    if time < 30:
        emitted, heated = .0001 * dt, 100.0 * dt
        s["smoke"][0] += emitted
        s["heat"][0] += heated
        s["smoke_in"] += emitted
        s["heat_in"] += heated
    assert min(s["smoke"]) >= -1e-14
    assert min(s["heat"]) >= -1e-10
    s["exposure"] += s["smoke"][4] / V * dt  # Lower upper-storey cell.
    s["peak_upper"] = max(s["peak_upper"], sum(s["smoke"][4:]))
    s["tick"] += 1


def run(mode, dt=.05, reload=False, reorder=False):
    s = initial()
    count = round(300 / dt)
    for tick in range(count):
        if reload and tick == count // 2:
            s = json.loads(json.dumps(s))
        step(s, dt, mode, reorder)
    smoke_error = abs(sum(s["smoke"]) + s["smoke_out"] - s["smoke_in"])
    heat_error = abs(sum(s["heat"]) + s["heat_out"] - s["heat_in"])
    assert smoke_error < 1e-12 and heat_error < 1e-7
    assert s["max_divergence"] < 1e-12
    return s, dict(smoke_remaining_kg=sum(s["smoke"]),
                   smoke_exported_kg=s["smoke_out"],
                   heat_exported_J=s["heat_out"],
                   peak_upper_smoke_kg=s["peak_upper"],
                   upper_exposure_kg_s_m3=s["exposure"],
                   peak_vent_net_m3_s=s["peak_vent_flow"],
                   max_divergence_m3_s=s["max_divergence"],
                   smoke_balance_error_kg=smoke_error,
                   heat_balance_error_J=heat_error,
                   max_outgoing_courant=s["max_courant"])


def main():
    results = {}
    states = {}
    for mode in ("sealed", "single_vent", "single_vent_mixing", "throughflow", "floor_closed"):
        states[mode], results[mode] = run(mode)
    (ROOT / "precheck-results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2), flush=True)
    assert states["sealed"]["smoke_out"] == 0
    assert states["floor_closed"]["peak_upper"] == 0
    assert states["single_vent"]["peak_vent_flow"] < 1e-12
    acceptance = dict(
        throughflow_exports_more_than_0_0001_kg=states["throughflow"]["smoke_out"] > .0001,
        single_vent_mixing_exports_more_than_0_0001_kg=states["single_vent_mixing"]["smoke_out"] > .0001,
        upper_exposure_improves=states["throughflow"]["exposure"] < states["sealed"]["exposure"])
    replay, _ = run("throughflow", reload=True, reorder=True)
    assert replay == states["throughflow"]
    refined, refined_results = run("throughflow", dt=.025)
    relative_exposure_error = abs(refined["exposure"] - states["throughflow"]["exposure"]) / refined["exposure"]
    assert relative_exposure_error < .01
    # Conservation + a pairwise equilibrium clamp does NOT ensure positivity or
    # a thermal maximum principle at a node with competing edges.
    naive_star = [1 - 4*.5] + [.5]*4
    stable_star = [1 - 4*.2] + [.2]*4
    assert sum(naive_star) == 1 and min(naive_star) < 0
    assert abs(sum(stable_star) - 1) < 1e-15 and min(stable_star) >= 0
    results["method_checks"] = dict(
        ventilation_acceptance=acceptance,
        ventilation_candidate_accepted=all(acceptance.values()),
        rejected_pair_clamp_star_temperatures=naive_star,
        aggregate_stable_star_temperatures=stable_star,
        reload_and_input_permutation_exact=True,
        dt_halving_relative_exposure_error=relative_exposure_error,
        refined_throughflow=refined_results,
        limits="8 cells, dilute tracer, linear drag, fixed-density Boussinesq, no inertia, radiation, fuel process, actors, gas pressure or chemistry; no production or scale evidence")
    (ROOT / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
