use super::*;

impl CompiledAtmosphere {
    pub(super) fn envelope_valid(&self, index: usize, parcel: &AtmosphereParcel) -> bool {
        let temperature = self.temperature(index, parcel);
        let pressure = self.pressure(index, parcel);
        temperature.is_finite()
            && temperature > 0.0
            && (temperature - self.definition.ambient.temperature_k).abs()
                <= self.definition.model.max_temperature_delta_k
            && pressure.is_finite()
            && pressure >= 0.0
            && pressure
                <= self.definition.ambient.pressure_pa * self.definition.model.max_pressure_ratio
            && parcel.smoke_kg <= parcel.carrier_kg * self.definition.model.max_smoke_mass_fraction
    }

    pub fn initial(&self) -> AtmosphereState {
        let parcels = self
            .definition
            .volumes
            .iter()
            .map(|volume| {
                let volume_m3 = self.volume_m3[self.volume_index[&volume.id]];
                AtmosphereParcel {
                    volume_id: volume.id.clone(),
                    carrier_kg: self.ambient_carrier_density * volume_m3,
                    smoke_kg: 0.0,
                    heat_j: 0.0,
                }
            })
            .collect::<Vec<_>>();
        let initial_carrier_kg = parcels.iter().map(|parcel| parcel.carrier_kg).sum();
        AtmosphereState {
            exchange_cache: None,
            owner: self.owner.clone(),
            version: "connected-atmosphere-state-v1".into(),
            identity: self.identity.clone(),
            parcels,
            initial_carrier_kg,
            initial_smoke_kg: 0.0,
            initial_heat_j: 0.0,
            smoke_source_kg: 0.0,
            heat_source_j: 0.0,
            carrier_boundary_kg: 0.0,
            smoke_boundary_kg: 0.0,
            heat_boundary_j: 0.0,
        }
    }

    pub(super) fn validate_state(&self, state: &AtmosphereState) -> Result<(), String> {
        if !Arc::ptr_eq(&state.owner, &self.owner)
            || state.version != "connected-atmosphere-state-v1"
            || state.identity != self.identity
            || state.parcels.len() != self.definition.volumes.len()
        {
            return Err("atmosphere state binding mismatch".into());
        }
        for (index, parcel) in state.parcels.iter().enumerate() {
            if parcel.volume_id != self.definition.volumes[index].id
                || !parcel.carrier_kg.is_finite()
                || parcel.carrier_kg < 0.0
                || !parcel.smoke_kg.is_finite()
                || parcel.smoke_kg < 0.0
                || !parcel.heat_j.is_finite()
            {
                return Err("invalid atmosphere parcel".into());
            }
            if !self.envelope_valid(index, parcel) {
                return Err("atmosphere parcel exceeds physical envelope".into());
            }
        }
        for value in [
            state.initial_carrier_kg,
            state.initial_smoke_kg,
            state.initial_heat_j,
            state.smoke_source_kg,
            state.heat_source_j,
            state.carrier_boundary_kg,
            state.smoke_boundary_kg,
            state.heat_boundary_j,
        ] {
            if !value.is_finite() {
                return Err("invalid atmosphere ledger".into());
            }
        }
        let carrier = state
            .parcels
            .iter()
            .map(|parcel| parcel.carrier_kg)
            .sum::<f64>()
            + state.carrier_boundary_kg;
        let smoke = state
            .parcels
            .iter()
            .map(|parcel| parcel.smoke_kg)
            .sum::<f64>()
            + state.smoke_boundary_kg;
        let heat = state
            .parcels
            .iter()
            .map(|parcel| parcel.heat_j)
            .sum::<f64>()
            + state.heat_boundary_j;
        if (carrier - state.initial_carrier_kg).abs() > 1e-8 * state.initial_carrier_kg.max(1.0)
            || (smoke - state.initial_smoke_kg - state.smoke_source_kg).abs()
                > 1e-8
                    * (state.initial_smoke_kg + state.smoke_source_kg)
                        .abs()
                        .max(1.0)
            || (heat - state.initial_heat_j - state.heat_source_j).abs()
                > 1e-8 * (state.initial_heat_j + state.heat_source_j).abs().max(1.0)
        {
            return Err("atmosphere ledger is not conserved".into());
        }
        Ok(())
    }

    pub fn encode_state(&self, state: &AtmosphereState) -> Result<Vec<u8>, String> {
        self.validate_state(state)?;
        let bytes = postcard::to_allocvec(&(STATE_VERSION, self.content_digest, state))
            .map_err(|_| "atmosphere state encoding failed")?;
        if bytes.len() > MAX_STATE_BYTES {
            return Err("atmosphere state exceeds byte bound".into());
        }
        Ok(bytes)
    }

    pub fn decode_state(&self, bytes: &[u8]) -> Result<AtmosphereState, String> {
        if bytes.len() > MAX_STATE_BYTES {
            return Err("atmosphere state exceeds byte bound".into());
        }
        let ((version, digest, mut state), rest): ((u16, [u8; 32], AtmosphereState), &[u8]) =
            postcard::take_from_bytes(bytes).map_err(|_| "invalid atmosphere state")?;
        if !rest.is_empty() {
            return Err("atmosphere state contains trailing bytes".into());
        }
        if version != STATE_VERSION {
            return Err("unsupported atmosphere state version".into());
        }
        if digest != self.content_digest {
            return Err("atmosphere state definition binding mismatch".into());
        }
        state.owner = self.owner.clone();
        self.validate_state(&state)?;
        Ok(state)
    }
}

// Derived execution caches do not change a physical state or its wire format.
impl PartialEq for AtmosphereState {
    fn eq(&self, other: &Self) -> bool {
        self.owner == other.owner
            && self.version == other.version
            && self.identity == other.identity
            && self.parcels == other.parcels
            && self.initial_carrier_kg == other.initial_carrier_kg
            && self.initial_smoke_kg == other.initial_smoke_kg
            && self.initial_heat_j == other.initial_heat_j
            && self.smoke_source_kg == other.smoke_source_kg
            && self.heat_source_j == other.heat_source_j
            && self.carrier_boundary_kg == other.carrier_boundary_kg
            && self.smoke_boundary_kg == other.smoke_boundary_kg
            && self.heat_boundary_j == other.heat_boundary_j
    }
}
