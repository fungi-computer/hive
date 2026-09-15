/** Presentation-only groups for painted designation layers. */
export const DESIGNATION_OVERLAY_KINDS = [
  "work-plans",
  "storage-areas",
] as const;

export type DesignationOverlayKind = (typeof DESIGNATION_OVERLAY_KINDS)[number];
export type DesignationOverlayVisibility = Readonly<
  Record<DesignationOverlayKind, boolean>
>;

export const DEFAULT_DESIGNATION_OVERLAY_VISIBILITY: DesignationOverlayVisibility =
  Object.freeze({ "work-plans": true, "storage-areas": true });

export function toggleDesignationOverlay(
  visibility: DesignationOverlayVisibility,
  kind: DesignationOverlayKind,
): DesignationOverlayVisibility {
  return { ...visibility, [kind]: !visibility[kind] };
}

export function designationOverlayVisible(
  visibility: DesignationOverlayVisibility | undefined,
  kind: DesignationOverlayKind,
): boolean {
  return visibility?.[kind] ?? true;
}

/** Filter presentation marks without touching their authoritative source. */
export function filterDesignationMarks<T extends { readonly kind: DesignationOverlayKind }>(
  marks: readonly T[],
  visibility: DesignationOverlayVisibility | undefined,
): T[] {
  return marks.filter((mark) => designationOverlayVisible(visibility, mark.kind));
}
