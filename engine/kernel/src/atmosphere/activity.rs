//! Derived exact exchange activity. Sleeping edges keep their shared flow budget.
use super::*;

#[derive(Clone, Debug)]
pub(super) struct ExchangeCache {
    dt: u64,
    parcels: Vec<[u64; 3]>,
    pub(super) flows: Vec<Flow>,
    awake: Vec<bool>,
    pub(super) active: Vec<usize>,
    #[cfg(test)]
    pub(super) recomputed: usize,
}

fn signature(parcel: &AtmosphereParcel) -> [u64; 3] {
    [
        parcel.carrier_kg.to_bits(),
        parcel.smoke_kg.to_bits(),
        parcel.heat_j.to_bits(),
    ]
}

impl CompiledAtmosphere {
    pub(super) fn exchange_activity(&self, state: &AtmosphereState, dt: f64) -> Arc<ExchangeCache> {
        let previous = state.exchange_cache.as_ref().filter(|cache| {
            cache.dt == dt.to_bits()
                && cache.flows.len() == self.exchange_openings.len()
                && cache.parcels.len() == state.parcels.len()
        });
        let mut dirty = vec![previous.is_none(); self.exchange_openings.len()];
        if let Some(cache) = previous {
            let mut changed = false;
            for (volume, parcel) in state.parcels.iter().enumerate() {
                if signature(parcel) != cache.parcels[volume] {
                    changed = true;
                    for &edge in &self.exchange_incident[volume] {
                        dirty[edge] = true;
                    }
                }
            }
            if !changed {
                return cache.clone();
            }
        }
        let mut next = match previous {
            Some(cache) => (**cache).clone(),
            None => ExchangeCache {
                dt: dt.to_bits(),
                parcels: Vec::new(),
                flows: vec![
                    Flow {
                        left: 0,
                        right: None,
                        mixed_m3: 0.0,
                        pressure_m3: 0.0
                    };
                    self.exchange_openings.len()
                ],
                awake: vec![false; self.exchange_openings.len()],
                active: Vec::new(),
                #[cfg(test)]
                recomputed: 0,
            },
        };
        next.parcels = state.parcels.iter().map(signature).collect();
        #[cfg(test)]
        {
            next.recomputed = dirty.iter().filter(|&&value| value).count();
        }
        for (index, changed) in dirty.into_iter().enumerate() {
            if !changed {
                continue;
            }
            let flow = self.opening_flow(&self.exchange_openings[index], &state.parcels, dt);
            next.awake[index] = !flow.mixed_m3.is_finite()
                || !flow.pressure_m3.is_finite()
                || flow.pressure_m3 != 0.0
                || [Quantity::Carrier, Quantity::Smoke, Quantity::Heat]
                    .into_iter()
                    .any(|quantity| {
                        let left = self.concentration(&state.parcels, Some(flow.left), quantity);
                        let right = self.concentration(&state.parcels, flow.right, quantity);
                        !left.is_finite()
                            || !right.is_finite()
                            || (flow.mixed_m3 != 0.0 && left != right)
                    });
            next.flows[index] = flow;
        }
        next.active = next
            .awake
            .iter()
            .enumerate()
            .filter_map(|(i, &awake)| awake.then_some(i))
            .collect();
        Arc::new(next)
    }
}
