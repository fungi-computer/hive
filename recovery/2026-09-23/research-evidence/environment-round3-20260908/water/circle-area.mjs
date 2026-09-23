// Exact antiderivative evaluation (up to Float64 rounding), not raster occupancy
// or subcell quadrature. Coordinates are relative to the disk center.
function quadrantArea(x, y, radius) {
  x = Math.min(Math.abs(x), radius); y = Math.min(Math.abs(y), radius);
  if (x === 0 || y === 0) return 0;
  if (x * x + y * y <= radius * radius) return x * y;
  const crossing = Math.min(x, Math.sqrt(Math.max(0, radius * radius - y * y)));
  const primitive = t => .5 * (t * Math.sqrt(Math.max(0, radius * radius - t * t)) + radius * radius * Math.asin(t / radius));
  return y * crossing + primitive(x) - primitive(crossing);
}

export function circleRectangleArea(x0, x1, y0, y1, radius) {
  if (![x0, x1, y0, y1, radius].every(Number.isFinite) || x1 <= x0 || y1 <= y0 || radius <= 0) throw Error('invalid disk/rectangle');
  const nearX = x0 > 0 ? x0 : x1 < 0 ? -x1 : 0, nearY = y0 > 0 ? y0 : y1 < 0 ? -y1 : 0;
  if (nearX * nearX + nearY * nearY >= radius * radius) return 0;
  const farX = Math.max(Math.abs(x0), Math.abs(x1)), farY = Math.max(Math.abs(y0), Math.abs(y1));
  const fullArea = (x1 - x0) * (y1 - y0);
  if (farX * farX + farY * farY <= radius * radius) return fullArea;
  const integral = (x, y) => Math.sign(x) * Math.sign(y) * quadrantArea(x, y, radius);
  const area = integral(x1, y1) - integral(x0, y1) - integral(x1, y0) + integral(x0, y0);
  const tolerance = 128 * Number.EPSILON * radius * radius;
  if (area < -tolerance || area > fullArea + tolerance) throw Error('circle integral outside rectangle');
  // Bound the geometric integral's cancellation error only. No evolved fluid
  // volume/film is clipped by this helper or by the solver.
  return Math.max(0, Math.min(fullArea, area));
}
