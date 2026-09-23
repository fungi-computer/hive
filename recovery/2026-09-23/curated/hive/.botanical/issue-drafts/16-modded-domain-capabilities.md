# Versioned domain capabilities for modded servers

Status: future architecture question after concrete domain systems exist; it
does not expand the active home or authorize a plugin framework now.

Levi wants pluggable domain systems and eventual modded servers. Elixir Plug's
extendable, composable API is a design reference, not a selected language,
runtime or service. The goal is for a changed arrest policy or added court system
not to rewrite unrelated movement, inventory or simulation code. This is product
intent, not a promise that arbitrary mods never require a core change.

Keep one deterministic physical simulation. Player and AI inputs use the same
validated command authority. Data-driven definitions suit recipes and simple
rules; richer behavior requires small consistent typed feature interfaces,
explicit accepted/short-circuit results, lifecycle and save/version compatibility,
resource bounds, and authority declarations. Feature modules retain their state
and transition ownership. An arrest request might compose territory/warrant rules
and later court policy before the existing authorized escort activity. Do not
create a universal per-tick middleware bus or grant arbitrary mutation of world
internals.

First useful proof, after two real extension consumers exist: change one legal
policy and add one court-like behavior through a narrow versioned capability;
replay the same physical commands to the same outcome, reject an unauthorized
mutation, save/reload extension state, and disable/remove the extension with an
explicit compatible result. Measure event/command overhead outside the fixed-step
hot path. No general plugin framework, middleware bus, mod loader, external
runtime/service, backend deploy, arbitrary code sandbox or package marketplace is
authorized by this issue.
