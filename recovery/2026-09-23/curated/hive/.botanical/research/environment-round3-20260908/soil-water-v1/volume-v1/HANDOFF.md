# Connected soil-volume handoff

Root accepted the source/caller and authorized one bounded packet. That packet passed on its first invocation: `run-u3277.scope`, invocation `36cfb84349734b95aa7fad4f170144f5`, exit0, six groups/3,484 checks. No numerical rerun, source correction, fixture change or tolerance change followed acceptance.

Read [RESULTS.md](RESULTS.md) for physical findings, actual residuals and limits, [RUN.md](RUN.md) for command/terminal provenance, and [run-v1/proof.json](run-v1/proof.json) plus the per-request JSON files for exact evidence. The latter retain successful diagnostics that the earlier column summary did not preserve. No first-failure file exists because the complete physical packet passed; deliberate rejection evidence is in `run-v1/rejections.json`.

The executable owner is `volume.mjs:createVolume`: deeply owned geometry/definitions, one canonical mass per soil/reservoir node, deterministic pressure rebuild, full bounded Newton/LU, one paired Darcy ledger with stable-tree closure, and exact aligned same-owner restart. `faces.mjs` is the shared all-axis hydraulic law; accepted retention is imported directly from unchanged `column-v1/source-v2/soil.mjs`. No per-voxel column runtime, gas PCG misuse or physical reference-water stock was added.

Key pins:

- Proof SHA256: `df8a665a83a5910db4e143b42dad38ceeb435ea8e94ea3a082ecf9ce17dacd65`.
- Source inventory SHA256: `758c4e36c5eee17863293beb48839e0fa9cdafa9f63382f477a0fd05f8b78319`.
- Runtime `volume.mjs`: `c54d5470e512483a76ddee0f1e235ad73464b23d26fc9e1dd3d79bf6a69542fd`.
- Geometry: `d82adab5f53189974ed8ff1b3249f10f244013f6d8e586faab631ac2870e9889`.
- Conservative graph closure: `684203674f11205e2bd352b62b1ee6ec419eb0964491122caebebd500b7d6921`.
- Caller: `112272d423da12234e4f298438f38cba907121a887397154975171ed82252f21`.
- Frozen shared retention: `8664df3a99269437a88d8f33ef26ad2b61d961ca802f31f28d7473b885aff6d1`.

All17 recorded current/reference files were rehashed in their live and frozen locations with zero mismatch. The complete inventory includes every LU/Newton/face/state dependency. The unchanged column reference and its earlier success/failure packets remain preserved.

Review decision requested is acceptance of this bounded physical reference, then a responsibility split of the actual geometry compiler hotspot before broadening. `compileFaces` cognitive46 is real source debt, not a runtime failure; Fallow's remaining estimated/no-coverage findings are disclosed. Large dynamic regions, general nonlinear3D convergence and excavation/free-water/gas integration are not claimed or started. Root retains those decisions and all production custody.
