# Measure colony scale to 50–100 people

Status: future performance foundation; five people is the first roster target, not an engine cap.

Measure and then bound active simulation, assignment, pathfinding, rendering, and memory toward roughly 50–100 people. Separate input/render responsiveness, assignment/path/state work, and offline scheduling in the measurements so one green number cannot hide another bottleneck. Preserve libcolony as the selected assignment owner and feed it explicit eligible actor/job pairs with unique edges. Use event-triggered eligible-assignment batches, route/topology caches, and fairness rules only where source behavior and profiling justify them; do not create a generic scheduler or claim scale from isolated local API success or a two-person law test.

First useful proof: a reproducible measured fixture reports input latency and render frame time separately from event-triggered assignment batches, path/state work, route/topology cache bounds, fairness, tick/memory budgets, and equal-tick replay as population rises. A later offline fixture measures bounded catch-up independently. Hosted capacity remains separately unproved.
