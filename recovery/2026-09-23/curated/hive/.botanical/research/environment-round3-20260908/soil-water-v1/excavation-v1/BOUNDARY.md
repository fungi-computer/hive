# The existing finite reservoir does not yet represent an ordinary pit

Historical source-conflict review against accepted `../volume-v1`. Root subsequently selected `../pit-face-v1/DECISION.md`; the current implementation candidate is `volume-with-pit-v1` and its current admission is in `CONTRACT.md`. This document preserves why a typed extension was required; its initial pending-state paragraph below is not the current queue.

## Exact conflict

- `geometry.mjs:92–106` places a reservoir's zero-depth datum at its first port's face-centre elevation and requires every other port to share it. Capacity is derived from the soil's maximum pressure-head envelope, not an excavated rim.
- `geometry.mjs:127–132` uses the soil half-cell boundary resistance split into two quarter-cell trace distances. This is the existing planar boundary approximation, not a spatially resolved water body.
- `faces.mjs:9–16` evaluates one reservoir head and its retention/conductivity per adjacent soil definition; `faces.mjs:23–25` uses one reservoir elevation for every face. There is no individual dry seepage trace or partial-height wetted area.
- `residual.mjs:19–29` permits reservoir stock rho*A*max(h,0), but explicitly rejects nonpositive heads at multiple ports. `state.mjs:15,47` enforces the same dry limitation. This deliberately avoids an empty negative-pressure tank transmitting between soils without owning water.

For a 1×.54×1 m pit, the floor's area is1 m² and elevation is its bottom. Each vertical side has area.54 m² and a centre .27 m above that bottom. A depth below .27 m cannot be represented by applying one positive boundary head at each side's centre; even centre-only clamping would lose the physically wet lower part of a side. Calling the sides closed would change an ordinary unlined hole into a different construction.

## Smallest extension for root's physical decision

Extend the existing reservoir/face owner, in a separately pinned candidate: one explicit basin bottom, rim and level-storage law, one canonical finite mass, and per-contact elevation/orientation/aperture. Free-surface elevation derives from that mass and geometry, not an independent saved pressure.

The admitted side-face approximation must explicitly resolve or integrate its submerged height; a bounded fixed subface rule is one possible reference. A submerged portion can use the existing paired Darcy transfer with hydrostatic boundary head at its own elevation. An exposed unsaturated portion has no liquid donor. It needs a seepage-face condition (outward soil flow only, zero-pressure outflow when active, otherwise an unsaturated no-flow trace), rather than a negative global tank head. Empty-pit handling must not permit simultaneous suction pass-through via dry ports. Root must choose the wet/dry active-set and finite-stock coupling; we are not installing those equations in this adapter.

Every accepted face still contributes one paired soil↔pit transfer, the finite pit cannot exceed its rim capacity, and all post-closure constitutive, seepage, stock and balance laws must be checked by the same solver. Overflow remains an explicit next physical outlet or a rejected step until supported. All heads/active sets remain derived on restart. An open vent is a declared atmosphere boundary; this does not prove finite gas displacement, dissolved gases, oxygen, erosion or a general free-water momentum solver.

Until that decision/source is accepted, excavation geometry and conservation can be inspected and saved, but time advancement is rejected. This is a useful transaction checkpoint and an honest physical boundary, not a completed flooding outcome.
