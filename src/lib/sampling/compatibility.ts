import type { WeightedCategory } from "@/lib/statistics/contracts";

import { namedRandom } from "./deterministic-random";
import { weightedDraw } from "./weighted-draw";

export class CompatibilityExhaustedError extends Error {
  constructor(path: string) {
    super(`Compatible sampling was exhausted for ${path}.`);
    this.name = "CompatibilityExhaustedError";
  }
}

export function drawCompatible(
  seed: string,
  path: string,
  categories: readonly WeightedCategory[],
  accepts: (category: WeightedCategory) => boolean,
  maximumRetries = 3,
) {
  for (let attempt = 0; attempt <= maximumRetries; attempt += 1) {
    const category = weightedDraw(
      categories,
      namedRandom(seed, `stat/${path}/attempt-${attempt}`),
    );
    if (accepts(category)) return category;
  }
  throw new CompatibilityExhaustedError(path);
}

export function householdCompatible(categoryKey: string, age: number) {
  if (["household_1", "household_3"].includes(categoryKey)) return age >= 66;
  return true;
}

export function activityCompatible(categoryKey: string, age: number) {
  if (categoryKey === "retired") return age >= 50;
  return true;
}
