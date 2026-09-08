// One study-only view policy for walls, decking and furnishing visibility.
export function cutaway(mode, facing) {
  const angle = (facing * Math.PI) / 2,
    cosine = Math.cos(angle),
    sine = Math.sin(angle);
  return {
    hidesWall(axis, side) {
      return (
        mode !== "exterior" &&
        side * (axis === "x" ? cosine - sine : sine + cosine) > 0
      );
    },
    hidesUpper(x, z) {
      return (
        mode === "ground" ||
        (mode === "dollhouse" && z * cosine - x * sine > 0.01)
      );
    },
  };
}
