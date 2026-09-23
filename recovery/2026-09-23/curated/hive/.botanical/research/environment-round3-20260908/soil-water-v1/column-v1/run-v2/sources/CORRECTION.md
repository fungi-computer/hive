# Wet boundary head ownership — source v2

The original source and run-v1 remain unchanged. No physical fixture, coefficient, tolerance, step budget, mass update or saved field changes here.

After the existing conservation elimination, derive **both** positive-stock boundary heads from their actual final mass divided by rho*area. Leave every dry boundary pressure trace untouched. The same complete constitutive/Darcy/paired-transfer/complementarity checks then use those derived heads. Report each wet boundary's old/new head and delta as accepted-step diagnostics; attach actual candidate boundary mass/depth/head/gap and those normalization deltas to a post-closure error. Qualifier changes only persist these new error diagnostics.

The original failing candidate head was not captured. The multiplication/division roundtrip diagnosis therefore remains inferred from source and the failed strict comparison; v2 is not evidence that the original physical balance was necessarily correct. This candidate must pass the unchanged fixture packet before a result is claimed.
