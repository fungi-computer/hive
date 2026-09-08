export function zoomAvailabilityForBounds(bounds, minimumSpan, maximumSpan) {
  const span = bounds.maxXExclusive - bounds.minX;
  return Object.freeze({
    span,
    canIn: span > minimumSpan,
    canOut: span < maximumSpan,
  });
}
