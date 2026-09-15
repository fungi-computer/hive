//! Atomic admission of matched finite-supply work.
//!
//! The planner may propose a batch, but this owner validates the complete set
//! against current custody, capacity, worker eligibility, and identities before
//! publishing any allocation, route, or WorkAttempt.
use super::{Kernel, PreparedRoute, STATE_BYTES};
use crate::components::*;
use crate::work_planner::WorkParticipation;
use std::collections::BTreeMap;

pub(super) struct SupplyAdmissionRequest {
    pub(super) requirement_owner: String,
    pub(super) requirement_role: String,
    pub(super) requirement_generation: u64,
    pub(super) party: String,
    pub(super) material: String,
    pub(super) portion: String,
    pub(super) destination_container: String,
    pub(super) quantity: u32,
    pub(super) worker: String,
    pub(super) route_destination: Point,
    pub(super) route: PreparedRoute,
}

struct PreparedSupplyAdmission {
    id: String,
    allocation: SupplyAllocation,
    worker: String,
    worker_entity: bevy_ecs::prelude::Entity,
    worker_position: Position,
    route_destination: Point,
    route: PreparedRoute,
    key: crate::work_attempt::AttemptKey,
}

impl Kernel {
    /// Validate the complete matched batch before publishing any allocation,
    /// route, or WorkAttempt. Once preparation succeeds, publication contains
    /// no fallible step and therefore cannot expose a partial assignment set.
    pub(super) fn admit_supply_assignments(
        &mut self,
        requests: Vec<SupplyAdmissionRequest>,
    ) -> Result<Vec<String>> {
        if requests.is_empty() {
            return Ok(Vec::new());
        }
        if self.ids.len().saturating_add(requests.len()) > 16_384 {
            return Err("region entity capacity".into());
        }
        let sequence_count = u64::try_from(requests.len())
            .map_err(|_| "supply admission batch is too large")?
            .checked_mul(2)
            .ok_or("supply admission generation exhausted")?;
        let next_generation = self
            .next_work_generation
            .checked_add(sequence_count)
            .ok_or("supply admission generation exhausted")?;
        let mut source_promises = BTreeMap::<String, u32>::new();
        let mut destination_promises = BTreeMap::<String, u32>::new();
        let mut selected_workers = std::collections::BTreeSet::new();
        let mut prepared = Vec::with_capacity(requests.len());

        for (index, request) in requests.into_iter().enumerate() {
            if !valid_id(&request.requirement_owner)
                || !valid_id(&request.requirement_role)
                || request.requirement_generation == 0
                || !valid_id(&request.party)
                || !valid_id(&request.material)
                || !valid_id(&request.portion)
                || !valid_id(&request.destination_container)
                || !valid_id(&request.worker)
                || request.quantity == 0
            {
                return Err("invalid supply admission request".into());
            }
            self.entity(&request.requirement_owner)?;
            let party = self.entity(&request.party)?;
            if self.ecs.get::<Party>(party).is_none() {
                return Err("supply admission party is not a party".into());
            }
            let source = self.entity(&request.portion)?;
            let lot = self
                .ecs
                .get::<Lot>(source)
                .ok_or("supply admission portion is missing")?;
            if lot.kind != request.material {
                return Err("supply admission portion material mismatch".into());
            }
            let source_container = self.entity(&lot.container)?;
            let destination = self.entity(&request.destination_container)?;
            let capacity = self
                .ecs
                .get::<Container>(destination)
                .ok_or("supply admission destination is not a container")?
                .capacity;
            if self
                .ecs
                .get::<OwnedByParty>(source_container)
                .map(|owner| owner.party.as_str())
                != Some(request.party.as_str())
                || self
                    .ecs
                    .get::<OwnedByParty>(destination)
                    .map(|owner| owner.party.as_str())
                    != Some(request.party.as_str())
                || self
                    .ecs
                    .get::<OwnedByParty>(source)
                    .map(|owner| owner.party.as_str())
                    != Some(request.party.as_str())
            {
                return Err("supply admission party ownership mismatch".into());
            }
            let available = lot
                .quantity
                .saturating_sub(crate::supply_allocation::reserved_source(
                    self,
                    &request.portion,
                    None,
                ))
                .saturating_sub(
                    source_promises
                        .get(&request.portion)
                        .copied()
                        .unwrap_or(0),
                );
            if request.quantity > available {
                return Err("supply admission source portion is overbooked".into());
            }
            let occupied = self.occupied_volume(&request.destination_container)?
                .saturating_add(crate::supply_allocation::reserved_destination_volume(self, &request.destination_container, None)?)
                .saturating_add(
                    self.material_volume(&request.material, destination_promises.get(&request.destination_container).copied().unwrap_or(0))?,
                );
            if occupied.saturating_add(self.material_volume(&request.material, request.quantity)?) > u64::from(capacity) {
                return Err("supply admission destination capacity is overbooked".into());
            }
            let worker = self.entity(&request.worker)?;
            let worker_position = *self
                .ecs
                .get::<Position>(worker)
                .ok_or("supply admission worker has no position")?;
            let worker_container = self
                .ecs
                .get::<Container>(worker)
                .ok_or("supply admission worker cannot carry material")?;
            let free_capacity = u64::from(worker_container.capacity).saturating_sub(self.occupied_volume(&request.worker)?);
            let request_volume = self.material_volume(&request.material, request.quantity)?;
            if self
                .ecs
                .get::<PartyMember>(worker)
                .map(|member| member.party.as_str())
                != Some(request.party.as_str())
                || self
                    .ecs
                    .get::<Body>(worker)
                    .is_none_or(|body| !body.speed.is_finite() || body.speed <= 0.0)
                || self.ecs.get::<Traversal>(worker).is_none()
                || self
                    .ecs
                    .get::<WorkParticipation>(worker)
                    .is_none_or(|participation| !participation.automatic)
                || request_volume > free_capacity
                || self.attempts_by_worker.contains_key(&request.worker)
                || self.ecs.get::<Destination>(worker).is_some()
                || self.direct.contains_key(&worker)
                || self.ecs.get::<Support>(worker).is_some()
                || self.ecs.get::<ExcavationWork>(worker).is_some()
                || !selected_workers.insert(request.worker.clone())
            {
                return Err("supply admission worker is unavailable".into());
            }
            let offset = u64::try_from(index)
                .map_err(|_| "supply admission batch is too large")?
                .checked_mul(2)
                .ok_or("supply admission generation exhausted")?;
            let allocation_sequence = self
                .next_work_generation
                .checked_add(offset)
                .ok_or("supply admission generation exhausted")?;
            let id = format!("allocation.{allocation_sequence}");
            if self.known.contains(&id) {
                return Err("supply allocation identity collides with live state".into());
            }
            let key = crate::work_attempt::AttemptKey {
                task: id.clone(),
                generation: allocation_sequence
                    .checked_add(1)
                    .ok_or("supply admission generation exhausted")?,
            };
            *source_promises.entry(request.portion.clone()).or_default() += request.quantity;
            *destination_promises
                .entry(request.destination_container.clone())
                .or_default() += request.quantity;
            prepared.push(PreparedSupplyAdmission {
                id,
                allocation: SupplyAllocation {
                    requirement_owner: request.requirement_owner,
                    requirement_role: request.requirement_role,
                    requirement_generation: request.requirement_generation,
                    party: request.party,
                    material: request.material,
                    portion: request.portion,
                    destination: request.destination_container,
                    quantity: request.quantity,
                    state: SupplyAllocationState::Reserved,
                },
                worker: request.worker,
                worker_entity: worker,
                worker_position,
                route_destination: request.route_destination,
                route: request.route,
                key,
            });
        }

        let mut projected_weight = self.state_weight;
        let mut projected_routes = self
            .routes
            .iter()
            .map(|(entity, path)| {
                (
                    *entity,
                    self.route_snapshot_for(*entity, path, self.terrain_routes.get(entity)),
                )
            })
            .collect::<BTreeMap<_, _>>();
        for item in &prepared {
            let owner = OwnedByParty {
                party: item.allocation.party.clone(),
            };
            let destination = Destination {
                x: item.route_destination.x,
                y: item.route_destination.y,
                z: item.route_destination.z,
                facing: item.worker_position.facing,
                frame: item.route_destination.frame.clone(),
            };
            projected_weight = projected_weight
                .saturating_add(item.id.len())
                .saturating_add(128)
                .saturating_add(
                    self.registry
                        .weight("hive.owned-by-party", &record(&owner)),
                )
                .saturating_add(
                    self.registry
                        .weight("hive.supply-allocation", &record(&item.allocation)),
                )
                .saturating_add(
                    self.registry
                        .weight("hive.destination", &record(&destination)),
                );
            projected_routes.insert(
                item.worker_entity,
                self.route_snapshot_for(
                    item.worker_entity,
                    &item.route.points,
                    item.route.terrain.as_ref(),
                ),
            );
        }
        let mut projected_routes = projected_routes.into_values().collect::<Vec<_>>();
        projected_routes.sort_by(|a, b| a.entity.cmp(&b.entity));
        let route_bytes = serde_json::to_vec(&projected_routes)
            .map_err(|error| error.to_string())?
            .len();
        let mut direct = self.direct.values().cloned().collect::<Vec<_>>();
        direct.sort_by(|a, b| a.entity.cmp(&b.entity));
        let direct_bytes = serde_json::to_vec(&direct)
            .map_err(|error| error.to_string())?
            .len();
        if projected_weight
            .saturating_add(route_bytes)
            .saturating_add(direct_bytes)
            > STATE_BYTES
        {
            return Err("supply admission exceeds canonical state capacity".into());
        }

        self.next_work_generation = next_generation;
        let mut admitted = Vec::with_capacity(prepared.len());
        for item in prepared {
            let operation = crate::work_attempt::OperationKey {
                attempt: item.key.clone(),
                sequence: 1,
            };
            let party = item.allocation.party.clone();
            let entity = self
                .ecs
                .spawn((
                    ExternalId(item.id.clone()),
                    OwnedByParty {
                        party: party.clone(),
                    },
                    item.allocation,
                    crate::work_attempt::WorkAttempt {
                        key: item.key.clone(),
                        worker: item.worker.clone(),
                        party,
                        phase: crate::work_attempt::AttemptPhase::Executing {
                            operation,
                            activity: crate::work_attempt::ActivityRef::Route {
                                destination: item.route_destination.clone(),
                            },
                        },
                    },
                ))
                .id();
            self.ids.insert(item.id.clone(), entity);
            self.known.insert(item.id.clone());
            self.ecs.entity_mut(item.worker_entity).insert(Destination {
                x: item.route_destination.x,
                y: item.route_destination.y,
                z: item.route_destination.z,
                facing: item.worker_position.facing,
                frame: item.route_destination.frame,
            });
            self.install_route(item.worker_entity, item.route);
            self.work_attempts.insert(item.id.clone(), entity);
            self.attempts_by_worker
                .insert(item.worker.clone(), item.key);
            admitted.push(item.id);
        }
        self.refresh_state_weight();
        Ok(admitted)
    }
}
