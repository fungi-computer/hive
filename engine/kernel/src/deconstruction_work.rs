//! Native timed deconstruction progress and exactly-once physical completion.
use super::*;
use crate::work_attempt::ActivityRef;

fn retryable_deconstruction_failure(reason: &str) -> bool {
    matches!(reason,
        "worker is not at construction contact"
        | "worker lacks salvage capacity"
        | "deconstruction geometry is invalid"
        | "supported dependent prevents deconstruction"
        | "required empty port contains live contents")
}

impl Kernel {
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
        if self.ecs.get::<OwnedByParty>(task_entity).is_some_and(|task_owner| task_owner.party != site_party) { return Err("deconstruction task party mismatch".into()); }
        if self.ecs.get::<OwnedByParty>(task_entity).is_none() { self.ecs.entity_mut(task_entity).insert(OwnedByParty { party: site_party }); }
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
        let pending: Vec<_> = query.iter(&self.ecs).map(|(id, work)| (id.0.clone(), work.clone())).collect();
        for (task, mut work) in pending {
            let task_entity = self.entity(&task)?;
            let Some(attempt) = self.ecs.get::<WorkAttempt>(task_entity).cloned() else { continue; };
            let AttemptPhase::Executing { operation, activity: ActivityRef::Deconstruction { site, contact } } = attempt.phase else { continue; };
            if site != work.site || contact.x != work.contact_x || contact.y != work.contact_y || contact.z != work.contact_z { continue; }
            let worker = self.entity(&attempt.worker)?;
            if self.ecs.get::<Destination>(worker).is_some() || self.ecs.get::<Support>(worker).is_some() { continue; }
            let pose = self.world_pose(&attempt.worker)?;
            if (pose.x - contact.x).powi(2) + (pose.y - contact.y).powi(2) + (pose.z - contact.z).powi(2) > 1.5_f64.powi(2) { continue; }
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
