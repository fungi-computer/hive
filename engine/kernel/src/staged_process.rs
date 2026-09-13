//! Generic staged-process records.
//!
//! This module owns process custody and stage arithmetic.  Physical effects are
//! deliberately returned as a typed transition token; the material, output,
//! and environment owners decide whether that token can be committed.  No
//! closure or content-specific rule is stored in a record.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const CURRENT_VERSION: u16 = 1;
pub const MAX_STAGES: usize = 16;
pub const MAX_BINDINGS: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StageMode { Attended, Unattended }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StageDefinition {
    pub mode: StageMode,
    pub ticks: u64,
    /// A typed operation ID resolved by the authored consumer.  It is data,
    /// never executable code and is therefore safe to persist.
    pub operation: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProcessDefinition {
    pub id: String,
    pub version: u32,
    pub stages: Vec<StageDefinition>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LotBinding {
    pub lot: String,
    pub container: String,
    pub kind: String,
    pub quantity: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutputBinding {
    pub container: String,
    pub kind: String,
    pub quantity: u32,
}

/// Read-only facts supplied by the native material owner at admission.  The
/// process module does not retain a second inventory map.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LotFact<'a> {
    pub id: &'a str,
    pub container: &'a str,
    pub kind: &'a str,
    pub quantity: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ContainerFact<'a> {
    pub id: &'a str,
    pub capacity: u32,
    pub quantity: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProcessBinding {
    pub version: u16,
    pub id: String,
    pub station: String,
    pub consumed: Vec<LotBinding>,
    pub retained: Vec<LotBinding>,
    pub outputs: Vec<OutputBinding>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProcessStatus { Active, Waiting, Complete }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StagedProcess {
    pub version: u16,
    pub id: String,
    pub definition: String,
    pub definition_version: u32,
    pub binding: String,
    pub station: String,
    pub stage: u16,
    pub progress: u64,
    pub entered_tick: u64,
    pub status: ProcessStatus,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TransitionToken {
    pub process: String,
    pub binding: String,
    pub stage: u16,
    pub operation: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Advance { Pending, Transition(TransitionToken), Complete }

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
}

fn validate_binding(binding: &ProcessBinding) -> Result<(), String> {
    if binding.version != CURRENT_VERSION || !valid_id(&binding.id) || !valid_id(&binding.station)
        || binding.consumed.len() + binding.retained.len() > MAX_BINDINGS
        || binding.outputs.len() > MAX_BINDINGS { return Err("invalid staged-process binding".into()); }
    let mut lots = BTreeSet::new();
    for lot in binding.consumed.iter().chain(binding.retained.iter()) {
        if !valid_id(&lot.lot) || !valid_id(&lot.container) || !valid_id(&lot.kind) || lot.quantity == 0 || !lots.insert(&lot.lot) { return Err("invalid or duplicate staged-process lot".into()); }
    }
    for output in &binding.outputs {
        if !valid_id(&output.container) || !valid_id(&output.kind) || output.quantity == 0 { return Err("invalid staged-process output".into()); }
    }
    Ok(())
}

/// Validate exact lot/container custody through facts queried from the
/// existing ECS material owner.  This function only reads those facts.
pub fn validate_binding_facts(
    binding: &ProcessBinding,
    lots: &[LotFact<'_>],
    containers: &[ContainerFact<'_>],
) -> Result<(), String> {
    validate_binding(binding)?;
    let lot = |id: &str| lots.iter().find(|fact| fact.id == id);
    let container = |id: &str| containers.iter().find(|fact| fact.id == id);
    for expected in binding.consumed.iter().chain(binding.retained.iter()) {
        let fact = lot(&expected.lot).ok_or("staged-process lot no longer exists")?;
        if fact.container != expected.container || fact.kind != expected.kind || fact.quantity < expected.quantity {
            return Err("staged-process lot custody or quantity changed".into());
        }
        if container(fact.container).is_none() { return Err("staged-process lot container no longer exists".into()); }
    }
    for output in &binding.outputs {
        let destination = container(&output.container).ok_or("staged-process output container no longer exists")?;
        if destination.quantity.saturating_add(u64::from(output.quantity)) > u64::from(destination.capacity) {
            return Err("staged-process output capacity is full".into());
        }
    }
    Ok(())
}

pub fn validate_definition(definition: &ProcessDefinition) -> Result<(), String> {
    if !valid_id(&definition.id) || definition.version == 0 || definition.stages.is_empty() || definition.stages.len() > MAX_STAGES { return Err("invalid staged-process definition".into()); }
    for stage in &definition.stages {
        if stage.ticks == 0 || !valid_id(&stage.operation) { return Err("invalid staged-process stage".into()); }
    }
    Ok(())
}

pub fn admit(definition: &ProcessDefinition, binding: &ProcessBinding, id: String, tick: u64) -> Result<StagedProcess, String> {
    validate_definition(definition)?;
    validate_binding(binding)?;
    if !valid_id(&id) || !valid_id(&binding.station) { return Err("invalid staged-process identity".into()); }
    Ok(StagedProcess { version: CURRENT_VERSION, id, definition: definition.id.clone(), definition_version: definition.version, binding: binding.id.clone(), station: binding.station.clone(), stage: 0, progress: 0, entered_tick: tick, status: ProcessStatus::Active })
}

fn token(process: &StagedProcess, definition: &ProcessDefinition) -> TransitionToken {
    TransitionToken { process: process.id.clone(), binding: process.binding.clone(), stage: process.stage, operation: definition.stages[process.stage as usize].operation.clone() }
}

pub fn attend(process: &mut StagedProcess, definition: &ProcessDefinition, delta: u64) -> Result<Advance, String> {
    validate_process(process, definition)?;
    if process.status == ProcessStatus::Complete { return Ok(Advance::Complete); }
    let stage = &definition.stages[process.stage as usize];
    if stage.mode != StageMode::Attended { return Ok(Advance::Pending); }
    process.progress = process.progress.saturating_add(delta).min(stage.ticks);
    if process.progress < stage.ticks { return Ok(Advance::Pending); }
    Ok(Advance::Transition(token(process, definition)))
}

pub fn advance_unattended(process: &mut StagedProcess, definition: &ProcessDefinition, tick: u64) -> Result<Advance, String> {
    validate_process(process, definition)?;
    if process.status == ProcessStatus::Complete { return Ok(Advance::Complete); }
    let stage = &definition.stages[process.stage as usize];
    if stage.mode != StageMode::Unattended || tick <= process.entered_tick { return Ok(Advance::Pending); }
    process.progress = process.progress.saturating_add(tick - process.entered_tick).min(stage.ticks);
    process.entered_tick = tick;
    if process.progress < stage.ticks { return Ok(Advance::Pending); }
    Ok(Advance::Transition(token(process, definition)))
}

/// Publish a physical transition after all owner-specific detached checks pass.
/// A token can be committed once; a repeated token is rejected without state
/// mutation, which makes command retry distinguishable from unfinished work.
pub fn commit_transition(process: &mut StagedProcess, definition: &ProcessDefinition, transition: &TransitionToken, tick: u64) -> Result<Advance, String> {
    validate_process(process, definition)?;
    if process.status == ProcessStatus::Complete { return Ok(Advance::Complete); }
    if transition.process != process.id || transition.binding != process.binding || transition.stage != process.stage || transition.operation != definition.stages[process.stage as usize].operation { return Err("staged-process transition token is stale".into()); }
    if process.progress < definition.stages[process.stage as usize].ticks { return Err("staged-process transition is early".into()); }
    if usize::from(process.stage) + 1 == definition.stages.len() { process.status = ProcessStatus::Complete; process.entered_tick = tick; return Ok(Advance::Complete); }
    process.stage += 1;
    process.progress = 0;
    process.entered_tick = tick;
    process.status = ProcessStatus::Active;
    Ok(Advance::Pending)
}

pub fn cancel(process: &StagedProcess) -> Result<(), String> {
    if process.status == ProcessStatus::Complete || process.stage != 0 || process.progress != 0 { return Err("staged-process has crossed its first transition".into()); }
    Ok(())
}

pub fn validate_process(process: &StagedProcess, definition: &ProcessDefinition) -> Result<(), String> {
    validate_definition(definition)?;
    if process.version != CURRENT_VERSION || !valid_id(&process.id) || process.definition != definition.id || process.definition_version != definition.version || !valid_id(&process.binding) || !valid_id(&process.station) || usize::from(process.stage) >= definition.stages.len() && process.status != ProcessStatus::Complete { return Err("invalid staged-process record".into()); }
    if process.status != ProcessStatus::Complete && process.progress > definition.stages[process.stage as usize].ticks { return Err("staged-process progress exceeds stage".into()); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (ProcessDefinition, ProcessBinding) {
        (ProcessDefinition { id: "herbal-ale-v1".into(), version: 1, stages: vec![StageDefinition { mode: StageMode::Attended, ticks: 2, operation: "prepare".into() }, StageDefinition { mode: StageMode::Unattended, ticks: 3, operation: "keg".into() }] }, ProcessBinding { version: 1, id: "binding.1".into(), station: "station".into(), consumed: vec![LotBinding { lot: "lot.malt".into(), container: "station".into(), kind: "malt".into(), quantity: 2 }], retained: vec![LotBinding { lot: "lot.keg".into(), container: "station".into(), kind: "keg".into(), quantity: 1 }], outputs: vec![OutputBinding { container: "station".into(), kind: "ale".into(), quantity: 4 }] })
    }
    #[test] fn blocked_attendance_keeps_progress_and_retry_is_single_transition() { let (d,b)=fixture(); let mut p=admit(&d,&b,"process.1".into(),4).unwrap(); assert_eq!(attend(&mut p,&d,1).unwrap(),Advance::Pending); let before=p.clone(); assert_eq!(attend(&mut p,&d,0).unwrap(),Advance::Pending); assert_eq!(p,before); let t=match attend(&mut p,&d,1).unwrap(){Advance::Transition(t)=>t,_=>panic!()}; assert_eq!(commit_transition(&mut p,&d,&t,6).unwrap(),Advance::Pending); assert!(commit_transition(&mut p,&d,&t,6).is_err()); }
    #[test] fn unattended_is_tick_gated_and_reloadable() { let (d,b)=fixture(); let mut p=admit(&d,&b,"process.1".into(),4).unwrap(); let t=match attend(&mut p,&d,2).unwrap(){Advance::Transition(t)=>t,_=>panic!()}; commit_transition(&mut p,&d,&t,6).unwrap(); assert_eq!(advance_unattended(&mut p,&d,6).unwrap(),Advance::Pending); assert_eq!(advance_unattended(&mut p,&d,8).unwrap(),Advance::Pending); let saved=serde_json::to_string(&p).unwrap(); let restored:StagedProcess=serde_json::from_str(&saved).unwrap(); assert_eq!(restored,p); }
    #[test] fn cancellation_only_releases_before_first_transition() { let (d,b)=fixture(); let mut p=admit(&d,&b,"process.1".into(),0).unwrap(); assert!(cancel(&p).is_ok()); attend(&mut p,&d,1).unwrap(); assert!(cancel(&p).is_err()); }
    #[test] fn binding_facts_reject_moved_or_full_native_material() { let (_,b)=fixture(); let lots=[LotFact{id:"lot.malt",container:"other",kind:"malt",quantity:2},LotFact{id:"lot.keg",container:"station",kind:"keg",quantity:1}]; let containers=[ContainerFact{id:"station",capacity:4,quantity:4},ContainerFact{id:"other",capacity:4,quantity:2}]; assert!(validate_binding_facts(&b,&lots,&containers).is_err()); let lots=[LotFact{id:"lot.malt",container:"station",kind:"malt",quantity:2},LotFact{id:"lot.keg",container:"station",kind:"keg",quantity:1}]; assert!(validate_binding_facts(&b,&lots,&containers).is_err()); }
}
