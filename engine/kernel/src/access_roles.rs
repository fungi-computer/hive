//! Exhaustive semantic targets for native actions.
//!
//! This module does not decide access. It prevents authorization from guessing
//! targets by scanning strings and gives the access owner a finite role table.

use crate::components::Action;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum OperationRole {
    Control,
    WorkTask,
    StationUse,
    Process,
    Withdraw,
    Deposit,
    Carrier,
    PlanSubject,
    Demolish,
    RelationSource,
    RelationTarget,
    Vessel,
    Launcher,
    Ammunition,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct RoleTarget<'a> {
    pub role: OperationRole,
    pub entity: &'a str,
}

fn role(role: OperationRole, entity: &str) -> RoleTarget<'_> {
    RoleTarget { role, entity }
}

/// Every existing-entity argument protected by an action, classified by why
/// the operation needs it. Newly allocated IDs deliberately do not appear.
pub(crate) fn action_roles(action: &Action) -> Vec<RoleTarget<'_>> {
    use OperationRole::*;
    match action {
        Action::InstantiateActors { .. } => vec![],
        Action::SetRelation { source, target, .. } => vec![
            role(RelationSource, source),
            role(RelationTarget, target),
        ],
        Action::ClearRelation { source, .. } => vec![role(RelationSource, source)],
        Action::BeginWorkAttempt { task, worker, .. } => {
            vec![role(WorkTask, task), role(Control, worker)]
        }
        Action::RetargetWorkAttempt { task, .. }
        | Action::InterruptWorkAttempt { task, .. }
        | Action::AcknowledgeWorkAttempt { task, .. }
        | Action::ContinueWorkAttempt { task, .. } => vec![role(WorkTask, task)],
        Action::CreateJob { .. } => vec![],
        Action::ResumeJob { id, .. } | Action::CancelJob { id } => vec![role(WorkTask, id)],
        Action::RequestProcess { station, .. } => vec![role(StationUse, station)],
        Action::AdmitProcess { process, station, .. } => {
            vec![role(Process, process), role(StationUse, station)]
        }
        Action::ExchangeFieldWater { worker, vessel, .. } => {
            vec![role(Control, worker), role(Vessel, vessel)]
        }
        Action::DesignateStockpile { party, .. }
        | Action::UpdateStockpile { party, .. }
        | Action::ClearStockpile { party, .. }
        | Action::PlanConstructions { party, .. }
        | Action::PlanExcavation { party, .. }
        | Action::DesignateResource { party, .. }
        | Action::RequestFieldWater { party, .. } => vec![role(PlanSubject, party)],
        Action::CancelExcavation { party, workers, .. } => {
            let mut roles = vec![role(PlanSubject, party)];
            roles.extend(workers.iter().map(|worker| role(Control, worker)));
            roles
        }
        Action::PlanDeconstruction { site, party } => {
            vec![role(PlanSubject, party), role(Demolish, site)]
        }
        Action::ReplaceFloor { existing_floor_id, .. } => vec![role(Demolish, existing_floor_id)],
        Action::BindConstructionStage { site, .. } => vec![role(WorkTask, site)],
        Action::CancelWork { entity }
        | Action::Move { entity, .. }
        | Action::BeginDirect { entity, .. }
        | Action::DirectInput { entity, .. }
        | Action::Displace { entity, .. } => vec![role(Control, entity)],
        Action::Deconstruct { worker, site }
        | Action::SetStructureOpen { worker, site, .. } => {
            vec![role(Control, worker), role(Demolish, site)]
        }
        Action::BeginEmission { worker, station } => {
            vec![role(Control, worker), role(StationUse, station)]
        }
        Action::DropLot { entity, lot } => {
            vec![role(Carrier, entity), role(Withdraw, lot)]
        }
        Action::Transfer { lot, from, to, .. } => vec![
            role(Withdraw, lot),
            role(Withdraw, from),
            role(Deposit, to),
        ],
        Action::Consume { entity, lot, .. } => {
            vec![role(Control, entity), role(Withdraw, lot)]
        }
        Action::ExtractResource { worker, source, .. } => {
            vec![role(Control, worker), role(Withdraw, source)]
        }
        Action::EstablishResourceSite { worker, site, .. } => {
            vec![role(Control, worker), role(PlanSubject, site)]
        }
        Action::TendResourceSite { worker, site, vessel, .. } => vec![
            role(Control, worker),
            role(PlanSubject, site),
            role(Vessel, vessel),
        ],
        Action::Launch { launcher, ammunition, .. } => {
            vec![role(Launcher, launcher), role(Ammunition, ammunition)]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn action(value: serde_json::Value) -> Action {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn roles_include_all_cancelled_workers_and_resource_vessel() {
        let cancel = action(serde_json::json!({
            "kind":"cancel-excavation", "party":"party", "area":null,
            "workers":["rowan", "sedge"]
        }));
        assert_eq!(action_roles(&cancel), vec![
            role(OperationRole::PlanSubject, "party"),
            role(OperationRole::Control, "rowan"),
            role(OperationRole::Control, "sedge"),
        ]);

        let tend = action(serde_json::json!({
            "kind":"tend-resource-site", "operation":"op", "worker":"rowan",
            "site":"plant", "vessel":"pail"
        }));
        assert_eq!(action_roles(&tend), vec![
            role(OperationRole::Control, "rowan"),
            role(OperationRole::PlanSubject, "plant"),
            role(OperationRole::Vessel, "pail"),
        ]);
    }

    #[test]
    fn roles_keep_transfer_authorities_distinct() {
        let transfer = action(serde_json::json!({
            "kind":"transfer", "lot":"lot", "from":"source", "to":"target", "quantity":1
        }));
        assert_eq!(action_roles(&transfer), vec![
            role(OperationRole::Withdraw, "lot"),
            role(OperationRole::Withdraw, "source"),
            role(OperationRole::Deposit, "target"),
        ]);
    }
}
