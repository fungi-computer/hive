import type { GamePack } from "../../engine/src/contracts";
import type { SessionOccurrenceDriver } from "../../engine/src/runtime/occurrence-driver";
import { colonyServerPack } from "../../engine/src/games/colony";
import { createColonyFrameworkProofPack, createColonyFrameworkProofV2Pack, createColonyPerformancePack } from "../../engine/src/games/colony-performance";
import { colonyFrameworkProofGameId, colonyFrameworkProofV2GameId, colonyFrameworkProofV2Schedule, colonyFrameworkProofV3GameId, parseColonyPerformanceGameId } from "../../engine/src/games/colony-performance-config";
import { createColonyFrameworkProofV3Pack } from "../../engine/src/games/colony-framework-proof-v3";
import { driveColonyFrameworkProofV2 } from "../../engine/src/games/colony-framework-proof-v2-driver";
import { formationsPack } from "../../engine/src/games/formations";
import { piratesPack } from "../../engine/src/games/pirates";
import { survivalPack } from "../../engine/src/games/survival";
import type { PublicPack } from "./protocol";

export type PublicPackRegistration = {
  readonly pack: GamePack;
  readonly seed: number;
  readonly clockControl: boolean;
  readonly measureCosts: boolean;
  readonly placementQuery: boolean;
  readonly occurrenceDriver?: SessionOccurrenceDriver;
};
function framework(pack: GamePack): PublicPackRegistration {
  if (!pack.localScope) throw new Error("framework fixture has no command scope");
  return { pack, seed: 1, clockControl: true, measureCosts: true, placementQuery: true,
    occurrenceDriver: {
      id: "colony-framework-command-ledger-v2", version: 1,
      stepSeconds: colonyFrameworkProofV2Schedule.stepSeconds,
      scope: pack.localScope,
      beforeStep: driveColonyFrameworkProofV2,
    },
  };
}

/** Content/policy registration is the sole host branch on fixture identities. */
export function publicPackRegistration(pack: PublicPack): PublicPackRegistration {
  if (pack === colonyFrameworkProofV2GameId) return framework(createColonyFrameworkProofV2Pack());
  if (pack === colonyFrameworkProofV3GameId) return framework(createColonyFrameworkProofV3Pack());
  if (pack === colonyFrameworkProofGameId)
    return { pack: createColonyFrameworkProofPack(), seed: 1, clockControl: true, measureCosts: true, placementQuery: true };
  const preset = parseColonyPerformanceGameId(pack);
  if (preset) return { pack: createColonyPerformancePack(preset.size, preset.workers), seed: 17, clockControl: true, measureCosts: false, placementQuery: true };
  const ordinary: Record<string, GamePack> = { survival: survivalPack, pirates: piratesPack, colony: colonyServerPack, formations: formationsPack };
  const registered = ordinary[pack];
  if (!registered) throw new Error("public-host-format");
  return { pack: registered, seed: 17, clockControl: false, measureCosts: false, placementQuery: false };
}
