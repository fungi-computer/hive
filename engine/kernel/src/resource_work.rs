//! Tended-resource intent and earned-work owner.
//!
//! The shared planner chooses labor. This module derives one requirement from
//! the canonical resource/order facts and commits sow, tend, or harvest only
//! after the authored duration has been earned at a still-valid contact.
use super::Kernel;
use crate::components::*;
use crate::work_attempt::{ActivityRef, AttemptPhase, WorkBlockReason, WorkOutcome};
use crate::work_planner::{WorkOperation, WorkParticipation, WorkPolicy, WorkRequirement, WorkSchedule};

impl Kernel {
    pub(super) fn request_field_water(&mut self, party: String, material: String, portions: u8, scope: &ActionScope) -> Result<String> {
        let execution = self.work_execution_for_scope(scope, &party, crate::work_planner::POLICY_FIELD_WATER)?;
        if !valid_id(&party) || !valid_id(&material) || portions == 0 || portions > 7 {
            return Err("invalid field water request".into());
        }
        if self.ecs.get::<Party>(self.entity(&party)?).is_none() { return Err("field water request party is not a party".into()); }
        if self.ids.len() >= 16_384 { return Err("region entity capacity".into()); }
        let id = (0_u16..=255).map(|ordinal| format!("field-water:manual:{}:{ordinal}", self.revision))
            .find(|candidate| !self.known.contains(candidate)).ok_or("field water request batch identity exhausted")?;
        let entity = self.ecs.spawn((
            ExternalId(id.clone()), OwnedByParty { party: party.clone() },
            FieldWaterWork { process: id.clone(), role: "manual".into(), generation: 1, party: party.clone(), destination: id.clone(), material, retain_in_vessel: true, portions, vessel: None, cell_x: 0, cell_y: 0, cell_z: 0, lot: None },
            WorkPolicy { pool: party, priority: 0, enabled: true },
            execution,
            WorkSchedule { next_review_tick: self.revision, last_considered: self.revision.saturating_sub(1) },
        )).id();
        self.ids.insert(id.clone(), entity); self.known.insert(id.clone()); self.contents.insert(id.clone(), Default::default());
        self.refresh_planner_index(&id); self.refresh_state_weight(); Ok(id)
    }
    pub(super) fn designate_resource(&mut self, order_id: String, party: String, definition: String, x: i32, y: i32, z: i32, scope: &ActionScope) -> Result<String> {
        let execution = self.work_execution_for_scope(scope, &party, crate::work_planner::POLICY_RESOURCE)?;
        if !valid_id(&order_id) || !valid_id(&party) || !valid_id(&definition) || self.known.contains(&order_id) {
            return Err("invalid resource designation".into());
        }
        let party_entity = self.entity(&party)?;
        if self.ecs.get::<Party>(party_entity).is_none() { return Err("resource designation party is not a party".into()); }
        let environment = self.environment.as_mut().ok_or("resource designation requires terrain")?;
        if !environment.resources.contains_key(&definition) { return Err("unknown resource definition".into()); }
        let surface = environment.world.surface_cells(&[(i64::from(x), i64::from(z))])?.into_iter().next().flatten().ok_or("resource site requires a generated ground surface")?;
        if surface.cell.y != y { return Err("resource site must be on the generated surface".into()); }
        if environment.world.structure_surfaces(&[(i64::from(x), i64::from(z))])?.into_iter().flatten().any(|cell| cell.x == i64::from(x) && cell.y == y && cell.z == i64::from(z)) {
            return Err("resource site cell is occupied by a structure".into());
        }
        if self.ids.values().any(|entity| {
            self.ecs.get::<ResourceOrder>(*entity).is_some_and(|order| order.cell_x == x && order.cell_y == y && order.cell_z == z && order.status != "complete")
                || self.ecs.get::<ResourceSite>(*entity).is_some_and(|_| self.ecs.get::<Position>(*entity).is_some_and(|position| {
                    let spacing = environment.world.cell_spacing_m();
                    (position.x - f64::from(x) * spacing[0]).abs() < spacing[0] * 0.5
                        && (position.y - (f64::from(y) + 0.5) * spacing[1]).abs() < spacing[1] * 0.5
                        && (position.z - f64::from(z) * spacing[2]).abs() < spacing[2] * 0.5
                }))
        }) { return Err("resource site cell already has an active designation".into()); }
        if self.ids.len() >= 16_384 { return Err("region entity capacity".into()); }
        let entity = self.ecs.spawn((
            ExternalId(order_id.clone()),
            OwnedByParty { party: party.clone() },
            ResourceOrder { definition, cell_x: x, cell_y: y, cell_z: z, status: "queued".into(), reason: String::new(), progress_seconds: 0.0 },
            WorkPolicy { pool: party, priority: 0, enabled: true },
            execution,
            WorkSchedule { next_review_tick: self.revision, last_considered: self.revision.saturating_sub(1) },
        )).id();
        self.ids.insert(order_id.clone(), entity);
        self.known.insert(order_id.clone());
        self.contents.insert(order_id.clone(), Default::default());
        self.refresh_planner_index(&order_id);
        self.refresh_state_weight();
        Ok(order_id)
    }

    fn resource_contacts(&self, order: &ResourceOrder) -> Result<Vec<Point>> {
        let spacing = self.environment.as_ref().ok_or("resource work requires terrain")?.world.cell_spacing_m();
        let center = Point { x: f64::from(order.cell_x) * spacing[0], y: (f64::from(order.cell_y) + 0.5) * spacing[1], z: f64::from(order.cell_z) * spacing[2], frame: None };
        Ok([(spacing[0], 0.0), (-spacing[0], 0.0), (0.0, spacing[2]), (0.0, -spacing[2])]
            .into_iter().map(|(dx, dz)| Point { x: center.x + dx, y: center.y, z: center.z + dz, frame: None }).collect())
    }

    fn held_resource_vessel(&self, party: &str, required_worker: Option<&str>, material: &str, portions: u8) -> Option<(String, String)> {
        self.planner_indexes.workers_by_party.get(party).into_iter().flatten().filter_map(|candidate| {
            if required_worker.is_some_and(|worker| worker != candidate.id) { return None; }
            let vessel = self.contents.get(&candidate.id)?.iter().filter_map(|entity| {
                let vessel_lot = self.ecs.get::<Lot>(*entity)?;
                self.ecs.get::<VesselCapability>(*entity)?.accepts_water.then_some(())?;
                (vessel_lot.container == candidate.id).then_some(())?;
                let vessel_id = self.external_id(*entity).ok()?;
                let held = self.contents.get(&vessel_id).into_iter().flatten().filter_map(|lot_entity| {
                    let lot = self.ecs.get::<Lot>(*lot_entity)?;
                    (lot.kind == material && self.ecs.get::<LotWater>(*lot_entity).is_some_and(|water| water.water_kg > 0.0)).then_some(lot.quantity)
                }).sum::<u32>();
                (held >= u32::from(portions)).then_some(vessel_id)
            }).min()?;
            Some((candidate.id.clone(), vessel))
        }).min()
    }

    fn ensure_resource_water_task(&mut self, order_id: &str, party: &str, material: &str, portions: u8, generation: u64) -> Result<()> {
        let task_id = format!("resource-water:{order_id}:{generation}");
        if self.known.contains(&task_id) { return Ok(()); }
        if self.ids.len() >= 16_384 { return Err("region entity capacity".into()); }
        let parent = self.entity(order_id)?;
        let execution = self.ecs.get::<WorkExecution>(parent).cloned().ok_or("resource order has no work execution")?;
        let entity = self.ecs.spawn((
            ExternalId(task_id.clone()), OwnedByParty { party: party.into() },
            FieldWaterWork { process: order_id.into(), role: "tend".into(), generation, party: party.into(), destination: order_id.into(), material: material.into(), retain_in_vessel: true, portions, vessel: None, cell_x: 0, cell_y: 0, cell_z: 0, lot: None },
            WorkPolicy { pool: party.into(), priority: 0, enabled: true },
            execution,
            WorkSchedule { next_review_tick: self.revision, last_considered: self.revision.saturating_sub(1) },
        )).id();
        self.ids.insert(task_id.clone(), entity); self.known.insert(task_id.clone()); self.contents.insert(task_id.clone(), Default::default());
        self.refresh_planner_index(&task_id); self.refresh_state_weight();
        Ok(())
    }

    pub(super) fn resource_work_operation(&mut self, order_id: &str, party: &str, routed_worker: Option<&str>) -> Result<Option<(WorkOperation, Option<String>)>> {
        let entity = self.entity(order_id)?;
        let order = self.ecs.get::<ResourceOrder>(entity).cloned().ok_or("resource order disappeared")?;
        if order.status == "complete" { return Ok(None); }
        let definition = self.environment.as_ref().ok_or("resource work requires terrain")?.resources.get(&order.definition).cloned().ok_or("resource definition disappeared")?;
        let site = self.ecs.get::<ResourceSite>(entity).cloned();
        let (operation, required_worker) = match site {
            None => (WorkOperation::ResourceEstablish { site: order_id.into(), definition: order.definition.clone(), cell: [order.cell_x, order.cell_y, order.cell_z] }, None),
            Some(site) if usize::from(site.stage) >= definition.stages.len() => (WorkOperation::ResourceExtract { source: order_id.into() }, None),
            Some(site) if self.time < site.next_due => return Ok(None),
            Some(site) => {
                let stage = &definition.stages[usize::from(site.stage)];
                let generation = u64::from(site.stage).saturating_add(1);
                if let Some((worker, vessel)) = self.held_resource_vessel(party, routed_worker, &definition.water_kind, stage.water_portions) {
                    (WorkOperation::ResourceTend { site: order_id.into(), vessel }, Some(worker))
                } else {
                    self.ensure_resource_water_task(order_id, party, &definition.water_kind, stage.water_portions, generation)?;
                    return Ok(None);
                }
            }
        };
        Ok(Some((operation, required_worker)))
    }

    pub(super) fn resource_work_requirement(&mut self, order_id: &str, party: &str) -> Result<Option<WorkRequirement>> {
        if self.work_attempts.contains_key(order_id) { return Ok(None); }
        let entity = self.entity(order_id)?;
        let order = self.ecs.get::<ResourceOrder>(entity).cloned().ok_or("resource order disappeared")?;
        let Some((operation, required_worker)) = self.resource_work_operation(order_id, party, None)? else { return Ok(None); };
        Ok(Some(WorkRequirement { task: order_id.into(), pool: party.into(), priority: self.ecs.get::<WorkPolicy>(entity).map(|p| p.priority).unwrap_or(0), schedule: self.ecs.get::<WorkSchedule>(entity).cloned().ok_or("resource order has no schedule")?, contacts: self.resource_contacts(&order)?, required_worker, free_capacity_required: 0, operation }))
    }

    pub(super) fn advance_resource_work(&mut self, delta: f64) -> Result<()> {
        if delta == 0.0 { return Ok(()); }
        let active = self.work_attempts.iter().filter_map(|(task, entity)| {
            let attempt = self.ecs.get::<crate::work_attempt::WorkAttempt>(*entity)?;
            let AttemptPhase::Executing { operation, activity } = &attempt.phase else { return None; };
            matches!(activity, ActivityRef::ResourceEstablish { .. } | ActivityRef::ResourceTend { .. } | ActivityRef::ResourceExtract { .. })
                .then(|| (task.clone(), attempt.worker.clone(), operation.clone(), activity.clone()))
        }).collect::<Vec<_>>();
        for (task, worker, operation, activity) in active {
            let worker_entity = self.entity(&worker)?;
            if !self.ecs.get::<WorkParticipation>(worker_entity).is_some_and(|participation| participation.automatic) {
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Interrupted { cause: crate::work_attempt::InterruptCause::WorkerUnavailable } })?;
                continue;
            }
            let entity = self.entity(&task)?;
            let mut order = self.ecs.get::<ResourceOrder>(entity).cloned().ok_or("resource attempt lost its order")?;
            let definition = self.environment.as_ref().ok_or("resource work requires terrain")?.resources.get(&order.definition).cloned().ok_or("resource definition disappeared")?;
            let required = match &activity { ActivityRef::ResourceEstablish { .. } => definition.sow_seconds, ActivityRef::ResourceTend { .. } => definition.tend_seconds, ActivityRef::ResourceExtract { .. } => definition.harvest_seconds, _ => unreachable!() };
            let position = *self.ecs.get::<Position>(worker_entity).ok_or("resource worker lost its position")?;
            let at_contact = self.resource_contacts(&order)?.into_iter().any(|contact| {
                crate::navigation::distance(Point { x: position.x, y: position.y, z: position.z, frame: None }, contact) <= 0.05
            });
            if !at_contact {
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                continue;
            }
            order.progress_seconds = super::earned_work_seconds(order.progress_seconds, delta, required)?;
            self.ecs.entity_mut(entity).insert(order.clone()); self.refresh_state_weight();
            if order.progress_seconds + f64::EPSILON < required { continue; }
            let result = match &activity {
                ActivityRef::ResourceEstablish { site, definition, cell } => self.establish_resource_site("native-resource", &worker, site, definition, cell[0], cell[1], cell[2]).map(|_| ()),
                ActivityRef::ResourceTend { site, vessel } => self.tend_resource_site("native-resource", &worker, site, vessel),
                ActivityRef::ResourceExtract { source } => self.extract_resource(&worker, source).map(|_| ()),
                _ => unreachable!(),
            };
            match result {
                Ok(()) => self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Completed })?,
                Err(reason) if matches!(reason.as_str(), "finite resource is exhausted" | "resource growth stage is not due" | "out of reach" | "material output exceeds container capacity" | "water vessel lacks requested water portions") => {
                    let block = if reason == "material output exceeds container capacity" { WorkBlockReason::CapacityUnavailable } else if matches!(reason.as_str(), "finite resource is exhausted" | "water vessel lacks requested water portions") { WorkBlockReason::MissingInputs } else { WorkBlockReason::AccessLost };
                    self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity, result: WorkOutcome::Blocked { reason: block } })?;
                }
                Err(reason) => return Err(reason),
            }
        }
        Ok(())
    }
}
