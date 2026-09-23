import { validateMaterialRelations } from "./relations.ts";
import { checkedMaterialDefinitions } from "./definitions.ts";
import { createMaterialRecovery } from "./recovery.ts";
import { createHeldUses } from "./held-use.ts";
import { createRecipeSettlements } from "./settlement.ts";
import { createMaterialOwner as configureOwner } from "./owner.ts";
import { materialStateSchema, materialSnapshotSchema } from "./schema.ts";
import type {
  ContainerSpec,
  MaterialDefinitions,
  MaterialsState,
} from "./types.ts";
export type {
  ContainerSpec,
  ItemLot,
  MaterialsState,
  Transfer,
  TransferRequest,
  MaterialDefinitions,
} from "./types.ts";

/** Supported headless material entry. Endpoint existence belongs to its consumer. */
export function createMaterialOwner<M extends string>(
  inputDefinitions: MaterialDefinitions<M>,
) {
  const definitions = checkedMaterialDefinitions(inputDefinitions);
  const configured = configureOwner(definitions);
  const { internal, ...operations } = configured;
  const schema = materialStateSchema(definitions);
  const envelope = materialSnapshotSchema(definitions);
  return {
    createState(): MaterialsState<M> {
      return {
        lots: [],
        transfers: [],
        bindings: [],
        transformations: [],
        consumptions: [],
        sinks: [],
        embedded: [],
        nextLotId: 1,
      };
    },
    ...operations,
    uses: createHeldUses(configured),
    recovery: createMaterialRecovery(configured),
    migration: {
      validatePredecessorPhase: internal.historicalTransferPhaseProblem,
    },
    recipes: createRecipeSettlements(configured),
    queries: {
      sourceContainer: internal.sourceContainer,
      availableMaterialFacts: internal.availableMaterialFacts,
      availablePortions: internal.availablePortions,
      transferForActor: internal.transferForActor,
      carriedLot: internal.carriedLot,
      embeddedQuantity: internal.embeddedQuantity,
      containerBulk: internal.containerBulk,
      bindingPromiseQuantity: internal.bindingPromiseQuantity,
    },
    availableQuantity: internal.availableQuantity,
    containerQuantity: internal.containerQuantity,
    containerContents: internal.containerContents,
    remainingContainerQuantity: internal.remainingContainerQuantity,
    validateState(
      state: MaterialsState<M>,
      containers: readonly ContainerSpec<M>[],
    ): void {
      validateMaterialRelations(state, containers, configured);
    },
    snapshot(
      state: MaterialsState<M>,
      containers: readonly ContainerSpec<M>[],
    ) {
      const parsed = schema.parse(state);
      validateMaterialRelations(parsed, containers, configured);
      return { schema: 1 as const, state: structuredClone(parsed) };
    },
    restore(
      value: unknown,
      containers: readonly ContainerSpec<M>[],
    ): MaterialsState<M> {
      const { state } = envelope.parse(value);
      validateMaterialRelations(state, containers, configured);
      return state;
    },
  };
}

export type {
  ResolvedRecipePlan,
  ResolvedRecipeSettlement,
  ResolvedRecipeOutputConsumption,
} from "./settlement.ts";
