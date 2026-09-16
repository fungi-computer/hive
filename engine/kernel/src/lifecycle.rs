//! Atomic instantiation of prepared game actor templates.
//!
//! Game packs define component shapes. Callers choose a template, bounded
//! arguments and local references; they never submit physical ECS records or
//! stable world identities.

use super::{Kernel, MaterialOutputSpec};
use crate::components::*;
use bevy_ecs::prelude::Entity;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

struct PreparedActor {
    id: String,
    components: BTreeMap<String, Record>,
}

impl Kernel {
    pub(super) fn instantiate_actors(
        &mut self,
        binding_id: String,
        expected_sequence: u64,
        plan: ActorInstantiationPlan,
    ) -> Result<String> {
        if !valid_id(&binding_id)
            || expected_sequence == 0
            || plan.actors.is_empty()
            || plan.actors.len() > 32
            || plan.initial_materials.len() > 32
            || !valid_id(&plan.party_slot)
            || plan.people_slots.len() > 32
        {
            return Err("invalid actor instantiation plan".into());
        }
        let player = format!("player:{expected_sequence}");
        let party = format!("party:{expected_sequence}");
        let digest = format!(
            "{:x}",
            Sha256::digest(
                serde_json::to_vec(&plan).map_err(|_| "invalid actor instantiation encoding")?
            )
        );
        if let Some(binding) = self.party_bindings.get(&binding_id) {
            if binding.sequence == expected_sequence
                && binding.player == player
                && binding.party == party
                && binding.digest == digest
            {
                return Ok(party);
            }
            return Err("actor instantiation replay mismatch".into());
        }
        if expected_sequence != self.next_party_sequence {
            return Err("actor instantiation sequence is stale".into());
        }
        let next_sequence = self
            .next_party_sequence
            .checked_add(1)
            .ok_or("actor instantiation sequence exhausted")?;

        let mut slots = BTreeMap::new();
        for actor in &plan.actors {
            if !valid_id(&actor.slot) || slots.contains_key(&actor.slot) {
                return Err("invalid or duplicate actor slot".into());
            }
            let id = if actor.slot == plan.party_slot {
                party.clone()
            } else {
                format!("{party}.{}", actor.slot)
            };
            if !valid_id(&id) || self.known.contains(&id) {
                return Err("actor identity conflict".into());
            }
            slots.insert(actor.slot.clone(), id);
        }
        if slots.get(&plan.party_slot) != Some(&party) {
            return Err("actor plan lacks party slot".into());
        }
        let people = plan
            .people_slots
            .iter()
            .map(|slot| slots.get(slot).cloned().ok_or_else(|| "actor plan has unknown person slot".into()))
            .collect::<Result<Vec<_>>>()?;
        if people.iter().collect::<BTreeSet<_>>().len() != people.len() {
            return Err("actor plan has duplicate person slot".into());
        }

        let mut known = self.known.clone();
        known.extend(slots.values().cloned());
        let surface_placements = plan.actors.iter().filter_map(|actor| {
            actor.surface_column.map(|column| (slots[&actor.slot].clone(), column))
        }).collect::<Vec<_>>();
        if surface_placements.iter().map(|(_, column)| *column).collect::<BTreeSet<_>>().len() != surface_placements.len() {
            return Err("actor surface placements collide".into());
        }
        let mut prepared = Vec::with_capacity(plan.actors.len());
        for actor in &plan.actors {
            let template = self
                .registry
                .actors
                .get(&actor.definition)
                .cloned()
                .ok_or("unknown actor definition")?;
            if actor.arguments.len() != template.parameters.len()
                || template
                    .parameters
                    .iter()
                    .any(|parameter| !actor.arguments.contains_key(&parameter.name))
            {
                return Err("actor arguments differ from definition".into());
            }
            let mut arguments = BTreeMap::new();
            for parameter in &template.parameters {
                let argument = actor.arguments.get(&parameter.name).ok_or("missing actor argument")?;
                let value = Self::resolve_actor_argument(argument, &parameter.parameter_type, &slots, &self.known, &player)?;
                arguments.insert(parameter.name.clone(), value);
            }
            let components = template
                .components
                .iter()
                .map(|capability| {
                    let fields = capability
                        .fields
                        .iter()
                        .map(|(name, binding)| {
                            let value = match binding {
                                ActorFieldBinding::Value { value } => value.clone(),
                                ActorFieldBinding::Parameter { parameter } => arguments
                                    .get(parameter)
                                    .cloned()
                                    .ok_or("actor template parameter was not resolved")?,
                            };
                            Ok((name.clone(), value))
                        })
                        .collect::<Result<Record>>()?;
                    self.registry.validate(&capability.component, &fields, &known)?;
                    Ok((capability.component.clone(), fields))
                })
                .collect::<Result<BTreeMap<_, _>>>()?;
            prepared.push(PreparedActor {
                id: slots[&actor.slot].clone(),
                components,
            });
        }

        let party_record = prepared
            .iter()
            .find(|actor| actor.id == party)
            .ok_or("actor plan lacks party actor")?;
        if party_record
            .components
            .get("hive.party")
            .and_then(|record| record.get("ownerPlayer"))
            .and_then(Value::as_str)
            != Some(player.as_str())
        {
            return Err("actor party owner mismatch".into());
        }
        for person in &people {
            let actor = prepared.iter().find(|actor| &actor.id == person).ok_or("person actor missing")?;
            if actor.components.get("hive.party-member").and_then(|record| record.get("party")).and_then(Value::as_str) != Some(party.as_str()) {
                return Err("person actor is not a party member".into());
            }
        }
        for actor in &prepared {
            for component in ["hive.party-member", "hive.owned-by-party"] {
                if let Some(reference) = actor.components.get(component) {
                    if reference.get("party").and_then(Value::as_str) != Some(party.as_str()) {
                        return Err("actor party reference mismatch".into());
                    }
                }
            }
        }
        self.validate_actor_positions(&prepared)?;
        if self.ids.len().saturating_add(prepared.len()).saturating_add(plan.initial_materials.len()) > 16_384 {
            return Err("region entity capacity".into());
        }

        let mut handles: Vec<(String, Entity)> = Vec::with_capacity(prepared.len());
        for actor in prepared {
            let entity = self.ecs.spawn(ExternalId(actor.id.clone())).id();
            for (component, value) in actor.components {
                self.registry.insert(&mut self.ecs, entity, &component, &value)?;
            }
            handles.push((actor.id, entity));
        }
        for (id, entity) in handles {
            self.ids.insert(id.clone(), entity);
            self.known.insert(id.clone());
            self.refresh_planner_index(&id);
        }
        self.place_entities_on_initial_surfaces(&surface_placements)?;
        self.refresh_state_weight();
        for grant in plan.initial_materials {
            let container = Self::resolve_actor_reference(&grant.container, &slots, &known)?;
            if !self.material_catalog.contains(&grant.kind) {
                return Err("initial material is not in the catalog".into());
            }
            let lot = self.complete_material_output(MaterialOutputSpec {
                container,
                kind: grant.kind,
                quantity: grant.quantity,
                water_kg: None,
            })?;
            let lot_entity = self.entity(&lot)?;
            self.ecs.entity_mut(lot_entity).insert(OwnedByParty { party: party.clone() });
            if let Some(definition) = grant.actor_definition {
                let template = self.registry.actors.get(&definition).cloned().ok_or("unknown material actor definition")?;
                if template.components.iter().any(|component| component.component == "hive.lot" || component.component == "hive.lot-water") {
                    return Err("material actor cannot own quantity components".into());
                }
                if grant.arguments.len() != template.parameters.len()
                    || template.parameters.iter().any(|parameter| !grant.arguments.contains_key(&parameter.name))
                {
                    return Err("material actor arguments differ from definition".into());
                }
                let mut arguments = BTreeMap::new();
                for parameter in &template.parameters {
                    let value = Self::resolve_actor_argument(
                        &grant.arguments[&parameter.name],
                        &parameter.parameter_type,
                        &slots,
                        &self.known,
                        &player,
                    )?;
                    arguments.insert(parameter.name.clone(), value);
                }
                let entity = lot_entity;
                for capability in template.components {
                    let fields = capability.fields.into_iter().map(|(name, binding)| {
                        let value = match binding {
                            ActorFieldBinding::Value { value } => value,
                            ActorFieldBinding::Parameter { parameter } => arguments.get(&parameter).cloned().ok_or("material actor parameter was not resolved")?,
                        };
                        Ok((name, value))
                    }).collect::<Result<Record>>()?;
                    self.registry.validate(&capability.component, &fields, &self.known)?;
                    self.registry.insert(&mut self.ecs, entity, &capability.component, &fields)?;
                }
                self.refresh_planner_index(&lot);
            }
        }
        self.rebuild_physical_indexes(false)?;
        self.rebuild_relation_index()?;
        self.party_bindings.insert(PartyBinding {
            binding_id,
            sequence: expected_sequence,
            player,
            party: party.clone(),
            people,
            digest,
        })?;
        self.next_party_sequence = next_sequence;
        self.refresh_state_weight();
        Ok(party)
    }

    fn resolve_actor_argument(
        argument: &ActorArgument,
        parameter_type: &ActorParameterType,
        slots: &BTreeMap<String, String>,
        known: &BTreeSet<String>,
        joining_player: &str,
    ) -> Result<Value> {
        match (argument, parameter_type) {
            (ActorArgument::Value { value }, ActorParameterType::Number)
                if value.as_f64().is_some_and(f64::is_finite) => Ok(value.clone()),
            (ActorArgument::Value { value }, ActorParameterType::Boolean) if value.is_boolean() => Ok(value.clone()),
            (ActorArgument::Value { value }, ActorParameterType::String) if value.is_string() => Ok(value.clone()),
            (ActorArgument::Value { value }, ActorParameterType::NullableEntity) if value.is_null() => Ok(value.clone()),
            (ActorArgument::JoiningPlayer, ActorParameterType::String) => Ok(Value::String(joining_player.into())),
            (ActorArgument::Spawned { .. } | ActorArgument::Existing { .. }, ActorParameterType::ActorReference | ActorParameterType::Entity | ActorParameterType::NullableEntity) => {
                Ok(Value::String(Self::resolve_actor_reference(argument, slots, known)?))
            }
            _ => Err("actor argument type mismatch".into()),
        }
    }

    fn resolve_actor_reference(
        argument: &ActorArgument,
        slots: &BTreeMap<String, String>,
        known: &BTreeSet<String>,
    ) -> Result<String> {
        match argument {
            ActorArgument::Spawned { slot } => slots.get(slot).cloned().ok_or("unknown actor slot".into()),
            ActorArgument::Existing { id } if valid_id(id) && known.contains(id) => Ok(id.clone()),
            _ => Err("actor argument is not a valid reference".into()),
        }
    }

    fn validate_actor_positions(&mut self, actors: &[PreparedActor]) -> Result<()> {
        let mut positions = Vec::new();
        for actor in actors {
            let Some(position) = actor.components.get("hive.position") else { continue; };
            let x = position.get("x").and_then(Value::as_f64).ok_or("invalid actor position")?;
            let z = position.get("z").and_then(Value::as_f64).ok_or("invalid actor position")?;
            if positions.iter().any(|(left, right): &(f64, f64)| (left - x).abs() < 0.75 && (right - z).abs() < 0.75) {
                return Err("actor positions collide".into());
            }
            for existing in self.ecs.query::<&Position>().iter(&self.ecs) {
                if (existing.x - x).abs() < 0.75 && (existing.z - z).abs() < 0.75 {
                    return Err("actor position occupied".into());
                }
            }
            positions.push((x, z));
        }
        Ok(())
    }
}
