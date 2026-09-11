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

#[derive(Clone, Copy, Debug)]
struct Flow { left: usize, right: Option<usize>, mixed_m3: f64, pressure_m3: f64 }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Quantity { Carrier, Smoke, Heat }

#[derive(Clone, Debug)]
pub struct CompiledAtmosphere {
    definition: AtmosphereDefinition,
    openings: Vec<OpeningIndex>,
    volume_index: BTreeMap<String, usize>,
    volume_m3: Vec<f64>,
    elevation_m: Vec<f64>,
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
    let bytes = postcard::to_allocvec(definition).map_err(|_| "atmosphere identity encoding failed")?;
    let mut value = String::with_capacity(bytes.len() * 2 + 12);
    value.push_str("atmosphere:");
    for byte in bytes { value.push_str(&format!("{byte:02x}")); }
    Ok(value)
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
        let mut volume_m3 = Vec::with_capacity(definition.volumes.len());
        let mut elevation_m = Vec::with_capacity(definition.volumes.len());
        let mut members = 0usize;
        for (index, volume) in definition.volumes.iter().enumerate() {
            if volume.id.is_empty() || volume.members.is_empty() || volume_index.insert(volume.id.clone(), index).is_some() { return Err("invalid atmosphere volume identity".into()); }
            for member in &volume.members {
                if member.cell_id.is_empty() || !member.volume_m3.is_finite() || member.volume_m3 <= 0.0 || !member.elevation_m.is_finite() { return Err("invalid atmosphere member".into()); }
                members = members.checked_add(1).ok_or("atmosphere member budget overflow")?;
                if members > MAX_MEMBERS { return Err("atmosphere member budget exceeded".into()); }
            }
            let total: f64 = volume.members.iter().map(|member| member.volume_m3).sum();
            let elevation = volume.members.iter().map(|member| member.elevation_m * member.volume_m3).sum::<f64>() / total;
            if !total.is_finite() || total <= 0.0 || !elevation.is_finite() { return Err("invalid atmosphere volume aggregate".into()); }
            volume_m3.push(total);
            elevation_m.push(elevation);
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
        Ok(Self { definition, openings, volume_index, volume_m3, elevation_m, ambient_carrier_density, identity })
    }

    pub fn definition(&self) -> &AtmosphereDefinition { &self.definition }
    pub fn identity(&self) -> &str { &self.identity }

    pub fn initial(&self) -> AtmosphereState {
        let parcels = self.definition.volumes.iter().map(|volume| {
            let volume_m3 = self.volume_m3[self.volume_index[&volume.id]];
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
        let snapshot = state.parcels.clone();
        let flows = self.bounded_flows(self.opening_flows(&snapshot, dt));
        for flow in flows { self.mix_pair(state, &snapshot, &flow)?; self.advect_pair(state, &snapshot, &flow)?; }
        Ok(())
    }

    fn opening_flows(&self, parcels: &[AtmosphereParcel], dt: f64) -> Vec<Flow> {
        self.openings.iter().map(|opening| {
            let left_temperature = self.temperature(opening.from, &parcels[opening.from]);
            let right_temperature = opening.to.map(|index| self.temperature(index, &parcels[index])).unwrap_or(self.definition.ambient.temperature_k);
            let lower = if self.elevation_m[opening.from] <= opening.to.map(|index| self.elevation_m[index]).unwrap_or(opening.elevation_m) { left_temperature } else { right_temperature };
            let upper = if self.elevation_m[opening.from] <= opening.to.map(|index| self.elevation_m[index]).unwrap_or(opening.elevation_m) { right_temperature } else { left_temperature };
            let height = (opening.to.map(|index| self.elevation_m[index]).unwrap_or(opening.elevation_m) - self.elevation_m[opening.from]).abs();
            let buoyancy = self.definition.model.buoyancy_velocity_mps_k * (lower - upper).max(0.0) * height / opening.distance_m;
            let interval = opening.area_m2 * opening.permeability * dt;
            let left_pressure = self.pressure(opening.from, &parcels[opening.from]);
            let right_pressure = opening.to.map(|index| self.pressure(index, &parcels[index])).unwrap_or(self.definition.ambient.pressure_pa);
            Flow { left: opening.from, right: opening.to, mixed_m3: interval * (self.definition.model.mixing_velocity_mps + buoyancy), pressure_m3: interval * self.definition.model.pressure_velocity_mps_pa * (left_pressure - right_pressure) }
        }).collect()
    }

    fn bounded_flows(&self, flows: Vec<Flow>) -> Vec<Flow> {
        let mut outgoing = vec![0.0; self.volume_m3.len()];
        let mut incoming = vec![0.0; self.volume_m3.len()];
        for flow in &flows {
            outgoing[flow.left] += flow.mixed_m3 + flow.pressure_m3.max(0.0); incoming[flow.left] += flow.mixed_m3 + (-flow.pressure_m3).max(0.0);
            if let Some(right) = flow.right { outgoing[right] += flow.mixed_m3 + (-flow.pressure_m3).max(0.0); incoming[right] += flow.mixed_m3 + flow.pressure_m3.max(0.0); }
        }
        let out = outgoing.iter().enumerate().map(|(i, amount)| if *amount == 0.0 { 1.0 } else { (self.volume_m3[i] * self.definition.model.max_exchange_fraction / amount).min(1.0) }).collect::<Vec<_>>();
        let into = incoming.iter().enumerate().map(|(i, amount)| if *amount == 0.0 { 1.0 } else { (self.volume_m3[i] * self.definition.model.max_exchange_fraction / amount).min(1.0) }).collect::<Vec<_>>();
        flows.into_iter().map(|flow| {
            let right_out = flow.right.map(|i| out[i]).unwrap_or(1.0); let right_in = flow.right.map(|i| into[i]).unwrap_or(1.0);
            Flow { mixed_m3: flow.mixed_m3 * out[flow.left].min(into[flow.left]).min(right_out).min(right_in), pressure_m3: flow.pressure_m3 * if flow.pressure_m3 >= 0.0 { out[flow.left].min(right_in) } else { into[flow.left].min(right_out) }, ..flow }
        }).collect()
    }

    fn concentration(&self, parcels: &[AtmosphereParcel], index: Option<usize>, quantity: Quantity) -> f64 {
        match index { Some(i) => match quantity { Quantity::Carrier => parcels[i].carrier_kg, Quantity::Smoke => parcels[i].smoke_kg, Quantity::Heat => parcels[i].heat_j } / self.volume_m3[i], None => if quantity == Quantity::Carrier { self.ambient_carrier_density } else { 0.0 } }
    }
    fn temperature(&self, index: usize, parcel: &AtmosphereParcel) -> f64 { self.definition.ambient.temperature_k + parcel.heat_j / (parcel.carrier_kg.max(1e-12) * self.definition.model.heat_capacity_jkg_k) }
    fn pressure(&self, index: usize, parcel: &AtmosphereParcel) -> f64 { parcel.carrier_kg * self.definition.model.specific_gas_constant_jkg_k * self.temperature(index, parcel) / self.volume_m3[index] }
    fn apply_pair(&self, state: &mut AtmosphereState, flow: &Flow, quantity: Quantity, delta_left: f64) -> Result<(), String> {
        let current_left = match quantity { Quantity::Carrier => state.parcels[flow.left].carrier_kg, Quantity::Smoke => state.parcels[flow.left].smoke_kg, Quantity::Heat => state.parcels[flow.left].heat_j };
        let current_right = flow.right.map(|i| { let parcel = &state.parcels[i]; match quantity { Quantity::Carrier => parcel.carrier_kg, Quantity::Smoke => parcel.smoke_kg, Quantity::Heat => parcel.heat_j } }).unwrap_or(match quantity { Quantity::Carrier => 0.0, Quantity::Smoke => state.smoke_boundary_kg, Quantity::Heat => state.heat_boundary_j });
        let next_left = current_left + delta_left; let next_right = current_right - delta_left;
        if !next_left.is_finite() || !next_right.is_finite() || (quantity != Quantity::Heat && (next_left < 0.0 || (flow.right.is_some() && next_right < 0.0))) { return Ok(()); }
        let left = &mut state.parcels[flow.left];
        match quantity { Quantity::Carrier => left.carrier_kg = next_left, Quantity::Smoke => left.smoke_kg = next_left, Quantity::Heat => left.heat_j = next_left }
        if let Some(index) = flow.right { let parcel = &mut state.parcels[index]; match quantity { Quantity::Carrier => parcel.carrier_kg = next_right, Quantity::Smoke => parcel.smoke_kg = next_right, Quantity::Heat => parcel.heat_j = next_right } } else { match quantity { Quantity::Carrier => state.carrier_boundary_kg = next_right, Quantity::Smoke => state.smoke_boundary_kg = next_right, Quantity::Heat => state.heat_boundary_j = next_right } }
        Ok(())
    }
    fn mix_pair(&self, state: &mut AtmosphereState, snapshot: &[AtmosphereParcel], flow: &Flow) -> Result<(), String> { for quantity in [Quantity::Carrier, Quantity::Smoke, Quantity::Heat] { let delta = (self.concentration(snapshot, flow.right, quantity) - self.concentration(snapshot, Some(flow.left), quantity)) * flow.mixed_m3; self.apply_pair(state, flow, quantity, delta)?; } Ok(()) }
    fn advect_pair(&self, state: &mut AtmosphereState, snapshot: &[AtmosphereParcel], flow: &Flow) -> Result<(), String> { if flow.pressure_m3 == 0.0 { return Ok(()); } let donor = if flow.pressure_m3 > 0.0 { Some(flow.left) } else { flow.right }; for quantity in [Quantity::Carrier, Quantity::Smoke, Quantity::Heat] { let delta = -flow.pressure_m3 * self.concentration(snapshot, donor, quantity); self.apply_pair(state, flow, quantity, delta)?; } Ok(()) }

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
    fn equal_density_tracer_mixes_and_multiple_openings_share_donor_budget() {
        let mut definition = definition();
        definition.openings.push(AtmosphereOpeningDefinition { id: "second".into(), from: "lower".into(), from_cell_id: "cell:0,0,0".into(), to: Some("upper".into()), to_cell_id: Some("cell:0,1,0".into()), area_m2: 1.0, distance_m: 1.0, elevation_m: 0.54, permeability: 1.0 });
        let atmosphere = CompiledAtmosphere::compile(definition).unwrap();
        let mut state = atmosphere.initial();
        state.parcels[0].smoke_kg = 0.01;
        let total_before = state.parcels.iter().map(|parcel| parcel.smoke_kg).sum::<f64>() + state.smoke_boundary_kg;
        let (next, _) = atmosphere.advance(&state, 0.2, &[]).unwrap();
        let total_after = next.parcels.iter().map(|parcel| parcel.smoke_kg).sum::<f64>() + next.smoke_boundary_kg;
        assert!((total_after - total_before).abs() < 1e-12);
        assert!(next.parcels[0].smoke_kg >= 0.0 && next.parcels[1].smoke_kg >= 0.0);
    }

    #[test]
    fn pressure_and_height_temperature_drive_signed_exchange() {
        let atmosphere = CompiledAtmosphere::compile(definition()).unwrap();
        let mut pressure = atmosphere.initial();
        pressure.parcels[0].carrier_kg *= 1.1;
        let (after_pressure, _) = atmosphere.advance(&pressure, 0.2, &[]).unwrap();
        assert!(after_pressure.parcels[0].carrier_kg < pressure.parcels[0].carrier_kg);
        let mut warm = atmosphere.initial();
        warm.parcels[0].heat_j = 10_000.0;
        let (after_warm, _) = atmosphere.advance(&warm, 0.2, &[]).unwrap();
        assert!(after_warm.parcels[1].carrier_kg > warm.parcels[1].carrier_kg || after_warm.parcels[0].carrier_kg < warm.parcels[0].carrier_kg);
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
