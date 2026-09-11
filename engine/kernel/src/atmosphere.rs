//! Bounded connected-volume atmosphere owner.
//!
//! Geometry producers supply volumes and openings. This module owns only
//! carrier, smoke, sensible heat, detached advancement, and durable state.

use crate::quantity::resolve_quantity_change;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

const STATE_VERSION: u16 = 2;
const MAX_VOLUMES: usize = 2048;
const MAX_OPENINGS: usize = 56_000;
const MAX_MEMBERS: usize = 40_000;
const MAX_INTERVAL_S: f64 = 6.0;
const MAX_STEPS: usize = 64;
const MAX_ID_BYTES: usize = 16_384;
const MAX_STATE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereMember {
    pub cell_id: String,
    pub volume_m3: f64,
    pub elevation_m: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereVolumeDefinition {
    pub id: String,
    pub members: Vec<AtmosphereMember>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
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

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
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

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereAmbient {
    pub pressure_pa: f64,
    pub temperature_k: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
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
    volume_id: String,
    carrier_kg: f64,
    smoke_kg: f64,
    heat_j: f64,
}

impl AtmosphereParcel {
    pub fn volume_id(&self) -> &str {
        &self.volume_id
    }
    pub fn carrier_kg(&self) -> f64 {
        self.carrier_kg
    }
    pub fn smoke_kg(&self) -> f64 {
        self.smoke_kg
    }
    pub fn heat_j(&self) -> f64 {
        self.heat_j
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereState {
    #[serde(skip)]
    owner: Arc<()>,
    version: String,
    identity: String,
    parcels: Vec<AtmosphereParcel>,
    initial_carrier_kg: f64,
    initial_smoke_kg: f64,
    initial_heat_j: f64,
    smoke_source_kg: f64,
    heat_source_j: f64,
    carrier_boundary_kg: f64,
    smoke_boundary_kg: f64,
    heat_boundary_j: f64,
}

impl AtmosphereState {
    pub fn parcels(&self) -> &[AtmosphereParcel] {
        &self.parcels
    }
    pub fn identity(&self) -> &str {
        &self.identity
    }
    pub fn smoke_source_kg(&self) -> f64 {
        self.smoke_source_kg
    }
    pub fn heat_source_j(&self) -> f64 {
        self.heat_source_j
    }
    pub fn carrier_boundary_kg(&self) -> f64 {
        self.carrier_boundary_kg
    }
    pub fn smoke_boundary_kg(&self) -> f64 {
        self.smoke_boundary_kg
    }
    pub fn heat_boundary_j(&self) -> f64 {
        self.heat_boundary_j
    }
}

#[derive(Clone, Debug, PartialEq)]
struct OpeningIndex {
    from: usize,
    to: Option<usize>,
    area_m2: f64,
    distance_m: f64,
    permeability: f64,
    elevation_m: f64,
}

#[derive(Clone, Copy, Debug)]
struct Flow {
    left: usize,
    right: Option<usize>,
    mixed_m3: f64,
    pressure_m3: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Quantity {
    Carrier,
    Smoke,
    Heat,
}

#[derive(Clone, Copy, Debug)]
struct MemberLocation { volume: usize, member: usize, volume_m3: f64 }

#[derive(Clone, Debug)]
pub struct CompiledAtmosphere {
    definition: SharedAtmosphereDefinition,
    exported_definition: std::sync::OnceLock<AtmosphereDefinition>,
    /// Complete physical definition binding, computed only when geometry is compiled.
    content_digest: [u8; 32],
    openings: Vec<OpeningIndex>,
    /// Equivalent face conductances for exchange; physical openings remain for remap.
    exchange_openings: Vec<OpeningIndex>,
    volume_index: BTreeMap<String, usize>,
    member_index: Vec<MemberLocation>,
    incident_openings: Vec<Vec<usize>>,
    volume_m3: Vec<f64>,
    elevation_m: Vec<f64>,
    ambient_carrier_density: f64,
    identity: String,
    owner: Arc<()>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtmosphereSource {
    pub volume_id: String,
    pub smoke_kg_s: f64,
    pub heat_j_s: f64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AtmosphereReceipt {
    pub seconds: f64,
    pub steps: usize,
    pub unresolved_exchanges: usize,
    pub source_smoke_kg: f64,
    pub source_heat_j: f64,
    pub carrier_boundary_kg: f64,
    pub smoke_boundary_kg: f64,
    pub heat_boundary_j: f64,
}

fn finite_nonnegative(value: f64, name: &str) -> Result<(), String> {
    if !value.is_finite() || value < 0.0 {
        return Err(format!("invalid atmosphere {name}"));
    }
    Ok(())
}

fn changed_quantity(before: f64, delta: f64) -> Result<f64, String> {
    resolve_quantity_change(before, delta)?
        .ok_or_else(|| "atmosphere source is below representable quantity resolution".into())
}

fn identity(definition: &SharedAtmosphereDefinition) -> Result<String, String> {
    if definition.geometry_identity.len() > MAX_ID_BYTES {
        return Err("atmosphere geometry identity exceeds bound".into());
    }
    Ok(format!(
        "atmosphere:{}:{}:{}:{}:{}",
        definition.region_id.len(),
        definition.region_id,
        definition.geometry_identity.len(),
        definition.geometry_identity,
        definition.revision
    ))
}

mod geometry;
pub(crate) use geometry::{MixingTile, FaceEndpoint, connect_face, geometry_identity};
pub use geometry::{project as project_geometry, AirAtmosphereGeometry, UnmodeledWaterPolicy};
mod shared_definition;
pub(crate) use shared_definition::SharedAtmosphereDefinition;
mod definition;
mod rebind;
pub use rebind::{rebind as rebind_geometry, AtmosphereRebindReceipt, AtmosphereRebindResult, RebindBlockReason};
#[cfg(test)]
mod rebind_tests;
mod exchange;
mod state;
#[cfg(test)]
mod tests;

/// Read-only physical facts at one admitted receiver. `None` means there is no
/// modeled air receiver; it must not be presented as clean or breathable air.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AtmosphereSample {
    pub volume_id: String,
    pub temperature_c: f64,
    pub pressure_pa: f64,
    pub smoke_kg_m3: f64,
}

impl CompiledAtmosphere {
    pub fn sample_cells(&self, state: &AtmosphereState, cells: &[String]) -> Result<Vec<Option<AtmosphereSample>>, String> {
        if cells.len() > 64 || cells.iter().any(|cell| cell.len() > 128) {
            return Err("atmosphere observation exceeds query budget".into());
        }
        if !Arc::ptr_eq(&self.owner, &state.owner) {
            return Err("atmosphere observation belongs to another geometry".into());
        }
        Ok(cells.iter().map(|cell| self.member_location(cell).map(|member| {
            let index = member.volume;
            let parcel = &state.parcels[index];
            AtmosphereSample {
                volume_id: parcel.volume_id.clone(),
                temperature_c: self.temperature(index, parcel) - 273.15,
                pressure_pa: self.pressure(index, parcel),
                smoke_kg_m3: parcel.smoke_kg / self.volume_m3[index],
            }
        })).collect())
    }
}
