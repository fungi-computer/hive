//! First native supply consumer. Domain facts remain in `Kernel`; this module
//! owns only requirement expansion, bounded matching, and admission.
use super::Kernel;
use crate::components::*;
use super::route_query::SearchOutcome;
use crate::work_planner::WorkParticipation;
use std::collections::BTreeMap;

impl Kernel {
    pub(crate) fn plan_construction_supply(&mut self, site: &str, party: &str) -> Result<Vec<String>> {
        self.ensure_ready()?;
        let site_entity = self.entity(site)?;
        let state = self.ecs.get::<ConstructionSite>(site_entity).cloned().ok_or("not a construction site")?;
        if state.phase != ConstructionPhase::Planned { return Err("construction supply requires a planned site".into()); }
        if self.ecs.get::<OwnedByParty>(site_entity).map(|owner| owner.party.as_str()) != Some(party) { return Err("construction supply site is outside party".into()); }
        self.ecs.get::<Container>(site_entity).ok_or("construction supply site is not a container")?;
        self.ecs.get::<Position>(site_entity).ok_or("construction supply requires a bound site contact")?;
        let definition = self.environment.as_ref().ok_or("construction needs environment")?.structures.get(&state.catalog).ok_or("construction catalog binding is missing")?.clone();
        let mut roles = definition.materials.iter().filter_map(|(kind, required)| {
            let present = self.ids.values().filter_map(|entity| { let lot = self.ecs.get::<Lot>(*entity)?; (lot.container == site && lot.kind == *kind && !self.ecs.get::<LotWater>(*entity).is_some_and(|water| water.water_kg > 0.0)).then_some(lot.quantity) }).sum::<u32>();
            let incoming = self.supply_allocations().filter(|(_, allocation)| allocation.requirement_owner == site && allocation.requirement_generation == 1 && allocation.material == *kind && allocation.destination == site && allocation.state == SupplyAllocationState::Reserved).map(|(_, allocation)| allocation.quantity).sum::<u32>();
            let missing = required.saturating_sub(present.saturating_add(incoming));
            (missing > 0).then_some((kind.clone(), missing))
        });
        let Some((material, missing)) = roles.next() else { return Ok(Vec::new()); };
        // The first bounded window admits each declared role in catalog order;
        // each portion is capped at three units and is independently reserved.
        let sources: Vec<(String, Position, u32)> = self.ids.iter().filter_map(|(id, entity)| {
            let lot = self.ecs.get::<Lot>(*entity)?;
            if lot.kind != material || self.ecs.get::<LotWater>(*entity).is_some_and(|water| water.water_kg > 0.0) { return None; }
            let container = self.entity(&lot.container).ok()?;
            if self.ecs.get::<OwnedByParty>(container).map(|owner| owner.party.as_str()) != Some(party) { return None; }
            if self.ecs.get::<GroundStock>(container).is_none() || self.ecs.get::<SealedContainer>(container).is_some() { return None; }
            let position = *self.ecs.get::<Position>(container)?;
            Some((id.clone(), position, lot.quantity.saturating_sub(crate::supply_allocation::reserved_source(self, id, None))))
        }).collect();
        let mut slots = Vec::new();
        let mut remaining = missing;
        let mut prospective = BTreeMap::<String, u32>::new();
        while remaining > 0 {
            let amount = remaining.min(3);
            let Some((lot, position, free)) = sources.iter().find(|(lot, _, free)| free.saturating_sub(*prospective.get(lot).unwrap_or(&0)) >= amount) else { return Err("construction supply is short of free material".into()); };
            *prospective.entry(lot.clone()).or_default() += amount;
            slots.push((lot.clone(), *position, amount));
            remaining -= amount;
        }
        let workers: Vec<(String, Position)> = self.ids.iter().filter_map(|(id, entity)| {
            let member = self.ecs.get::<PartyMember>(*entity)?;
            (member.party == party && self.ecs.get::<WorkParticipation>(*entity).is_some_and(|p| p.automatic) && self.ecs.get::<Container>(*entity).is_some_and(|c| c.capacity > 0) && self.ecs.get::<Body>(*entity).is_some_and(|b| b.speed.is_finite() && b.speed > 0.0) && self.ecs.get::<Traversal>(*entity).is_some() && self.ecs.get::<Position>(*entity).is_some() && !self.attempts_by_worker.contains_key(id) && self.ecs.get::<Destination>(*entity).is_none() && !self.direct.contains_key(entity) && self.ecs.get::<Support>(*entity).is_none() && self.ecs.get::<ExcavationWork>(*entity).is_none()).then_some((id.clone(), *self.ecs.get::<Position>(*entity).unwrap()))
        }).collect();
        if workers.len() < slots.len() { return Err("construction supply has too few eligible workers".into()); }
        let window = crate::work_candidates::PlanningWindow { workers: workers.iter().map(|(id, _)| crate::work_candidates::WorkerCandidate { id: id.clone(), party: party.into() }).collect(), tasks: slots.iter().enumerate().map(|(index, _)| crate::work_candidates::TaskCandidate { id: format!("native-supply-{site}-{index}"), party: party.into(), priority: 0, last_considered: 0, due_tick: 0 }).collect() };
        let candidates = workers.iter().flat_map(|(worker, position)| slots.iter().enumerate().map(move |(index, (_, source, _))| crate::assign::Candidate { worker: worker.clone(), task: format!("native-supply-{site}-{index}"), cost: ((position.x-source.x).powi(2)+(position.y-source.y).powi(2)+(position.z-source.z).powi(2)).sqrt() })).collect::<Vec<_>>();
        let task_slots: BTreeMap<String, usize> = slots.iter().enumerate().map(|(index, _)| (format!("native-supply-{site}-{index}"), index)).collect();
        let planned = crate::work_candidates::assign_verified(&window, &candidates, |candidate| {
            let worker = self.entity(&candidate.worker)?;
            let position = *self.ecs.get::<Position>(worker).ok_or("native supply worker has no position")?;
            let index = *task_slots.get(&candidate.task).ok_or("native supply task identity is invalid")?;
            let (_, source, _) = slots.get(index).ok_or("native supply task slot is missing")?;
            match super::route_query::classify_route(self.route_for(worker, position, &Point { x: source.x, y: source.y, z: source.z, frame: None }))? {
                SearchOutcome::Reachable(route) => { let cost = crate::terrain_route::waypoint_cost_micrometres(std::iter::once(crate::navigation::point(position)).chain(route.points.iter().cloned()).collect::<Vec<_>>())? as f64 / 1_000_000.0; Ok(SearchOutcome::Reachable((cost, route))) }
                SearchOutcome::NoPath(error) => Ok(SearchOutcome::NoPath(error)),
                SearchOutcome::Deferred(error) => Ok(SearchOutcome::Deferred(error)),
            }
        }).map_err(|error| format!("native construction assignment failed: {error:?}"))?;
        let mut admitted = Vec::new();
        for assignment in planned.assignments {
            let index = *task_slots.get(&assignment.task).ok_or("native supply task identity is invalid")?;
            let (lot, source, quantity) = slots.get(index).ok_or("native supply task slot is missing")?;
            let allocation = self.reserve_supply_allocation(site.into(), material.clone(), 1, party.into(), material.clone(), lot.clone(), site.into(), *quantity)?;
            let route = assignment.witness;
            if let Err(error) = self.begin_work_attempt_with_prepared_route(allocation.clone(), assignment.worker, party.into(), Point { x: source.x, y: source.y, z: source.z, frame: None }, route) {
                self.cancel_supply_allocation(&allocation)?;
                return Err(error);
            }
            admitted.push(allocation);
        }
        self.refresh_state_weight();
        Ok(admitted)
    }
}
