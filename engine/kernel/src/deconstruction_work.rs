//! Native timed deconstruction progress and exactly-once physical completion.
use super::*;
use crate::work_attempt::ActivityRef;

fn retryable_deconstruction_failure(reason: &str) -> bool {
    matches!(reason,
        "worker is not at construction contact"
        | "worker lacks salvage capacity"
        | "deconstruction geometry is invalid"
        | "supported dependent prevents deconstruction"
        | "required empty port contains live contents"
        | "not a construction site"
        | "deconstruction requires a finished site"
        | "construction catalog binding is missing")
}

impl Kernel {
    pub(super) fn validate_deconstruction_orders(&mut self) -> Result<()> {
        let mut active_sites = std::collections::BTreeSet::new();
        let mut query = self.ecs.query::<(Entity, &ExternalId, &DeconstructionOrder)>();
        for (entity, id, order) in query.iter(&self.ecs) {
            let owner = self.ecs.get::<OwnedByParty>(entity).ok_or("deconstruction order has no party owner")?;
            let policy = self.ecs.get::<crate::work_planner::WorkPolicy>(entity).ok_or("deconstruction order has no work policy")?;
            let schedule = self.ecs.get::<crate::work_planner::WorkSchedule>(entity).ok_or("deconstruction order has no work schedule")?;
            if id.0 != format!("deconstruction-order.{}:{}", order.site.len(), order.site)
                || owner.party != policy.pool || schedule.next_review_tick < schedule.last_considered
                || (order.status == "complete") == policy.enabled
            { return Err("invalid saved deconstruction order".into()); }
            if order.status != "complete" {
                if !active_sites.insert(order.site.clone()) { return Err("duplicate active deconstruction target".into()); }
                let site = self.entity(&order.site)?;
                if self.ecs.get::<ConstructionSite>(site).is_none()
                    || self.ecs.get::<OwnedByParty>(site).map(|value| value.party.as_str()) != Some(owner.party.as_str())
                { return Err("deconstruction order target is invalid".into()); }
            }
        }
        Ok(())
    }

    pub(super) fn plan_deconstruction(&mut self, site: String, party: String) -> Result<String> {
        if !crate::components::valid_id(&site) || !crate::components::valid_id(&party) { return Err("invalid deconstruction plan identity".into()); }
        let site_entity = self.entity(&site)?;
        let state = self.ecs.get::<ConstructionSite>(site_entity).ok_or("not a construction site")?;
        if state.phase != ConstructionPhase::Finished || self.ecs.get::<SealedContainer>(site_entity).is_none() { return Err("deconstruction requires a finished site".into()); }
        if self.ecs.get::<OwnedByParty>(site_entity).map(|owner| owner.party.as_str()) != Some(party.as_str()) { return Err("deconstruction site party mismatch".into()); }
        let task = format!("deconstruction-order.{}:{site}", site.len());
        if let Some(entity) = self.ids.get(&task).copied() {
            let order = self.ecs.get::<DeconstructionOrder>(entity).ok_or("deconstruction identity collision")?;
            if order.site != site || self.ecs.get::<OwnedByParty>(entity).map(|owner| owner.party.as_str()) != Some(party.as_str()) { return Err("deconstruction replay mismatch".into()); }
            return Ok(task);
        }
        if self.ids.len() >= 16_384 || !crate::components::valid_id(&task) { return Err("deconstruction state capacity exceeded".into()); }
        let order = DeconstructionOrder { site, contact_x: 0.0, contact_y: 0.0, contact_z: 0.0, salvage_quantity: 0, work_seconds: 0.0, status: "queued".into(), reason: String::new(), retry_key: String::new() };
        let entity = self.ecs.spawn((ExternalId(task.clone()), order, OwnedByParty { party: party.clone() },
            crate::work_planner::WorkPolicy { pool: party, priority: 0, enabled: true },
            crate::work_planner::WorkSchedule { next_review_tick: self.revision, last_considered: self.revision })).id();
        self.ids.insert(task.clone(), entity); self.known.insert(task.clone());
        self.refresh_planner_index(&task); self.refresh_state_weight();
        Ok(task)
    }

    pub(super) fn validate_deconstruction_work(&mut self) -> Result<()> {
        let mut query = self.ecs.query::<(Entity, &ExternalId, &DeconstructionWork)>();
        for (task_entity, _id, work) in query.iter(&self.ecs) {
            if work.site.is_empty() || !work.seconds.is_finite() || work.seconds < 0.0 || !work.required_seconds.is_finite() || work.required_seconds < work.seconds { return Err("invalid deconstruction progress".into()); }
            let task_owner = self.ecs.get::<OwnedByParty>(task_entity).ok_or("deconstruction progress task has no party owner")?;
            let site_entity = self.entity(&work.site)?;
            let site_owner = self.ecs.get::<OwnedByParty>(site_entity).ok_or("deconstruction progress site has no party owner")?;
            if task_owner.party != site_owner.party { return Err("deconstruction progress party mismatch".into()); }
            if let Some(attempt) = self.ecs.get::<WorkAttempt>(task_entity) {
                if attempt.party != task_owner.party { return Err("deconstruction progress attempt party mismatch".into()); }
                match &attempt.phase {
                    AttemptPhase::Executing { activity: ActivityRef::Deconstruction { site, contact }, .. }
                    | AttemptPhase::Outcome { activity: ActivityRef::Deconstruction { site, contact }, .. } => {
                        if site != &work.site || contact.x != work.contact_x || contact.y != work.contact_y || contact.z != work.contact_z { return Err("deconstruction progress target mismatch".into()); }
                    }
                    AttemptPhase::Executing { activity: ActivityRef::Route { .. }, .. }
                    | AttemptPhase::Outcome { activity: ActivityRef::Route { .. }, .. }
                    | AttemptPhase::Ready | AttemptPhase::Settling { .. } => {}
                    _ => return Err("deconstruction progress activity mismatch".into()),
                }
            }
        }
        Ok(())
    }

    pub(super) fn request_deconstruction_for_attempt(&mut self, task: &str, site: String, contact: Point, required_seconds: f64) -> Result<()> {
        if !required_seconds.is_finite() || required_seconds < 0.0 { return Err("invalid deconstruction duration".into()); }
        let task_entity = self.entity(task)?;
        let attempt = self.ecs.get::<WorkAttempt>(task_entity).ok_or("deconstruction requires a work attempt")?;
        let site_entity = self.entity(&site)?;
        let site_party = self.ecs.get::<OwnedByParty>(site_entity).ok_or("deconstruction site has no party owner")?.party.clone();
        if site_party != attempt.party { return Err("deconstruction continuation party mismatch".into()); }
        if self.ecs.get::<OwnedByParty>(task_entity).map(|task_owner| task_owner.party.as_str()) != Some(site_party.as_str()) { return Err("deconstruction task party mismatch".into()); }
        let work = DeconstructionWork { site, contact_x: contact.x, contact_y: contact.y, contact_z: contact.z, seconds: 0.0, required_seconds };
        if let Some(existing) = self.ecs.get::<DeconstructionWork>(task_entity) {
            if existing.site != work.site || existing.contact_x != work.contact_x || existing.contact_y != work.contact_y || existing.contact_z != work.contact_z || existing.required_seconds != work.required_seconds { return Err("task already has different deconstruction work".into()); }
        } else {
            self.ecs.entity_mut(task_entity).insert(work.clone());
            self.refresh_state_weight();
        }
        Ok(())
    }

    pub(super) fn advance_deconstruction(&mut self, delta: f64) -> Result<()> {
        if delta <= 0.0 { return Ok(()); }
        let mut query = self.ecs.query::<(&ExternalId, &DeconstructionWork)>();
        let mut pending: Vec<_> = query.iter(&self.ecs).map(|(id, work)| (id.0.clone(), work.clone())).collect();
        pending.sort_by(|a, b| a.0.cmp(&b.0));
        for (task, mut work) in pending {
            let task_entity = self.entity(&task)?;
            let Some(attempt) = self.ecs.get::<WorkAttempt>(task_entity).cloned() else { continue; };
            let AttemptPhase::Executing { operation, activity: ActivityRef::Deconstruction { site, contact } } = attempt.phase else { continue; };
            if site != work.site || contact.x != work.contact_x || contact.y != work.contact_y || contact.z != work.contact_z {
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: ActivityRef::Deconstruction { site: work.site.clone(), contact }, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                continue;
            }
            let worker = self.entity(&attempt.worker)?;
            if self.ecs.get::<Destination>(worker).is_some() { continue; }
            if self.direct.contains_key(&worker) || self.ecs.get::<ExcavationWork>(worker).is_some() {
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: ActivityRef::Deconstruction { site: work.site.clone(), contact }, result: WorkOutcome::Blocked { reason: WorkBlockReason::WorkerUnavailable } })?;
                continue;
            }
            if self.ecs.get::<Support>(worker).is_some() {
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: ActivityRef::Deconstruction { site: work.site.clone(), contact }, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                continue;
            }
            let pose = self.world_pose(&attempt.worker)?;
            if (pose.x - contact.x).powi(2) + (pose.y - contact.y).powi(2) + (pose.z - contact.z).powi(2) > 1.5_f64.powi(2) {
                self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: ActivityRef::Deconstruction { site: work.site.clone(), contact }, result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost } })?;
                continue;
            }
            work.seconds = super::earned_work_seconds(work.seconds, delta, work.required_seconds)?;
            self.ecs.entity_mut(task_entity).insert(work.clone());
            if work.seconds < work.required_seconds { continue; }
            match self.deconstruct_construction(&attempt.worker, &work.site) {
                Ok(()) => {
                    self.ecs.entity_mut(task_entity).remove::<DeconstructionWork>();
                    self.refresh_state_weight();
                    self.settle_attempt(&task, AttemptPhase::Outcome { operation, activity: ActivityRef::Deconstruction { site: work.site, contact }, result: WorkOutcome::Completed })?;
                }
                // Physical admission can change between earned progress and
                // completion. Retain progress behind a typed terminal block;
                // the authored provider acknowledges it and a later admission
                // may retry from the saved work component.
                Err(reason) if retryable_deconstruction_failure(&reason) => {
                    self.settle_attempt(&task, AttemptPhase::Outcome {
                        operation,
                        activity: ActivityRef::Deconstruction { site: work.site, contact },
                        result: WorkOutcome::Blocked { reason: WorkBlockReason::AccessLost },
                    })?;
                }
                Err(reason) => return Err(reason),
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn saved(task_owner: Option<&str>, site_owner: &str) -> String {
        let task_owner = task_owner.map(|party| json!({"party": party}));
        let mut initial = vec![json!({"id":"site","components":{"hive.owned-by-party":{"party":site_owner}}}), json!({"id":"party","components":{"hive.party":{"ownerPlayer":"p"}}}), json!({"id":"other","components":{"hive.party":{"ownerPlayer":"other"}}})];
        let mut task = json!({"id":"task","components":{"hive.deconstruction-work":{"site":"site","contactX":0.0,"contactY":0.0,"contactZ":0.0,"seconds":1.0,"requiredSeconds":2.0}}});
        if let Some(owner) = task_owner { task["components"]["hive.owned-by-party"] = owner; }
        initial.push(task);
        let mut kernel = Kernel::new();
        kernel.load(&json!({"format":"hive-game","version":3,"game":"deconstruction-tests","components":[],"materialCatalog":[],"initial":initial}).to_string()).unwrap();
        kernel.snapshot_json().unwrap()
    }

    #[test]
    fn parked_progress_restores_without_attempt() {
        let mut kernel = Kernel::new();
        assert!(kernel.restore_json(&saved(Some("party"), "party")).is_ok());
    }

    #[test]
    fn parked_progress_rejects_missing_or_foreign_task_owner() {
        let mut missing = Kernel::new();
        assert!(missing.restore_json(&saved(None, "party")).is_err());
        let mut foreign = Kernel::new();
        assert!(foreign.restore_json(&saved(Some("other"), "party")).is_err());
    }
}
