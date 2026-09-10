export type AtmosphereMember = {
  readonly cellId: string;
  readonly volumeM3: number;
  readonly elevationM: number;
};

export type AtmosphereVolumeDefinition = {
  readonly id: string;
  readonly members: readonly AtmosphereMember[];
};

export type AtmosphereOpeningDefinition = {
  readonly id: string;
  readonly from: string;
  readonly fromCellId: string;
  /** Null is an explicitly declared ambient boundary. */
  readonly to: string | null;
  readonly toCellId: string | null;
  readonly areaM2: number;
  readonly distanceM: number;
  readonly elevationM: number;
  readonly permeability: number;
};

export type AtmosphereModel = {
  readonly specificGasConstantJKgK: number;
  readonly heatCapacityJKgK: number;
  readonly mixingVelocityMPS: number;
  readonly buoyancyVelocityMPSK: number;
  readonly pressureVelocityMPSPa: number;
  readonly maxStepS: number;
  readonly maxExchangeFraction: number;
  /** Upper pressure admission envelope; vacuum and finite underpressure are valid. */
  readonly maxPressureRatio: number;
  readonly maxTemperatureDeltaK: number;
  readonly maxSmokeMassFraction: number;
};

export type AtmosphereDefinition = {
  readonly version: "connected-atmosphere-definition-v1";
  readonly regionId: string;
  /** Stable identity of the physical geometry snapshot that supplied the cells. */
  readonly geometryIdentity: string;
  readonly revision: number;
  readonly ambient: {
    readonly pressurePa: number;
    readonly temperatureK: number;
  };
  readonly model: AtmosphereModel;
  readonly volumes: readonly AtmosphereVolumeDefinition[];
  readonly openings: readonly AtmosphereOpeningDefinition[];
};

export type AtmosphereParcel = {
  readonly volumeId: string;
  readonly carrierKg: number;
  readonly smokeKg: number;
  /** Signed sensible heat relative to the declared ambient temperature. */
  readonly heatJ: number;
};

export type AtmosphereState = {
  readonly version: "connected-atmosphere-state-v1";
  readonly identity: string;
  readonly parcels: readonly AtmosphereParcel[];
  readonly initialCarrierKg: number;
  readonly initialSmokeKg: number;
  readonly initialHeatJ: number;
  readonly smokeSourceKg: number;
  readonly heatSourceJ: number;
  /** Signed outward boundary quantities; imports are negative. */
  readonly carrierBoundaryKg: number;
  readonly smokeBoundaryKg: number;
  readonly heatBoundaryJ: number;
};

export type AtmosphereSource = {
  readonly volumeId: string;
  readonly smokeKgS: number;
  readonly heatJS: number;
};

export type AtmosphereGeometryMetricUpdate = {
  readonly geometryIdentity: string;
  readonly revision: number;
  readonly memberVolumes: readonly {
    readonly volumeId: string;
    readonly cellId: string;
    readonly volumeM3: number;
  }[];
  readonly openingAreas: readonly {
    readonly openingId: string;
    readonly areaM2: number;
  }[];
};

export type AtmosphereVolumeFacts = AtmosphereParcel & {
  readonly volumeM3: number;
  readonly elevationM: number;
  readonly pressurePa: number;
  readonly temperatureK: number;
  readonly smokeKgM3: number;
};

export type AtmosphereFacts = {
  readonly volumes: readonly AtmosphereVolumeFacts[];
  readonly balance: {
    readonly carrierKg: number;
    readonly smokeKg: number;
    readonly heatJ: number;
  };
};

export type AtmosphereAdvanceReceipt = {
  readonly seconds: number;
  readonly steps: number;
  readonly sourceSmokeKg: number;
  readonly sourceHeatJ: number;
  readonly carrierBoundaryKg: number;
  readonly smokeBoundaryKg: number;
  readonly heatBoundaryJ: number;
};

export type AtmosphereRebindReceipt = {
  readonly oldIdentity: string;
  readonly newIdentity: string;
  readonly oldVolumeM3: number;
  readonly newVolumeM3: number;
  readonly carrierBoundaryKg: number;
  readonly smokeBoundaryKg: number;
  readonly heatBoundaryJ: number;
  readonly routedParcels: readonly {
    readonly fromVolumeId: string;
    readonly toVolumeId: string | null;
  }[];
};

export type AtmosphereRebindResult =
  | {
      readonly status: "applied";
      readonly definition: AtmosphereDefinition;
      readonly state: AtmosphereState;
      readonly receipt: AtmosphereRebindReceipt;
    }
  | {
      readonly status: "blocked";
      readonly reason: "trapped-volume-removed" | "pressure-envelope";
    };
