export const susceptibilityColors = {
  Lower: "#4f8e74",
  Moderate: "#c89936",
  Higher: "#b55336",
  Unscored: "#858c88",
};

export const moderateMargin = 0.1;

export function susceptibilityLevel(score: number | null): keyof typeof susceptibilityColors {
  if (score === null || !Number.isFinite(score)) return "Unscored";
  if (score < -moderateMargin) return "Lower";
  if (score > moderateMargin) return "Higher";
  return "Moderate";
}
