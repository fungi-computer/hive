/** One complete observation in flight per socket; newest state stays at the owner. */
export type ObservationDelivery = {
  readonly observationRevision?: number;
  readonly observationReplayEpoch?: number;
  readonly observationAcknowledged?: boolean;
};
export type ObservationIdentity = { readonly revision: number; readonly replayEpoch: number };
export function canSendObservation(delivery: ObservationDelivery, identity?: ObservationIdentity): boolean {
  return (delivery.observationRevision === undefined || delivery.observationAcknowledged === true) &&
    (identity === undefined || delivery.observationRevision !== identity.revision || delivery.observationReplayEpoch !== identity.replayEpoch);
}
export function acknowledgeObservation<T extends ObservationDelivery>(delivery: T, revision: unknown, replayEpoch: unknown): T {
  if (!Number.isSafeInteger(revision) || (revision as number) < 0 || revision !== delivery.observationRevision ||
      !Number.isSafeInteger(replayEpoch) || (replayEpoch as number) < 0 || replayEpoch !== delivery.observationReplayEpoch)
    throw new Error("public-observation-ack-invalid");
  return { ...delivery, observationAcknowledged: true };
}
