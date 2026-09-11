//! Bounded connected-volume atmosphere owner.
//!
//! Geometry producers supply volumes and openings. This module owns only
//! carrier, smoke, sensible heat, detached advancement, and durable state.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const DEFINITION_VERSION: u16 = 1;
const STATE_VERSION: u16 = 1;
const MAX_VOLUMES: usize = 2048;
const MAX_OPENINGS: usize = 56_000;
const MAX_MEMBERS: usize = 40_000;
const MAX_INTERVAL_S: f64 = 6.0;
const MAX_STEPS: usize = 64;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereMember {
    pub cell_id: String,
    pub volume_m3: f64,
    pub elevation_m: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereVolumeDefinition {
    pub id: String,
    pub members: Vec<AtmosphereMember>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereOpeningDefinition {
    pub id: String,
    pub from: String,
    pub from_cell_id: String,
    pub to: Option<String>,
    pub to_cell_id: Option<String>,
    pub area_m2: f64,
    pub distance_m: f64,
    pub elevation_m: f64,
    pub permeability: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereModel {
    pub specific_gas_constant_jkg_k: f64,
    pub heat_capacity_jkg_k: f64,
    pub mixing_velocity_mps: f64,
    pub buoyancy_velocity_mps_k: f64,
    pub pressure_velocity_mps_pa: f64,
    pub max_step_s: f64,
    pub max_exchange_fraction: f64,
    pub max_pressure_ratio: f64,
    pub max_temperature_delta_k: f64,
    pub max_smoke_mass_fraction: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereAmbient {
    pub pressure_pa: f64,
    pub temperature_k: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereDefinition {
    pub version: String,
    pub region_id: String,
    pub geometry_identity: String,
    pub revision: u64,
    pub ambient: AtmosphereAmbient,
    pub model: AtmosphereModel,
    pub volumes: Vec<AtmosphereVolumeDefinition>,
    pub openings: Vec<AtmosphereOpeningDefinition>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereParcel {
    pub volume_id: String,
    pub carrier_kg: f64,
    pub smoke_kg: f64,
    pub heat_j: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereState {
    pub version: String,
    pub identity: String,
    pub parcels: Vec<AtmosphereParcel>,
    pub initial_carrier_kg: f64,
    pub initial_smoke_kg: f64,
    pub initial_heat_j: f64,
    pub smoke_source_kg: f64,
    pub heat_source_j: f64,
    pub carrier_boundary_kg: f64,
    pub smoke_boundary_kg: f64,
    pub heat_boundary_j: f64,
}

#[derive(Clone, Debug, PartialEq)]
struct OpeningIndex {
    from: usize,
    to: Option<usize>,
    area_m2: f64,
    distance_m: f64,
    permeability: f64,
}

#[derive(Clone, Debug)]
pub struct CompiledAtmosphere {
    pub definition: AtmosphereDefinition,
    openings: Vec<OpeningIndex>,
    volume_index: BTreeMap<String, usize>,
    ambient_carrier_density: f64,
    identity: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereSource {
    pub volume_id: String,
    pub smoke_kg_s: f64,
    pub heat_j_s: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AtmosphereReceipt {
    pub seconds: f64,
    pub steps: usize,
    pub source_smoke_kg: f64,
    pub source_heat_j: f64,
    pub carrier_boundary_kg: f64,
    pub smoke_boundary_kg: f64,
    pub heat_boundary_j: f64,
}

fn finite_nonnegative(value: f64, name: &str) -> Result<(), String> {
    if !value.is_finite() || value < 0.0 { return Err(format!("invalid atmosphere {name}")); }
    Ok(())
}

fn identity(definition: &AtmosphereDefinition) -> Result<String, String> {
    postcard::to_allocvec(definition).map(|bytes| format!("atmosphere:{:x}", fnv1a(&bytes))).map_err(|_| "atmosphere identity encoding failed".into())
}

fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325u64, |hash, byte| (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3))
}

impl CompiledAtmosphere {
    pub fn compile(definition: AtmosphereDefinition) -> Result<Self, String> {
        if definition.version != "connected-atmosphere-definition-v1" || definition.region_id.is_empty() || definition.geometry_identity.is_empty() {
            return Err("invalid atmosphere definition identity".into());
        }
        if definition.volumes.is_empty() || definition.volumes.len() > MAX_VOLUMES || definition.openings.len() > MAX_OPENINGS {
            return Err("atmosphere definition exceeds bounds".into());
        }
        if !definition.ambient.pressure_pa.is_finite() || definition.ambient.pressure_pa <= 0.0
            || !definition.ambient.temperature_k.is_finite() || definition.ambient.temperature_k <= 0.0 { return Err("invalid atmosphere ambient".into()); }
        let model = &definition.model;
        for (value, name) in [
            (model.specific_gas_constant_jkg_k, "gas constant"),
            (model.heat_capacity_jkg_k, "heat capacity"),
            (model.mixing_velocity_mps, "mixing velocity"),
            (model.buoyancy_velocity_mps_k, "buoyancy velocity"),
            (model.pressure_velocity_mps_pa, "pressure velocity"),
            (model.max_step_s, "maximum step"),
            (model.max_exchange_fraction, "exchange fraction"),
            (model.max_pressure_ratio, "pressure ratio"),
            (model.max_temperature_delta_k, "temperature envelope"),
            (model.max_smoke_mass_fraction, "smoke envelope"),
        ] { finite_nonnegative(value, name)?; }
        if model.max_step_s == 0.0 || model.max_exchange_fraction > 1.0 || model.max_pressure_ratio < 1.0 || model.max_temperature_delta_k == 0.0 || model.max_smoke_mass_fraction == 0.0 { return Err("invalid atmosphere model bounds".into()); }
        let mut volume_index = BTreeMap::new();
        let mut members = 0usize;
        for (index, volume) in definition.volumes.iter().enumerate() {
            if volume.id.is_empty() || volume.members.is_empty() || volume_index.insert(volume.id.clone(), index).is_some() { return Err("invalid atmosphere volume identity".into()); }
            for member in &volume.members {
                if member.cell_id.is_empty() || !member.volume_m3.is_finite() || member.volume_m3 <= 0.0 || !member.elevation_m.is_finite() { return Err("invalid atmosphere member".into()); }
                members = members.checked_add(1).ok_or("atmosphere member budget overflow")?;
                if members > MAX_MEMBERS { return Err("atmosphere member budget exceeded".into()); }
            }
        }
        let mut openings = Vec::with_capacity(definition.openings.len());
        let mut ids = BTreeSet::new();
        for opening in &definition.openings {
            if opening.id.is_empty() || !ids.insert(opening.id.clone()) || opening.from_cell_id.is_empty() || opening.to_cell_id.as_ref().is_some_and(String::is_empty) { return Err("invalid atmosphere opening identity".into()); }
            let from = *volume_index.get(&opening.from).ok_or("atmosphere opening source volume missing")?;
            let to = opening.to.as_ref().map(|id| volume_index.get(id).copied()).transpose()?.ok_or_else(|| "atmosphere opening destination volume missing".to_string()).or_else(|error| if opening.to.is_none() { Ok(None) } else { Err(error) })?;
            if !opening.area_m2.is_finite() || opening.area_m2 <= 0.0 || !opening.distance_m.is_finite() || opening.distance_m <= 0.0 || !opening.elevation_m.is_finite() || !opening.permeability.is_finite() || opening.permeability < 0.0 { return Err("invalid atmosphere opening metric".into()); }
            openings.push(OpeningIndex { from, to, area_m2: opening.area_m2, distance_m: opening.distance_m, permeability: opening.permeability });
        }
        let ambient_carrier_density = definition.ambient.pressure_pa / (model.specific_gas_constant_jkg_k * definition.ambient.temperature_k);
        if !ambient_carrier_density.is_finite() || ambient_carrier_density <= 0.0 { return Err("invalid atmosphere ambient density".into()); }
        let identity = identity(&definition)?;
        Ok(Self { definition, openings, volume_index, ambient_carrier_density, identity })
    }

    pub fn initial(&self) -> AtmosphereState {
        let parcels = self.definition.volumes.iter().map(|volume| {
            let volume_m3: f64 = volume.members.iter().map(|member| member.volume_m3).sum();
            AtmosphereParcel { volume_id: volume.id.clone(), carrier_kg: self.ambient_carrier_density * volume_m3, smoke_kg: 0.0, heat_j: 0.0 }
        }).collect::<Vec<_>>();
        let initial_carrier_kg = parcels.iter().map(|parcel| parcel.carrier_kg).sum();
        AtmosphereState { version: "connected-atmosphere-state-v1".into(), identity: self.identity.clone(), parcels, initial_carrier_kg, initial_smoke_kg: 0.0, initial_heat_j: 0.0, smoke_source_kg: 0.0, heat_source_j: 0.0, carrier_boundary_kg: 0.0, smoke_boundary_kg: 0.0, heat_boundary_j: 0.0 }
    }

    fn validate_state(&self, state: &AtmosphereState) -> Result<(), String> {
        if state.version != "connected-atmosphere-state-v1" || state.identity != self.identity || state.parcels.len() != self.definition.volumes.len() { return Err("atmosphere state binding mismatch".into()); }
        let mut seen = BTreeSet::new();
        for parcel in &state.parcels {
            if !seen.insert(parcel.volume_id.clone()) || !self.volume_index.contains_key(&parcel.volume_id) || !parcel.carrier_kg.is_finite() || parcel.carrier_kg < 0.0 || !parcel.smoke_kg.is_finite() || parcel.smoke_kg < 0.0 || !parcel.heat_j.is_finite() { return Err("invalid atmosphere parcel".into()); }
        }
        for value in [state.initial_carrier_kg, state.initial_smoke_kg, state.initial_heat_j, state.smoke_source_kg, state.heat_source_j, state.carrier_boundary_kg, state.smoke_boundary_kg, state.heat_boundary_j] { if !value.is_finite() { return Err("invalid atmosphere ledger".into()); } }
        Ok(())
    }

    pub fn advance(&self, state: &AtmosphereState, seconds: f64, sources: &[AtmosphereSource]) -> Result<(AtmosphereState, AtmosphereReceipt), String> {
        self.validate_state(state)?;
        if !seconds.is_finite() || seconds < 0.0 || seconds > MAX_INTERVAL_S || (seconds > 0.0 && seconds < 1e-6) { return Err("invalid bounded atmosphere interval".into()); }
        if sources.len() > 64 { return Err("atmosphere source budget exceeded".into()); }
        let mut source_indexes = Vec::new();
        let mut source_ids = BTreeSet::new();
        for source in sources {
            if !source_ids.insert(source.volume_id.clone()) || !self.volume_index.contains_key(&source.volume_id) || !source.smoke_kg_s.is_finite() || source.smoke_kg_s < 0.0 || !source.heat_j_s.is_finite() { return Err("invalid atmosphere source".into()); }
            source_indexes.push((*self.volume_index.get(&source.volume_id).unwrap(), source));
        }
        let steps = if seconds == 0.0 { 0 } else { (seconds / self.definition.model.max_step_s).ceil() as usize };
        if steps > MAX_STEPS { return Err("atmosphere interval exceeds step budget".into()); }
        let dt = if steps == 0 { 0.0 } else { seconds / steps as f64 };
        let mut next = state.clone();
        let before_source = (state.smoke_source_kg, state.heat_source_j);
        let before_boundary = (state.carrier_boundary_kg, state.smoke_boundary_kg, state.heat_boundary_j);
        for _ in 0..steps {
            for (index, source) in &source_indexes {
                next.parcels[*index].smoke_kg += source.smoke_kg_s * dt;
                next.parcels[*index].heat_j += source.heat_j_s * dt;
                next.smoke_source_kg += source.smoke_kg_s * dt;
                next.heat_source_j += source.heat_j_s * dt;
            }
            self.exchange_step(&mut next, dt)?;
            self.validate_state(&next)?;
        }
        let receipt = AtmosphereReceipt { seconds, steps, source_smoke_kg: next.smoke_source_kg - before_source.0, source_heat_j: next.heat_source_j - before_source.1, carrier_boundary_kg: next.carrier_boundary_kg - before_boundary.0, smoke_boundary_kg: next.smoke_boundary_kg - before_boundary.1, heat_boundary_j: next.heat_boundary_j - before_boundary.2 };
        Ok((next, receipt))
    }

    fn exchange_step(&self, state: &mut AtmosphereState, dt: f64) -> Result<(), String> {
        let mut deltas = vec![(0.0, 0.0, 0.0); state.parcels.len()];
        for opening in &self.openings {
            let donor = &state.parcels[opening.from];
            let conductance = opening.area_m2 * opening.permeability * self.definition.model.mixing_velocity_mps * dt / opening.distance_m;
            if conductance <= 0.0 { continue; }
            let donor_volume = self.volume_m3(opening.from);
            let (other_carrier, other_smoke, other_heat, other_volume) = opening.to.map(|index| {
                let parcel = &state.parcels[index]; (parcel.carrier_kg, parcel.smoke_kg, parcel.heat_j, self.volume_m3(index))
            }).unwrap_or((self.ambient_carrier_density * donor_volume, 0.0, 0.0, donor_volume));
            let carrier_delta = ((other_carrier / other_volume) - (donor.carrier_kg / donor_volume)) * conductance * donor_volume;
            let bounded = carrier_delta.clamp(-donor.carrier_kg * self.definition.model.max_exchange_fraction, other_carrier * self.definition.model.max_exchange_fraction);
            let fraction = if carrier_delta < 0.0 { (-bounded / donor.carrier_kg.max(1e-12)).min(1.0) } else { 0.0 };
            let smoke_delta = if bounded < 0.0 { -donor.smoke_kg * fraction } else { (other_smoke / other_volume - donor.smoke_kg / donor_volume) * conductance * donor_volume };
            let heat_delta = if bounded < 0.0 { -donor.heat_j * fraction } else { (other_heat / other_volume - donor.heat_j / donor_volume) * conductance * donor_volume };
            deltas[opening.from].0 += bounded; deltas[opening.from].1 += smoke_delta; deltas[opening.from].2 += heat_delta;
            if let Some(index) = opening.to {
                deltas[index].0 -= bounded; deltas[index].1 -= smoke_delta; deltas[index].2 -= heat_delta;
            } else {
                state.carrier_boundary_kg += bounded;
                state.smoke_boundary_kg += smoke_delta;
                state.heat_boundary_j += heat_delta;
            }
        }
        for (parcel, (carrier, smoke, heat)) in state.parcels.iter_mut().zip(deltas) {
            parcel.carrier_kg += carrier;
            parcel.smoke_kg = (parcel.smoke_kg + smoke).max(0.0);
            parcel.heat_j += heat;
            if parcel.carrier_kg < -1e-9 || !parcel.carrier_kg.is_finite() || !parcel.smoke_kg.is_finite() || !parcel.heat_j.is_finite() { return Err("atmosphere exchange produced invalid parcel".into()); }
            parcel.carrier_kg = parcel.carrier_kg.max(0.0);
        }
        Ok(())
    }

    fn volume_m3(&self, index: usize) -> f64 { self.definition.volumes[index].members.iter().map(|member| member.volume_m3).sum() }

    pub fn encode_state(&self, state: &AtmosphereState) -> Result<Vec<u8>, String> {
        self.validate_state(state)?;
        postcard::to_allocvec(&(STATE_VERSION, state)).map_err(|_| "atmosphere state encoding failed".into())
    }

    pub fn decode_state(&self, bytes: &[u8]) -> Result<AtmosphereState, String> {
        let (version, state): (u16, AtmosphereState) = postcard::from_bytes(bytes).map_err(|_| "invalid atmosphere state")?;
        if version != STATE_VERSION { return Err("unsupported atmosphere state version".into()); }
        self.validate_state(&state)?;
        Ok(state)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition() -> AtmosphereDefinition {
        AtmosphereDefinition {
            version: "connected-atmosphere-definition-v1".into(), region_id: "room".into(), geometry_identity: "geo-1".into(), revision: 0,
            ambient: AtmosphereAmbient { pressure_pa: 101_325.0, temperature_k: 293.15 },
            model: AtmosphereModel { specific_gas_constant_jkg_k: 287.05, heat_capacity_jkg_k: 1005.0, mixing_velocity_mps: 1.0, buoyancy_velocity_mps_k: 0.1, pressure_velocity_mps_pa: 0.001, max_step_s: 0.2, max_exchange_fraction: 0.5, max_pressure_ratio: 2.0, max_temperature_delta_k: 100.0, max_smoke_mass_fraction: 0.01 },
            volumes: vec![AtmosphereVolumeDefinition { id: "lower".into(), members: vec![AtmosphereMember { cell_id: "cell:0,0,0".into(), volume_m3: 1.0, elevation_m: 0.0 }] }, AtmosphereVolumeDefinition { id: "upper".into(), members: vec![AtmosphereMember { cell_id: "cell:0,1,0".into(), volume_m3: 1.0, elevation_m: 0.54 }] }],
            openings: vec![AtmosphereOpeningDefinition { id: "stair".into(), from: "lower".into(), from_cell_id: "cell:0,0,0".into(), to: Some("upper".into()), to_cell_id: Some("cell:0,1,0".into()), area_m2: 1.0, distance_m: 1.0, elevation_m: 0.54, permeability: 1.0 }],
        }
    }

    #[test]
    fn finite_source_moves_through_connected_parcels_and_round_trips() {
        let atmosphere = CompiledAtmosphere::compile(definition()).unwrap();
        let state = atmosphere.initial();
        let (next, receipt) = atmosphere.advance(&state, 1.0, &[AtmosphereSource { volume_id: "lower".into(), smoke_kg_s: 0.001, heat_j_s: 10.0 }]).unwrap();
        assert_eq!(receipt.steps, 5);
        assert!(next.smoke_source_kg > 0.0 && next.parcels[1].smoke_kg > 0.0);
        assert_eq!(atmosphere.decode_state(&atmosphere.encode_state(&next).unwrap()).unwrap(), next);
    }

    #[test]
    fn ambient_opening_accounts_boundary_without_mutating_input() {
        let mut definition = definition();
        definition.openings.push(AtmosphereOpeningDefinition { id: "chimney".into(), from: "upper".into(), from_cell_id: "cell:0,1,0".into(), to: None, to_cell_id: None, area_m2: 1.0, distance_m: 1.0, elevation_m: 1.0, permeability: 1.0 });
        let atmosphere = CompiledAtmosphere::compile(definition).unwrap();
        let state = atmosphere.initial();
        let (next, _) = atmosphere.advance(&state, 1.0, &[AtmosphereSource { volume_id: "upper".into(), smoke_kg_s: 0.001, heat_j_s: 0.0 }]).unwrap();
        assert!(next.smoke_boundary_kg <= 0.0);
        assert_eq!(state.smoke_source_kg, 0.0);
    }

    #[test]
    fn malformed_definition_and_late_source_fail_before_state_change() {
        let mut definition = definition();
        definition.volumes.push(AtmosphereVolumeDefinition { id: "bad".into(), members: Vec::new() });
        assert!(CompiledAtmosphere::compile(definition).is_err());
        let atmosphere = CompiledAtmosphere::compile(definition()).unwrap();
        let state = atmosphere.initial();
        assert!(atmosphere.advance(&state, 0.1, &[AtmosphereSource { volume_id: "missing".into(), smoke_kg_s: 1.0, heat_j_s: 0.0 }]).is_err());
        assert_eq!(state.smoke_source_kg, 0.0);
    }
}
