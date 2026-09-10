import "./client.css";
import { createHiveClient } from "./client.js";

const mode = document.body.dataset.mode || "hub";
const configs = {
  colony: { title: "Colony", subtitle: "Select workers and admit a shared delivery order.", source: "https://github.com/fungi-computer/hive/tree/main/engine/src/client" },
  survival: { title: "Survival", subtitle: "One survivor, one body, and direct actions through the same client.", source: "https://github.com/fungi-computer/hive/tree/main/engine/src/client" },
  formations: { title: "Formations", subtitle: "Select a group, set a destination, and practice a morale rule.", source: "https://github.com/fungi-computer/hive/tree/main/engine/src/client" },
};
const root = document.querySelector("#hive-app");
if (mode === "hub") {
  root.innerHTML = `<div class="hive-hub"><div class="hive-kicker">HIVE / FRESH ENGINE</div><h1>Three small worlds, one client</h1><p>These playable shells share camera, picking, controls, HUD, and the original Goblin static art bank. The simulation runtime will connect at the same boundary when its contract lands.</p><div class="hive-links"><a href="./colony.html"><strong>Colony</strong><span>Shared workers and finite food</span></a><a href="./survival.html"><strong>Survival</strong><span>Direct body actions and condition</span></a><a href="./formations.html"><strong>Formations</strong><span>Group orders and morale</span></a></div><a href="../index.html">Open the old Goblin game ↗</a></div>`;
} else {
  const config = configs[mode] || configs.colony;
  root.className = "hive-shell";
  createHiveClient({ root, mode, ...config });
}

