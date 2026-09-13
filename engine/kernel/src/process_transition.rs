//! Private staged-process transition preparation boundary.
//!
//! The token is deliberately data-only: callers must prepare the complete
//! batch before handing it back to the Kernel's synchronous publishers.
/// The Kernel owns the physical publishers; this child module is the narrow
/// transition boundary used by the staged-process owner.
pub(super) fn publish(kernel: &mut super::Kernel, process: &str, transition: &crate::staged_process::ProcessTransition) -> Result<(), String> {
    kernel.execute_process_transition(process, transition)
}
