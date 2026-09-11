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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DefinitionInput {
    world: WorldInput,
    materials: Vec<MaterialInput>,
    water: WaterInput,
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
}

pub fn build_from_json(input: &str) -> Result<TerrainWater, String> {
    let prepared = prepare_definition_mode(input, true)?;
    TerrainWater::fresh(prepared.geometry, prepared.terrain, &prepared.stocks)
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
    let bounds = Bounds {
        min_x: definition.world.bounds.min_x,
        max_x: definition.world.bounds.max_x,
        min_y: definition.world.bounds.min_y,
        max_y: definition.world.bounds.max_y,
        min_z: definition.world.bounds.min_z,
        max_z: definition.world.bounds.max_z,
    };
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
    for material in definition.materials {
        if behavior.contains_key(&material.slot) {
            return Err("duplicate material slot".into());
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(seed: &str) -> String {
        format!(
            r#"{{"world":{{"seed":"{seed}","identity":"demo","bounds":{{"minX":-8,"maxX":8,"minY":-8,"maxY":40,"minZ":-8,"maxZ":8}},"slots":{{"air":0,"soil":1,"stone":2}},"seaLevel":12,"verticalMetres":0.54}},"materials":[{{"slot":0,"solid":false,"diggable":false,"water":{{"kind":"open"}}}},{{"slot":1,"solid":true,"diggable":true,"water":{{"kind":"porous","rule":{{"id":"soil","porosity":0.4,"retention":0.1,"absorbMPerS":0.1,"seepMPerS":0.1}}}}}},{{"slot":2,"solid":true,"diggable":true,"water":{{"kind":"porous","rule":{{"id":"stone","porosity":0.05,"retention":0.01,"absorbMPerS":0.01,"seepMPerS":0.01}}}}}}],"water":{{"id":"w","cells":[[0,-7,0],[0,-6,0],[0,39,0]],"fallMPerS":0.1,"spreadMPerS":0.1}}}}"#
        )
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
        let built = build_from_json(&input).unwrap();
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
        let mut input: serde_json::Value = serde_json::from_str(&fixture("seed-a")).unwrap();
        let mut prepared = prepare_definition(&input.to_string()).unwrap();
        let at = (-7..8).flat_map(|x| (-6..0).map(move |y| Cell { x, y, z: 0 }))
            .find(|at| prepared.terrain.query(*at).unwrap() != 0
                && prepared.terrain.query(Cell { y: at.y - 1, ..*at }).unwrap() != 0)
            .expect("generated fixture contains adjacent porous rock");
        input["water"]["cells"] = serde_json::json!([[at.x, at.y, 0], [at.x, at.y - 1, 0], [0, 39, 0]]);
        kernel.load_environment(&input.to_string()).unwrap();
        let before = kernel.environment_facts_json().unwrap();
        let step = r#"{"delta":0.2,"writes":[],"actions":[]}"#;
        kernel.advance_json(step).unwrap();
        let moved = kernel.environment_facts_json().unwrap();
        assert_ne!(moved, before);
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
    }

}
