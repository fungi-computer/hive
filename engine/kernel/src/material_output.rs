//! Prepared finite material output. Preparation is pure; Kernel publication is
//! the only operation that inserts the admitted lot into ECS and its indexes.

use crate::components::{valid_id, Lot, LotWater, MAX_CARRIED_WATER_KG};

pub(super) struct MaterialOutputSpec {
    pub container: String,
    pub kind: String,
    pub quantity: u32,
    pub water_kg: Option<f64>,
}

pub(super) struct PreparedMaterialOutput {
    pub(super) revision: u64,
    pub(super) container: String,
    pub(super) lot_id: String,
    pub(super) lot: Lot,
    pub(super) water: Option<LotWater>,
    pub(super) next_lot: u64,
    pub(super) state_weight: usize,
}

pub(super) fn allocate_lot_id(next_lot: u64, known: impl Fn(&str) -> bool) -> Result<(String, u64), String> {
    if next_lot == 0 { return Err("lot identity exhausted".into()); }
    let mut sequence = next_lot;
    let lot_id = loop {
        let candidate = format!("lot.{sequence}");
        sequence = sequence.checked_add(1).ok_or("lot identity exhausted")?;
        if !known(&candidate) { break candidate; }
    };
    Ok((lot_id, sequence))
}

pub(super) fn prepare(
    spec: MaterialOutputSpec,
    revision: u64,
    next_lot: u64,
    known: impl Fn(&str) -> bool,
    container_capacity: u32,
    container_quantity: u64,
    state_weight: usize,
    fixed_added_weight: usize,
    state_limit: usize,
) -> Result<PreparedMaterialOutput, String> {
    if !valid_id(&spec.container) || !valid_id(&spec.kind) {
        return Err("invalid material output identity".into());
    }
    if spec.quantity == 0 {
        return Err("material output quantity must be positive".into());
    }
    if container_quantity.saturating_add(u64::from(spec.quantity)) > u64::from(container_capacity) {
        return Err("material output exceeds container capacity".into());
    }
    let water = spec.water_kg.map(|mass| -> Result<LotWater, String> {
        if !mass.is_finite() || mass < 0.0 || mass > MAX_CARRIED_WATER_KG {
            return Err("invalid material output water mass".into());
        }
        Ok(LotWater { water_kg: mass })
    }).transpose()?;
    let (lot_id, sequence) = allocate_lot_id(next_lot, known)?;
    let next_state_weight = state_weight.checked_add(fixed_added_weight).and_then(|value| value.checked_add(lot_id.len())).ok_or("region canonical state capacity")?;
    if next_state_weight > state_limit {
        return Err("region canonical state capacity".into());
    }
    let lot = Lot { kind: spec.kind, quantity: spec.quantity, container: spec.container.clone() };
    Ok(PreparedMaterialOutput {
        revision,
        container: spec.container,
        lot_id,
        lot,
        water,
        next_lot: sequence,
        state_weight: next_state_weight,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::Kernel;
    use serde_json::json;

    fn spec(water_kg: Option<f64>) -> MaterialOutputSpec {
        MaterialOutputSpec { container: "bin".into(), kind: "stone".into(), quantity: 3, water_kg }
    }

    #[test]
    fn prepares_finite_dry_and_wet_output_without_mutation() {
        let dry = prepare(spec(None), 4, 1, |id| id == "lot.1", 10, 2, 100, 40, 8 * 1024 * 1024).unwrap();
        assert_eq!(dry.lot_id, "lot.2");
        assert_eq!(dry.lot.quantity, 3);
        assert!(dry.water.is_none());
        let wet = prepare(spec(Some(2.5)), 4, 1, |_| false, 10, 2, 100, 48, 8 * 1024 * 1024).unwrap();
        assert_eq!(wet.water.unwrap().water_kg, 2.5);
    }

    #[test]
    fn preparation_rejects_capacity_invalid_content_and_water() {
        assert!(prepare(spec(None), 0, 1, |_| false, 4, 2, 100, 40, 8 * 1024 * 1024).is_err());
        let mut invalid = spec(None);
        invalid.kind = "bad kind".into();
        assert!(prepare(invalid, 0, 1, |_| false, 10, 0, 100, 40, 8 * 1024 * 1024).is_err());
        assert!(prepare(spec(Some(f64::NAN)), 0, 1, |_| false, 10, 0, 100, 40, 8 * 1024 * 1024).is_err());
    }

    #[test]
    fn preparation_rejects_state_budget_before_publication() {
        assert!(prepare(spec(None), 0, 1, |_| false, 10, 0, 8 * 1024 * 1024, 1, 8 * 1024 * 1024).is_err());
    }

    fn kernel() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":1, "game":"output-test", "components":[],
            "initial":[{"id":"bin","components":{
                "hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},
                "hive.container":{"capacity":10}
            }}]
        }).to_string()).unwrap();
        kernel
    }

    #[test]
    fn wet_excavation_joins_output_and_field_or_leaves_both_unchanged() {
        use crate::terrain_water::ExcavationResult;
        use crate::generation::Cell;
        let mut kernel = kernel();
        kernel.load_environment(&crate::environment_definition::tests::fixture("wet-output")).unwrap();
        let facts = kernel.environment.as_ref().unwrap().world.facts().unwrap();
        let wet = facts.cells.iter().find(|cell| cell.kind == crate::water::WaterCellKind::Soil && cell.mass_kg > 0.0).expect("generated wet material");
        let at = Cell { x: i64::from(wet.at[0]), y: wet.at[1], z: i64::from(wet.at[2]) };
        let expected = kernel.environment.as_mut().unwrap().world.material(at).unwrap();
        let before = kernel.save_records().unwrap();
        let ExcavationResult::Prepared(prepared) = kernel.environment.as_mut().unwrap().world.prepare_excavation(at, expected, 0).unwrap() else { panic!("prepare"); };
        assert!(kernel.complete_excavation(prepared, "bin".into(), "spoil".into(), 11).is_err());
        let unchanged = kernel.save_records().unwrap();
        assert_eq!(before.entities, unchanged.entities);
        let a = &before.environment.as_ref().unwrap().1;
        let b = &unchanged.environment.as_ref().unwrap().1;
        assert_eq!(a.terrain, b.terrain);
        assert_eq!(a.water, b.water);
        let ExcavationResult::Prepared(prepared) = kernel.environment.as_mut().unwrap().world.prepare_excavation(at, expected, 0).unwrap() else { panic!("prepare"); };
        let credit = prepared.water_kg();
        let lot = kernel.complete_excavation(prepared, "bin".into(), "spoil".into(), 3).unwrap();
        let entity = kernel.entity(&lot).unwrap();
        assert_eq!(kernel.ecs.get::<LotWater>(entity).unwrap().water_kg, credit);
        assert_eq!(kernel.ecs.get::<Lot>(entity).unwrap().quantity, 3);
        let remaining = kernel.environment.as_ref().unwrap().world.facts().unwrap().total_kg;
        assert!((remaining + credit - facts.total_kg).abs() < 1e-9);
        assert!(matches!(kernel.environment.as_mut().unwrap().world.prepare_excavation(at, expected, 0).unwrap(), ExcavationResult::TerrainBlocked(_)));
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.environment.as_mut().unwrap().world.material(at).unwrap(), 0);
        assert_eq!(restored.ecs.get::<LotWater>(restored.entity(&lot).unwrap()).unwrap().water_kg, credit);
        assert_eq!(restored.environment.as_ref().unwrap().world.facts().unwrap().total_kg, remaining);
    }

    #[test]
    fn kernel_publication_consumes_prepared_token_and_preserves_preparation_snapshot() {
        let mut kernel = kernel();
        let first = kernel.complete_material_output(spec(None)).unwrap();
        let second = kernel.complete_material_output(MaterialOutputSpec { container: "bin".into(), kind: "water".into(), quantity: 2, water_kg: Some(1.5) }).unwrap();
        assert_ne!(first, second);
        let lots: serde_json::Value = serde_json::from_str(&kernel.query_json(r#"["hive.lot"]"#).unwrap()).unwrap();
        assert_eq!(lots.as_array().unwrap().len(), 2);
    }
}
