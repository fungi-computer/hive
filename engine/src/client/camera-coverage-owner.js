const contains = (outer, inner) => outer.left <= inner.left && outer.right >= inner.right &&
  outer.top <= inner.top && outer.bottom >= inner.bottom;
const expand = (rect, margin) => ({ left: rect.left - margin, right: rect.right + margin,
  top: rect.top - margin, bottom: rect.bottom + margin });

/** Retains a camera's prepared area with hysteresis. The planner runs only when
 * coverage or projection changes, never for ordinary movement inside the margin.
 * Padding is bounded by the same chunk budget as the visible area. */
export function createCameraCoverageOwner({ padding = 128 } = {}) {
  if (!(padding > 0) || !Number.isFinite(padding)) throw new Error("invalid camera coverage padding");
  let context, prepared, refresh, plan, viewport, margin = 0;
  let plans = 0, retained = 0;
  return Object.freeze({
    update(nextViewport, nextContext, planner) {
      viewport = nextViewport;
      if (context === nextContext && plan?.kind === "ready" && contains(refresh, viewport)) {
        retained++;
        return plan;
      }
      // A smaller margin is preferable to dropping a valid visible scene when
      // zooming out. The planner still rejects a genuinely over-budget view.
      for (margin = padding; ; margin = margin <= 16 ? 0 : margin / 2) {
        prepared = expand(viewport, margin);
        plan = planner(prepared); plans++;
        if (plan.kind === "ready" || margin === 0) break;
      }
      context = nextContext;
      refresh = expand(viewport, margin * 0.65);
      return plan;
    },
    reset() { context = prepared = refresh = plan = viewport = undefined; margin = 0; },
    snapshot() {
      return { plans, retained, padding: margin, prepared: prepared && { ...prepared },
        refresh: refresh && { ...refresh }, viewport: viewport && { ...viewport },
        regions: plan?.regions?.length ?? 0, withinPrepared: Boolean(prepared && viewport && contains(prepared, viewport)) };
    },
  });
}
