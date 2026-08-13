import type { WeightedCategory } from "@/lib/statistics/contracts";

export function weightedDraw(
  categories: readonly WeightedCategory[],
  randomValue: number,
) {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new Error("Weighted draw random value must be in [0, 1). ");
  }
  if (categories.length === 0) {
    throw new Error("Weighted draw requires at least one category.");
  }

  let total = 0;
  let lastPositive: WeightedCategory | null = null;
  for (const category of categories) {
    if (!Number.isFinite(category.weight) || category.weight < 0) {
      throw new Error(`Invalid weight for ${category.key}.`);
    }
    if (category.weight > 0) lastPositive = category;
    total += category.weight;
  }
  if (!(total > 0)) throw new Error("Weighted draw requires positive weight.");

  const target = randomValue * total;
  let cumulative = 0;
  for (const category of categories) {
    cumulative += category.weight;
    if (category.weight > 0 && target < cumulative) return category;
  }
  if (!lastPositive)
    throw new Error("Weighted draw found no selectable category.");
  return lastPositive;
}
