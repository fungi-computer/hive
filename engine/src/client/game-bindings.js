/** Client-owned acquisition bindings. Semantic command identity and schemas arrive from Whistle. */
export const GAME_BINDINGS = Object.freeze({
  colony: Object.freeze([
    { commandId: "colony:lightHearth", id: "light-brew-station", label: "Light brew station fire", preset: { station: "colony.brew-station" } },
    { commandId: "colony:cancelIgnition", id: "cancel-ignition", label: "Cancel lighting", preset: { station: "colony.brew-station" } },
    { commandId: "colony:resumeWork", id: "resume-work", label: "Resume work", selection: "entities" },
    ...["timber-floor", "timber-wall", "timber-roof", "timber-bed", "timber-shelf"].map(catalog => ({
      commandId: "colony:build", id: catalog, label: `Build ${catalog.replace("timber-", "")}`, target: "world-surface",
      designation: catalog === "timber-wall" ? ["point", "line", "rectangle"] : catalog === "timber-bed" || catalog === "timber-shelf" ? ["point"] : ["point", "rectangle"],
      preset: { catalog, ...(catalog === "timber-floor" || catalog === "timber-roof" || catalog === "timber-bed" || catalog === "timber-shelf" ? { orientation: "north" } : {}) },
    })),
    ...["north", "east", "south", "west"].map(orientation => ({ commandId: "colony:build", id: `stair-${orientation}`, label: `Stair ${orientation}`, target: "world-surface", designation: ["point"], preset: { catalog: "timber-stair", orientation } })),
    { commandId: "colony:dig", id: "dig", label: "Dig area", target: "terrain-area", designation: ["rectangle"] },
    { commandId: "colony:cancelDig", id: "cancel-dig", label: "Cancel dig area", target: "terrain-area", designation: ["rectangle"] },
    { commandId: "colony:deposit", id: "deposit", label: "Deposit carried goods", selection: "entities" },
    { commandId: "colony:designateTrees", id: "designate-trees", label: "Fell selected trees", selection: "entities" },
    { commandId: "colony:cancelTrees", id: "cancel-trees", label: "Cancel tree work", selection: "entities" },
    { commandId: "colony:designateStockpile", id: "designate-stockpile", label: "Designate stockpile", target: "terrain-area", designation: ["rectangle"], preset: { filterProfile: "wood", priority: 50 } },
    { commandId: "colony:deconstruct", id: "deconstruct", label: "Deconstruct", selection: "entities", designation: ["entities"] },
  ]),
  survival: Object.freeze([
    { commandId: "survival:takeFood", id: "take", label: "Take bread", preset: null },
    { commandId: "survival:eatFood", id: "eat", label: "Eat bread", preset: null },
    { commandId: "survival:setMealRule", id: "recovery-10", label: "Meal recovery 10", preset: { recovery: 10 } },
    { commandId: "survival:setMealRule", id: "recovery-25", label: "Meal recovery 25", preset: { recovery: 25 } },
  ]),
  formations: Object.freeze([
    { commandId: "formations:fire", id: "fire-cannon", label: "Fire downrange", preset: { velocity: { x: 8 * Math.cos(0.12), y: 8 * Math.sin(0.12), z: 0 } } },
    ...["north", "east", "south", "west"].map((label, facing) => ({ commandId: "formations:setFacing", id: `facing-${facing}`, label: `Formation ${label}`, preset: { facing } })),
    { commandId: "formations:setRetreatThreshold", id: "retreat-25", label: "Retreat at 25", preset: { retreatBelow: 25 } },
    { commandId: "formations:setRetreatThreshold", id: "retreat-90", label: "Retreat at 90", preset: { retreatBelow: 90 } },
  ]),
  pirates: Object.freeze([
    { commandId: "pirates:loadCargo", id: "load-cargo", label: "Load cargo", preset: { entities: ["pirates.crew.1", "pirates.crew.2"] } },
    ...["north", "east", "south", "west"].map((label, facing) => ({ commandId: "pirates:turnShip", id: `turn-${label}`, label: `Face ${label}`, preset: { facing } })),
  ]),
});
