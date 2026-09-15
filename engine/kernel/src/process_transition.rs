//! Atomic staged-process transitions.
//!
//! This private module prepares every material, output, and environmental
//! consequence before publishing any of them. `Kernel` remains the sole
//! mutation owner; callers can only request the complete transition.

use super::*;

impl Kernel {
    pub(super) fn execute_process_transition(
        &mut self,
        process_id: &str,
        transition: &crate::staged_process::ProcessTransition,
    ) -> Result<()> {
        let bindings = self.process_bindings(process_id);
        let mut portions = Vec::new();
        let mut roles = BTreeSet::new();
        // A portion can satisfy more than one transition concern (the paid
        // emission source is also consumed). Accumulate by lot before handing
        // the batch to material_consumption, whose owner requires unique lots.
        let mut requested: BTreeMap<String, u32> = BTreeMap::new();
        for role in &transition.consume_roles {
            let rows: Vec<_> = bindings.iter().filter(|b| b.role == *role).collect();
            if rows.is_empty() {
                return Err("transition-missing-binding".into());
            }
            for binding in rows {
                let next = requested
                    .get(&binding.lot)
                    .copied()
                    .unwrap_or(0)
                    .checked_add(binding.quantity)
                    .ok_or("transition-quantity-overflow")?;
                requested.insert(binding.lot.clone(), next);
            }
            roles.insert(role.clone());
        }
        if let Some(emission) = &transition.emission {
            let rows: Vec<_> = bindings
                .iter()
                .filter(|b| b.role == emission.role)
                .collect();
            if rows.is_empty() {
                return Err("transition-missing-emission-binding".into());
            }
            for binding in rows {
                // Emission source roles are not also consume roles in the
                // authored catalog, but merging makes the invariant explicit.
                if transition
                    .consume_roles
                    .iter()
                    .any(|role| role == &emission.role)
                {
                    continue;
                }
                let next = requested
                    .get(&binding.lot)
                    .copied()
                    .unwrap_or(0)
                    .checked_add(binding.quantity)
                    .ok_or("transition-quantity-overflow")?;
                requested.insert(binding.lot.clone(), next);
            }
            roles.insert(emission.role.clone());
        }
        portions.extend(
            requested
                .into_iter()
                .map(|(lot, quantity)| MaterialPortion { lot, quantity }),
        );
        let prepared_consumption = if portions.is_empty() {
            None
        } else {
            Some(material_consumption::prepare(
                &self.material_consumption_owner,
                self.revision,
                &self.ecs,
                &self.ids,
                &self.registry,
                self.state_weight,
                &portions,
            )?)
        };
        let mut released_by_container: BTreeMap<String, u64> = BTreeMap::new();
        for portion in &portions {
            if let Some(lot) = self.ecs.get::<Lot>(self.entity(&portion.lot)?) {
                *released_by_container
                    .entry(lot.container.clone())
                    .or_default() += self.material_volume(&lot.kind, portion.quantity)?;
            }
        }
        let mut prepared_outputs = Vec::new();
        let mut planned_next_lot = self.next_lot;
        // Outputs are published after consumption, so their detached state
        // witness must start from consumption's resulting canonical weight.
        let mut planned_weight = prepared_consumption
            .as_ref()
            .map_or(self.state_weight, |prepared| prepared.state_weight());
        let mut planned_destinations: BTreeMap<String, u64> = BTreeMap::new();
        for output in &transition.outputs {
            let container = match &output.destination {
                crate::staged_process::OutputDestination::StationPort { port } => format!(
                    "{}:{}",
                    self.ecs
                        .get::<StagedProcess>(self.entity(process_id)?)
                        .ok_or("process-missing")?
                        .station,
                    port
                ),
                crate::staged_process::OutputDestination::RetainedContainer { role } => bindings
                    .iter()
                    .find(|b| b.role == *role)
                    .ok_or("output-retained-binding-missing")?
                    .lot
                    .clone(),
            };
            let destination_quantity = self
                .occupied_volume(&container)?
                .saturating_sub(*released_by_container.get(&container).unwrap_or(&0))
                .saturating_add(*planned_destinations.get(&container).unwrap_or(&0));
            let capacity = self
                .ecs
                .get::<Container>(self.entity(&container)?)
                .ok_or("output-destination-not-container")?
                .capacity;
            let lot = Lot {
                kind: output.material.clone(),
                quantity: output.quantity,
                container: container.clone(),
            };
            let added_weight = 128 + self.registry.weight("hive.lot", &record(&lot));
            let prepared = material_output::prepare(
                MaterialOutputSpec {
                    container: container.clone(),
                    kind: output.material.clone(),
                    quantity: output.quantity,
                    water_kg: None,
                },
                self.revision,
                planned_next_lot,
                |id| {
                    self.known.contains(id)
                        || prepared_outputs
                            .iter()
                            .any(|item: &PreparedMaterialOutput| item.lot_id == id)
                },
                capacity,
                destination_quantity,
                self.material_volume(&output.material, output.quantity)?,
                planned_weight,
                added_weight,
                STATE_BYTES,
            )?;
            planned_next_lot = prepared.next_lot;
            planned_weight = prepared.state_weight;
            *planned_destinations.entry(container).or_default() += self.material_volume(&output.material, output.quantity)?;
            prepared_outputs.push(prepared);
        }
        let emission_source = if let Some(emission) = &transition.emission {
            let source_rows: Vec<_> = bindings
                .iter()
                .filter(|b| b.role == emission.role)
                .collect();
            let source_quantity: u32 = source_rows
                .iter()
                .try_fold(0u32, |sum, b| sum.checked_add(b.quantity))
                .ok_or("transition-emission-quantity-overflow")?;
            let source_port = source_rows
                .first()
                .ok_or("transition-missing-emission-binding")?;
            let lot = self
                .ecs
                .get::<Lot>(self.entity(&source_port.lot)?)
                .ok_or("transition-emission-lot-missing")?;
            let emitter_id = lot.container.clone();
            let emitter = self
                .ecs
                .get::<Emitter>(self.entity(&emitter_id)?)
                .ok_or("transition-emitter-missing")?;
            if emitter.catalog != emission.catalog {
                return Err("transition-emitter-catalog-mismatch".into());
            }
            let definition = self
                .environment
                .as_ref()
                .ok_or("transition-needs-environment")?
                .emissions
                .get(&emission.catalog)
                .ok_or("transition-emission-definition-missing")?
                .definition()
                .clone();
            let target = self.world_pose(&emitter_id)?;
            let env = self
                .environment
                .as_mut()
                .ok_or("transition-needs-environment")?;
            let spacing = env.world.cell_spacing_m();
            let cell = crate::generation::Cell {
                x: (target.x / spacing[0] + 0.5).floor() as i64,
                y: (target.y / spacing[1] + 0.5).floor() as i32,
                z: (target.z / spacing[2] + 0.5).floor() as i64,
            };
            let air = env
                .atmosphere
                .as_mut()
                .ok_or("transition-air-unavailable")?;
            if !air.can_emit(&mut env.world, cell)? {
                return Err("transition-air-unavailable".into());
            }
            if definition.material_kind != lot.kind || definition.quantity != source_quantity {
                return Err("transition-emission-material-mismatch".into());
            }
            if env.paid_emissions.len() >= 64 {
                return Err("transition-emission-capacity".into());
            }
            if env.paid_emissions.contains_key(&emitter_id) {
                return Err("transition-emission-already-paid".into());
            }
            Some((
                emitter_id,
                environment_runtime::PaidEmission {
                    catalog: definition.id,
                    cell,
                    elapsed_s: 0.0,
                    admitted_revision: self.revision,
                },
            ))
        } else {
            None
        };
        if let Some(prepared) = prepared_consumption {
            material_consumption::publish(
                prepared,
                &self.material_consumption_owner,
                self.revision,
                &mut self.ecs,
                &mut self.state_weight,
            )?;
        }
        for prepared in prepared_outputs {
            self.publish_material_output(prepared);
        }
        if let Some((station, paid)) = emission_source {
            self.environment
                .as_mut()
                .unwrap()
                .paid_emissions
                .insert(station, paid);
        }
        for role in roles {
            let ids: Vec<String> = self
                .ids
                .iter()
                .filter_map(|(id, entity)| {
                    self.ecs
                        .get::<crate::staged_process::ProcessBinding>(*entity)
                        .filter(|b| b.process == process_id && b.role == role)
                        .map(|_| id.clone())
                })
                .collect();
            for id in ids {
                let entity = self.ids.remove(&id).unwrap();
                self.known.remove(&id);
                self.ecs.despawn(entity);
            }
        }
        self.bound_process_lots = self
            .ids
            .values()
            .filter_map(|entity| {
                self.ecs
                    .get::<crate::staged_process::ProcessBinding>(*entity)
                    .map(|b| b.lot.clone())
            })
            .collect();
        self.refresh_state_weight();
        Ok(())
    }
}
