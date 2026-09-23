# Dwarven compost-air heat recovery

Reviewed Game CTO future addendum, 2026-09-07. Levi specifically wants suction/blower systems drawing air through compost beds and supplying a greenhouse, as knowledge dwarves have developed. This extends the already-transferred ecology/homestead direction; it does not alter those reviewed bytes or current upstairs/brewing scope.

## Verified reference

The term **negative aeration** describes drawing air through a compost pile; heat recovery can use the resulting warm, moist exhaust. The SARE project [Compost Exhaust to Provide Nutrients for Plants in Biofilter and Heat for Greenhouse, ONE22-427](https://projects.sare.org/project-reports/one22-427/) documents an installed arrangement with under-pile perforated collection pipes, a manifold, heat exchanger, blower, condensate traps, and a biofilter beneath an adjacent greenhouse. The remaining exhaust passes through the growing-bed medium. This is a project report, not a universal guarantee of heating adequacy or filter performance.

Bruce Fulford's [1986 New Alchemy Institute report](https://newalchemists.net/wp-content/uploads/2015/01/nai-res-rpt-3-compost-gh-edit-pictures1.pdf), covering March 1984–January 1986, also documents compost exhaust delivered by blowers through growing beds that filter ammonia. It describes control by daylight/temperature, and filter performance depending on moisture, porosity, airflow, and loading. This grounds the combined heat/air/biological-filter concept. We have inspected the written report's system and filter sections; no claim of reviewing every numerical result or treating its figures as current engineering specifications.

This does not contradict the earlier coop note: unconditioned shared air and a deliberately designed compost biofilter are different configurations. The game may model both, with their actual consequences.

## Proposed game composition

One useful direct process-air path is:

```text
ambient intake → active compost → collection duct/blower
              → biofilter growing bed → greenhouse → vent/outlet
```

An optional heat exchanger and condensate collector can sit before the biofilter. A separate isolated heat-recovery arrangement transfers energy to another air or water circuit while exhausting compost process air elsewhere. Those two circuits never silently exchange gases, water, or nutrients.

- **Compost process:** consumes finite feedstock and responds to moisture, oxygen, and temperature. Its declared heat/gas/water outputs enter shared environmental ownership. Aeration can improve oxygen supply while also removing heat and moisture; more flow is not automatically better.
- **Blower:** adds a powered pressure/flow contribution through connected physical ports. Draw/flow is bounded by supply, resistance, and the chosen simple model. When power stops, its forced contribution stops; whatever passive flow the shared air model supports remains. No free air creation or separate ventilation clock.
- **Dwarven mechanism:** waterwheel- or other mechanically driven fans/bellows, maintainable ducts, dampers, condensate collectors, filter media, and later temperature-driven controls are original game proposals. Their exact art and technology order wait for a real powered-air consumer. Knowledge is learnable/tradable rather than an inherent dwarf-only physics exception.
- **Biofilter:** a real substrate/process with finite loading and operating conditions. It transfers or transforms selected modeled compounds, retains resulting material, and may need maintenance. It is not a universal clean-air flag. Plant uptake, filter storage, and outgoing exhaust cannot each claim the same nutrient quantity.
- **Greenhouse:** receives only the heat, air, vapor, and other modeled contents actually transferred. Openings, insulation, sunlight, and crop demand continue to matter. Root-zone warmth and room-air warmth remain distinct where the crop caller needs them.
- **Heat recovery:** energy removed from process air/pile is credited once to the receiving circuit. If condensation is modeled, its collected water and released latent heat share one transfer outcome; steam particles create neither heat nor water.

Ordinary jobs supply feedstock, maintain the filter, repair ducts, and change settings. Shared power, environmental flow, resources, and crop owners execute the consequences. Definitions select supported machines and parameters; this does not introduce a special greenhouse task engine, arbitrary config scripting, or a new global lifecycle machine.

## Small later validation

After passive compost/hotbed and a powered-air consumer exist, compare one covered crop bed with the blower off, modest flow, and excessive extraction under the same forcing. Verify heat and material budgets, root/air conditions, filter load, condensate if modeled, power loss, and save/resume. Repeat with an isolated heat exchanger and confirm process gases cannot cross its sealed boundary. Use the shared utility overlay for actual paths/flow and inspectable limiting conditions.

Associate with existing #10 water, #14 horticulture, #17 knowledge/technology, and ONI heat/air direction. The passive hotbed remains useful. This is a future capability added to the accepted homestead/lifecycle plan; no current source, dependencies, art, proof pin, or release is changed.
