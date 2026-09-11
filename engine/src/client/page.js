import "./client.css";
import { PIRATE_VISUAL_BINDINGS, CANNON_VISUAL_BINDINGS } from "./visual-bindings.js";
import "@fungi.computer/caps/styles.css";
import "@fungi.computer/stipe/fonts.css";
import { createHiveClient } from "./client.js";
import { createConnectionChoice } from "./connection-choice.js";
import { connectBrowserRuntime } from "../runtime/browser-client.js";
import { connectRemoteRuntime } from "../runtime/remote-client.ts";

const mode = document.body.dataset.mode || "hub";
const configs = {
  pirates: {
    title: "Timber raft",
    environment: "water",
    visualBindings: PIRATE_VISUAL_BINDINGS,
    subtitle: "Sail the raft, walk its deck, and carry finite supplies into the hold. Save and continue your voyage.",
    selectionShortcuts: [{ id: "pirates.ship", label: "Select raft" }],
    controlHelp: "Sail: choose Select raft, then right-click water. Walk: click a crew member, then right-click the deck.",
    orderCommand: "move",
    source: "./source/pirates.ts",
  },
  colony: {
    title: "Colony",
    subtitle:
      "Choose a one- or two-piece food delivery. Pause the worker mid-trip, inspect the carried food, then resume.",
    source: "./source/colony.ts",
  },
  survival: {
    directControlId: "survival.survivor.1",
    controlHelp: "Hold WASD or arrows to move freely. E takes bread; F eats. Compare Prediction on/off.",
    title: "Survival",
    subtitle:
      "Take and eat finite bread, watch hunger, and change how much a meal restores.",
    source: "./source/survival.ts",
  },
  formations: {
    visualBindings: CANNON_VISUAL_BINDINGS,
    title: "Formations",
    orderCommand: "march",
    subtitle:
      "Fire the six-round cannon, watch health and morale change, or drag-select soldiers and right-click to move them out of its path.",
    source: "./source/formations.ts",
  },
};
const root = document.querySelector("#hive-app");
const queryMode = new URLSearchParams(location.search).get("game");
function mount(mode, config) {
  try {
    const connection = createConnectionChoice({
      mode,
      publicHost: import.meta.env.VITE_HIVE_PUBLIC_HOST,
      connectLocal: connectBrowserRuntime,
      connectRemote: connectRemoteRuntime,
    });
    createHiveClient({ root, mode, runtime: connection.runtime, persistence: connection.persistence, ...config });
  } catch (error) {
    root.innerHTML = `<div class="hive-hub"><div class="hive-kicker">HIVE / CONNECTION</div><h1>World unavailable</h1><p>${error.message}</p><p>Use <code>?runtime=local</code> for a browser-local demo.</p></div>`;
  }
}
if (mode === "hub" && configs[queryMode]) {
  root.className = "hive-shell";
  mount(queryMode, configs[queryMode]);
} else if (mode === "hub") {
  root.innerHTML = `<div class="hive-hub"><div class="hive-kicker">HIVE / FRESH ENGINE</div><h1>Four small worlds, one client</h1><p>Choose a world. Each tab keeps its own runtime identity while sharing the same camera, controls, HUD, and original Goblin static art bank.</p><div class="hive-links"><a href="./?game=colony"><strong>Colony</strong><span>Shared workers and finite food</span></a><a href="./?game=survival"><strong>Survival</strong><span>Direct body actions and condition</span></a><a href="./?game=formations"><strong>Formations</strong><span>Group orders and morale</span></a><a href="./?game=pirates"><strong>Timber raft</strong><span>Moving decks and shared cargo</span></a></div><a href="../index.html">Open the old Goblin game ↗</a></div>`;
} else {
  const config = configs[mode] || configs.colony;
  root.className = "hive-shell";
  mount(mode, config);
}
