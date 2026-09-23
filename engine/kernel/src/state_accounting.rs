//! Canonical state-size accounting for component replacement.
//!
//! Progressing work changes one ECS component. Charge its old and new records
//! at the mutation owner instead of rereading every entity and schema for each
//! worker. The full world scan remains the load/checkpoint oracle.

use super::{Kernel, STATE_BYTES};
use bevy_ecs::prelude::{Component, Entity};
use serde::Serialize;

/// A checked change to the entity portion of canonical state accounting.
/// The caller prepares before mutating the ECS, then applies immediately after
/// the corresponding entity change. This keeps capacity policy and the live
/// ledger under one owner without rescanning the world.
#[derive(Clone, Copy)]
pub(super) struct EntityWeightChange {
    previous: usize,
    next: usize,
}

impl Kernel {
    pub(super) fn prepare_entity_addition_after(
        &self,
        previous: usize,
        id: &str,
        records: &[(&str, crate::components::Record)],
    ) -> crate::components::Result<EntityWeightChange> {
        let added = records.iter().try_fold(id.len().saturating_add(128), |weight, (schema, value)| {
            weight.checked_add(self.registry.weight(schema, value))
        }).ok_or("invalid canonical state accounting")?;
        let next = previous.checked_add(added)
            .ok_or("invalid canonical state accounting")?;
        if next > STATE_BYTES {
            return Err("region canonical state capacity".into());
        }
        Ok(EntityWeightChange { previous, next })
    }

    pub(super) fn prepare_entity_removal(
        &self,
        id: &str,
        entity: Entity,
    ) -> crate::components::Result<EntityWeightChange> {
        let mut removed = id.len().saturating_add(128);
        for schema in self.registry.schemas.keys() {
            if let Some(value) = self.registry.read(&self.ecs, entity, schema) {
                removed = removed.checked_add(self.registry.weight(schema, &value))
                    .ok_or("invalid canonical state accounting")?;
            }
        }
        let next = self.state_weight.checked_sub(removed)
            .ok_or("invalid canonical state accounting")?;
        Ok(EntityWeightChange { previous: self.state_weight, next })
    }

    pub(super) fn apply_entity_weight_change(&mut self, change: EntityWeightChange) {
        assert_eq!(self.state_weight, change.previous, "canonical state changed after accounting preflight");
        self.state_weight = change.next;
    }

    pub(super) fn projected_entity_weight(change: EntityWeightChange) -> usize {
        change.next
    }

    pub(super) fn insert_accounted_component<T: Component + Serialize>(
        &mut self,
        entity: Entity,
        schema: &str,
        next: T,
    ) -> crate::components::Result<()> {
        if self.registry.read(&self.ecs, entity, schema).is_some() {
            return Err(format!("accounted component {schema} already exists"));
        }
        let new_weight = self.registry.weight(schema, &crate::components::record(&next));
        let weight = self.state_weight.checked_add(new_weight)
            .ok_or("invalid canonical state accounting")?;
        if weight > STATE_BYTES {
            return Err("region canonical state capacity".into());
        }
        self.ecs.entity_mut(entity).insert(next);
        self.state_weight = weight;
        Ok(())
    }

    pub(super) fn replace_accounted_component<T: Component + Serialize>(
        &mut self,
        entity: Entity,
        schema: &str,
        next: T,
    ) -> crate::components::Result<()> {
        let previous = self.registry.read(&self.ecs, entity, schema)
            .ok_or_else(|| format!("accounted component {schema} is missing"))?;
        let replacement = crate::components::record(&next);
        let old_weight = self.registry.weight(schema, &previous);
        let new_weight = self.registry.weight(schema, &replacement);
        let weight = self.state_weight.checked_sub(old_weight)
            .and_then(|remaining| remaining.checked_add(new_weight))
            .ok_or("invalid canonical state accounting")?;
        if weight > STATE_BYTES {
            return Err("region canonical state capacity".into());
        }
        self.ecs.entity_mut(entity).insert(next);
        self.state_weight = weight;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::components::{ExternalId, OwnedBy, ResourceOrder};
    use crate::job::JobTaskWork;

    #[test]
    fn progress_replacements_match_full_accounting() {
        let mut kernel = Kernel::new();
        let task = kernel.ecs.spawn((ExternalId("task".into()), JobTaskWork { seconds: 0.0 })).id();
        let resource = kernel.ecs.spawn((ExternalId("resource".into()), ResourceOrder {
            definition: "plant".into(), cell_x: 0, cell_y: 0, cell_z: 0,
            status: "working".into(), reason: String::new(), progress_seconds: 0.0,
        })).id();
        kernel.ids.insert("task".into(), task);
        kernel.ids.insert("resource".into(), resource);
        kernel.refresh_state_weight();
        kernel.insert_accounted_component(task, "hive.owned-by", OwnedBy { player: "player".into() }).unwrap();
        kernel.replace_accounted_component(task, "hive.job-task-work", JobTaskWork { seconds: 0.75 }).unwrap();
        kernel.replace_accounted_component(resource, "hive.resource-order", ResourceOrder {
            definition: "plant".into(), cell_x: 0, cell_y: 0, cell_z: 0,
            status: "working".into(), reason: "needs water".into(), progress_seconds: 0.5,
        }).unwrap();
        let accounted = kernel.state_weight;
        kernel.refresh_state_weight();
        assert_eq!(accounted, kernel.state_weight);
    }
}
