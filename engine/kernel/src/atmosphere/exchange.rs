use super::*;

impl CompiledAtmosphere {
    pub fn advance(
        &self,
        state: &AtmosphereState,
        seconds: f64,
        sources: &[AtmosphereSource],
    ) -> Result<(AtmosphereState, AtmosphereReceipt), String> {
        self.validate_state(state)?;
        if !seconds.is_finite()
            || seconds < 0.0
            || seconds > MAX_INTERVAL_S
            || (seconds > 0.0 && seconds < 1e-6)
        {
            return Err("invalid bounded atmosphere interval".into());
        }
        if sources.len() > 64 {
            return Err("atmosphere source budget exceeded".into());
        }
        let mut source_indexes = Vec::new();
        let mut source_ids = BTreeSet::new();
        for source in sources {
            if !source_ids.insert(source.volume_id.clone())
                || !self.volume_index.contains_key(&source.volume_id)
                || !source.smoke_kg_s.is_finite()
                || source.smoke_kg_s < 0.0
                || !source.heat_j_s.is_finite()
            {
                return Err("invalid atmosphere source".into());
            }
            source_indexes.push((*self.volume_index.get(&source.volume_id).unwrap(), source));
        }
        let steps = if seconds == 0.0 {
            0
        } else {
            (seconds / self.definition.model.max_step_s).ceil() as usize
        };
        if steps > MAX_STEPS {
            return Err("atmosphere interval exceeds step budget".into());
        }
        let dt = if steps == 0 {
            0.0
        } else {
            seconds / steps as f64
        };
        let mut next = state.clone();
        let before_source = (state.smoke_source_kg, state.heat_source_j);
        let before_boundary = (
            state.carrier_boundary_kg,
            state.smoke_boundary_kg,
            state.heat_boundary_j,
        );
        let mut unresolved_exchanges = 0;
        for _ in 0..steps {
            for (index, source) in &source_indexes {
                next.parcels[*index].smoke_kg =
                    changed_quantity(next.parcels[*index].smoke_kg, source.smoke_kg_s * dt)?;
                next.parcels[*index].heat_j =
                    changed_quantity(next.parcels[*index].heat_j, source.heat_j_s * dt)?;
                next.smoke_source_kg =
                    changed_quantity(next.smoke_source_kg, source.smoke_kg_s * dt)?;
                next.heat_source_j = changed_quantity(next.heat_source_j, source.heat_j_s * dt)?;
            }
            unresolved_exchanges += self.exchange_step(&mut next, dt)?;
            self.validate_state(&next)?;
        }
        let receipt = AtmosphereReceipt {
            seconds,
            steps,
            unresolved_exchanges,
            source_smoke_kg: next.smoke_source_kg - before_source.0,
            source_heat_j: next.heat_source_j - before_source.1,
            carrier_boundary_kg: next.carrier_boundary_kg - before_boundary.0,
            smoke_boundary_kg: next.smoke_boundary_kg - before_boundary.1,
            heat_boundary_j: next.heat_boundary_j - before_boundary.2,
        };
        Ok((next, receipt))
    }

    /// Emissions released directly outdoors have no resident parcel. Record both
    /// their finite source and outward boundary in the same detached candidate.
    pub(crate) fn advance_with_boundary(
        &self, state: &AtmosphereState, seconds: f64,
        sources: &[AtmosphereSource], outdoor: (f64, f64),
    ) -> Result<(AtmosphereState, AtmosphereReceipt), String> {
        finite_nonnegative(outdoor.0, "outdoor smoke rate")?;
        if !outdoor.1.is_finite() { return Err("invalid outdoor heat rate".into()); }
        let (mut next, mut receipt) = self.advance(state, seconds, sources)?;
        let smoke = outdoor.0 * seconds;
        let heat = outdoor.1 * seconds;
        next.smoke_source_kg = changed_quantity(next.smoke_source_kg, smoke)?;
        next.smoke_boundary_kg = changed_quantity(next.smoke_boundary_kg, smoke)?;
        next.heat_source_j = changed_quantity(next.heat_source_j, heat)?;
        next.heat_boundary_j = changed_quantity(next.heat_boundary_j, heat)?;
        self.validate_state(&next)?;
        receipt.source_smoke_kg = next.smoke_source_kg - state.smoke_source_kg;
        receipt.source_heat_j = next.heat_source_j - state.heat_source_j;
        receipt.smoke_boundary_kg = next.smoke_boundary_kg - state.smoke_boundary_kg;
        receipt.heat_boundary_j = next.heat_boundary_j - state.heat_boundary_j;
        Ok((next, receipt))
    }

    fn exchange_step(&self, state: &mut AtmosphereState, dt: f64) -> Result<usize, String> {
        let snapshot = state.parcels.clone();
        let flows = self.bounded_flows(self.opening_flows(&snapshot, dt));
        let mut unresolved = 0;
        for flow in flows {
            unresolved += self.mix_pair(state, &snapshot, &flow)?;
            unresolved += self.advect_pair(state, &snapshot, &flow)?;
        }
        Ok(unresolved)
    }

    fn opening_flows(&self, parcels: &[AtmosphereParcel], dt: f64) -> Vec<Flow> {
        self.exchange_openings
            .iter()
            .map(|opening| {
                let left_temperature = self.temperature(opening.from, &parcels[opening.from]);
                let right_temperature = opening
                    .to
                    .map(|index| self.temperature(index, &parcels[index]))
                    .unwrap_or(self.definition.ambient.temperature_k);
                let lower = if self.elevation_m[opening.from]
                    <= opening
                        .to
                        .map(|index| self.elevation_m[index])
                        .unwrap_or(opening.elevation_m)
                {
                    left_temperature
                } else {
                    right_temperature
                };
                let upper = if self.elevation_m[opening.from]
                    <= opening
                        .to
                        .map(|index| self.elevation_m[index])
                        .unwrap_or(opening.elevation_m)
                {
                    right_temperature
                } else {
                    left_temperature
                };
                let height = (opening
                    .to
                    .map(|index| self.elevation_m[index])
                    .unwrap_or(opening.elevation_m)
                    - self.elevation_m[opening.from])
                    .abs();
                let buoyancy = self.definition.model.buoyancy_velocity_mps_k
                    * (lower - upper).max(0.0)
                    * height
                    / opening.distance_m;
                let interval = opening.area_m2 * opening.permeability * dt;
                let left_pressure = self.pressure(opening.from, &parcels[opening.from]);
                let right_pressure = opening
                    .to
                    .map(|index| self.pressure(index, &parcels[index]))
                    .unwrap_or(self.definition.ambient.pressure_pa);
                Flow {
                    left: opening.from,
                    right: opening.to,
                    mixed_m3: interval * (self.definition.model.mixing_velocity_mps + buoyancy),
                    pressure_m3: interval
                        * self.definition.model.pressure_velocity_mps_pa
                        * (left_pressure - right_pressure),
                }
            })
            .collect()
    }

    fn bounded_flows(&self, flows: Vec<Flow>) -> Vec<Flow> {
        let mut outgoing = vec![0.0; self.volume_m3.len()];
        let mut incoming = vec![0.0; self.volume_m3.len()];
        for flow in &flows {
            outgoing[flow.left] += flow.mixed_m3 + flow.pressure_m3.max(0.0);
            incoming[flow.left] += flow.mixed_m3 + (-flow.pressure_m3).max(0.0);
            if let Some(right) = flow.right {
                outgoing[right] += flow.mixed_m3 + (-flow.pressure_m3).max(0.0);
                incoming[right] += flow.mixed_m3 + flow.pressure_m3.max(0.0);
            }
        }
        let out = outgoing
            .iter()
            .enumerate()
            .map(|(i, amount)| {
                if *amount == 0.0 {
                    1.0
                } else {
                    (self.volume_m3[i] * self.definition.model.max_exchange_fraction / amount)
                        .min(1.0)
                }
            })
            .collect::<Vec<_>>();
        let into = incoming
            .iter()
            .enumerate()
            .map(|(i, amount)| {
                if *amount == 0.0 {
                    1.0
                } else {
                    (self.volume_m3[i] * self.definition.model.max_exchange_fraction / amount)
                        .min(1.0)
                }
            })
            .collect::<Vec<_>>();
        flows
            .into_iter()
            .map(|flow| {
                let right_out = flow.right.map(|i| out[i]).unwrap_or(1.0);
                let right_in = flow.right.map(|i| into[i]).unwrap_or(1.0);
                Flow {
                    mixed_m3: flow.mixed_m3
                        * out[flow.left]
                            .min(into[flow.left])
                            .min(right_out)
                            .min(right_in),
                    pressure_m3: flow.pressure_m3
                        * if flow.pressure_m3 >= 0.0 {
                            out[flow.left].min(right_in)
                        } else {
                            into[flow.left].min(right_out)
                        },
                    ..flow
                }
            })
            .collect()
    }

    fn concentration(
        &self,
        parcels: &[AtmosphereParcel],
        index: Option<usize>,
        quantity: Quantity,
    ) -> f64 {
        match index {
            Some(i) => {
                (match quantity {
                    Quantity::Carrier => parcels[i].carrier_kg,
                    Quantity::Smoke => parcels[i].smoke_kg,
                    Quantity::Heat => parcels[i].heat_j,
                }) / self.volume_m3[i]
            }
            None => {
                if quantity == Quantity::Carrier {
                    self.ambient_carrier_density
                } else {
                    0.0
                }
            }
        }
    }
    pub(super) fn temperature(&self, _index: usize, parcel: &AtmosphereParcel) -> f64 {
        self.definition.ambient.temperature_k
            + parcel.heat_j
                / (parcel.carrier_kg.max(1e-12) * self.definition.model.heat_capacity_jkg_k)
    }
    pub(super) fn pressure(&self, index: usize, parcel: &AtmosphereParcel) -> f64 {
        parcel.carrier_kg
            * self.definition.model.specific_gas_constant_jkg_k
            * self.temperature(index, parcel)
            / self.volume_m3[index]
    }
    pub(super) fn apply_pair(
        &self,
        state: &mut AtmosphereState,
        flow: &Flow,
        quantity: Quantity,
        delta_left: f64,
    ) -> Result<bool, String> {
        let current_left = match quantity {
            Quantity::Carrier => state.parcels[flow.left].carrier_kg,
            Quantity::Smoke => state.parcels[flow.left].smoke_kg,
            Quantity::Heat => state.parcels[flow.left].heat_j,
        };
        let current_right = flow
            .right
            .map(|i| {
                let parcel = &state.parcels[i];
                match quantity {
                    Quantity::Carrier => parcel.carrier_kg,
                    Quantity::Smoke => parcel.smoke_kg,
                    Quantity::Heat => parcel.heat_j,
                }
            })
            .unwrap_or(match quantity {
                Quantity::Carrier => state.carrier_boundary_kg,
                Quantity::Smoke => state.smoke_boundary_kg,
                Quantity::Heat => state.heat_boundary_j,
            });
        let Some(next_left) = resolve_quantity_change(current_left, delta_left)? else {
            return Ok(false);
        };
        let Some(next_right) = resolve_quantity_change(current_right, -delta_left)? else {
            return Ok(false);
        };
        if !next_left.is_finite()
            || !next_right.is_finite()
            || (quantity != Quantity::Heat
                && (next_left < 0.0 || (flow.right.is_some() && next_right < 0.0)))
        {
            return Err("atmosphere paired exchange is not representable".into());
        }
        let left = &mut state.parcels[flow.left];
        match quantity {
            Quantity::Carrier => left.carrier_kg = next_left,
            Quantity::Smoke => left.smoke_kg = next_left,
            Quantity::Heat => left.heat_j = next_left,
        }
        if let Some(index) = flow.right {
            let parcel = &mut state.parcels[index];
            match quantity {
                Quantity::Carrier => parcel.carrier_kg = next_right,
                Quantity::Smoke => parcel.smoke_kg = next_right,
                Quantity::Heat => parcel.heat_j = next_right,
            }
        } else {
            match quantity {
                Quantity::Carrier => state.carrier_boundary_kg = next_right,
                Quantity::Smoke => state.smoke_boundary_kg = next_right,
                Quantity::Heat => state.heat_boundary_j = next_right,
            }
        }
        Ok(true)
    }
    fn mix_pair(
        &self,
        state: &mut AtmosphereState,
        snapshot: &[AtmosphereParcel],
        flow: &Flow,
    ) -> Result<usize, String> {
        let mut unresolved = 0;
        for quantity in [Quantity::Carrier, Quantity::Smoke, Quantity::Heat] {
            let delta = (self.concentration(snapshot, flow.right, quantity)
                - self.concentration(snapshot, Some(flow.left), quantity))
                * flow.mixed_m3;
            if !self.apply_pair(state, flow, quantity, delta)? {
                unresolved += 1;
            }
        }
        Ok(unresolved)
    }
    fn advect_pair(
        &self,
        state: &mut AtmosphereState,
        snapshot: &[AtmosphereParcel],
        flow: &Flow,
    ) -> Result<usize, String> {
        if flow.pressure_m3 == 0.0 {
            return Ok(0);
        }
        let donor = if flow.pressure_m3 > 0.0 {
            Some(flow.left)
        } else {
            flow.right
        };
        let mut unresolved = 0;
        for quantity in [Quantity::Carrier, Quantity::Smoke, Quantity::Heat] {
            let delta = -flow.pressure_m3 * self.concentration(snapshot, donor, quantity);
            if !self.apply_pair(state, flow, quantity, delta)? {
                unresolved += 1;
            }
        }
        Ok(unresolved)
    }


}
