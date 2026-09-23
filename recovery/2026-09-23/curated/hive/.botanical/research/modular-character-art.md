# Character assembly before the mythical pack

Status: Game CTO direction from Levi, 2026-09-07. Planning and a bounded art proof; not a shipped equipment or character-generator system.

Levi requests elves, dwarves and trolls, and explicitly asks that swappable heads, bodies, clothing and other parts be planned before expanding that cast. Astra personally owns original geometry/poses and final native-scale/motion acceptance. Game-delivery owns tracked source and publication.

## Source trace and missing behavior

`src/art.js:bakeArt` chooses a figure kind/pose/facing/frame and calls `src/art/figures.js:figure`. `figure` applies root motion and calls a named complete builder such as `rowan` or `witchRunner`. `bake` renders its assembled Three scene to a fixed 80×80 canvas, then Pixi displays that texture. `src/study.js:studyArt` calls the same builders for the separate study.

There are useful reusable pieces already: geometry primitives, legs/arms, coats, head/hat builders, returned palm groups, shared work-tool grips, the fixed camera and outline bake. But the current complete builders mix anatomy, clothing, hair, accessories and pose choices. `humanHead` includes its hair; `witchHat` and `copperHair` use body-relative absolute heights. Sleeves and skin are created inside the posing limb functions. Changing a head height cannot reliably carry its hair/hat along, and equipping a different outfit would require editing a whole named character.

The needed change is modular **authored 3D assembly** and appearance data. Reuse Three's ordinary Group transforms; no new scene graph, skeleton engine, generic avatar framework or simulation owner.

## Decision

Separate four concepts:

| Concept | Owns | Does not own |
| --- | --- | --- |
| Body/rig profile | Authored proportions, limb lengths, named attachment frames, supported pose family | Name, controller, job or faction |
| Appearance recipe | References to body, head/face, hair, garments, palettes and cosmetic attachments | Item ownership or combat statistics |
| Equipped/held items | Actual item identities, equipped slots, ready hand or stowed location in the eventual inventory owner | Duplicate cosmetic inventory |
| Pose | Local joint/root transforms for an action and phase, plus authored secondary hair/cloth/tail motion | Decisions to work, flee, attack or rest |

An eventual actor definition references an appearance recipe. Rowan and Sedge can remain curated starter recipes, rather than special anatomy programs. Generated characters choose compatible part references and store those choices; changing a name does not change their body. Identity/name generation remains the selected identity library's responsibility after its real interface is inspected.

The same biped pose vocabulary can fit human, elf and dwarf profiles through authored dimensions and offsets. Do not stretch one finished human sprite into every species. A tall, narrow elf, short broad dwarf, and heavy troll need distinct silhouettes and fitting. Trolls may need a larger frame at the **same pixels per world unit**, rather than shrinking to fit a human canvas. Four-legged animals use their own pose family; they can share attachment/material conventions without becoming distorted bipeds.

## Attachment and fitting rules

Begin with only attachment frames needed by current examples: neck/head, hat/hair, shoulders/forearms/palms, hips/legs/feet, back, and belt. These are local Three groups. Body proportions place them; pose transforms move them; parts attach beneath them.

- Heads attach at the neck. Hair, ears, facial features, beards, hats and horns follow the head frame; long hair may have additional authored motion/fitting.
- Shirts, armor, gloves, trousers and boots fit the authored body profile and its posed limbs. A shared garment recipe may generate geometry from dimensions; a different silhouette may require an authored fit variant.
- Held objects attach at their explicit grip point in the palm, with an orientation appropriate to the activity. The accepted axe/mallet grip fixes are reference outcomes to preserve.
- Packs and belts have attachment frames. Their eventual capacity changes come from actual equipped-item definitions; the visible pack is a projection of that state.
- A hat or helmet specifies what hair/face regions it covers, and a compatible fitting or reduced hair form. Do not solve every overlap with a universal scale multiplier or hide all hair.
- Unsupported combinations return an explicit study/authoring incompatibility. No silent human fallback for an absent dwarf/troll fit.

Body shape, species, culture, controller and faction remain separate facts. Physical occupancy/clearance must be explicitly authored in the game definition; a large hat or hair silhouette does not automatically occupy another Z level. Art variants do not silently change pathfinding dimensions.

## Rendering and performance

Keep the accepted original Three geometry → fixed low-resolution bake → Pixi pipeline. Assemble the complete posed outfit in Three and bake the resulting figure together, preserving depth between hair, armor, limbs, weapons and packs in all facings. This avoids a premature 2D layering system that guesses which arm or lock of hair should be in front.

Do not bake the Cartesian product of all heads × bodies × clothing × palettes. Bake actual recipes needed by the scene/study, reuse identical assembled recipes, and invalidate only the changed recipe when appearance/equipment changes. The first implementation should measure bake duration and texture bytes before selecting a cache/atlas policy.

The current human schedule is four facings × (seven eight-frame poses + one sleep frame) = 228 frames. At 80×80 RGBA8 that is about 5.6 MiB of raw texels per unique complete appearance before CPU copies, graphics overhead or additional study variants. One hundred unique full sets would already be about 557 MiB of raw texels. This is arithmetic from the current caller, not a measured GPU allocation or capacity benchmark. On-demand pose sets, shared recipes, packed atlases, eviction and offline baking are candidates to measure; eagerly duplicating every outfit's full set is unacceptable as the roster grows.

Animation timers and equipment changes may select textures; the frame loop should not continuously allocate new geometry. A future background bake may be useful but is not a prerequisite or selected worker framework here.

## Small first proof

1. Preserve the accepted Rowan/Sedge native-scale image and motion as references.
2. Assemble one biped with two heads/hair choices and two outfits, plus a removable hat and an actual palm-mounted tool prop. Change parts through the study's real controls. Only the part selections change; body/pose/camera keep their authority.
3. Repeat the outfit and tool on one short/broad profile, using fitting information rather than a scaled finished sprite. This supplies the first concrete dwarf-compatible seam before producing the larger mythical pack.
4. Inspect four facings plus idle, walk, kneeling build, chop, carry and sleep: neck seams, tool grip, hair/hat coverage, shoulders, foot anchor, alpha clipping and secondary motion. Check the delivered pixels, not only part metadata.
5. Record startup/swap bake duration, frame count and texture residency for the actual compared recipes. A small study is not a 100-actor performance claim.

This proof is art assembly and fitting. It does not claim playable equipping, stats, inventory slots, species simulation, character generation or a full animation editor. After the seam proves itself, author the elf/dwarf/troll pack using it and fit the existing Devil when useful. The accepted standalone Devil may be published independently; its release should not wait for a whole character-system rewrite.

## Integration and deletion

The first safe source delta should separate one real builder's parts and transforms while preserving the existing `figure(...)` consumer or adapting that immediate caller once. Remove duplicated absolute attachment coordinates and recipe-specific anatomy/gear branches as their new owner becomes real. Do not leave a complete old builder beside a second complete body engine indefinitely.

Keep activity/state-machine work independent. Art receives an action/phase and appearance; it must not inspect a party's jobs, discover a controller, grant permissions or decide whether a character flees. Those facts stay in the deterministic game.

Track this under the existing character study and paper-doll equipment issues (#2 and #7), with this note linked from the current art/architecture direction. No new management board or broader source rewrite is needed.
