//! Coupled physical publication inside the existing Kernel environment owner.
use super::KernelEnvironment;
use crate::terrain_atmosphere::{SmokeReceipt, SmokeSource};
use crate::terrain_water::{PreparedExcavation, PreparedStructureChange};
use crate::water::WaterWork;
use serde::{Serialize, Deserialize};
use std::collections::BTreeMap;

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(super) enum WaterStep {
    Paused,
    Applied { work: WaterWork },
}
pub(super) struct EnvironmentStep {
    pub water: WaterStep,
    pub air: Option<AirStep>,
}


#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AirStep {
    pub receipt: SmokeReceipt,
    pub waiting: Vec<EmissionWait>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EmissionWait {
    source: String,
    reason: EmissionWaitReason,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum EmissionWaitReason { NoAirReceiver, Capacity, UnrepresentableInterval }

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct PaidEmission {
    pub catalog: String,
    pub cell: crate::generation::Cell,
    pub elapsed_s: f64,
    pub admitted_revision: u64,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SavedAir {
    version: u16,
    atmosphere: crate::terrain_atmosphere::TerrainAtmosphereRecords,
    emissions: BTreeMap<String, PaidEmission>,
}

impl KernelEnvironment {
    pub(super) fn save_air(&self) -> Result<Option<Vec<u8>>, String> {
        let Some(air) = &self.atmosphere else {
            if !self.paid_emissions.is_empty() { return Err("paid emissions require atmosphere".into()); }
            return Ok(None);
        };
        let records = SavedAir { version: 1, atmosphere: air.save()?, emissions: self.paid_emissions.clone() };
        let bytes = postcard::to_allocvec(&records).map_err(|_| "air record encoding failed")?;
        if bytes.len() > 2 * 1024 * 1024 + 64 * 1024 { return Err("air records exceed bound".into()); }
        Ok(Some(bytes))
    }
    pub(super) fn restore_air(&mut self, expected: Option<&crate::terrain_atmosphere::TerrainAtmosphereConfig>, bytes: Option<&[u8]>, revision: u64) -> Result<(), String> {
        let (expected, bytes) = match (expected, bytes) {
            (None, None) => return Ok(()),
            (Some(expected), Some(bytes)) => (expected, bytes),
            _ => return Err("saved atmosphere capability does not match environment".into()),
        };
        if bytes.len() > 2 * 1024 * 1024 + 64 * 1024 { return Err("air records exceed bound".into()); }
        let (saved, rest): (SavedAir, &[u8]) = postcard::take_from_bytes(bytes).map_err(|_| "invalid air records")?;
        if !rest.is_empty() || saved.version != 1 || saved.emissions.len() > 64 { return Err("invalid air record binding".into()); }
        let air = crate::terrain_atmosphere::TerrainAtmosphere::restore(&mut self.world, &saved.atmosphere)?;
        if air.config() != expected { return Err("saved atmosphere does not match authored environment".into()); }
        let bounds = self.world.bounds();
        for (id, source) in &saved.emissions {
            let definition = self.emissions.get(&source.catalog).ok_or("saved emission definition is missing")?.definition();
            if !crate::components::valid_id(id) || !source.elapsed_s.is_finite() || source.elapsed_s < 0.0
                || source.elapsed_s >= definition.duration_s || source.admitted_revision > revision
                || source.cell.x < bounds.min_x || source.cell.x >= bounds.max_x
                || source.cell.y < bounds.min_y || source.cell.y >= bounds.max_y
                || source.cell.z < bounds.min_z || source.cell.z >= bounds.max_z
                || source.cell.x < expected.min.x || source.cell.x >= expected.max.x
                || source.cell.y < expected.min.y || source.cell.y >= expected.max.y
                || source.cell.z < expected.min.z || source.cell.z >= expected.max.z {
                return Err("invalid saved paid emission".into());
            }
        }
        self.atmosphere = Some(air);
        self.paid_emissions = saved.emissions;
        Ok(())
    }

    pub(super) fn apply_excavation(&mut self, prepared: PreparedExcavation) -> Result<(), String> {
        let changes = self.world.air_geometry_changes(crate::terrain_water::AirGeometryEdit::Excavation(&prepared))?;
        self.world.apply_excavation(prepared)?;
        if let Some(air) = self.atmosphere.as_mut() { air.invalidate(&changes.cells, changes.physical_revision); }
        Ok(())
    }
    pub(super) fn apply_structures(&mut self, prepared: PreparedStructureChange) -> Result<(), String> {
        let changes = self.world.air_geometry_changes(crate::terrain_water::AirGeometryEdit::Structures(&prepared))?;
        self.world.apply_structures(prepared)?;
        if let Some(air) = self.atmosphere.as_mut() { air.invalidate(&changes.cells, changes.physical_revision); }
        Ok(())
    }
    fn advance_emissions(&mut self, seconds: f64, revision: u64) -> Result<Option<AirStep>, String> {
        let Some(air) = self.atmosphere.as_mut() else { return Ok(None); };
        let mut sources = Vec::new();
        let mut progress = Vec::new();
        let mut waiting = Vec::new();
        for (id, source) in &self.paid_emissions {
            // An action admitted this tick does not earn an entire prior tick.
            if source.admitted_revision >= revision { continue; }
            if !air.can_emit(&mut self.world, source.cell)? { waiting.push(EmissionWait { source: id.clone(), reason: EmissionWaitReason::NoAirReceiver }); continue; }
            let definition = self.emissions.get(&source.catalog).ok_or("paid emission catalog missing")?;
            let end = (source.elapsed_s + seconds).min(definition.definition().duration_s);
            if !end.is_finite() || end <= source.elapsed_s { waiting.push(EmissionWait { source: id.clone(), reason: EmissionWaitReason::UnrepresentableInterval }); continue; }
            let released = definition.release().released_between(Some(0.0), source.elapsed_s, end)?;
            sources.push(SmokeSource { cell: source.cell, smoke_kg: released["smokeKg"], heat_j: released["heatJ"] });
            progress.push((id.clone(), end, definition.definition().duration_s));
        }
        let receipt = match air.advance(&mut self.world, seconds, &sources) {
            Ok(receipt) => receipt,
            // The owner computes detached state: failed source admission has
            // published neither gas nor progress. Vent existing air and retain
            // the paid obligation for a later admissible step.
            Err(reason) if reason == "active smoke budget reached" => {
                waiting.extend(progress.iter().map(|(id, _, _)| EmissionWait { source: id.clone(), reason: EmissionWaitReason::Capacity }));
                let receipt = air.advance(&mut self.world, seconds, &[])?;
                return Ok(Some(AirStep { receipt, waiting }));
            }
            Err(reason) => return Err(reason),
        };
        for (id, elapsed, duration) in progress {
            if elapsed == duration { self.paid_emissions.remove(&id); }
            else { self.paid_emissions.get_mut(&id).unwrap().elapsed_s = elapsed; }
        }
        Ok(Some(AirStep { receipt, waiting }))
    }
    pub(super) fn advance(&mut self, seconds: f64, revision: u64) -> Result<EnvironmentStep, String> {
        if seconds == 0.0 { return Ok(EnvironmentStep { water: WaterStep::Paused, air: None }); }
        let prepared = self.world.prepare_water_advance(seconds)?;
        let changes = self.world.air_geometry_changes(crate::terrain_water::AirGeometryEdit::Water(&prepared))?;
        let water = self.world.apply_water_advance(prepared)?;
        if let Some(air) = self.atmosphere.as_mut() { air.invalidate(&changes.cells, changes.physical_revision); }
        let receipt = self.advance_emissions(seconds, revision)?;
        Ok(EnvironmentStep { water: WaterStep::Applied { work: water }, air: receipt })
    }
}
