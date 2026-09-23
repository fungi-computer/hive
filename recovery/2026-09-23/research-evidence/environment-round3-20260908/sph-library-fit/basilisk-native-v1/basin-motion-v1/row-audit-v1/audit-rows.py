"""Read-only analysis of existing rows; no fluid/oracle subprocess and no changed data."""
from pathlib import Path
import hashlib
import json
import math
import os

ROOT = Path(__file__).resolve().parent
STUDY = ROOT.parent
RAW = STUDY / "result-v1"
native_bytes = (RAW / "native-result.json").read_bytes()
comparison_bytes = (RAW / "comparison.json").read_bytes()
native = json.loads(native_bytes)
comparison = json.loads(comparison_bytes)
fixture = json.loads((STUDY / "FIXTURE.json").read_text())
E0 = fixture["initialPerturbationEnergyJPerM"]
g = fixture["gravityMps2"]
rho_jump = fixture["waterDensityKgM3"] - fixture["airDensityKgM3"]
a = fixture["amplitudeM"]
h = fixture["waterDepthM"]
k = fixture["kPerM"]
by_case = {}
for cap, comparison_case in zip(native["cases"], comparison["cases"]):
    assert cap["caseName"] == comparison_case["caseName"]
    by_case[cap["caseName"]] = {
        "rows": {r["step"]: r for r in cap["rows"] if r.get("kind") == "observation"},
        "samples": {r["step"]: r for r in comparison_case["samples"]},
        "limits": comparison_case["limits"],
    }


def diagnostic(name, step):
    case = by_case[name]
    r, s = case["rows"][step], case["samples"][step]
    delta = case["limits"]["delta"]
    eta = [height - h for height in r["columnHeightsM"]]
    sinc = math.sin(k * delta / 2) / (k * delta / 2)
    weights = [sinc * math.cos(k * (j + .5) * delta) for j in range(len(eta))]
    A = s["amplitudeM"]
    residual = [v - A * weight for v, weight in zip(eta, weights)]
    # This independently assumes a single water-under-height graph. It cannot
    # reconstruct disconnected subcell fluid or replace the actual PLIC moment.
    pe_graph = rho_jump * g * delta * sum(h * v + .5 * v * v for v in eta)
    pe_fundamental = .5 * rho_jump * g * delta * A * A * sum(w * w for w in weights)
    pe_residual = .5 * rho_jump * g * delta * sum(v * v for v in residual)
    pe_cross = rho_jump * g * delta * A * sum(w * v for w, v in zip(weights, residual))
    pe_mass_offset = rho_jump * g * h * delta * sum(eta)
    assert abs(pe_graph - pe_fundamental - pe_residual - pe_cross - pe_mass_offset) <= 1e-12
    K, PE = r["kineticEnergyJPerMetre"], r["potentialAboveFlatJPerMetre"]
    # Recover the exact separately evaluated oracle quantities from the frozen
    # comparison arithmetic, rather than authoring another wave oracle here.
    K_expected = K - E0 * s["kineticErrorOverE0"]
    PE_expected = PE - E0 * s["potentialErrorOverE0"]
    return {"case": name, "step": step,
            "velocityTimeSeconds": r["velocityTimeSeconds"],
            "nominalFractionTimeSeconds": r["nominalFractionTimeSeconds"],
            "dtSeconds": r["dtSeconds"], "previousDtSeconds": r["previousDtSeconds"],
            "vofTransportSeconds": r["vofTransportSeconds"],
            "signedFundamentalOverRequestedA": A / a,
            "expectedFundamentalOverRequestedA": s["expectedAmplitudeM"] / a,
            "signedModeError": s["signedModeError"],
            "profileL2": s["profileL2"], "higherModeResidueL2": s["higherModeResidueL2"],
            "kineticOverE0": K / E0, "kineticExpectedOverE0": K_expected / E0,
            "kineticErrorOverE0": s["kineticErrorOverE0"],
            "plicPotentialOverE0": PE / E0, "potentialExpectedOverE0": PE_expected / E0,
            "columnGraphPotentialOverE0": pe_graph / E0,
            "plicMinusColumnGraphOverE0": (PE - pe_graph) / E0,
            "columnFundamentalPotentialOverE0": pe_fundamental / E0,
            "columnResidualPotentialOverE0": pe_residual / E0,
            "columnCrossPotentialOverE0": pe_cross / E0,
            "columnMassOffsetPotentialOverE0": pe_mass_offset / E0,
            "staggeredEnergyErrorOverE0": s["staggeredEnergyErrorOverE0"],
            "columnBasedStaggeredErrorOverE0": (K + pe_graph - K_expected - PE_expected) / E0,
            "roundoffEnergyBoundOverE0": s["roundoffEnergyBoundOverE0"],
            "cellSpeedMps": r["cellSpeedMps"], "faceSpeedMps": r["faceSpeedMps"],
            "wallSpeedMps": r["wallNormalSpeedMps"],
            "projectionIterations": r["projectionIterations"],
            "projectionResidualRatio": r["projectionResidual"] / r["projectionTarget"] if step else 0,
            "projectionStepWallSeconds": r["projectionSeconds"],
            "nativeMomentErrors": r["invalidMomentCells"]}


first_failures, selected = {}, {}
for metric, threshold in [("profileL2", .08), ("staggeredEnergyErrorOverE0", .12)]:
    samples = list(by_case["coarse"]["samples"].values())
    failing = [r for r in samples if abs(r[metric]) > threshold]
    first_failures[metric] = diagnostic("coarse", failing[0]["step"]) if failing else None
    peak = max(samples, key=lambda r: abs(r[metric]))
    selected["peak_" + metric] = diagnostic("coarse", peak["step"])
selected["coarse_initial"] = diagnostic("coarse", 0)
selected["coarse_final"] = diagnostic("coarse", max(by_case["coarse"]["rows"]))
selected["fine_final_partial"] = diagnostic("fine", max(by_case["fine"]["rows"]))

matched = []
for step in sorted(set(by_case["coarse"]["rows"]) & set(by_case["fine"]["rows"])):
    coarse, fine = diagnostic("coarse", step), diagnostic("fine", step)
    if abs(coarse["nominalFractionTimeSeconds"] - fine["nominalFractionTimeSeconds"]) > 1e-12:
        continue
    matched.append({"coarse": coarse, "fine": fine})
first_energy_step = first_failures["staggeredEnergyErrorOverE0"]["step"]
selected_matches = [r for r in matched if r["coarse"]["step"] in {first_energy_step, 310, 532}]
interval_maxima = {}
for name in ("coarse", "fine"):
    values = [pair[name] for pair in matched]
    interval_maxima[name] = {metric: max(abs(r[metric]) for r in values) for metric in
        ["profileL2", "higherModeResidueL2", "staggeredEnergyErrorOverE0",
         "kineticErrorOverE0", "plicMinusColumnGraphOverE0", "columnBasedStaggeredErrorOverE0"]}
all_diagnostics = {name: [diagnostic(name, step) for step in sorted(case["rows"])]
                   for name, case in by_case.items()}
maximum_graph_difference = {name: max(abs(r["plicMinusColumnGraphOverE0"]) for r in values)
                            for name, values in all_diagnostics.items()}
max_dt = max(r["dtSeconds"] for case in by_case.values() for r in case["rows"].values())
result = {"scope": "Existing-row diagnostics only. Column graph PE is independent labeled approximation, not replacement PLIC or full refinement.",
          "invocationId": os.environ.get("INVOCATION_ID"),
          "nativeSha256": hashlib.sha256(native_bytes).hexdigest(),
          "comparisonSha256": hashlib.sha256(comparison_bytes).hexdigest(),
          "firstThresholdFailures": first_failures, "selectedSamples": selected,
          "matchedTimeComparison": {"matchedSamples": len(matched),
              "lastNominalFractionTimeSeconds": matched[-1]["coarse"]["nominalFractionTimeSeconds"],
              "selectedPairs": selected_matches, "maximaOverExactlyMatchedRecordedTimes": interval_maxima,
              "fullPeriodRefinementQualified": False},
          "maxAbsPlicMinusColumnGraphOverE0": maximum_graph_difference,
          "referenceTimingSensitivity": {"maximumNativeDtSeconds": max_dt,
              "maxHalfStepChangeOfOneQuadraticReferenceEnergyOverE0": fixture["omegaPerSecond"] * max_dt / 2,
              "maxOneStepChangeOverE0": fixture["omegaPerSecond"] * max_dt,
              "meaning": "Derivative bound for oracle sin²/cos² only, not a bound on unrecorded actual high-frequency field time interpolation."}}
(ROOT / "audit.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"invocationId": result["invocationId"],
                  "firstFailureSteps": {k: v["step"] for k, v in first_failures.items()},
                  "matchedTimeMaxima": interval_maxima,
                  "maxAbsPlicMinusColumnGraphOverE0": maximum_graph_difference,
                  "referenceTimingSensitivity": result["referenceTimingSensitivity"]}, indent=2))
