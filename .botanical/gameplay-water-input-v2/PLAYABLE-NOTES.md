# Gameplay water input v2 — release-note candidate

Source-only handoff for frozen candidate `210b85d722e4d074eeff34d3653d109882c02655`, compared with live rollback `4a6931c4c6c4454431651c330ff8ec15dd980b1a`. The playable game route is `/`; `/wet-clearing.html` remains the existing standalone local water study rather than a new game mode (`vite.config.js:6-18`, `src/studies/catalog.js:7-11`).

## Candidate playable actions

- Open **Build**, choose **Dig**, and click a visible owned soil cell to designate **shallow soil** excavation. This is shared Build work: the hollow appears when a worker physically completes the job, including when the game was paused at designation time (`src/ui-actions.ts:7-24`, `src/hud.jsx:1064-1123`, `src/main.js:714-726`).
- With no tool armed and **Pan view** off, click the ground in an earned hollow to open **Water in the hollow**. It reports that exact cell's standing water and whole 1 L measures; it does not silently redirect inspection to a nearby wetter cell (`src/ui-actions.ts:62-76`, `src/main.js:728-737`, `src/hud.jsx:1226-1257`, `src/field-inspection.ts:46-66`).
- Reachable field water joins the common pail supply used by existing consumers. A draw needs at least one whole 1 L measure, a supported drawing rim, a clear reachable route, and an available pail. The **Pail** panel shows its finite contents as `Water …/2` (`src/field-water-source.ts:55-118`, `src/field-water.ts:74-205`, `src/hud.jsx:1261-1294`).
- Undrafted home members can use that shared water for hydration; the **Character** panel shows hydration and care status. Self-care pauses while a member is drafted (`src/needs.ts:51-66`, `src/needs.ts:188-258`, `src/hud.jsx:894-969`).
- **Water mugwort** spends 2 water once to begin growth. The Mugwort window reports whether a worker is recovering a shared pail, drawing water, or carrying it (`src/hud.jsx:1580-1659`, `src/herbs.ts:16-27`).
- At **Brew station · Ground**, **Fill kettle** draws from the same shared supply. **Brew herbal ale** still requires the displayed finite malt, mugwort, wood fuel, barm, keg, and 2 water in the kettle; **Serve herbal ale** and **Clear spent grain** remain the completion actions (`src/BrewStationPanel.jsx:15-20`, `src/BrewStationPanel.jsx:29-79`, `src/BrewStationPanel.jsx:106-178`, `src/brewing.ts:405-460`).

## Material and release limits

- Hollow inspection is informational. Fractional water below one whole 1 L measure can be visible but cannot fill a pail, and standing stock may change before a worker arrives (`src/field-inspection.ts:20-43`, `src/field-inspection.ts:69-85`, `src/hud.jsx:1248-1257`).
- Digging currently removes supported shallow soil. Deep climbing, arbitrary deep excavation, and stone mining are outside this release (`src/ui-actions.ts:13-18`, `docs/decisions/architecture-proof-sprint.md:20-29`).
- Served ale does not currently satisfy thirst (`src/BrewStationPanel.jsx:92-97`). Brewing here does not claim room-air, smoke, or heat simulation.
- Saves on this route are browser-local. **Continue saved clearing**, **Download raw local save**, **Download backup**, and **New clearing** are the actual menu surfaces; this candidate does not claim server hosting or migration of older save formats (`src/hud.jsx:1801-1876`, `src/persistence.ts:1-2`).

This text records source-visible behavior only. It does not add browser interaction, hosted-parity, or release-execution evidence.
