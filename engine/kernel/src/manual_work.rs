//! Native owner for manual route terminal reconciliation.
//!
//! A drafted actor may keep its route alive, while an automatic actor's
//! manual route is interrupted when control is reclaimed. Terminal outcomes
//! are acknowledged here so no TypeScript scheduler is required for cleanup.
use super::Kernel;
use crate::work_attempt::{AttemptPhase, InterruptCause};

impl Kernel {
    pub(crate) fn reconcile_manual_attempts(&mut self) -> Result<usize> {
        let candidates = self.work_attempts.iter().filter_map(|(task, entity)| {
            let attempt = self.ecs.get::<crate::work_attempt::WorkAttempt>(*entity)?.clone();
            (task == &attempt.worker).then_some((task.clone(), attempt))
        }).collect::<Vec<_>>();
        let mut progressed = 0;
        for (task, attempt) in candidates {
            let Some(operation) = attempt.current_operation().cloned() else { continue; };
            match attempt.phase {
                AttemptPhase::Outcome { .. } => {
                    self.acknowledge_work_attempt(task, operation.attempt.generation, operation.sequence)?;
                    progressed += 1;
                }
                AttemptPhase::Executing { .. } => {
                    let automatic = self.entity(&attempt.worker).ok()
                        .and_then(|entity| self.ecs.get::<crate::work_planner::WorkParticipation>(entity))
                        .is_some_and(|participation| participation.automatic);
                    if automatic {
                        self.interrupt_work_attempt(task, operation.attempt.generation, operation.sequence, InterruptCause::Cancelled)?;
                        progressed += 1;
                    }
                }
                _ => {}
            }
        }
        Ok(progressed)
    }
}
