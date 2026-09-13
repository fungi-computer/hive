//! Private staged-process transition preparation boundary.
//!
//! The token is deliberately data-only: callers must prepare the complete
//! batch before handing it back to the Kernel's synchronous publishers.
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct PreparedTransition {
    pub(super) output_ids: Vec<String>,
    pub(super) destination_quantities: BTreeMap<String, u64>,
}

pub(super) fn prepare_output_id_plan(
    next_lot: u64,
    existing: impl Fn(&str) -> bool,
    outputs: &[(String, u32, u64, u32)],
) -> Result<PreparedTransition, String> {
    let mut sequence = next_lot;
    let mut ids = Vec::with_capacity(outputs.len());
    let mut destinations = BTreeMap::new();
    for (destination, quantity, current, capacity) in outputs {
        let total = current.saturating_add(*destinations.get(destination).unwrap_or(&0));
        if total.saturating_add(u64::from(*quantity)) > u64::from(*capacity) { return Err("process-output-full".into()); }
        let id = loop { let candidate = format!("lot.{sequence}"); sequence = sequence.checked_add(1).ok_or("process-state-capacity")?; if !existing(&candidate) && !ids.contains(&candidate) { break candidate; } };
        ids.push(id); *destinations.entry(destination.clone()).or_default() += u64::from(*quantity);
    }
    Ok(PreparedTransition { output_ids: ids, destination_quantities: destinations })
}

/// The Kernel owns the physical publishers; this child module is the narrow
/// transition boundary used by the staged-process owner.
pub(super) fn publish(kernel: &mut super::Kernel, process: &str, transition: &crate::staged_process::ProcessTransition) -> Result<(), String> {
    kernel.execute_process_transition(process, transition)
}
