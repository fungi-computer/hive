/** Content-free physical material records. Consumers supply their material IDs. */
export type ActorId = string;
export type JobId = string;
export type LotId = string;
export type TransferId = string;
export type ContainerId = string;
export type OperationId = string;
export type RecipeId = string;
export type Cell = { x: number; z: number; level: number };
declare const positiveIntBrand: unique symbol;
export type PositiveInt = number & { readonly [positiveIntBrand]: true };
export type ItemLotLocation =
  | ({ kind: "ground" } & Cell)
  | { kind: "hand"; actor: ActorId }
  | { kind: "container"; container: ContainerId };
export type ItemLot<M extends string = string> = {
  id: LotId;
  material: M;
  quantity: PositiveInt;
  location: ItemLotLocation;
};
export type SourcePolicy<M extends string = string> =
  | { readonly kind: "eligible-ground"; readonly material: M }
  | {
      readonly kind: "eligible-container";
      readonly material: M;
      readonly container: ContainerId;
    }
  | { readonly kind: "exact-lot"; readonly lot: LotId };
export type TransferOrigin =
  | { readonly kind: "ground"; readonly cell: Cell }
  | { readonly kind: "container"; readonly container: ContainerId };
export type TransferRequest<M extends string = string> = {
  readonly source: SourcePolicy<M>;
  /** A whole request preserves one source lot; a portion may split it. */
  readonly quantityPolicy: "whole-lot" | "portion";
  readonly quantity: PositiveInt;
};
/** A held item is either promised to a container or retained for one operation. */
export type CarryIntent =
  | { readonly kind: "deliver"; readonly destination: ContainerId }
  | { readonly kind: "use"; readonly operation: OperationId };
export type JobTransferOwner = {
  readonly kind: "job";
  readonly job: JobId;
  readonly step: string;
};
export type OperationTransferOwner = {
  readonly kind: "operation";
  readonly operation: OperationId;
};
export type TransferOwner = JobTransferOwner | OperationTransferOwner;
/** Durable material promises outlive the worker currently moving a lot. */
export type MaterialBinding<M extends string = string> =
  | {
      readonly kind: "vessel-use";
      readonly id: OperationId;
      readonly vessel: LotId;
    }
  | {
      /** A non-container operation consumes this exact ordinary held lot. */
      readonly kind: "operation-use";
      readonly id: OperationId;
      readonly lot: LotId;
      readonly quantity: PositiveInt;
    }
  | {
      /** A resolved physical plan; recipe semantics stay with its definition. */
      readonly kind: "recipe";
      readonly id: OperationId;
      readonly definition: RecipeId;
      readonly station: ContainerId;
      readonly consumed: readonly {
        readonly role: string;
        readonly lot: LotId;
        readonly material: M;
        readonly quantity: PositiveInt;
      }[];
      readonly retained: readonly {
        readonly role: string;
        readonly lot: LotId;
        readonly material: M;
        readonly quantity: PositiveInt;
      }[];
      readonly promises: readonly {
        readonly role: string;
        readonly destination: ContainerId;
        readonly material: M;
        readonly quantity: PositiveInt;
      }[];
    };
export type Transfer<M extends string = string> = {
  readonly id: TransferId;
  readonly actor: ActorId;
  /** Consumer-defined opaque identity; the material kernel never branches on it. */
  readonly owner: TransferOwner;
  readonly request: TransferRequest<M>;
  /** Material resolved by reservation admission, retained after source exhaustion. */
  readonly resolvedMaterial: M;
  readonly intent: CarryIntent;
  phase:
    | {
        kind: "reserved";
        sourceLot: LotId;
        quantity: PositiveInt;
        origin: TransferOrigin;
      }
    | { kind: "carrying"; lot: LotId };
};
export type EmbeddedMaterial<M extends string = string> = {
  container: ContainerId;
  material: M;
  quantity: PositiveInt;
};
/** Immutable provenance and, after settlement, durable output receipt. */
export type RecipeTransformation<M extends string = string> = {
  readonly id: OperationId;
  readonly definition: RecipeId;
  readonly inputs: readonly {
    readonly role: string;
    readonly lot: LotId;
    readonly material: M;
    readonly quantity: PositiveInt;
  }[];
  /** Null is an attended/fermenting transformation with its live binding. */
  readonly settlement: null | {
    readonly station: ContainerId;
    readonly retained: readonly {
      readonly role: string;
      readonly lot: LotId;
      readonly material: M;
      readonly quantity: PositiveInt;
    }[];
    readonly outputs: readonly {
      readonly role: string;
      readonly destination: ContainerId;
      readonly material: M;
      readonly quantity: PositiveInt;
    }[];
  };
};
/** A durable settled-output consumption; its physical lot may later be gone. */
export type RecipeConsumption<M extends string = string> = {
  readonly id: OperationId;
  readonly transformation: OperationId;
  readonly role: string;
  readonly material: M;
  readonly quantity: PositiveInt;
};
/** Durable physical removal without creating a second inventory or event stream. */
export type MaterialSinkReceipt<M extends string = string> = {
  readonly id: string;
  readonly material: M;
  readonly quantity: PositiveInt;
};
export type MaterialsState<M extends string = string> = {
  lots: ItemLot<M>[];
  transfers: Transfer<M>[];
  bindings: MaterialBinding<M>[];
  transformations: RecipeTransformation<M>[];
  consumptions: RecipeConsumption<M>[];
  sinks: MaterialSinkReceipt<M>[];
  embedded: EmbeddedMaterial<M>[];
  nextLotId: number;
};

export type ContainerSpec<M extends string = string> = {
  id: ContainerId;
  capacity: PositiveInt;
  accepts: readonly M[];
  bulk: Readonly<Partial<Record<M, PositiveInt>>>;
};

export type TransferAccess = {
  sourceReachable: boolean;
  destinationReachableWithPayload: boolean;
};

export type LegalDrop = { cell: Cell; legal: boolean };

export type MaterialFailure =
  | "invalid-positive-integer"
  | "invalid-allocator"
  | "duplicate-lot"
  | "duplicate-sink"
  | "duplicate-transfer"
  | "lot-not-found"
  | "transfer-not-found"
  | "source-not-available"
  | "source-ineligible"
  | "source-insufficient"
  | "source-unreachable"
  | "destination-unreachable"
  | "destination-mismatch"
  | "destination-full"
  | "owner-busy"
  | "actor-busy"
  | "actor-hand-not-empty"
  | "wrong-phase"
  | "held-lot-invalid"
  | "illegal-drop"
  | "container-has-incoming"
  | "container-embedded"
  | "container-incomplete"
  | "embedding-exists"
  | "embedding-not-found"
  | "invalid-salvage"
  | "use-intent-required"
  | "deliver-intent-required"
  | "vessel-invalid";

export type MaterialResult<T> =
  { ok: true; value: T } | { ok: false; reason: MaterialFailure };

export type MaterialDefinition<M extends string> = {
  readonly carry: "portion" | "whole" | "contained";
  readonly interior?: Omit<ContainerSpec<M>, "id">;
};
export type MaterialDefinitions<M extends string> = Readonly<
  Record<M, MaterialDefinition<M>>
>;
