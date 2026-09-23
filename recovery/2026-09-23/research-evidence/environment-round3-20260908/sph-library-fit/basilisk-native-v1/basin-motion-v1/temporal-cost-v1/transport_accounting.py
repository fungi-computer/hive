"""Independent signed closure of passive records; never invokes the solver."""
import math
import sys
from force_accounting import finite, near


def words(row, key):
    pair = row[key]
    if not isinstance(pair, list) or len(pair) != 2 or not all(finite(x) for x in pair):
        raise ValueError(f"invalid compensated pair {key}")
    return pair


def value(row, key):
    return math.fsum(words(row, key))


def difference(row, after, before):
    return math.fsum(words(row, after) + [-x for x in words(row, before)])


def ledger_near(a, b):
    # JSON round-trips each double; permit a few final-sum ulps, never stock-scale repair.
    return finite(a) and finite(b) and abs(a - b) <= max(1e-24, 8 * sys.float_info.epsilon * max(abs(a), abs(b)))


def inspect_transport(capture):
    rows = [r for r in capture["rows"] if r.get("kind") == "transport"]
    waves = {r["step"]: r for r in capture["rows"] if r.get("kind") == "observation"}
    forces = {r["step"]: r for r in capture["rows"] if r.get("kind") == "reduced_force"}
    controls = {key: True for key in (
        "oneContiguousTransportPerCompletedStep", "matchingTimeAndStages",
        "finiteCanonicalObservation", "closedWaterBoundaryKnownZero",
        "originalFractionEnvelope", "signedVofClosure", "stageClosure",
        "cumulativeSignedClosure", "cumulativeLedgerMatchesRows",
        "onePeriodAbsoluteBudget", "clampMatchesSeparateNativeForceRecord",
        "legacyFailureReportedTruthfully")}
    controls["oneContiguousTransportPerCompletedStep"] = len(rows) == len(waves) - 1 and len(rows) > 0
    history = {key: [] for key in ("cc", "cc_abs", "vof", "vof_abs", "clamp", "clamp_abs",
                                 "stage", "stage_abs", "full_bound")}
    previous = None
    samples = []
    legacy_failed = False
    for step, r in enumerate(rows, 1):
        w, force = waves.get(step), forces.get(step)
        if w is None or force is None:
            controls["matchingTimeAndStages"] = False
            continue
        controls["oneContiguousTransportPerCompletedStep"] &= r["step"] == step and \
            r["beforeVofCalls"] == step and r["afterVofCalls"] == step and r["beforeForceCalls"] == step
        controls["finiteCanonicalObservation"] &= r["valid"] is True and r["bad"] == 0 and \
            r["cells"] == w["cells"] and all(finite(x) for x in r.values() if not isinstance(x, (str, bool, list)))
        controls["matchingTimeAndStages"] &= r["case"] == capture["caseName"] and \
            words(r, "initialStock") == words(rows[0], "initialStock") and \
            near(r["velocityTimeSeconds"], w["velocityTimeSeconds"]) and \
            near(r["transportDtSeconds"], w["dtSeconds"]) and \
            near(r["priorProjectionDtSeconds"], w["previousDtSeconds"]) and \
            near(value(r, "postForceStock"), w["waterM3PerMetre"], 1e-12) and \
            near(value(r, "preForceStock"), force["preWaterM3PerM"], 1e-12)
        controls["closedWaterBoundaryKnownZero"] &= r["nonzeroWallFaces"] == 0 and \
            r["waterBoundaryFluxKnown"] is True and r["waterBoundaryFluxM3PerM"] == 0 and \
            r["wallNormalSpeedMps"] == 0 and value(r, "boundaryTotalInward") == 0 and \
            value(r, "boundaryTotalAbsolute") == 0
        controls["originalFractionEnvelope"] &= finite(r["preVofFractionMin"]) and \
            finite(r["preVofFractionMax"]) and r["preVofFractionMin"] >= -1e-12 and \
            r["preVofFractionMax"] <= 1 + 1e-12
        dt = r["transportDtSeconds"]
        cc = value(r, "ccContribution")
        delta = difference(r, "postVofStock", "preVofStock")
        residual = delta - cc
        allowance = 64 * sys.float_info.epsilon * (1.08 + r["sweptVolumeScaleM3PerM"])
        stage_allowance = 8 * sys.float_info.epsilon * 1.08
        controls["signedVofClosure"] &= near(r["vofDeltaM3PerM"], delta, 1e-24) and \
            near(r["vofResidualM3PerM"], residual, 1e-24) and \
            near(r["vofResidualAllowanceM3PerM"], allowance, 1e-27) and \
            0 <= r["sweptVolumeScaleM3PerM"] and abs(residual) <= allowance
        prior_stock = words(previous, "postForceStock") if previous else words(r, "initialStock")
        gap0 = math.fsum(words(r, "preVofStock") + [-x for x in prior_stock])
        gap1 = difference(r, "preForceStock", "postVofStock")
        clamp = value(r, "clampSigned")
        clamp_absolute = value(r, "clampAbsolute")
        gap2 = difference(r, "postForceStock", "preForceStock") - clamp
        controls["stageClosure"] &= near(r["stageAllowanceM3PerM"], stage_allowance, 1e-27) and \
            all(near(r[k], x, 1e-24) and abs(x) <= stage_allowance for k, x in (
                ("preVofGapM3PerM", gap0), ("preForceGapM3PerM", gap1), ("clampResidualM3PerM", gap2)))
        full_bound = dt * 1.08 * r["preVofDivergenceMaxPerSecond"]
        controls["signedVofClosure"] &= near(r["fullDomainBoundM3PerM"], full_bound, 1e-24) and \
            abs(cc) <= full_bound + 1e-24
        increments = {"cc": cc, "cc_abs": abs(cc), "vof": residual, "vof_abs": abs(residual),
                      "clamp": clamp, "clamp_abs": clamp_absolute,
                      "stage": gap0 + gap1 + gap2, "stage_abs": abs(gap0) + abs(gap1) + abs(gap2),
                      "full_bound": full_bound}
        for key, increment in increments.items():
            history[key].append(increment)
        cumulative = {key: math.fsum(values) for key, values in history.items()}
        for key, field in (("cc", "cumulativeCc"), ("cc_abs", "cumulativeCcAbsolute"),
                           ("vof", "cumulativeVofResidual"), ("vof_abs", "cumulativeVofResidualAbsolute"),
                           ("clamp", "cumulativeClamp"), ("clamp_abs", "cumulativeClampAbsolute"),
                           ("stage", "cumulativeStageResidual"), ("stage_abs", "cumulativeStageResidualAbsolute"),
                           ("full_bound", "cumulativeFullDomainBound")):
            controls["cumulativeLedgerMatchesRows"] &= ledger_near(value(r, field), cumulative[key])
        drift = difference(r, "postForceStock", "initialStock")
        closure = math.fsum([drift, -cumulative["cc"], -cumulative["vof"],
                             -cumulative["clamp"], -cumulative["stage"]])
        controls["cumulativeSignedClosure"] &= near(r["driftM3PerM"], drift, 1e-24) and \
            near(r["signedClosureM3PerM"], closure, 1e-24) and abs(closure) <= stage_allowance
        spent = cumulative["cc_abs"] + cumulative["vof_abs"] + cumulative["clamp_abs"] + cumulative["stage_abs"]
        controls["onePeriodAbsoluteBudget"] &= r["budgetM3PerM"] == 5.4e-7 and \
            ledger_near(r["spentAbsoluteBudgetM3PerM"], spent) and 0 <= spent <= 5.4e-7 and abs(drift) <= 5.4e-7
        controls["clampMatchesSeparateNativeForceRecord"] &= clamp_absolute >= abs(clamp) and \
            near(clamp, force["nativeClampSignedM3PerM"], 1e-24) and \
            near(clamp_absolute, force["nativeClampAbsoluteM3PerM"], 1e-24)
        legacy_step = abs(w["waterM3PerMetre"] - .54) <= 1e-10 and \
            abs(w["airM3PerMetre"] - .54) <= 1e-10 and \
            abs(force["waterDriftAfterNativeClampM3PerM"]) <= 1e-10
        legacy_failed |= not legacy_step
        controls["legacyFailureReportedTruthfully"] &= r["legacyStockEverFailed"] is legacy_failed
        samples.append({"step": step, "seconds": w["velocityTimeSeconds"], "driftM3PerM": drift,
                        "ccM3PerM": cc, "vofResidualM3PerM": residual,
                        "clampM3PerM": clamp, "stageResidualM3PerM": gap0 + gap1 + gap2,
                        "signedClosureM3PerM": closure, "cumulative": cumulative,
                        "spentAbsoluteBudgetM3PerM": spent,
                        "transportToPriorProjectionDtRatio": dt / r["priorProjectionDtSeconds"]
                            if r["priorProjectionDtSeconds"] > 0 else None})
        previous = r
    return {"case": capture["caseName"], "scope": "Captured closed-fixture signed transport closure only; full-wave acceptance stays separate.",
            "controls": controls, "capturedAccountingPassed": all(controls.values()),
            "legacyStockPassed": not legacy_failed,
            "legacyPredecessor": {"run": "u3386.scope", "passed": False},
            "budgetM3PerM": 5.4e-7, "samples": samples,
            "final": samples[-1] if samples else None}
