# Crafted arrows with swept multi-level collision

Status: future combat reference slice; no combat expansion in the current home goal.

Author a small bow-and-arrow path from craftable arrow material through aim and trajectory to an inert target. Use swept collision across multiple Z levels, floors, and holes so fast projectiles cannot tunnel through the first hit or floor edge. Keep projectile outcomes deterministic and separate from camera rotation, which changes view/picking but not saved world geometry; a combat or body engine is not a prerequisite.

First useful proof: craft one arrow, fire at an inert target through a two-floor/holes arrangement, and record trajectory, swept first collision, and saved/replayed outcome. Combat Extended is a reference for physical projectiles, not a code or asset dependency.
