//! Native timed excavation. Requests select intent; only advancement earns time.
use super::*;
use crate::{generation::Cell, terrain_water::ExcavationResult};
use crate::work_planner::WorkParticipation;

enum TargetOccupancy {
    Clear,
    MoveWorker(String),
    Blocked,
}

pub(super) enum ExcavationAdmission {
    Started,
    WaitingForClearTarget,
}

fn cell(work: ExcavationWork) -> Cell {
    Cell { x: i64::from(work.x), y: work.y, z: i64::from(work.z) }
}
fn same_target(a: ExcavationWork, b: ExcavationWork) -> bool {
    a.x == b.x && a.y == b.y && a.z == b.z && a.expected == b.expected && a.replacement == b.replacement
}
/// The same contact rule filters prospective approaches and earns native work.
pub(super) fn within_reach(position: [f64; 3], target: Cell, spacing: [f64; 3]) -> bool {
    let at = [target.x as f64 * spacing[0], f64::from(target.y) * spacing[1], target.z as f64 * spacing[2]];
    position.into_iter().zip(at).map(|(a, b)| (a - b).powi(2)).sum::<f64>() <= 1.5_f64.powi(2)
}
impl Kernel {
    fn target_occupancy(&mut self, target: Cell) -> Result<TargetOccupancy> {
        let spacing = self.environment.as_ref().ok_or("excavation needs environment")?.world.cell_spacing_m();
        let mut worker = None;
        let mut query = self.ecs.query::<(Entity, &ExternalId, &Body, &Position)>();
        for (entity, id, _, position) in query.iter(&self.ecs) {
            if self.ecs.get::<Support>(entity).is_some() { continue; }
            let values = [position.x / spacing[0], position.y / spacing[1] - 0.5, position.z / spacing[2]];
            if !values.iter().all(|value| value.is_finite()) { return Err("invalid standing terrain pose".into()); }
            let standing = Cell { x: values[0].round() as i64, y: values[1].round() as i32, z: values[2].round() as i64 };
            if standing != target { continue; }
            let eligible_worker = self.ecs.get::<PartyMember>(entity).is_some()
                && self.ecs.get::<Traversal>(entity).is_some()
                && self.ecs.get::<WorkParticipation>(entity).is_some_and(|participation| participation.automatic);
            if !eligible_worker || worker.is_some() { return Ok(TargetOccupancy::Blocked); }
            worker = Some(id.0.clone());
        }
        Ok(worker.map_or(TargetOccupancy::Clear, TargetOccupancy::MoveWorker))
    }

    fn excavation_contacts(&self, order: &ExcavationOrder, designated: &BTreeSet<(i32, i32, i32)>) -> Result<Vec<Point>> {
        let spacing = self.environment.as_ref().ok_or("excavation needs environment")?.world.cell_spacing_m();
        let mut contacts = Vec::new();
        for (dx, dz) in [(-1_i32, 0_i32), (1, 0), (0, -1), (0, 1)] {
            for dy in -2_i32..=1_i32 {
                let x = order.cell_x.checked_add(dx).ok_or("excavation contact overflow")?;
                let y = order.cell_y.checked_add(dy).ok_or("excavation contact overflow")?;
                let z = order.cell_z.checked_add(dz).ok_or("excavation contact overflow")?;
                if designated.contains(&(x, y, z)) { continue; }
                contacts.push(Point { x: f64::from(x) * spacing[0], y: (f64::from(y) + 0.5) * spacing[1], z: f64::from(z) * spacing[2], frame: None });
            }
        }
        Ok(contacts)
    }

    /// Contribute a designated dig to the shared native labor planner.  A
    /// captured material mismatch is structurally stale and is retired; route
    /// and occupancy failures remain ordinary waiting outcomes.
    pub(super) fn excavation_work_requirement(
        &mut self,
        task: &str,
        party: &str,
        designated: &BTreeSet<(i32, i32, i32)>,
    ) -> Result<Option<crate::work_planner::WorkRequirement>> {
        self.ensure_ready()?;
        let entity = self.entity(task)?;
        let Some(order) = self.ecs.get::<ExcavationOrder>(entity).cloned() else { return Ok(None); };
        let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(entity).cloned() else { return Ok(None); };
        let Some(schedule) = self.ecs.get::<crate::work_planner::WorkSchedule>(entity).cloned() else { return Ok(None); };
        if !policy.enabled || policy.party != party || order.status == "cancelling" || self.work_attempts.contains_key(task) { return Ok(None); }
        if self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str()) != Some(party) { return Ok(None); }
        let target = Cell { x: i64::from(order.cell_x), y: order.cell_y, z: i64::from(order.cell_z) };
        let material = self.environment.as_mut().ok_or("excavation needs environment")?.world.material(target)?;
        let expected = order.expected;
        let required_worker = match self.target_occupancy(target)? {
            TargetOccupancy::Clear => None,
            TargetOccupancy::MoveWorker(worker) => Some(worker),
            TargetOccupancy::Blocked => {
                if order.status != "blocked" || order.reason != "Someone is standing on this tile" {
                    self.ecs.entity_mut(entity).insert(ExcavationOrder { status: "blocked".into(), reason: "Someone is standing on this tile".into(), ..order });
                    self.refresh_planner_index(task);
                }
                return Ok(None);
            }
        };
        if order.status == "blocked" || !order.reason.is_empty() {
            self.ecs.entity_mut(entity).insert(ExcavationOrder {
                status: "queued".into(),
                reason: String::new(),
                ..order.clone()
            });
            self.refresh_planner_index(task);
        }
        let rule_exists = self.environment.as_ref().is_some_and(|environment| environment.excavation_rules.contains_key(&expected));
        let open_replacement = self.environment.as_ref().is_some_and(|environment| environment.world.is_open_material(0));
        if material == 0 || material != expected || !rule_exists || !open_replacement {
            // A stale designation has no valid continuation.  It has no live
            // attempt at this point, so retire the intent in this same bounded
            // planner pass instead of leaving a dead blocked projection.
            self.remove_excavation_order(task)?;
            return Ok(None);
        }
        let contacts = self.excavation_contacts(&order, designated)?;
        if contacts.is_empty() { return Ok(None); }
        Ok(Some(crate::work_planner::WorkRequirement {
            task: task.to_owned(), party: party.to_owned(), priority: policy.priority, schedule,
            contacts, required_worker, free_capacity_required: 0,
            operation: crate::work_planner::WorkOperation::Excavation { cell: [order.cell_x, order.cell_y, order.cell_z], expected, replacement: 0 },
        }))
    }

    pub(super) fn plan_excavation(&mut self, party: String, prefix: String, start: [i32; 3], end: [i32; 3]) -> Result<()> {
        if !valid_id(&party) || !valid_id(&prefix) || prefix.len() > 96 { return Err("invalid excavation designation identity".into()); }
        let party_entity = self.entity(&party)?;
        if self.ecs.get::<Party>(party_entity).is_none() { return Err("excavation designation party is not a party".into()); }
        if start[1] != end[1] { return Err("excavation area must stay on one level".into()); }
        let min_x = i64::from(start[0].min(end[0]));
        let max_x = i64::from(start[0].max(end[0]));
        let min_z = i64::from(start[2].min(end[2]));
        let max_z = i64::from(start[2].max(end[2]));
        let width = max_x.checked_sub(min_x).and_then(|value| value.checked_add(1)).ok_or("excavation area is too large")?;
        let depth = max_z.checked_sub(min_z).and_then(|value| value.checked_add(1)).ok_or("excavation area is too large")?;
        let count = width.checked_mul(depth).ok_or("excavation area is too large")?;
        if !(1..=256).contains(&count) { return Err("excavation area exceeds 256 cells".into()); }
        let environment = self.environment.as_mut().ok_or("excavation designation needs environment")?;
        let existing_cells = self.ids.iter().filter_map(|(id, entity)| {
            self.ecs.get::<ExcavationOrder>(*entity).map(|order| {
                ((order.cell_x, order.cell_y, order.cell_z), id.clone())
            })
        }).collect::<BTreeMap<_, _>>();
        let mut prepared = Vec::new();
        let mut replayed = 0usize;
        for x in min_x..=max_x { for z in min_z..=max_z {
            let cell = Cell { x, y: start[1], z };
            let material = environment.world.material(cell)?;
            if material == 0 || !environment.excavation_rules.contains_key(&material) || !environment.world.is_open_material(0) { continue; }
            let x = i32::try_from(x).map_err(|_| "excavation coordinate is out of range")?;
            let z = i32::try_from(z).map_err(|_| "excavation coordinate is out of range")?;
            let id = format!("{prefix}.{x}.{}.{}", start[1], z);
            if !valid_id(&id) || id.len() > 128 { return Err("excavation designation identity is too long".into()); }
            if let Some(existing) = existing_cells.get(&(x, start[1], z))
                && existing != &id
            {
                return Err("excavation cell is already designated".into());
            }
            if let Some(entity) = self.ids.get(&id).copied() {
            if self.ecs.get::<ExcavationOrder>(entity).is_some_and(|order| order.cell_x == x && order.cell_y == start[1] && order.cell_z == z)
                    && self.ecs.get::<OwnedByParty>(entity).is_some_and(|owner| owner.party == party) { replayed += 1; continue; }
                return Err("excavation designation identity is already in use".into());
            }
            prepared.push((id, ExcavationOrder { cell_x: x, cell_y: start[1], cell_z: z, expected: material, status: "queued".into(), reason: String::new() }));
        }}
        let existing_orders = self.ids.values().filter(|entity| self.ecs.get::<ExcavationOrder>(**entity).is_some()).count();
        if existing_orders.saturating_add(prepared.len()) > 256 { return Err("Finish or cancel existing dig orders before adding more than 256".into()); }
        if prepared.is_empty() && replayed == 0 { return Err("excavation area has no valid diggable cells".into()); }
        let added_weight = prepared.iter().map(|(id, order)| id.len() + 128 + self.registry.weight("hive.excavation-order", &record(order)) + self.registry.weight("hive.owned-by-party", &record(&OwnedByParty { party: party.clone() })) + self.registry.weight("hive.work-policy", &record(&crate::work_planner::WorkPolicy { party: party.clone(), priority: 0, enabled: true })) + self.registry.weight("hive.work-schedule", &record(&crate::work_planner::WorkSchedule { next_review_tick: self.revision, last_considered: self.revision }))).sum::<usize>();
        if self.state_weight.saturating_add(added_weight) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        for (id, order) in prepared {
            let entity = self.ecs.spawn((ExternalId(id.clone()), order, OwnedByParty { party: party.clone() }, crate::work_planner::WorkPolicy { party: party.clone(), priority: 0, enabled: true }, crate::work_planner::WorkSchedule { next_review_tick: self.revision, last_considered: self.revision })).id();
            self.ids.insert(id.clone(), entity);
            self.known.insert(id.clone());
            self.refresh_planner_index(&id);
        }
        self.refresh_state_weight();
        Ok(())
    }

    pub(super) fn cancel_excavation(&mut self, party: String, area: Option<([i32; 3], [i32; 3])>, workers: Vec<String>) -> Result<()> {
        if !valid_id(&party) || workers.len() > 32 || workers.iter().any(|worker| !valid_id(worker)) { return Err("invalid excavation cancellation".into()); }
        let party_entity = self.entity(&party)?;
        if self.ecs.get::<Party>(party_entity).is_none() { return Err("excavation cancellation party is not a party".into()); }
        if let Some((start, end)) = area && start[1] != end[1] { return Err("excavation area must stay on one level".into()); }
        let worker_set = workers.into_iter().collect::<BTreeSet<_>>();
        let selected: Vec<String> = self.ids.iter().filter_map(|(id, entity)| {
            let order = self.ecs.get::<ExcavationOrder>(*entity)?;
            (self.ecs.get::<OwnedByParty>(*entity).is_some_and(|owner| owner.party == party)
                && (area.is_some_and(|(start, end)| order.cell_x >= start[0].min(end[0]) && order.cell_x <= start[0].max(end[0]) && order.cell_y == start[1] && order.cell_z >= start[2].min(end[2]) && order.cell_z <= start[2].max(end[2]))
                    || self.work_attempt(id).is_some_and(|attempt| worker_set.contains(&attempt.worker)))).then_some(id.clone())
        }).collect();
        if selected.is_empty() { return Err("no matching excavation order".into()); }
        for id in selected {
            let entity = self.entity(&id)?;
            let mut order = self.ecs.get::<ExcavationOrder>(entity).cloned().ok_or("excavation order disappeared")?;
            order.status = "cancelling".into(); order.reason = "Cancelled".into();
            self.ecs.entity_mut(entity).insert(order);
            let attempt = self.work_attempt(&id).cloned();
            match attempt.map(|attempt| (attempt.key.generation, attempt.phase, attempt.worker)) {
                Some((generation, AttemptPhase::Executing { operation, .. }, _)) => {
                    // Keep the cancelling order enabled and due now so the
                    // planner can acknowledge the exact interrupted attempt
                    // before removing its physical order projection.
                    if let Some(schedule) = self.ecs.get::<crate::work_planner::WorkSchedule>(entity).cloned() {
                        self.ecs.entity_mut(entity).insert(crate::work_planner::WorkSchedule { next_review_tick: self.revision, ..schedule });
                    }
                    self.refresh_planner_index(&id);
                    self.interrupt_work_attempt(id, generation, operation.sequence, InterruptCause::Cancelled)?
                }
                Some((generation, AttemptPhase::Outcome { operation, .. }, _)) => { self.acknowledge_work_attempt(id.clone(), generation, operation.sequence)?; self.remove_excavation_order(&id)?; }
                None => {
                    if let Some(policy) = self.ecs.get::<crate::work_planner::WorkPolicy>(entity).cloned() {
                        self.ecs.entity_mut(entity).insert(crate::work_planner::WorkPolicy { enabled: false, ..policy });
                    }
                    self.remove_excavation_order(&id)?
                }
                Some((_, AttemptPhase::Ready, _)) | Some((_, AttemptPhase::Settling { .. }, _)) => return Err("excavation attempt is not cancellable".into()),
            }
        }
        Ok(())
    }

    pub(super) fn remove_excavation_order(&mut self, id: &str) -> Result<()> {
        let entity = self.entity(id)?;
        self.ecs.entity_mut(entity).remove::<ExcavationWork>();
        self.ids.remove(id); self.known.remove(id); self.ecs.despawn(entity);
        self.refresh_planner_index(id);
        self.refresh_state_weight();
        Ok(())
    }

    fn terrain_support_occupied(&mut self, target: Cell, working_actor: Option<Entity>) -> Result<bool> {
        let spacing = self.environment.as_ref().ok_or("world has no environment")?.world.cell_spacing_m();
        let mut query = self.ecs.query::<(Entity, &Body, &Position)>();
        for (entity, _, position) in query.iter(&self.ecs) {
            // The worker assigned to this excavation has already been routed
            // to an admitted contact. Its own support cannot obstruct the
            // work it owns; every other body remains a physical blocker.
            if Some(entity) == working_actor { continue; }
            if self.ecs.get::<Support>(entity).is_some() { continue; }
            let values = [position.x / spacing[0], position.y / spacing[1] - 0.5, position.z / spacing[2]];
            if !values.iter().all(|value| value.is_finite()) { return Err("invalid standing terrain pose".into()); }
            let cell = Cell { x: values[0].round() as i64, y: values[1].round() as i32, z: values[2].round() as i64 };
            if cell == target { return Ok(true); }
        }
        Ok(false)
    }

    fn terrain_support_reserved(&self, target: Cell) -> bool {
        // A moving actor owns its admitted contact path until it arrives or
        // cancels. Excavation may be admitted while that path is in use, but
        // it earns no work and cannot publish a terrain mutation until the
        // route releases the support.
        self.terrain_routes
            .values()
            .any(|route| !route.suspended && route.path.contains(&target))
    }

    pub(super) fn request_excavation_for_attempt(&mut self, id: &str, work: ExcavationWork) -> Result<ExcavationAdmission> {
        let task_entity = self.entity(id)?;
        let attempt = self.ecs.get::<WorkAttempt>(task_entity).ok_or("excavation requires a work attempt")?;
        let actor = self.entity(&attempt.worker)?;
        if self.ecs.get::<Body>(actor).is_none() { return Err("excavation needs a worker body".into()); }
        if self.ecs.get::<Support>(actor).is_some() || self.direct.contains_key(&actor) { return Err("excavation requires terrain contact".into()); }
        if self.terrain_support_occupied(cell(work), Some(actor))? { return Ok(ExcavationAdmission::WaitingForClearTarget); }
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        if !environment.excavation_rules.contains_key(&work.expected) || !environment.world.is_open_material(work.replacement) || work.expected == work.replacement || environment.world.material(cell(work))? != work.expected { return Err("excavation target is unavailable".into()); }
        if let Some(existing) = self.ecs.get::<ExcavationWork>(task_entity) { return if same_target(*existing, work) { Ok(ExcavationAdmission::Started) } else { Err("task already has different excavation work".into()) }; }
        let added = self.registry.weight("hive.excavation-work", &record(&work));
        if self.state_weight.saturating_add(added) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        self.ecs.entity_mut(task_entity).insert(work);
        self.state_weight += added;
        Ok(ExcavationAdmission::Started)
    }

    pub(super) fn validate_excavation_work(&mut self) -> Result<()> {
        let mut query = self.ecs.query::<(Entity, &ExternalId, &ExcavationWork)>();
        let saved: Vec<_> = query.iter(&self.ecs).map(|(entity, _id, work)| (entity, *work)).collect();
        for (task_entity, work) in saved {
            let Some(attempt) = self.ecs.get::<WorkAttempt>(task_entity) else {
                let environment = self.environment.as_mut().ok_or("saved work needs environment")?;
                if environment.world.material(cell(work))? != work.expected { return Err("saved excavation target changed".into()); }
                continue;
            };
            if !matches!(&attempt.phase, AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Excavation { .. }, .. }) { continue; }
            let actor_id = attempt.worker.clone();
            let actor = self.entity(&actor_id)?;
            if self.ecs.get::<Body>(actor).is_none() {
                return Err("saved excavation lacks worker capabilities".into());
            }
            let environment = self.environment.as_mut().ok_or("saved excavation lacks environment")?;
            let rule = environment.excavation_rules.get(&work.expected).ok_or("saved excavation lacks material rule")?;
            if work.seconds > rule.work_seconds || !environment.world.is_open_material(work.replacement)
                || work.expected == work.replacement || environment.world.material(cell(work))? != work.expected
                || self.direct.contains_key(&actor) || self.ecs.get::<Support>(actor).is_some() {
                return Err("invalid saved excavation progress or replacement".into());
            }
        }
        Ok(())
    }

    pub(super) fn validate_excavation_orders(&mut self) -> Result<()> {
        let mut cells = BTreeSet::new();
        let mut query = self.ecs.query::<(Entity, &ExternalId, &ExcavationOrder)>();
        let mut count = 0usize;
        for (entity, id, order) in query.iter(&self.ecs) {
            count += 1;
            let owner = self.ecs.get::<OwnedByParty>(entity).ok_or("excavation order has no party owner")?;
            let policy = self.ecs.get::<crate::work_planner::WorkPolicy>(entity).ok_or("excavation order has no work policy")?;
            let schedule = self.ecs.get::<crate::work_planner::WorkSchedule>(entity).ok_or("excavation order has no work schedule")?;
            if !valid_id(&id.0)
                || owner.party != policy.party
                || schedule.next_review_tick < schedule.last_considered
                || !matches!(order.status.as_str(), "queued" | "blocked" | "cancelling")
                || order.reason.len() > 256
                || !cells.insert((order.cell_x, order.cell_y, order.cell_z))
            { return Err("invalid saved excavation order".into()); }
            let party = self.entity(&owner.party)?;
            if self.ecs.get::<Party>(party).is_none() { return Err("excavation order owner is not a party".into()); }
            if let Some(work) = self.ecs.get::<ExcavationWork>(entity) {
                if work.x != order.cell_x || work.y != order.cell_y || work.z != order.cell_z || work.expected != order.expected || work.replacement != 0 {
                    return Err("excavation order target mismatch".into());
                }
                if self.ecs.get::<WorkAttempt>(entity).is_none() { return Err("excavation work has no attempt".into()); }
            }
        }
        if count > 256 { return Err("saved excavation orders exceed bound".into()); }
        Ok(())
    }

    pub(super) fn advance_excavation(&mut self, delta: f64) -> Result<()> {
        if delta == 0.0 { return Ok(()); }
        // ECS membership finds working actors; map order stabilizes competing completions.
        let mut query = self.ecs.query::<(&ExternalId, &ExcavationWork)>();
        let mut pending: Vec<_> = query.iter(&self.ecs).map(|(id, work)| (id.0.clone(), *work)).collect();
        pending.sort_by(|a, b| a.0.cmp(&b.0));
        for (id, mut work) in pending {
            let task_entity = self.entity(&id)?;
            let Some(attempt) = self.ecs.get::<WorkAttempt>(task_entity) else { continue; };
            if !matches!(&attempt.phase, AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Excavation { .. }, .. }) { continue; }
            let actor_id = attempt.worker.clone();
            let actor = self.entity(&actor_id)?;
            // Routing retains saved work but earns no effort while travelling.
            if self.ecs.get::<Destination>(actor).is_some() { continue; }
            if self.direct.contains_key(&actor) {
                let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                    self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::WorkerUnavailable } })?;
                }
                continue;
            }
            if self.ecs.get::<Support>(actor).is_some() {
                let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                    self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                }
                continue;
            }
            let pose = self.world_pose_entity(actor, 0)?;
            if self.terrain_support_reserved(cell(work)) { continue; }
            if self.terrain_support_occupied(cell(work), Some(actor))? {
                let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                    self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                }
                continue;
            }
            let environment = self.environment.as_mut().ok_or("saved work needs environment")?;
            if environment.world.material(cell(work))? != work.expected {
                let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                    self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                }
                continue;
            }
            let rule = environment.excavation_rules.get(&work.expected).ok_or("saved work has no material rule")?;
            let required = rule.work_seconds;
            let spacing = environment.world.cell_spacing_m();
            if !within_reach([pose.x, pose.y, pose.z], cell(work), spacing) {
                let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                    self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                }
                continue;
            }
            work.seconds = super::earned_work_seconds(work.seconds, delta, required)?;
            self.ecs.entity_mut(task_entity).insert(work);
            if work.seconds < required { continue; }
            let prepared = match self.environment.as_mut().unwrap().world.prepare_excavation(cell(work), work.expected, work.replacement)? {
                ExcavationResult::Prepared(prepared) => prepared,
                ExcavationResult::TerrainBlocked(_) | ExcavationResult::WaterBlocked(_) | ExcavationResult::StructuresBlocked(_) => {
                    let attempt = self.ecs.get::<WorkAttempt>(task_entity).cloned().ok_or("work attempt component is missing")?;
                    if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                        self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                    }
                    continue;
                },
            };
            // Capacity/geometry admission failure leaves earned work available for retry.
            let owner_party = self.ecs.get::<OwnedByParty>(task_entity).map(|owner| owner.party.clone());
            match self.complete_excavation_at(prepared, material_output::MaterialOutputLocation::Ground {
                position: Position { x: pose.x, y: pose.y, z: pose.z, facing: pose.facing },
                owner_party,
            }) {
                Ok(Some(_)) => {
                    self.ecs.entity_mut(task_entity).remove::<ExcavationWork>();
                    self.refresh_state_weight();
                    if let Some(attempt) = self.ecs.get::<WorkAttempt>(task_entity).cloned() {
                        if let AttemptPhase::Executing { operation, activity } = attempt.phase {
                            self.settle_attempt(&id, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Completed })?;
                        }
                    }
                }
                Ok(None) => {},
                Err(reason) if reason == "material output exceeds container capacity"
                    || reason == "region entity capacity" || reason == "region canonical state capacity" => {}
                Err(reason) => return Err(reason),
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Kernel, ExcavationWork) {
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"work-test","components":[],"materialCatalog":[],"initial":[
            {"id":"party","components":{"hive.party":{"ownerPlayer":"player"}}},
            {"id":"task","components":{"hive.owned-by-party":{"party":"party"}}},
            {"id":"worker","components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.body":{"speed":1},"hive.container":{"capacity":10},"hive.party-member":{"party":"party"}}}
        ]}).to_string()).unwrap();
        let mut definition: serde_json::Value = serde_json::from_str(&crate::environment_definition::tests::fixture("timed-work")).unwrap();
        for material in definition["materials"].as_array_mut().unwrap() {
            if material["diggable"] == true { material["excavation"] = json!({"workSeconds":2,"outputKind":"spoil","unitsPerCell":3}); }
        }
        kernel.load_environment(&definition.to_string()).unwrap();
        let wet = kernel.environment.as_ref().unwrap().world.facts().unwrap().cells.into_iter().find(|cell| cell.kind == crate::water::WaterCellKind::Soil).unwrap();
        let work = ExcavationWork {x:wet.at[0],y:wet.at[1],z:wet.at[2],expected:kernel.environment.as_mut().unwrap().world.material(Cell{x:i64::from(wet.at[0]),y:wet.at[1],z:i64::from(wet.at[2])}).unwrap(),replacement:0,seconds:0.0};
        let actor = kernel.entity("worker").unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        kernel.ecs.entity_mut(actor).insert(Position{x:f64::from(work.x)*spacing[0]+1.0,y:f64::from(work.y)*spacing[1],z:f64::from(work.z)*spacing[2],facing:0.0});
        (kernel,work)
    }
    fn begin_excavation(kernel: &mut Kernel, work: ExcavationWork) {
        let position = *kernel.ecs.get::<Position>(kernel.entity("worker").unwrap()).unwrap();
        let key = kernel.begin_work_attempt("task".into(), "worker".into(), "party".into(), crate::work_attempt::ActivityRef::Route { destination: Point { x: position.x, y: position.y, z: position.z, frame: None } }).unwrap();
        kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[]}"#).unwrap();
        kernel.continue_work_attempt("task".into(), key.generation, 1, crate::work_attempt::ActivityRef::Excavation { cell: [work.x, work.y, work.z], expected_material: work.expected, replacement_material: work.replacement }).unwrap();
    }
    fn planner_fixture() -> (Kernel, ExcavationWork) {
        let (mut kernel, _) = fixture();
        let columns = (-3..=3)
            .flat_map(|x| (-3..=3).map(move |z| (x, z)))
            .collect::<Vec<_>>();
        let surfaces = kernel
            .environment
            .as_mut()
            .unwrap()
            .world
            .surface_cells(&columns)
            .unwrap()
            .into_iter()
            .flatten()
            .map(|surface| ((surface.cell.x, surface.cell.z), surface.cell))
            .collect::<BTreeMap<_, _>>();
        let (target, contact) = surfaces
            .values()
            .find_map(|target| {
                let material = kernel
                    .environment
                    .as_mut()
                    .unwrap()
                    .world
                    .material(*target)
                    .ok()?;
                if !kernel
                    .environment
                    .as_ref()
                    .unwrap()
                    .excavation_rules
                    .contains_key(&material)
                {
                    return None;
                }
                [(-1_i64, 0_i64), (1, 0), (0, -1), (0, 1)]
                    .into_iter()
                    .filter_map(|(dx, dz)| surfaces.get(&(target.x + dx, target.z + dz)))
                    .find(|contact| (-2..=1).contains(&(contact.y - target.y)))
                    .copied()
                    .map(|contact| ((*target, material), contact))
            })
            .expect("fixture needs neighboring traversable dig contact");
        let work = ExcavationWork {
            x: i32::try_from(target.0.x).unwrap(),
            y: target.0.y,
            z: i32::try_from(target.0.z).unwrap(),
            expected: target.1,
            replacement: 0,
            seconds: 0.0,
        };
        enable_automatic_work(&mut kernel, contact);
        (kernel, work)
    }
    fn enable_automatic_work(kernel: &mut Kernel, contact: Cell) {
        let worker = kernel.entity("worker").unwrap();
        let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
        kernel.ecs.entity_mut(worker).insert((
            Position {
                x: contact.x as f64 * spacing[0],
                y: (f64::from(contact.y) + 0.5) * spacing[1],
                z: contact.z as f64 * spacing[2],
                facing: 0.0,
            },
            Traversal { clearance_cells: 1, max_step_cells: 1 },
            WorkParticipation { automatic: true },
        ));
        kernel.rebuild_physical_indexes(true).unwrap();
        kernel.refresh_planner_index("worker");
    }

    #[test]
    fn task_owned_excavation_progress_is_unique_and_survives_save() {
        let (mut kernel, work) = fixture();
        begin_excavation(&mut kernel, work);
        kernel.advance_excavation(1.0).unwrap();
        let task = kernel.entity("task").unwrap();
        assert_eq!(kernel.ecs.get::<ExcavationWork>(task).unwrap().seconds, 1.0);
        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.ecs.get::<ExcavationWork>(restored.entity("task").unwrap()).unwrap().seconds, 1.0);
    }

    #[test]
    fn task_without_attempt_does_not_advance_or_mutate_terrain() {
        let (mut kernel, work) = fixture();
        let task = kernel.entity("task").unwrap();
        kernel.ecs.entity_mut(task).insert(work);
        let before = kernel.environment.as_mut().unwrap().world.material(cell(work)).unwrap();
        kernel.advance_excavation(10.0).unwrap();
        assert_eq!(kernel.ecs.get::<ExcavationWork>(task).unwrap().seconds, 0.0);
        assert_eq!(kernel.environment.as_mut().unwrap().world.material(cell(work)).unwrap(), before);
    }

    #[test]
    fn excavation_losing_contact_settles_attempt_and_retains_progress() {
        let (mut kernel, work) = fixture();
        begin_excavation(&mut kernel, work);
        let worker = kernel.entity("worker").unwrap();
        kernel.ecs.get_mut::<Position>(worker).unwrap().x += 10.0;
        kernel.advance_excavation(1.0).unwrap();
        let attempt = kernel.ecs.get::<WorkAttempt>(kernel.entity("task").unwrap()).unwrap();
        assert!(matches!(attempt.phase, AttemptPhase::Outcome { result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost }, .. }));
        assert!(kernel.ecs.get::<ExcavationWork>(kernel.entity("task").unwrap()).is_some());
    }

    #[test]
    fn designation_is_durable_and_enters_the_shared_native_planner() {
        let (mut kernel, work) = planner_fixture();
        let at = [work.x, work.y, work.z];
        kernel
            .plan_excavation("party".into(), "dig".into(), at, at)
            .unwrap();
        let task = format!("dig.{}.{}.{}", work.x, work.y, work.z);
        let entity = kernel.entity(&task).unwrap();
        let order = kernel.ecs.get::<ExcavationOrder>(entity).unwrap();
        assert_eq!(order.expected, work.expected, "admission captures the material witness");

        let saved = kernel.save_records().unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved).unwrap();
        assert_eq!(restored.advance_native_work_planner(8).unwrap(), 1);
        assert!(matches!(
            &restored.work_attempt(&task).unwrap().phase,
            AttemptPhase::Executing { activity: crate::work_attempt::ActivityRef::Route { .. }, .. }
        ));
    }

    #[test]
    fn cancellation_releases_the_native_attempt_then_removes_the_order() {
        let (mut kernel, work) = planner_fixture();
        let at = [work.x, work.y, work.z];
        kernel
            .plan_excavation("party".into(), "dig".into(), at, at)
            .unwrap();
        let task = format!("dig.{}.{}.{}", work.x, work.y, work.z);
        assert_eq!(kernel.advance_native_work_planner(8).unwrap(), 1);

        kernel
            .cancel_excavation("party".into(), Some((at, at)), Vec::new())
            .unwrap();
        assert!(matches!(
            &kernel.work_attempt(&task).unwrap().phase,
            AttemptPhase::Outcome { result: WorkOutcome::Interrupted { cause: InterruptCause::Cancelled }, .. }
        ));
        assert_eq!(kernel.advance_native_work_planner(16).unwrap(), 1);
        assert!(!kernel.known.contains(&task));
        assert!(kernel.work_attempt(&task).is_none());
        assert!(!kernel.attempts_by_worker.contains_key("worker"));
    }

}
