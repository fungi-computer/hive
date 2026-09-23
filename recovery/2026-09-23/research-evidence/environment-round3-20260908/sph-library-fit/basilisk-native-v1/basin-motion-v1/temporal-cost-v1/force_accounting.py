"""Read the actual reduced-force records and their ordinary post-state partners."""
import math


def finite(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def near(a, b, tolerance=1e-12):
    return finite(a) and finite(b) and abs(a - b) <= tolerance


def inspect_force(capture):
    ordinary = [r for r in capture["rows"] if r.get("kind") == "observation"]
    forces = [r for r in capture["rows"] if r.get("kind") == "reduced_force"]
    by_step = {r["step"]: r for r in ordinary}
    controls = {
        "oneForceRecordPerObservation": len(forces) == len(ordinary) and len(forces) > 1,
        "uniqueForceSteps": len({r["step"] for r in forces}) == len(forces),
        "matchingCaseTimeAndPostState": True,
        "nativeForceAndPressureControls": True,
        "preFractionEnvelope": True,
        "postFractionEnvelope": True,
        "signedAbsoluteAndCumulativeCorrection": True,
        "postStockMatchesNativeCleanup": True,
        "onePeriodAndCleanupAccountedBalance": True,
        "physicalPressureFiniteAndCorrectMeaning": True,
    }
    signed = absolute = 0.
    metrics = []
    for index, r in enumerate(forces):
        w = by_step.get(r["step"])
        if w is None:
            controls["matchingCaseTimeAndPostState"] = False
            continue
        controls["matchingCaseTimeAndPostState"] &= r["case"] == capture["caseName"] and \
            r["step"] == index and near(r["velocityTimeSeconds"], w["velocityTimeSeconds"]) and \
            near(r["dtSeconds"], w["dtSeconds"]) and r["preForceCalls"] == index and \
            near(r["observedPostWaterM3PerM"], w["waterM3PerMetre"]) and \
            r["observedPostFractionMin"] == w["fractionMin"] and \
            r["observedPostFractionMax"] == w["fractionMax"]
        controls["nativeForceAndPressureControls"] &= r["forceValid"] is True and r["valid"] is True and \
            r["preFractionNonfinite"] == 0 and r["unsupportedWallCells"] == 0 and \
            r["purePressureCells"] > 0 and r["purePressureCells"] + r["mixedPressureCellsExcluded"] == w["cells"]
        controls["preFractionEnvelope"] &= finite(r["preFractionMin"]) and finite(r["preFractionMax"]) and \
            r["preFractionMin"] >= -1e-12 and r["preFractionMax"] <= 1 + 1e-12
        controls["postFractionEnvelope"] &= finite(w["fractionMin"]) and finite(w["fractionMax"]) and \
            w["fractionMin"] >= 0 and w["fractionMax"] <= 1
        delta, magnitude = r["nativeClampSignedM3PerM"], r["nativeClampAbsoluteM3PerM"]
        if not finite(delta) or not finite(magnitude):
            controls["signedAbsoluteAndCumulativeCorrection"] = False
            continue
        signed += delta
        absolute += magnitude
        controls["signedAbsoluteAndCumulativeCorrection"] &= magnitude >= 0 and abs(delta) <= magnitude and \
            near(r["cumulativeClampSignedM3PerM"], signed, 1e-18) and \
            near(r["cumulativeClampAbsoluteM3PerM"], absolute, 1e-18) and absolute <= 1e-10
        controls["postStockMatchesNativeCleanup"] &= near(w["waterM3PerMetre"], r["predictedPostClampWaterM3PerM"]) and \
            near(r["postMinusPredictedWaterM3PerM"], w["waterM3PerMetre"] - r["predictedPostClampWaterM3PerM"])
        controls["onePeriodAndCleanupAccountedBalance"] &= abs(w["waterM3PerMetre"] - .54) <= 5.4e-7 and \
            abs(w["airM3PerMetre"] - .54) <= 5.4e-7 and \
            finite(r["waterDriftAfterNativeClampM3PerM"]) and abs(r["waterDriftAfterNativeClampM3PerM"]) <= 5.4e-7 and \
            near(r["waterDriftAfterNativeClampM3PerM"], r["waterDriftFromInitialM3PerM"] - signed)
        pressure_keys = ["reducedPressureGaugePa", "purePhysicalPressureMinPa", "purePhysicalPressureMaxPa",
                         "bottomReducedTractionNPerM", "topReducedTractionNPerM", "bottomPhysicalTractionNPerM",
                         "topPhysicalTractionNPerM", "physicalSupportNPerM", "actualWeightNPerM", "momentumYKgMPerSecondPerM"]
        controls["physicalPressureFiniteAndCorrectMeaning"] &= all(finite(r[k]) for k in pressure_keys) and \
            r["pressureVariable"] == "q = physical_p - rho*G.(x-Z)" and \
            r["gravityFormulation"] == "native reduced.h + iforce.h" and near(r["gravityReferenceYM"], .54) and \
            near(r["physicalSupportNPerM"], r["bottomPhysicalTractionNPerM"] - r["topPhysicalTractionNPerM"], 1e-9) and \
            near(r["actualWeightNPerM"], 9.81*(1000*w["waterM3PerMetre"] + 1.2*w["airM3PerMetre"]), 1e-9)
        metrics.append(r)
    def max_abs(key):
        return max((abs(r[key]) for r in metrics if finite(r[key])), default=None)
    return {
        "scope": "Actual native cleanup accounting and reconstructed-pressure records over captured coverage; no added physical support accuracy claim.",
        "case": capture["caseName"], "controls": controls,
        "legacyOriginalAndCleanupAccountedBalance": all(abs(r["waterDriftAfterNativeClampM3PerM"]) <= 1e-10 for r in metrics) and all(abs(w["waterM3PerMetre"] - .54) <= 1e-10 and abs(w["airM3PerMetre"] - .54) <= 1e-10 for w in ordinary),
        "legacyPredecessor": {"run": "u3386.scope", "passed": False},
        "capturedAccountingPassed": all(controls.values()),
        "forceRows": len(forces), "ordinaryRows": len(ordinary),
        "unpairedOrdinarySteps": sorted(set(by_step) - {r["step"] for r in forces}),
        "lastForceStep": forces[-1]["step"] if forces else None,
        "lastForceVelocityTimeSeconds": forces[-1]["velocityTimeSeconds"] if forces else None,
        "cumulativeClampSignedM3PerM": signed, "cumulativeClampAbsoluteM3PerM": absolute,
        "maxClampAbsolutePerStepM3PerM": max_abs("nativeClampAbsoluteM3PerM"),
        "maxPostMinusPredictedWaterM3PerM": max_abs("postMinusPredictedWaterM3PerM"),
        "maxWaterDriftFromInitialM3PerM": max_abs("waterDriftFromInitialM3PerM"),
        "maxWaterDriftAfterNativeClampM3PerM": max_abs("waterDriftAfterNativeClampM3PerM"),
        "firstPressure": metrics[0] if metrics else None,
        "lastPressure": metrics[-1] if metrics else None,
    }
