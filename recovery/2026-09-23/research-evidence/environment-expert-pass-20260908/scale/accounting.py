"""Owned scalar accounting/scheduling experiment; not a physical fluid solver.

Integer fixture flux = abs(amount difference)//8, intentionally a 7-unit
deadband. No terrain/actors/production imports, pressure, momentum or browser.
"""
import hashlib
import json
import platform
import random
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def apportion(requests, budget):
    total = sum(q for _, q in requests)
    if total <= budget:
        return dict(requests)
    amounts = {key: q * budget // total for key, q in requests}
    ranked = sorted(requests, key=lambda p: (-(p[1] * budget % total), p[0]))
    for key, _ in ranked[:budget - sum(amounts.values())]:
        amounts[key] += 1
    return amounts


def settle(old, proposals, capacity=1000):
    # Both endpoints consume the identical integer face amount; never clamp
    # endpoints independently. Receiver capacity freed this step is ignored.
    donors, receivers = {}, {}
    for key, (a, b, q) in proposals.items():
        donors.setdefault(a, []).append((key, q))
    accepted = {}
    for a, requests in donors.items():
        accepted.update(apportion(requests, old[a]))
    for key, (a, b, _) in proposals.items():
        receivers.setdefault(b, []).append((key, accepted[key]))
    for b, requests in receivers.items():
        accepted.update(apportion(requests, capacity - old[b]))
    result, changed = old.copy(), set()
    for key in sorted(proposals):
        a, b, _ = proposals[key]
        q = accepted[key]
        result[a] -= q
        result[b] += q
        if q:
            changed.update((a, b))
    return result, changed, accepted


def run(side, chunk, scenario, ordering, events=False, restore_at=None):
    chunks = [(x, z) for z in range(0, side, chunk) for x in range(0, side, chunk)]
    if ordering == "reverse":
        chunks.reverse()
    elif ordering == "shuffle":
        random.Random(1907).shuffle(chunks)
    old, faces, incident = {}, {}, {}
    for cx, cz in chunks:
        for z in range(cz, cz + chunk):
            for x in range(cx, cx + chunk):
                i = z * side + x
                local = side // 2 - 8 <= x < side // 2 + 8 and side // 2 - 8 <= z < side // 2 + 8
                active = scenario == "full" or (scenario == "local" and local)
                old[i] = (900 if (x + z) % 2 else 100) if active else 500
                for nx, nz in ((x + 1, z), (x - 1, z), (x, z + 1), (x, z - 1)):
                    if not (0 <= nx < side and 0 <= nz < side):
                        continue
                    j = nz * side + nx
                    key = tuple(sorted((i, j)))
                    faces[key] = key  # Neighbor/chunk duplicate observation is a view.
                    incident.setdefault(i, set()).add(key)
    active = {key for key, (a, b) in faces.items() if abs(old[a] - old[b]) >= 8}
    initial = sum(old.values())
    external, total_faces, peak_active, solver_ms = 0, 0, 0, 0.0
    closed = set()
    digests = []
    for tick in range(24):
        if events and tick in (4, 9):
            seam = {key for key, (a, b) in faces.items() if a % side == side // 2 - 1 and b == a + 1}
            closed = seam if tick == 4 else set()
            active.update(seam)  # A committed aperture revision wakes both sides.
        if events and tick in (2, 7):
            i = 0 if tick == 2 else side * side - 1
            amount = min(71, 1000 - old[i]) if tick == 2 else -min(39, old[i])
            old[i] += amount
            external += amount
            active.update(incident[i])
        started = time.perf_counter()
        peak_active = max(peak_active, len(active))
        proposals = {}
        for key in sorted(active, reverse=ordering == "reverse"):
            total_faces += 1
            if key in closed:
                continue
            a, b = key
            if old[a] < old[b]:
                a, b = b, a
            q = (old[a] - old[b]) // 8
            if q:
                proposals[key] = (a, b, q)
        old, changed, accepted = settle(old, proposals)
        active = set().union(*(incident[i] for i in changed)) if changed else set()
        solver_ms += (time.perf_counter() - started) * 1000
        # Full proof scans/digests are intentionally outside solver timing.
        assert min(old.values()) >= 0 and max(old.values()) <= 1000
        assert sum(old.values()) == initial + external
        digests.append(hashlib.sha256(json.dumps(sorted(old.items())).encode()).hexdigest())
        if restore_at == tick:
            # Checkpoint contains all amounts and future-affecting frontier state.
            payload = json.dumps({"cells": sorted(old.items()), "active": sorted(active), "closed": sorted(closed)})
            saved = json.loads(payload)
            old = dict(saved["cells"])
            active = {tuple(k) for k in saved["active"]}
            closed = {tuple(k) for k in saved["closed"]}
    return {"side": side, "chunks": len(chunks), "scenario": scenario,
            "ordering": ordering, "evaluated_faces": total_faces, "peak_active_faces": peak_active,
            "solver_ms_24_steps": round(solver_ms, 3), "mass_balance_error": sum(old.values()) - initial - external,
            "boundary_net": external, "final": digests[-1], "trace": digests}


def main():
    rows = [run(side, 16, scenario, "forward") for side in (16, 32, 64) for scenario in ("idle", "local", "full")]
    partitions = [run(64, chunk, "local", order, events=True) for chunk in (64, 32, 16) for order in ("forward", "reverse", "shuffle")]
    assert all(r["trace"] == partitions[0]["trace"] for r in partitions)
    restored = run(64, 16, "local", "shuffle", events=True, restore_at=5)
    assert restored["trace"] == partitions[0]["trace"]
    donor, _, _ = settle({0: 5, 1: 0, 2: 0}, {(0, 1): (0, 1, 5), (0, 2): (0, 2, 5)})
    receiver, _, _ = settle({0: 9, 1: 9, 2: 9}, {(0, 2): (0, 2, 4), (1, 2): (1, 2, 4)}, 10)
    assert donor == {0: 0, 1: 3, 2: 2} and receiver == {0: 8, 1: 9, 2: 10}
    sequential = []
    for edge_order in (((0, 1), (1, 2)), ((1, 2), (0, 1))):
        values = [10, 0, 0]
        for a, b in edge_order:
            q = (values[a] - values[b]) // 2
            values[a] -= q
            values[b] += q
        sequential.append(values)
    assert sequential == [[5, 3, 2], [5, 5, 0]]
    output = {"runtime": platform.python_version(), "scope": __doc__, "steps": 24,
              "rows": rows, "partition_cases": partitions,
              "checkpoint_restore_trace_equal": True,
              "counterexamples": {"naive_per_edge_donor": [-5, 5, 5], "joint_donor": donor,
                                  "joint_receiver": receiver,
                                  "sequential_half_gradient_forward": sequential[0],
                                  "sequential_half_gradient_reverse": sequential[1]},
              "limits": "Single-run Python scalar fixture. Solver timing includes full canonical dictionary copy; excludes setup, hash/proof scans and JSON checkpoint work. Idle is not O(active) overall. No continuous solver, browser, memory, distributed protocol or capacity proof."}
    (HERE / "results.json").write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps({"rows": [{k: v for k, v in r.items() if k != "trace"} for r in rows],
                      "partition_traces_equal": True, "checkpoint_restore_trace_equal": True,
                      "cases": len(partitions)}, indent=2))


if __name__ == "__main__":
    main()
