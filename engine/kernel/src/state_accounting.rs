//! Canonical state-size accounting for component replacement.
//!
//! Progressing work changes one ECS component. Charge its old and new records
//! at the mutation owner instead of rereading every entity and schema for each
//! worker. The full world scan remains the load/checkpoint oracle.

use super::{Kernel, STATE_BYTES};
use bevy_ecs::prelude::{Component, Entity};
use serde::Serialize;

impl Kernel {
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
    use crate::components::{ExternalId, ResourceOrder};
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
