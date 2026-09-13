//! Authored staged-process definitions and the persisted facts they bind.
//!
//! This module only compiles bounded content and defines the ECS records. It
//! does not admit a process or advance physical material.

use bevy_ecs::prelude::Component;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

use crate::components::valid_id;
use crate::emission_definition::EmissionCatalog;
use crate::environment_definition::StructureDefinition;

pub const CURRENT_VERSION: u16 = 1;
const MAX_DEFINITIONS: usize = 64;
const MAX_INPUTS: usize = 32;
const MAX_STAGES: usize = 16;
const MAX_OUTPUTS_PER_STAGE: usize = 16;
const MAX_ROLES_PER_STAGE: usize = 32;
const MAX_DURATION_SECONDS: f64 = 86_400.0;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StageMode {
    Attended,
    Elapsed,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum InputPolicy {
    Portion,
    WholeLot,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum InputDisposition {
    Consume,
    Retain,
    EmissionSource,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessInput {
    pub role: String,
    pub port: String,
    pub material: String,
    pub quantity: u32,
    pub policy: InputPolicy,
    pub disposition: InputDisposition,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessEmission {
    pub role: String,
    pub catalog: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum OutputDestination {
    StationPort { port: String },
    RetainedContainer { role: String },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessOutput {
    pub role: String,
    pub material: String,
    pub quantity: u32,
    pub destination: OutputDestination,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessTransition {
    #[serde(default)]
    pub consume_roles: Vec<String>,
    #[serde(default)]
    pub emission: Option<ProcessEmission>,
    #[serde(default)]
    pub outputs: Vec<ProcessOutput>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessStage {
    pub id: String,
    pub mode: StageMode,
    pub duration_seconds: f64,
    pub transition: ProcessTransition,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessDefinition {
    pub id: String,
    pub version: u32,
    pub station_catalog: String,
    pub inputs: Vec<ProcessInput>,
    pub stages: Vec<ProcessStage>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CompiledProcessDefinition {
    definition: ProcessDefinition,
}
impl CompiledProcessDefinition {
    pub fn definition(&self) -> &ProcessDefinition {
        &self.definition
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ProcessCatalog {
    definitions: BTreeMap<String, CompiledProcessDefinition>,
}
impl ProcessCatalog {
    pub fn from_definitions(
        definitions: Vec<ProcessDefinition>,
        structures: &BTreeMap<String, StructureDefinition>,
        emissions: &EmissionCatalog,
    ) -> Result<Self, String> {
        if definitions.len() > MAX_DEFINITIONS {
            return Err("process catalog exceeds 64 entries".into());
        }
        let mut compiled = BTreeMap::new();
        for definition in definitions {
            let process = compile(definition, structures, emissions)?;
            if compiled
                .insert(process.definition.id.clone(), process)
                .is_some()
            {
                return Err("duplicate process definition id".into());
            }
        }
        Ok(Self {
            definitions: compiled,
        })
    }
    pub fn get(&self, id: &str) -> Option<&CompiledProcessDefinition> {
        self.definitions.get(id)
    }
    pub fn len(&self) -> usize {
        self.definitions.len()
    }
    pub fn requirements(&self, id: &str, phase: ProcessPhase) -> Option<ProcessRequirements> {
        let definition = self.get(id)?.definition();
        Some(ProcessRequirements {
            definition: definition.id.clone(), version: definition.version,
            station_catalog: definition.station_catalog.clone(),
            inputs: definition.inputs.iter().cloned().map(ProcessRequirementInput::from).collect(),
            stages: definition.stages.iter().cloned().map(ProcessRequirementStage::from).collect(), phase,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRequirements {
    pub definition: String,
    pub version: u32,
    pub station_catalog: String,
    pub inputs: Vec<ProcessRequirementInput>,
    pub stages: Vec<ProcessRequirementStage>,
    pub phase: ProcessPhase,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRequirementInput {
    pub role: String, pub port: String, pub material: String, pub quantity: u32,
    pub policy: InputPolicy, pub disposition: InputDisposition,
}
impl From<ProcessInput> for ProcessRequirementInput {
    fn from(input: ProcessInput) -> Self {
        Self { role: input.role, port: input.port, material: input.material, quantity: input.quantity, policy: input.policy, disposition: input.disposition }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRequirementStage {
    pub id: String, pub mode: StageMode, pub duration_seconds: f64,
}
impl From<ProcessStage> for ProcessRequirementStage {
    fn from(stage: ProcessStage) -> Self { Self { id: stage.id, mode: stage.mode, duration_seconds: stage.duration_seconds } }
}

fn valid_name(value: &str) -> bool {
    valid_id(value)
}
fn container_port(structure: &StructureDefinition, key: &str) -> bool {
    structure
        .on_complete
        .ports
        .iter()
        .find(|port| port.key == key)
        .is_some_and(|port| {
            port.components.iter().any(|(name, value)| {
                name == "hive.container"
                    && value
                        .get("capacity")
                        .and_then(serde_json::Value::as_f64)
                        .is_some_and(|capacity| capacity.is_finite() && capacity > 0.0)
            })
        })
}

pub fn compile(
    definition: ProcessDefinition,
    structures: &BTreeMap<String, StructureDefinition>,
    emissions: &EmissionCatalog,
) -> Result<CompiledProcessDefinition, String> {
    if !valid_name(&definition.id)
        || definition.version == 0
        || !valid_name(&definition.station_catalog)
        || definition.inputs.is_empty()
        || definition.inputs.len() > MAX_INPUTS
        || definition.stages.is_empty()
        || definition.stages.len() > MAX_STAGES
    {
        return Err("invalid process definition bounds or identity".into());
    }
    let station = structures
        .get(&definition.station_catalog)
        .ok_or("process station catalog is unknown")?;
    let ports: BTreeSet<&str> = station
        .on_complete
        .ports
        .iter()
        .map(|port| port.key.as_str())
        .collect();
    let mut roles = BTreeMap::new();
    for input in &definition.inputs {
        if !valid_name(&input.role)
            || !valid_name(&input.port)
            || !valid_name(&input.material)
            || input.quantity == 0
            || roles.insert(input.role.as_str(), input).is_some()
        {
            return Err("invalid or duplicate process input role".into());
        }
        if !ports.contains(input.port.as_str()) || !container_port(station, &input.port) {
            return Err("process input port lacks container capability".into());
        }
        if input.disposition == InputDisposition::Retain && input.policy != InputPolicy::WholeLot {
            return Err("retained input must be whole-lot".into());
        }
        if input.disposition == InputDisposition::EmissionSource
            && input.policy != InputPolicy::Portion
        {
            return Err("emission source must be portion input".into());
        }
    }
    let mut consumed = BTreeSet::new();
    let mut emissions_seen = BTreeSet::new();
    let mut stage_ids = BTreeSet::new();
    let mut output_roles = BTreeSet::new();
    for stage in &definition.stages {
        if !valid_name(&stage.id)
            || !stage_ids.insert(stage.id.as_str())
            || !stage.duration_seconds.is_finite()
            || stage.duration_seconds <= 0.0
            || stage.duration_seconds > MAX_DURATION_SECONDS
            || stage.transition.consume_roles.len() > MAX_ROLES_PER_STAGE
            || stage.transition.outputs.len() > MAX_OUTPUTS_PER_STAGE
        {
            return Err("invalid process stage".into());
        }
        for role in &stage.transition.consume_roles {
            let input = roles.get(role.as_str()).ok_or("unknown consumed role")?;
            if input.disposition != InputDisposition::Consume || !consumed.insert(role.as_str()) {
                return Err("consumed role must be referenced exactly once".into());
            }
        }
        if let Some(emission) = &stage.transition.emission {
            let input = roles
                .get(emission.role.as_str())
                .ok_or("unknown emission role")?;
            let catalog = emissions
                .get(&emission.catalog)
                .ok_or("process emission catalog is unknown")?;
            if input.disposition != InputDisposition::EmissionSource
                || !emissions_seen.insert(emission.role.as_str())
                || catalog.definition().material_kind != input.material
                || catalog.definition().quantity != input.quantity
            {
                return Err("process emission does not match source input".into());
            }
        }
        for output in &stage.transition.outputs {
            if !valid_name(&output.role)
                || !valid_name(&output.material)
                || output.quantity == 0
                || !output_roles.insert(output.role.as_str())
            {
                return Err("invalid or duplicate process output".into());
            }
            match &output.destination {
                OutputDestination::StationPort { port } => {
                    if !ports.contains(port.as_str()) || !container_port(station, port) {
                        return Err("process output port lacks container capability".into());
                    }
                }
                OutputDestination::RetainedContainer { role } => {
                    let input = roles
                        .get(role.as_str())
                        .ok_or("process retained container role is unknown")?;
                    if input.disposition != InputDisposition::Retain
                        || input.policy != InputPolicy::WholeLot
                        || !container_port(station, &input.port)
                    {
                        return Err(
                            "process retained destination requires retained whole-lot container"
                                .into(),
                        );
                    }
                }
            }
        }
    }
    for input in &definition.inputs {
        match input.disposition {
            InputDisposition::Consume if !consumed.contains(input.role.as_str()) => {
                return Err("consumed role must be referenced exactly once".into())
            }
            InputDisposition::EmissionSource if !emissions_seen.contains(input.role.as_str()) => {
                return Err("emission source role must be referenced exactly once".into())
            }
            _ => {}
        }
    }
    Ok(CompiledProcessDefinition { definition })
}

#[derive(Component, Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StagedProcess {
    pub version: u16,
    pub definition: String,
    pub definition_version: u32,
    pub station: String,
    pub stage_index: u16,
    pub progress_seconds: f64,
    pub entered_tick: u64,
    pub phase: ProcessPhase,
    pub blocked_reason: String,
}

#[derive(Component, Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessBinding {
    pub process: String,
    pub role: String,
    pub lot: String,
    pub quantity: u32,
}

pub fn binding_id(binding: &ProcessBinding) -> String {
    format!("binding:{}:{}:{}", binding.process, binding.role, binding.lot)
}

pub fn resolve_bindings(
    definition: &ProcessDefinition,
    process: &str,
    station: &str,
    lots: &BTreeMap<String, crate::components::Lot>,
) -> Result<Vec<ProcessBinding>, String> {
    let mut used = BTreeSet::new();
    let mut result = Vec::new();
    for input in &definition.inputs {
        let port = format!("{station}:{}", input.port);
        let mut candidates: Vec<_> = lots.iter().filter(|(id, lot)| {
            !used.contains(*id) && lot.container == port && lot.kind == input.material && lot.quantity > 0
                && (input.policy == InputPolicy::Portion || lot.quantity == input.quantity)
        }).collect();
        candidates.sort_by(|(left, _), (right, _)| left.cmp(right));
        let mut remaining = input.quantity;
        for (id, lot) in candidates {
            let quantity = if input.policy == InputPolicy::WholeLot { lot.quantity } else { lot.quantity.min(remaining) };
            if quantity == 0 { continue; }
            result.push(ProcessBinding { process: process.into(), role: input.role.clone(), lot: id.clone(), quantity });
            used.insert(id.clone());
            remaining -= quantity;
            if remaining == 0 { break; }
        }
        if remaining != 0 { return Err(format!("process input is missing material: {}", input.role)); }
    }
    Ok(result)
}

pub fn validate_bindings(
    definition: &ProcessDefinition,
    process: &str,
    station: &str,
    bindings: &[ProcessBinding],
    lot: &impl Fn(&str) -> Option<crate::components::Lot>,
) -> Result<(), String> {
    let inputs: BTreeMap<&str, &ProcessInput> = definition.inputs.iter().map(|input| (input.role.as_str(), input)).collect();
    let mut roles: BTreeMap<&str, u32> = BTreeMap::new();
    let mut lots = BTreeSet::new();
    for binding in bindings {
        if binding.process != process || !lots.insert(binding.lot.clone()) { return Err("process bindings do not uniquely own lots".into()); }
        let input = inputs.get(binding.role.as_str()).ok_or("process binding role is unknown")?;
        let source = lot(&binding.lot).ok_or("process binding lot is missing")?;
        if source.kind != input.material || source.container != format!("{station}:{}", input.port) || binding.quantity == 0 || binding.quantity > source.quantity {
            return Err("process binding lot does not satisfy its input role".into());
        }
        if input.policy == InputPolicy::WholeLot && binding.quantity != source.quantity { return Err("whole-lot process binding is partial".into()); }
        let total = roles.entry(binding.role.as_str()).or_default().checked_add(binding.quantity).ok_or("process binding quantity overflow")?;
        if input.policy == InputPolicy::WholeLot && *total > input.quantity { return Err("whole-lot process binding is duplicated".into()); }
    }
    for input in &definition.inputs {
        if roles.get(input.role.as_str()).copied().unwrap_or(0) != input.quantity { return Err("process bindings do not satisfy every input role".into()); }
        if input.policy == InputPolicy::WholeLot && roles.get(input.role.as_str()).copied().unwrap_or(0) != input.quantity { return Err("whole-lot process input is not exact".into()); }
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProcessPhase {
    Waiting,
    Working,
    Blocked,
    Complete,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::environment_definition::{
        CompletionRecipe, PortDefinition, RemovalRecipe, StructureShape,
    };
    use serde_json::json;

    fn station() -> BTreeMap<String, StructureDefinition> {
        let ports = ["kettle", "hearth", "barm", "keg", "tray"]
            .into_iter()
            .map(|key| {
                let components = vec![(
                    "hive.container".into(),
                    [("capacity".into(), json!(8))].into_iter().collect(),
                )];
                PortDefinition {
                    key: key.into(),
                    components,
                    at_site_contact: true,
                }
            })
            .collect();
        BTreeMap::from([(
            "brew-station".into(),
            StructureDefinition {
                id: "brew-station".into(),
                shape: StructureShape::Floor,
                materials: BTreeMap::new(),
                work_seconds: 1.0,
                work_reach_below_cells: 0,
                on_complete: CompletionRecipe {
                    components: vec![],
                    ports,
                },
                on_remove: RemovalRecipe::default(),
            },
        )])
    }

    fn herbal_ale() -> ProcessDefinition {
        let input = |role: &str,
                     port: &str,
                     material: &str,
                     quantity: u32,
                     policy: InputPolicy,
                     disposition: InputDisposition| ProcessInput {
            role: role.into(),
            port: port.into(),
            material: material.into(),
            quantity,
            policy,
            disposition,
        };
        ProcessDefinition {
            id: "herbal-ale-v1".into(),
            version: 1,
            station_catalog: "brew-station".into(),
            inputs: vec![
                input(
                    "malt",
                    "kettle",
                    "malt",
                    2,
                    InputPolicy::Portion,
                    InputDisposition::Consume,
                ),
                input(
                    "water",
                    "kettle",
                    "water",
                    2,
                    InputPolicy::Portion,
                    InputDisposition::Consume,
                ),
                input(
                    "mugwort",
                    "kettle",
                    "mugwort",
                    1,
                    InputPolicy::WholeLot,
                    InputDisposition::Consume,
                ),
                input(
                    "wood",
                    "hearth",
                    "wood",
                    1,
                    InputPolicy::Portion,
                    InputDisposition::EmissionSource,
                ),
                input(
                    "barm",
                    "barm",
                    "barm",
                    1,
                    InputPolicy::WholeLot,
                    InputDisposition::Retain,
                ),
                input(
                    "keg",
                    "keg",
                    "keg",
                    1,
                    InputPolicy::WholeLot,
                    InputDisposition::Retain,
                ),
            ],
            stages: vec![
                ProcessStage {
                    id: "prepare".into(),
                    mode: StageMode::Attended,
                    duration_seconds: 40.0,
                    transition: ProcessTransition {
                        consume_roles: vec!["malt".into(), "water".into(), "mugwort".into()],
                        emission: Some(ProcessEmission {
                            role: "wood".into(),
                            catalog: "wood-hearth".into(),
                        }),
                        outputs: vec![],
                    },
                },
                ProcessStage {
                    id: "ferment".into(),
                    mode: StageMode::Elapsed,
                    duration_seconds: 240.0,
                    transition: ProcessTransition::default(),
                },
                ProcessStage {
                    id: "keg".into(),
                    mode: StageMode::Attended,
                    duration_seconds: 20.0,
                    transition: ProcessTransition {
                        consume_roles: vec![],
                        emission: None,
                        outputs: vec![
                            ProcessOutput {
                                role: "ale".into(),
                                material: "ale".into(),
                                quantity: 4,
                                destination: OutputDestination::RetainedContainer {
                                    role: "keg".into(),
                                },
                            },
                            ProcessOutput {
                                role: "spent-grain".into(),
                                material: "spent-grain".into(),
                                quantity: 1,
                                destination: OutputDestination::StationPort {
                                    port: "tray".into(),
                                },
                            },
                        ],
                    },
                },
            ],
        }
    }

    fn emission(quantity: u32) -> EmissionCatalog {
        EmissionCatalog::from_definitions(vec![crate::emission_definition::EmissionDefinition {
            id: "wood-hearth".into(),
            material_kind: "wood".into(),
            quantity,
            duration_s: 30.0,
            smoke_kg: 0.03,
            heat_j: 30_000.0,
        }])
        .unwrap()
    }

    #[test]
    fn full_herbal_ale_fixture_compiles() {
        let catalog =
            ProcessCatalog::from_definitions(vec![herbal_ale()], &station(), &emission(1)).unwrap();
        assert_eq!(
            catalog.get("herbal-ale-v1").unwrap().definition().stages[1].duration_seconds,
            240.0
        );
    }

    #[test]
    fn compiler_rejects_missing_coverage_and_emission_mismatch() {
        assert!(
            ProcessCatalog::from_definitions(vec![herbal_ale()], &station(), &emission(2)).is_err()
        );
        let mut missing = herbal_ale();
        missing.stages[0].transition.consume_roles.pop();
        assert!(ProcessCatalog::from_definitions(vec![missing], &station(), &emission(1)).is_err());
    }

    #[test]
    fn compiler_rejects_zero_version_retain_portion_and_duplicate_output() {
        let mut zero = herbal_ale();
        zero.version = 0;
        assert!(ProcessCatalog::from_definitions(vec![zero], &station(), &emission(1)).is_err());

        let mut retained = herbal_ale();
        retained.inputs[4].policy = InputPolicy::Portion;
        assert!(
            ProcessCatalog::from_definitions(vec![retained], &station(), &emission(1)).is_err()
        );

        let mut duplicate = herbal_ale();
        let output = duplicate.stages[2].transition.outputs[0].clone();
        duplicate.stages[1].transition.outputs.push(output);
        assert!(
            ProcessCatalog::from_definitions(vec![duplicate], &station(), &emission(1)).is_err()
        );
    }

    #[test]
    fn compiler_rejects_input_without_container_capability() {
        let mut structures = station();
        structures
            .get_mut("brew-station")
            .unwrap()
            .on_complete
            .ports[0]
            .components
            .clear();
        assert!(
            ProcessCatalog::from_definitions(vec![herbal_ale()], &structures, &emission(1))
                .is_err()
        );
    }

    #[test]
    fn admission_binds_portion_across_lots_and_preserves_quantities() {
        let mut definition = herbal_ale();
        definition.inputs.retain(|input| input.role == "malt");
        let lots = BTreeMap::from([
            ("malt-a".into(), crate::components::Lot { kind: "malt".into(), quantity: 1, container: "station:kettle".into() }),
            ("malt-b".into(), crate::components::Lot { kind: "malt".into(), quantity: 3, container: "station:kettle".into() }),
        ]);
        let bindings = resolve_bindings(&definition, "process:station:ale", "station", &lots).unwrap();
        assert_eq!(bindings.iter().map(|binding| binding.quantity).sum::<u32>(), 2);
        assert_eq!(bindings.iter().map(|binding| binding.lot.as_str()).collect::<Vec<_>>(), vec!["malt-a", "malt-b"]);
        validate_bindings(&definition, "process:station:ale", "station", &bindings, &|id| lots.get(id).cloned()).unwrap();
    }

    #[test]
    fn admission_rejects_partial_or_duplicate_whole_lots() {
        let mut definition = herbal_ale();
        definition.inputs.retain(|input| input.role == "mugwort");
        let lots = BTreeMap::from([("herb".into(), crate::components::Lot { kind: "mugwort".into(), quantity: 2, container: "station:kettle".into() })]);
        assert!(resolve_bindings(&definition, "process:station:ale", "station", &lots).is_err());
        let exact = BTreeMap::from([("herb".into(), crate::components::Lot { kind: "mugwort".into(), quantity: 1, container: "station:kettle".into() })]);
        let binding = ProcessBinding { process: "process:station:ale".into(), role: "mugwort".into(), lot: "herb".into(), quantity: 1 };
        validate_bindings(&definition, "process:station:ale", "station", &[binding.clone(), binding], &|id| exact.get(id).cloned()).unwrap_err();
    }

    #[test]
    fn process_definition_decoder_rejects_unknown_fields() {
        let mut environment: serde_json::Value = serde_json::from_str(
            &crate::environment_definition::tests::fixture("unknown-process-field"),
        )
        .unwrap();
        environment["processes"] = serde_json::json!([{"id":"p","version":1,"stationCatalog":"floor","inputs":[],"stages":[],"unexpected":true}]);
        assert!(crate::environment_definition::build_from_json(&environment.to_string()).is_err());
    }

    #[test]
    fn requirements_projection_is_derived_without_availability_or_worker_state() {
        let catalog = ProcessCatalog::from_definitions(vec![herbal_ale()], &station(), &emission(1)).unwrap();
        let projection = catalog.requirements("herbal-ale-v1", ProcessPhase::Waiting).unwrap();
        assert_eq!(projection.inputs.iter().find(|input| input.role == "malt").unwrap().quantity, 2);
        assert_eq!(projection.stages.iter().map(|stage| stage.duration_seconds).sum::<f64>(), 300.0);
        assert_eq!(projection.phase, ProcessPhase::Waiting);
    }
}
