//! Bounded content-to-native admission for a terrain/water scene.
//!
//! This boundary validates authored data, samples immutable generated facts,
//! and prepares finite initial stocks. It does not own save/reload or advance.

use crate::generation::{Bounds, Cell, MaterialSlots, WorldSpec};
use crate::terrain::TerrainOwner;
use crate::terrain_water::{MaterialWater, TerrainWater, TerrainWaterGeometry};
use crate::water::{SoilRule, WaterLimits, WaterStock};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

const MAX_JSON_BYTES: usize = 128 * 1024;
const MAX_MATERIALS: usize = 64;
const MAX_CELLS: usize = 2048;
const MAX_INITIAL_PLACEMENTS: usize = 128;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DefinitionInput {
    world: WorldInput,
    materials: Vec<MaterialInput>,
    water: WaterInput,
    #[serde(default)]
    initial_placements: Vec<InitialPlacementInput>,
}
#[derive(Debug, Clone)]
pub struct InitialSurfacePlacement {
    pub entity: String,
    pub column: [i64; 2],
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct InitialPlacementInput {
    entity: String,
    column: [i64; 2],
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WorldInput {
    seed: String,
    identity: String,
    bounds: BoundsInput,
    slots: SlotsInput,
    sea_level: i32,
    vertical_metres: f64,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BoundsInput {
    min_x: i64,
    max_x: i64,
    min_y: i32,
    max_y: i32,
    min_z: i64,
    max_z: i64,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SlotsInput {
    air: u16,
    soil: u16,
    stone: u16,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct MaterialInput {
    slot: u16,
    solid: bool,
    diggable: bool,
    water: WaterKindInput,
    excavation: Option<ExcavationRule>,
}
/// Authored conversion for one physical voxel, not caller-selected output.
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ExcavationRule {
    pub work_seconds: f64,
    pub output_kind: String,
    pub units_per_cell: u32,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    content = "rule",
    rename_all = "lowercase",
    deny_unknown_fields
)]
enum WaterKindInput {
    Closed,
    Open,
    Porous(SoilRule),
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WaterInput {
    id: String,
    cells: Vec<[i32; 3]>,
    fall_m_per_s: f64,
    spread_m_per_s: f64,
}

pub struct PreparedDefinition {
    pub terrain: TerrainOwner,
    pub geometry: TerrainWaterGeometry,
    pub stocks: Vec<WaterStock>,
    pub excavation_rules: BTreeMap<u16, ExcavationRule>,
    pub initial_placements: Vec<InitialSurfacePlacement>,
}

pub struct BuiltEnvironment {
    pub world: TerrainWater,
    pub excavation_rules: BTreeMap<u16, ExcavationRule>,
    pub initial_placements: Vec<InitialSurfacePlacement>,
}
pub fn build_from_json(input: &str) -> Result<BuiltEnvironment, String> {
    let prepared = prepare_definition_mode(input, true)?;
    let world = TerrainWater::fresh(prepared.geometry, prepared.terrain, &prepared.stocks)?;
    Ok(BuiltEnvironment { world, excavation_rules: prepared.excavation_rules, initial_placements: prepared.initial_placements })
}

pub fn prepare_definition(input: &str) -> Result<PreparedDefinition, String> {
    prepare_definition_mode(input, false)
}

fn prepare_definition_mode(
    input: &str,
    admit_initial_stocks: bool,
) -> Result<PreparedDefinition, String> {
    if input.len() > MAX_JSON_BYTES {
        return Err("environment definition exceeds 128KiB".into());
    }
    let definition: DefinitionInput = serde_json::from_str(input)
        .map_err(|error| format!("invalid environment definition: {error}"))?;
    if definition.world.seed.is_empty() || definition.world.identity.is_empty() {
        return Err("world seed and identity are required".into());
    }
    if definition.initial_placements.len() > MAX_INITIAL_PLACEMENTS {
        return Err("initial placement count exceeds 128".into());
    }
    let mut placement_entities = BTreeSet::new();
    let mut placement_columns = BTreeSet::new();
    let initial_placements = definition.initial_placements.into_iter().map(|placement| {
        if !crate::components::valid_id(&placement.entity) || !placement_entities.insert(placement.entity.clone())
            || !placement_columns.insert(placement.column)
        {
            return Err("initial placements contain duplicate or invalid target".into());
        }
        Ok(InitialSurfacePlacement { entity: placement.entity, column: placement.column })
    }).collect::<Result<Vec<_>, String>>()?;
    let bounds = Bounds {
        min_x: definition.world.bounds.min_x,
        max_x: definition.world.bounds.max_x,
        min_y: definition.world.bounds.min_y,
        max_y: definition.world.bounds.max_y,
        min_z: definition.world.bounds.min_z,
        max_z: definition.world.bounds.max_z,
    };
    if initial_placements.iter().any(|placement| placement.column[0] < bounds.min_x || placement.column[0] >= bounds.max_x || placement.column[1] < bounds.min_z || placement.column[1] >= bounds.max_z) {
        return Err("initial placement column is outside world bounds".into());
    }
    let slots = MaterialSlots {
        air: definition.world.slots.air,
        soil: definition.world.slots.soil,
        stone: definition.world.slots.stone,
    };
    let spec = WorldSpec {
        seed: &definition.world.seed,
        identity: &definition.world.identity,
        bounds,
        slots,
        sea_level: definition.world.sea_level,
        vertical_metres: definition.world.vertical_metres,
        max_samples: 4096,
    };
    let generator = spec.compile().map_err(str::to_owned)?;
    if definition.materials.is_empty() || definition.materials.len() > MAX_MATERIALS {
        return Err("material definition count exceeds 64".into());
    }
    let mut properties = Vec::with_capacity(definition.materials.len());
    let mut behavior = BTreeMap::new();
    let mut excavation_rules = BTreeMap::new();
    for material in definition.materials {
        if behavior.contains_key(&material.slot) {
            return Err("duplicate material slot".into());
        }
        if let Some(rule) = material.excavation {
            if !material.solid || !material.diggable || !rule.work_seconds.is_finite()
                || rule.work_seconds <= 0.0 || !crate::components::valid_id(&rule.output_kind)
                || rule.units_per_cell == 0 {
                return Err("invalid material excavation rule".into());
            }
            excavation_rules.insert(material.slot, rule);
        }
        let water = match material.water {
            WaterKindInput::Closed => MaterialWater::Closed,
            WaterKindInput::Open => MaterialWater::Open,
            WaterKindInput::Porous(rule) => MaterialWater::Porous(rule),
        };
        properties.push(crate::terrain::MaterialProperty {
            slot: material.slot,
            solid: material.solid,
            diggable: material.diggable,
        });
        behavior.insert(material.slot, water);
    }
    let water = definition.water;
    if water.cells.is_empty() || water.cells.len() > MAX_CELLS {
        return Err("water cell count must be between 1 and 2048".into());
    }
    let mut unique = BTreeSet::new();
    for at in &water.cells {
        if !unique.insert(*at) {
            return Err("duplicate water cell".into());
        }
    }
    let mut stocks = Vec::with_capacity(water.cells.len());
    let vertical = definition.world.vertical_metres;
    let limits = WaterLimits::default();
    for at in &water.cells {
        if !admit_initial_stocks { break; }
        let cell = Cell {
            x: i64::from(at[0]),
            y: at[1],
            z: i64::from(at[2]),
        };
        let generated = generator.sample(cell).map_err(str::to_owned)?;
        let material = behavior.get(&generated.material).ok_or_else(|| {
            format!(
                "water cell uses undefined material slot {}",
                generated.material
            )
        })?;
        let mass = match material {
            MaterialWater::Closed => 0.0,
            MaterialWater::Open => {
                let head = if admit_initial_stocks {
                    Some(
                        generator
                            .groundwater(cell.x, cell.z)
                            .map_err(str::to_owned)?
                            .head_level,
                    )
                } else {
                    None
                };
                if head.is_some_and(|head| {
                    (generated.bed_level <= generated.cell.y
                        && generated.cell.y < definition.world.sea_level)
                        || (generated.cave_void && generated.cell.y < head)
                }) {
                    1_000.0 * vertical
                } else {
                    0.0
                }
            }
            MaterialWater::Porous(rule) => {
                let proposal = if admit_initial_stocks {
                    Some(
                        generator
                            .groundwater(cell.x, cell.z)
                            .map_err(str::to_owned)?,
                    )
                } else {
                    None
                };
                match proposal {
                    Some(proposal) if generated.cell.y < proposal.head_level => {
                        1_000.0 * vertical * rule.porosity * proposal.pore_fill
                    }
                    _ => 0.0,
                }
            }
        };
        if !matches!(material, MaterialWater::Closed) {
            stocks.push(WaterStock {
                id: format!("cell:{},{},{}", at[0], at[1], at[2]),
                mass_kg: mass,
            });
        }
    }
    stocks.sort_by(|left, right| left.id.cmp(&right.id));
    let terrain =
        TerrainOwner::new(generator, properties, 32, 65_536, 256 * 1024).map_err(str::to_owned)?;
    let geometry = TerrainWaterGeometry::new(
        water.id,
        water
            .cells
            .iter()
            .map(|at| Cell {
                x: i64::from(at[0]),
                y: at[1],
                z: i64::from(at[2]),
            })
            .collect(),
        behavior,
        [1.0, vertical, 1.0],
        water.fall_m_per_s,
        water.spread_m_per_s,
        limits,
    )?;
    Ok(PreparedDefinition {
        terrain,
        geometry,
        stocks,
        excavation_rules,
        initial_placements,
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    pub(crate) fn fixture(seed: &str) -> String {
        format!(
            r#"{{"world":{{"seed":"{seed}","identity":"demo","bounds":{{"minX":-8,"maxX":8,"minY":-8,"maxY":40,"minZ":-8,"maxZ":8}},"slots":{{"air":0,"soil":1,"stone":2}},"seaLevel":12,"verticalMetres":0.54}},"materials":[{{"slot":0,"solid":false,"diggable":false,"water":{{"kind":"open"}}}},{{"slot":1,"solid":true,"diggable":true,"water":{{"kind":"porous","rule":{{"id":"soil","porosity":0.4,"retention":0.1,"absorbMPerS":0.1,"seepMPerS":0.1}}}}}},{{"slot":2,"solid":true,"diggable":true,"water":{{"kind":"porous","rule":{{"id":"stone","porosity":0.05,"retention":0.01,"absorbMPerS":0.01,"seepMPerS":0.01}}}}}}],"water":{{"id":"w","cells":[[0,-7,0],[0,-6,0],[0,39,0]],"fallMPerS":0.1,"spreadMPerS":0.1}}}}"#
        )
    }
    #[test]
    fn excavation_rules_are_validated_and_rebuilt_from_definition() {
        use serde_json::json;
        let mut input: serde_json::Value = serde_json::from_str(&fixture("rules")).unwrap();
        let rule = json!({"workSeconds":2.5,"outputKind":"soil-spoil","unitsPerCell":4});
        input["materials"][1]["excavation"] = rule.clone();
        let built = build_from_json(&input.to_string()).unwrap();
        assert_eq!(built.excavation_rules[&1].output_kind, "soil-spoil");
        assert_eq!(built.excavation_rules[&1].units_per_cell, 4);
        assert_eq!(built.excavation_rules[&1].work_seconds, 2.5);
        let restored_definition = prepare_definition(&input.to_string()).unwrap();
        assert_eq!(restored_definition.excavation_rules[&1].units_per_cell, 4);
        for invalid in [json!({"workSeconds":0,"outputKind":"soil-spoil","unitsPerCell":4}),
            json!({"workSeconds":-1,"outputKind":"soil-spoil","unitsPerCell":4}),
            json!({"workSeconds":2,"outputKind":"bad kind","unitsPerCell":4}),
            json!({"workSeconds":2,"outputKind":"soil-spoil","unitsPerCell":0})] {
            input["materials"][1]["excavation"] = invalid;
            assert!(prepare_definition(&input.to_string()).is_err());
        }
        input["materials"][1]["excavation"] = rule.clone();
        input["materials"][0]["excavation"] = rule;
        assert!(prepare_definition(&input.to_string()).is_err());
    }

    #[test]
    fn rejects_oversized_or_duplicate_content() {
        assert!(build_from_json(&"x".repeat(MAX_JSON_BYTES + 1)).is_err());
        let duplicate = r#"{"world":{"seed":"s","identity":"i","bounds":{"minX":-8,"maxX":8,"minY":-8,"maxY":40,"minZ":-8,"maxZ":8},"slots":{"air":0,"soil":1,"stone":2},"seaLevel":2,"verticalMetres":0.54},"materials":[{"slot":0,"solid":false,"diggable":false,"water":{"kind":"closed"}},{"slot":0,"solid":false,"diggable":false,"water":{"kind":"closed"}}],"water":{"id":"w","cells":[[0,0,0]],"fallMPerS":0.1,"spreadMPerS":0.1}}"#;
        let error = match build_from_json(duplicate) {
            Ok(_) => panic!("duplicate material accepted"),
            Err(error) => error,
        };
        assert!(error.contains("duplicate material slot"));
    }
    #[test]
    fn fresh_proposes_finite_stocks_once_and_restore_shape_is_dry() {
        let input = fixture("seed-a");
        let prepared = prepare_definition(&input).unwrap();
        assert!(prepared.stocks.is_empty());
        let admitted = prepare_definition_mode(&input, true).unwrap();
        assert!(!admitted.stocks.is_empty() && admitted.stocks.len() <= 3);
        assert!(
            admitted
                .stocks
                .iter()
                .all(|stock| stock.mass_kg.is_finite() && stock.mass_kg >= 0.0)
        );
        let built = build_from_json(&input).unwrap().world;
        assert!(built.facts().unwrap().total_kg.is_finite());
        let other = prepare_definition_mode(&fixture("seed-b"), true).unwrap();
        assert!(admitted.stocks.iter().any(|stock| stock.mass_kg > 0.0));
        assert!(admitted.stocks.iter().any(|stock| stock.mass_kg == 0.0));
        assert_ne!(admitted.terrain.export().unwrap(), other.terrain.export().unwrap());
    }
    #[test]
    fn kernel_clock_and_record_restore_advance_one_authored_environment() {
        let mut kernel = crate::Kernel::new();
        kernel.load(r#"{"format":"hive-game","version":1,"game":"colony","components":[],"initial":[]}"#).unwrap();
        kernel.load_environment(&fixture("seed-a")).unwrap();
        let before = kernel.environment_facts_json().unwrap();
        let step = r#"{"delta":0.2,"writes":[],"actions":[]}"#;
        let output: serde_json::Value = serde_json::from_str(&kernel.advance_json(step).unwrap()).unwrap();
        assert!(output["environmentWork"]["faces"].as_u64().unwrap() > 0);
        // These two submerged cave cells are full: clock work must not invent flow.
        let moved = kernel.environment_facts_json().unwrap();
        assert_eq!(moved, before);
        assert!(kernel.snapshot_json().is_err());
        let records = kernel.save_records().unwrap();
        let entities: serde_json::Value = serde_json::from_str(&records.entities).unwrap();
        assert_eq!(entities["time"], 0.2);
        let mut restored = crate::Kernel::new();
        restored.restore_records(&records).unwrap();
        assert_eq!(restored.environment_facts_json().unwrap(), moved);
        kernel.advance_json(step).unwrap();
        restored.advance_json(step).unwrap();
        assert_eq!(restored.environment_facts_json().unwrap(), kernel.environment_facts_json().unwrap());
        assert_eq!(restored.save_records().unwrap().entities, kernel.save_records().unwrap().entities);
        let committed = restored.save_records().unwrap();
        assert!(restored.advance_json(r#"{"delta":2,"writes":[],"actions":[]}"#).is_err());
        assert!(restored.environment_facts_json().is_err());
        assert!(restored.render_json().is_err());
        assert!(restored.save_records().is_err());
        assert!(restored.advance_json(step).is_err());
        restored.restore_records(&committed).unwrap();
        assert_eq!(restored.environment_facts_json().unwrap(), kernel.environment_facts_json().unwrap());

    }

    #[test]
    fn initial_surface_placements_use_generated_surface_and_survive_restore() {
        use serde_json::json;
        let mut definition: serde_json::Value = serde_json::from_str(&fixture("placement")).unwrap();
        definition["initialPlacements"] = json!([
            {"entity":"actor", "column":[0, 0]},
            {"entity":"pantry", "column":[1, 0]}
        ]);
        let mut kernel = crate::Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":1, "game":"placement", "components":[],
            "initial":[
                {"id":"actor","components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0.25},"hive.body":{"speed":1},"hive.container":{"capacity":2},"hive.traversal":{"clearanceCells":1,"maxStepCells":1}}},
                {"id":"pantry","components":{"hive.position":{"x":0,"y":0,"z":0,"facing":1.25},"hive.container":{"capacity":20}}}
            ]
        }).to_string()).unwrap();
        kernel.load_environment(&definition.to_string()).unwrap();
        let first: serde_json::Value = serde_json::from_str(&kernel.render_json().unwrap()).unwrap();
        let actor = first.as_array().unwrap().iter().find(|fact| fact["id"] == "actor").unwrap();
        let pantry = first.as_array().unwrap().iter().find(|fact| fact["id"] == "pantry").unwrap();
        let surfaces: serde_json::Value = serde_json::from_str(&kernel.terrain_surfaces_json("[[0,0],[1,0]]").unwrap()).unwrap();
        let actor_y = (surfaces[0]["cell"][1].as_i64().unwrap() as f64 + 0.5) * 0.54;
        let pantry_y = (surfaces[1]["cell"][1].as_i64().unwrap() as f64 + 0.5) * 0.54;
        assert_eq!(actor["local"]["position"]["y"], actor_y);
        assert_eq!(pantry["local"]["position"]["y"], pantry_y);
        assert_eq!(actor["local"]["position"]["x"], 0.0);
        assert_eq!(pantry["local"]["position"]["x"], 1.0);
        assert_eq!(actor["local"]["facing"], 0.25);
        assert_eq!(pantry["local"]["facing"], 1.25);
        let destination: serde_json::Value = serde_json::from_str(&kernel.terrain_surfaces_json("[[2,0]]").unwrap()).unwrap();
        let destination_y = (destination[0]["cell"][1].as_i64().unwrap() as f64 + 0.5) * 0.54;
        let move_output: serde_json::Value = serde_json::from_str(&kernel.advance_json(&format!(r#"{{"delta":0,"writes":[],"actions":[{{"kind":"move","entity":"actor","destination":{{"x":2,"y":{destination_y},"z":0,"frame":null}}}}]}}"#)).unwrap()).unwrap();
        assert_eq!(move_output["results"][0]["accepted"], true);
        for _ in 0..4 { kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap(); }
        let moved: serde_json::Value = serde_json::from_str(&kernel.render_json().unwrap()).unwrap();
        let moved_actor = moved.as_array().unwrap().iter().find(|fact| fact["id"] == "actor").unwrap();
        assert!(moved_actor["local"]["position"]["x"].as_f64().unwrap() > 0.0);
        let records = kernel.save_records().unwrap();
        let mut restored = crate::Kernel::new();
        restored.restore_records(&records).unwrap();
        assert_eq!(restored.render_json().unwrap(), kernel.render_json().unwrap());
    }

    #[test]
    fn initial_surface_placements_reject_duplicate_columns_and_missing_entities() {
        use serde_json::json;
        let mut duplicate: serde_json::Value = serde_json::from_str(&fixture("duplicate-placement")).unwrap();
        duplicate["initialPlacements"] = json!([
            {"entity":"actor", "column":[0, 0]},
            {"entity":"other", "column":[0, 0]}
        ]);
        assert!(build_from_json(&duplicate.to_string()).is_err());
        let mut missing: serde_json::Value = serde_json::from_str(&fixture("missing-placement")).unwrap();
        missing["initialPlacements"] = json!([{ "entity":"missing", "column":[0, 0] }]);
        let mut kernel = crate::Kernel::new();
        kernel.load(r#"{"format":"hive-game","version":1,"game":"placement","components":[],"initial":[]}"#).unwrap();
        let before = kernel.save_records().unwrap().entities;
        assert!(kernel.load_environment(&missing.to_string()).is_err());
        assert_eq!(kernel.save_records().unwrap().entities, before);
        assert!(kernel.environment_facts_json().is_err());
    }

    #[test]
    fn initial_surface_placement_rejects_stale_excavation_work() {
        use serde_json::json;
        let mut definition: serde_json::Value = serde_json::from_str(&fixture("placement-work")).unwrap();
        definition["initialPlacements"] = json!([{ "entity":"actor", "column":[0, 0] }]);
        let mut kernel = crate::Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":1, "game":"placement", "components":[],
            "initial":[{"id":"actor","components":{
                "hive.position":{"x":0,"y":0,"z":0,"facing":0},
                "hive.body":{"speed":1}, "hive.container":{"capacity":2},
                "hive.excavation-work":{"x":0,"y":0,"z":0,"expected":1,"replacement":0,"seconds":1}
            }}]
        }).to_string()).unwrap();
        assert!(kernel.load_environment(&definition.to_string()).is_err());
        assert!(kernel.environment_facts_json().is_err());
    }

}
