//! Atomic physical publication for the closed Job transform operations.
//!
//! Job admission and scheduling stay in their owners. This module only joins
//! exact source witnesses to the existing material preparation/publication
//! owners, so a transform cannot acknowledge a task without publishing its
//! physical result.

use super::Kernel;
use crate::components::{record, FiniteResource, Lot};
use super::material_consumption::{MaterialPortion, PreparedConsumption};
use super::material_output::{self, PreparedMaterialOutput};

type Result<T> = std::result::Result<T, String>;

enum PreparedTransform {
    Finite {
        source: bevy_ecs::prelude::Entity,
        after: FiniteResource,
        output: PreparedMaterialOutput,
    },
    Item {
        consumption: PreparedConsumption,
        output: PreparedMaterialOutput,
    },
}

impl Kernel {
    /// Prepare every source witness and output allocation before publishing
    /// either side. The enclosing candidate-world transaction discards the
    /// whole transform if publication rejects a stale prepared witness.
    pub(super) fn execute_job_transform(
        &mut self,
        operation: &crate::job::TypedWorkOperation,
        party: &str,
    ) -> Result<String> {
        let prepared = match operation {
            crate::job::TypedWorkOperation::FiniteToItem {
                source: crate::job::EntityBinding::Exact(source), input_kind,
                input_quantity, output_kind, output_quantity, ..
            } => {
                let source_entity = self.entity(source)?;
                let before = self.ecs.get::<FiniteResource>(source_entity).cloned().ok_or("job source is not finite")?;
                if before.kind != *input_kind || before.quantity < *input_quantity {
                    return Err("job finite source changed before completion".into());
                }
                let after = FiniteResource { quantity: before.quantity - *input_quantity, ..before.clone() };
                let old_weight = self.registry.weight("hive.finite-resource", &record(&before));
                let next_weight = self.state_weight.checked_sub(old_weight)
                    .and_then(|value| value.checked_add(self.registry.weight("hive.finite-resource", &record(&after))))
                    .ok_or("job finite source state weight underflow")?;
                let position = self.world_pose_entity(source_entity, 0)?;
                let output = material_output::prepare_ground(position, output_kind.clone(), *output_quantity, None, (!party.is_empty()).then(|| party.to_owned()), self.revision, self.next_lot,
                    |id| self.known.contains(id), next_weight, super::STATE_BYTES, &self.registry)?;
                PreparedTransform::Finite { source: source_entity, after, output }
            }
            crate::job::TypedWorkOperation::ItemToItems {
                source: crate::job::EntityBinding::Exact(source), input_kind,
                input_quantity, output_kind, output_quantity, ..
            } => {
                let source_entity = self.entity(source)?;
                let lot = self.ecs.get::<Lot>(source_entity).cloned().ok_or("job source is not a material lot")?;
                if lot.kind != *input_kind || lot.quantity < *input_quantity {
                    return Err("job item source changed before completion".into());
                }
                let position = self.world_pose(&lot.container)?;
                let consumption = self.prepare_material_consumption(&[MaterialPortion { lot: source.clone(), quantity: *input_quantity }])?;
                let output = material_output::prepare_ground(position, output_kind.clone(), *output_quantity, None, (!party.is_empty()).then(|| party.to_owned()), self.revision, self.next_lot,
                    |id| self.known.contains(id), consumption.state_weight(), super::STATE_BYTES, &self.registry)?;
                PreparedTransform::Item { consumption, output }
            }
            _ => return Err("job transform source binding is invalid".into()),
        };

        match prepared {
            PreparedTransform::Finite { source, after, output } => {
                let id = self.publish_material_output(output);
                self.ecs.entity_mut(source).insert(after);
                Ok(id)
            }
            PreparedTransform::Item { consumption, output } => {
                self.publish_material_consumption(consumption)?;
                Ok(self.publish_material_output(output))
            }
        }
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn finite_and_item_transforms_publish_once_and_conserve_quantity() {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"job-transform","components":[],"materialCatalog":[],"initial":[
            {"id":"source","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.finite-resource":{"kind":"wood","quantity":6}}}
        ]}).to_string()).unwrap();
        let fell = crate::job::TypedWorkOperation::FiniteToItem {
            source: crate::job::EntityBinding::Exact("source".into()), input_kind: "wood".into(), input_quantity: 6,
            output_kind: "wood-felled".into(), output_quantity: 6, work_seconds: 1.0, result_slot: "felled".into(),
        };
        let felled = kernel.execute_job_transform(&fell, "").unwrap();
        assert_eq!(kernel.ecs.get::<FiniteResource>(kernel.entity("source").unwrap()).unwrap().quantity, 0);
        assert!(kernel.execute_job_transform(&fell, "").is_err());
        let chop = crate::job::TypedWorkOperation::ItemToItems {
            source: crate::job::EntityBinding::Exact(felled.clone()), input_kind: "wood-felled".into(), input_quantity: 6,
            output_kind: "wood".into(), output_quantity: 6, work_seconds: 1.0, result_slot: "logs".into(),
        };
        let logs = kernel.execute_job_transform(&chop, "").unwrap();
        assert_ne!(felled, logs);
        assert_eq!(kernel.ecs.get::<Lot>(kernel.entity(&felled).unwrap()).unwrap().quantity, 0);
        assert_eq!(kernel.ecs.get::<Lot>(kernel.entity(&logs).unwrap()).unwrap().quantity, 6);
        let lots: serde_json::Value = serde_json::from_str(&kernel.query_json("[\"hive.lot\"]").unwrap()).unwrap();
        assert_eq!(lots.as_array().unwrap().len(), 2);
    }
}
