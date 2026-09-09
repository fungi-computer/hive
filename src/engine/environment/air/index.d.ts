/** Stable global identities. Integer coordinates and membership are runtime laws. */
export type AirCellId = `cell:${number},${number},${number}`;
export type AirFaceId = `${"x" | "y" | "z"}:${number},${number},${number}`;
export type AirOpenSide = "x-" | "x+" | "y-" | "y+" | "z-" | "z+";
export type AirCoordinate = readonly [x: number, y: number, z: number];

/** Explicit SI constants bound into the model identity. */
export interface AirModel {
  readonly densityKgM3: number;
  readonly heatCapacityJKgK: number;
  readonly referenceTemperatureK: number;
  readonly gravityMSS: number;
  readonly viscosityM2S: number;
  readonly thermalDiffusivityM2S: number;
  readonly tracerDiffusivityM2S: number;
}

export interface AirDefinition {
  readonly version: "voxel-air-definition-v1";
  /** Nonempty, at most 160 characters. */
  readonly regionId: string;
  /** Nonnegative safe integer. */
  readonly revision: number;
  /** Signed safe integer voxel coordinates. y is vertical. */
  readonly origin: AirCoordinate;
  /** Each extent >=2; product <=1024, including solid cells. */
  readonly size: AirCoordinate;
  readonly spacingM: readonly [1, 0.54, 1];
  readonly solidCells: readonly AirCellId[];
  readonly closedFaces: readonly AirFaceId[];
  readonly openSides: readonly AirOpenSide[];
  readonly model: AirModel;
}

export interface AirInitialCell {
  readonly cellId: AirCellId;
  readonly smokeKg: number;
  /** Signed sensible-heat anomaly relative to the model reference atmosphere. */
  readonly heatJ: number;
}

export interface AirInitialInput {
  /** Exactly one explicit stock per fluid cell; no solid-cell entries. */
  readonly cells: readonly AirInitialCell[];
}

/** Current serialized state, copied/frozen and validated by the owner.
 * Cell arrays include solids (zero stocks), x fastest, then y, then z.
 * Velocity order follows the definition's canonical open face order.
 * Numeric/relational validity is a runtime law, not established by this shape.
 */
export interface AirState {
  readonly version: "voxel-boussinesq-air-state-v1";
  readonly identity: string;
  readonly timeS: number;
  readonly steps: number;
  readonly velocityMPS: readonly number[];
  readonly smokeKg: readonly number[];
  readonly heatJ: readonly number[];
  readonly initialSmokeKg: number;
  readonly initialHeatJ: number;
  readonly smokeSourceKg: number;
  readonly heatSourceJ: number;
  /** Signed net outward transfers; incoming reference air carries zero anomaly. */
  readonly smokeBoundaryKg: number;
  readonly heatBoundaryJ: number;
  readonly airImportM3: number;
  readonly airExportM3: number;
}

export interface AirBalance {
  readonly smokeKg: number;
  readonly heatJ: number;
}

export interface AirCellFacts {
  readonly cellId: AirCellId;
  readonly at: AirCoordinate;
  readonly volumeM3: number;
  readonly smokeKg: number;
  readonly smokeKgM3: number;
  readonly heatJ: number;
  readonly temperatureK: number;
}

export interface AirFaceFacts {
  readonly faceId: AirFaceId;
  readonly areaM2: number;
  readonly distanceM: number;
  /** null denotes the explicit exterior boundary, not another stored cell. */
  readonly leftCellId: AirCellId | null;
  readonly rightCellId: AirCellId | null;
  /** Positive from left to right. */
  readonly velocityMPS: number;
  readonly boundary: AirOpenSide | null;
}

export interface AirFacts {
  readonly timeS: number;
  readonly steps: number;
  /** Stock + net boundary - source - initial residuals. */
  readonly balance: AirBalance;
  /** Only fluid cells; unlike the canonical state arrays. */
  readonly cells: readonly AirCellFacts[];
  readonly faces: readonly AirFaceFacts[];
}

export interface AirSource {
  readonly cellId: AirCellId;
  /** Finite nonnegative rate, kilograms per second. */
  readonly smokeKgS: number;
  /** Finite signed rate, joules per second. */
  readonly heatJS: number;
}

export interface AirAdvanceOptions {
  /** Distinct known fluid cells. No callbacks or sources in serialized plans. */
  readonly sources?: readonly AirSource[];
  /** 1e-6..0.2 seconds; defaults to0.2. */
  readonly dtMaxS?: number;
  /** Positive integer <=512, default512. Limits may only be reduced. */
  readonly maxSteps?: number;
  /** Positive integer <=512, default512. */
  readonly maxTrials?: number;
  /** Positive integer <=65536, default65536, across this request. */
  readonly maxProjectionIterations?: number;
}

export interface AirWork {
  readonly accepted: number;
  readonly trials: number;
  readonly rejected: number;
  readonly projections: number;
  readonly projectionIterations: number;
  readonly maxAccepted: number;
  readonly maxTrials: number;
  readonly maxRejected: number;
  readonly maxProjections: number;
  readonly maxProjectionIterations: number;
}

/** Successful advance adds scalar evaluation counts and measured scratch sizes. */
export interface AirAdvanceWork extends AirWork {
  readonly scalarFaceEvaluations: number;
  readonly scalarStages: number;
  readonly scalarWorkspaceBytes: number;
  readonly projectionWorkspaceBytes: number;
}

export interface AirStepReceipt {
  readonly startS: number;
  readonly endS: number;
  readonly dtS: number;
  /** Maximum cell continuity residual in cubic metres per second. */
  readonly divergenceM3S: number;
  readonly scalarCourant: number;
  readonly momentumCourant: number;
}

export interface AirReceiptBalance extends AirBalance {
  /** smokeKg/heatJ above are maximum absolute per-cell reconstruction errors. */
  readonly totalSourceSmokeKg: number;
  readonly totalSourceHeatJ: number;
  readonly boundarySmokeKg: number;
  readonly boundaryHeatJ: number;
  readonly airImportM3: number;
  readonly airExportM3: number;
}

export interface AirAdvanceReceipt {
  readonly startS: number;
  readonly endS: number;
  /** Complete cell order, including solid cells. */
  readonly cellIds: readonly AirCellId[];
  readonly faceIds: readonly AirFaceId[];
  /** Signed integrated face transfers, positive left -> right. */
  readonly airM3: readonly number[];
  readonly smokeKg: readonly number[];
  readonly heatJ: readonly number[];
  /** Source amounts aligned with cellIds. */
  readonly sourceSmokeKg: readonly number[];
  readonly sourceHeatJ: readonly number[];
  readonly steps: readonly AirStepReceipt[];
  readonly balance: AirReceiptBalance;
}

/** Detached, uncommitted result. The host owns its durable transaction. */
export interface AirAdvanceResult {
  readonly state: AirState;
  readonly receipt: AirAdvanceReceipt;
  readonly work: AirAdvanceWork;
}

export interface AirRebindOptions {
  /** Positive integer <=65536, default65536. */
  readonly maxProjectionIterations?: number;
}

export interface AirRebindReceipt {
  readonly timeS: number;
  readonly oldIdentity: string;
  readonly newIdentity: string;
  readonly newFaces: readonly AirFaceId[];
  readonly closedFaces: readonly AirFaceId[];
  /** Resolved kinetic energy under rho * face area * face distance. */
  readonly oldKineticJ: number;
  readonly mappedKineticJ: number;
  readonly newKineticJ: number;
  readonly kineticChangeJ: number;
  readonly boundaryDissipationJ: number;
  readonly divergenceM3S: number;
  /** Rebind never converts projection dissipation to scalar stocks. */
  readonly thermalTransferJ: 0;
  readonly smokeTransferKg: 0;
}

export interface AirRebindResult {
  readonly definition: AirDefinition;
  readonly state: AirState;
  readonly receipt: AirRebindReceipt;
  /** Projection work only; no scalar evaluation/scratch fields are returned. */
  readonly work: AirWork;
}

export interface Air {
  readonly definition: AirDefinition;
  readonly identity: string;
  readonly initial: (input: AirInitialInput) => AirState;
  readonly read: (state: AirState) => AirFacts;
  /** Finite interval0..6s; nonzero intervals >=1e-6s. Bounds and clock resolution
   * are checked at runtime. Sources are finite rates over the solved interval.
   */
  readonly advance: (
    state: AirState,
    intervalS: number,
    options?: AirAdvanceOptions,
  ) => AirAdvanceResult;
  /** Validates a newer definition with unchanged fluid cells, volume and model.
   * Only opening masks/sides may differ. Its result belongs to the new identity.
   */
  readonly rebind: (
    state: AirState,
    nextDefinition: unknown,
    options?: AirRebindOptions,
  ) => AirRebindResult;
  readonly encode: (state: AirState) => string;
  readonly decode: (raw: string) => AirState;
}

/** Validates a plain current definition and returns its sole mutation owner.
 * Author content with `satisfies AirDefinition`; unknown input remains supported
 * at this parser boundary. The current runtime rejects extra fields/accessors.
 */
export declare function createAir(input: unknown): Air;
