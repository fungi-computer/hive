# Soil column handoff

The accepted physical candidate is **source-v2/**, frozen again under **run-v2/sources/**. Original root-level v1 source and failed **run-v1/** remain unchanged. No production, shared world, surface-water or gas module was edited.

Successful physical scope: u3196 / `58f1a8f55b504f58b74392ba7294d1eb`, exit0,6 groups/5287 assertions,1.05757418s measured runner wall,.950845s CPU. Exact results, verified laws, unmet/future scope, pre-run fixture recut and retained diagnostic limitations are in **run-v2/RESULTS.md**. Syntax u3195 / `7b5b4cf1f0af4d84a2eb154595a4fd71` exited0. Both terminal calls completed; no proof process remains from these commands.

One derived wet-boundary fact was corrected: both wet pressure traces come from final canonical M/(rho*A) before the unchanged physical recheck. Dry traces, stocks, source coefficients, fixture/tolerance/work limits and saved state did not change. The failed v1 head was not captured, and successful v2 per-step head normalizations/face maxima were not persisted; the original floating-roundtrip cause stays inferred. The unchanged packet's pass and the residual bounds are the actual evidence, with no extra diagnostic rerun.

Source hash comparison found **zero mismatches** between each version's live source and its own frozen inventory, and zero mismatches in either frozen source directory. Main candidate hashes:

| File | SHA256 |
| --- | --- |
| source-v2/soil.mjs | 8664df3a99269437a88d8f33ef26ad2b61d961ca802f31f28d7473b885aff6d1 |
| source-v2/geometry.mjs | 6d2f7d1aeca5bfce0b98a6b27a6a6c4f88d5882512c1e278ec679eb41e498ceb |
| source-v2/linear.mjs | 7d1a2895db6e689c6ce5beff05116b3554fefed4f033bce0218e030f03572f10 |
| source-v2/solve.mjs | 35e0b7cfcc657fec9ad491fafa2835d67a003d1ddcde35858565c0d30927694c |
| source-v2/column.mjs | 6471b9066a9a22a8358d74606ac8616d82274777801519a95f8de8be1513fb47 |
| source-v2/explicit-reference.mjs | e4d7427391b944b0c8b30d23edac7b824951b63a0bafe4602b0b346c7335c362 |
| source-v2/qualify.mjs | 843a88a973b22496db44aa6f73a0716e2a4e0f10ff5b718a5d5ea6f5b1ce7bd2 |
| run-v2/proof.json | 1992aa77a4ca16513e58601b509e66de8a6435ebe942e5bc58a4d04e5f277354 |
| run-v2/source-inventory.json | dbd1b414f48a8c3cfe11a985dc324dc06555e864522c0055f9b8752ae70b742f |
| run-v2/nonlinear-reference.json | 986675bdc6b0198538c4343906b748d4d7d450a498a5084dc43ab8b23bc5b42c |
| run-v1/failure.json | 5093eaa997fda58920904988147f790d2f111d66a7971ced27ea61cf963ebf4c |

The independent forward-time reference shares only constitutive and spatial face rules with the BE reference; its own mass stepping/depletion handling and .025/.0125 profile refinement were actually checked. It remains strictly unsaturated and is not a replacement saturated solver. The lower donor's final ~7e-15kg transfer is roundoff-scale, not a physical reversal.

Retained Fallow shows0 dead-code/cycle findings and0 clones after declaring the actual qualifier entry, but18 health advisories remain, with real cognitive hotspots in guessHeads32, independent explicit reference29 and Jacobian fixture24; CRAP is statically estimated, not imported coverage. No suppression/deletion or broad scan was used after the physical correction. These are candidates for a later behavior-preserving responsibility split, not an excuse to change the physics fixture during this handoff.

Root owns the next shared physical decision. Fixed1D homogeneous vented/isothermal Richards is now qualified within the contract; layers, excavation, finite free water,3D connectivity, closed pore gas and heat remain unjoined. Do not port or begin excavation from this note. In particular a dug voxel must conserve its displaced pore water through the future shared water owner; this column never creates groundwater from a material label.
