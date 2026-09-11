//! Detached consumption of exact material-lot portions.
//!
//! Preparation is read-only. Kernel publication rechecks the owner token,
//! revision, and every lot witness before mutating any lot or water component.
//! This module does not decide why material is consumed.

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

use bevy_ecs::prelude::{Entity, World};

use crate::{
    components::{Container, Lot, LotWater, MAX_CARRIED_WATER_KG, record},
    quantity::resolve_quantity_change,
    registry::Registry,
};

const MAX_PORTIONS: usize = 64;

#[derive(Clone)]
pub(super) struct MaterialPortion {
    pub lot: String,
    pub quantity: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct ConsumedPortion {
    pub lot: String,
    pub quantity: u32,
    pub water_kg: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct ConsumedMaterial {
    pub portions: Vec<ConsumedPortion>,
    pub water_kg: f64,
}

struct Witness {
    entity: Entity,
    lot_id: String,
    before: Lot,
    after: Lot,
    before_water: Option<LotWater>,
    after_water: Option<LotWater>,
    consumed_water_kg: f64,
}

pub(super) struct PreparedConsumption {
    owner: Arc<()>,
    revision: u64,
    witnesses: Vec<Witness>,
    result: ConsumedMaterial,
    state_weight: usize,
}

fn same_lot(left: &Lot, right: &Lot) -> bool {
    left.kind == right.kind && left.quantity == right.quantity && left.container == right.container
}

fn same_water(left: Option<&LotWater>, right: Option<LotWater>) -> bool {
    match (left, right) {
        (None, None) => true,
        (Some(left), Some(right)) => left.water_kg == right.water_kg,
        _ => false,
    }
}

fn validate_water(water: f64, quantity: u32) -> Result<(), String> {
    if !water.is_finite() || water < 0.0 || water > MAX_CARRIED_WATER_KG {
        return Err("material lot water is invalid".into());
    }
    if quantity == 0 && water > 0.0 {
        return Err("zero-quantity lot cannot carry water".into());
    }
    Ok(())
}

fn consume_water(
    water: Option<f64>,
    stock: u32,
    requested: u32,
) -> Result<(f64, Option<LotWater>), String> {
    let Some(water) = water else {
        return Ok((0.0, None));
    };
    validate_water(water, stock)?;
    if requested == stock {
        return Ok((water, Some(LotWater { water_kg: 0.0 })));
    }
    let consumed = water * f64::from(requested) / f64::from(stock);
    if !consumed.is_finite() || consumed < 0.0 || (water > 0.0 && consumed == 0.0) {
        return Err("material lot water portion is not representable".into());
    }
    let remaining = resolve_quantity_change(water, -consumed)?
        .ok_or("material lot water portion is not representable")?;
    if !remaining.is_finite() || remaining < 0.0 || (water > 0.0 && remaining == 0.0) {
        return Err("material lot water portion is not representable".into());
    }
    Ok((
        consumed,
        Some(LotWater {
            water_kg: remaining,
        }),
    ))
}

pub(super) fn prepare(
    owner: &Arc<()>,
    revision: u64,
    ecs: &World,
    ids: &BTreeMap<String, Entity>,
    registry: &Registry,
    state_weight: usize,
    portions: &[MaterialPortion],
) -> Result<PreparedConsumption, String> {
    if portions.is_empty() || portions.len() > MAX_PORTIONS {
        return Err("material consumption requires 1..64 portions".into());
    }
    let mut seen = BTreeSet::new();
    let mut witnesses = Vec::with_capacity(portions.len());
    let mut result = Vec::with_capacity(portions.len());
    let mut total_water = 0.0;
    let mut next_weight = state_weight;
    for portion in portions {
        if portion.quantity == 0 || !seen.insert(portion.lot.clone()) {
            return Err("material consumption portions must be positive and unique".into());
        }
        let entity = ids
            .get(&portion.lot)
            .copied()
            .ok_or("material lot is unknown")?;
        let before = ecs
            .get::<Lot>(entity)
            .cloned()
            .ok_or("material lot is missing")?;
        if before.container.is_empty() || before.quantity < portion.quantity {
            return Err("material lot quantity is insufficient".into());
        }
        let container_entity = ids
            .get(&before.container)
            .copied()
            .ok_or("material lot container is unknown")?;
        if ecs.get::<Container>(container_entity).is_none() {
            return Err("material lot owner is not a container".into());
        }
        if ecs
            .get::<crate::components::SealedContainer>(container_entity)
            .is_some()
        {
            return Err("sealed container cannot consume material".into());
        }
        let before_water = ecs.get::<LotWater>(entity).copied();
        if let Some(water) = before_water {
            validate_water(water.water_kg, before.quantity)?;
        }
        let (consumed_water_kg, after_water) = consume_water(
            before_water.map(|water| water.water_kg),
            before.quantity,
            portion.quantity,
        )?;
        total_water = total_water
            .checked_add(consumed_water_kg)
            .ok_or("material consumption water total is not finite")?;
        let mut after = before.clone();
        after.quantity -= portion.quantity;
        let old_weight = registry.weight("hive.lot", &record(&before));
        let new_weight = registry.weight("hive.lot", &record(&after));
        next_weight = next_weight
            .checked_sub(old_weight)
            .and_then(|weight| weight.checked_add(new_weight))
            .ok_or("material consumption state weight underflow")?;
        if let (Some(old), Some(new)) = (before_water, after_water) {
            next_weight = next_weight
                .checked_sub(registry.weight("hive.lot-water", &record(&old)))
                .and_then(|weight| {
                    weight.checked_add(registry.weight("hive.lot-water", &record(&new)))
                })
                .ok_or("material consumption state weight underflow")?;
        }
        result.push(ConsumedPortion {
            lot: portion.lot.clone(),
            quantity: portion.quantity,
            water_kg: consumed_water_kg,
        });
        witnesses.push(Witness {
            entity,
            lot_id: portion.lot.clone(),
            before,
            after,
            before_water,
            after_water,
            consumed_water_kg,
        });
    }
    if next_weight > 8 * 1024 * 1024 || !total_water.is_finite() {
        return Err("material consumption canonical state capacity".into());
    }
    Ok(PreparedConsumption {
        owner: Arc::clone(owner),
        revision,
        witnesses,
        result: ConsumedMaterial {
            portions: result,
            water_kg: total_water,
        },
        state_weight: next_weight,
    })
}

pub(super) fn publish(
    prepared: PreparedConsumption,
    owner: &Arc<()>,
    revision: u64,
    ecs: &mut World,
    state_weight: &mut usize,
) -> Result<ConsumedMaterial, String> {
    if !Arc::ptr_eq(&prepared.owner, owner) {
        return Err("material consumption belongs to another kernel".into());
    }
    if prepared.revision != revision {
        return Err("material consumption revision is stale".into());
    }
    for witness in &prepared.witnesses {
        let current = ecs
            .get::<Lot>(witness.entity)
            .ok_or("material lot disappeared")?;
        if !same_lot(current, &witness.before)
            || current.quantity < witness.result_quantity()
            || current.container != witness.before.container
            || !same_water(ecs.get::<LotWater>(witness.entity), witness.before_water)
        {
            return Err(format!("material lot witness is stale: {}", witness.lot_id));
        }
    }
    for witness in prepared.witnesses {
        ecs.entity_mut(witness.entity).insert(witness.after);
        if let Some(water) = witness.after_water {
            ecs.entity_mut(witness.entity).insert(water);
        }
    }
    *state_weight = prepared.state_weight;
    Ok(prepared.result)
}

impl Witness {
    fn result_quantity(&self) -> u32 {
        self.before.quantity - self.after.quantity
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::Kernel;
    use serde_json::{Value, json};

    fn kernel(water: Option<f64>, quantity: u32) -> Kernel {
        let mut kernel = Kernel::new();
        let mut lot = json!({"hive.lot":{"kind":"fuel","quantity":quantity,"container":"store"}});
        if let Some(water) = water {
            lot["hive.lot-water"] = json!({"waterKg":water});
        }
        kernel.load(&json!({"format":"hive-game","version":1,"game":"consumption","components":[],"initial":[
            {"id":"store","components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.container":{"capacity":20}}},
            {"id":"lot","components":lot}
        ]}).to_string()).unwrap();
        kernel
    }
    fn portion(quantity: u32) -> MaterialPortion {
        MaterialPortion {
            lot: "lot".into(),
            quantity,
        }
    }
    fn lot_rows(kernel: &mut Kernel) -> Value {
        serde_json::from_str(
            &kernel
                .query_json("[\"hive.lot\",\"hive.lot-water\"]")
                .unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn dry_and_wet_partial_consumption_report_exact_material() {
        let mut dry = kernel(None, 4);
        let prepared = dry.prepare_material_consumption(&[portion(2)]).unwrap();
        let consumed = dry.publish_material_consumption(prepared).unwrap();
        assert_eq!(consumed.water_kg, 0.0);
        assert_eq!(consumed.portions[0].quantity, 2);
        let mut wet = kernel(Some(8.0), 4);
        let prepared = wet.prepare_material_consumption(&[portion(2)]).unwrap();
        let consumed = wet.publish_material_consumption(prepared).unwrap();
        assert_eq!(consumed.water_kg, 4.0);
        assert!(lot_rows(&mut wet).to_string().contains("waterKg"));
    }

    #[test]
    fn failed_second_portion_has_no_first_debit() {
        let mut kernel = kernel(None, 4);
        let before = lot_rows(&mut kernel);
        let bad = [
            portion(1),
            MaterialPortion {
                lot: "missing".into(),
                quantity: 1,
            },
        ];
        assert!(kernel.prepare_material_consumption(&bad).is_err());
        assert_eq!(lot_rows(&mut kernel), before);
    }

    #[test]
    fn same_revision_competition_and_foreign_restore_token_are_rejected() {
        let mut kernel = kernel(None, 4);
        let first = kernel.prepare_material_consumption(&[portion(1)]).unwrap();
        let second = kernel.prepare_material_consumption(&[portion(1)]).unwrap();
        kernel.publish_material_consumption(first).unwrap();
        assert!(kernel.publish_material_consumption(second).is_err());
        let mut foreign = kernel(None, 4);
        let token = foreign.prepare_material_consumption(&[portion(1)]).unwrap();
        assert!(kernel.publish_material_consumption(token).is_err());
    }

    #[test]
    fn zero_quantity_lot_remains_a_valid_fact() {
        let mut kernel = kernel(None, 1);
        let prepared = kernel.prepare_material_consumption(&[portion(1)]).unwrap();
        kernel.publish_material_consumption(prepared).unwrap();
        assert!(lot_rows(&mut kernel).to_string().contains("quantity\":0"));
    }
}
