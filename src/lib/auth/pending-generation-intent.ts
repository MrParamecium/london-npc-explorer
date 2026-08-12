import { z } from "zod";

import { CoordinatesSchema } from "@/lib/location/contracts";

const STORAGE_KEY = "london-npc-atlas:pending-generation";
const MAX_AGE_MS = 15 * 60 * 1_000;

export const PendingGenerationIntentSchema = z
  .object({
    version: z.literal(1),
    action: z.literal("generate_npc"),
    latitude: CoordinatesSchema.shape.latitude.min(51.28).max(51.705),
    longitude: CoordinatesSchema.shape.longitude.min(-0.51).max(0.334),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type PendingGenerationIntent = z.infer<
  typeof PendingGenerationIntentSchema
>;

export function savePendingGenerationIntent(
  storage: Storage,
  coordinates: { latitude: number; longitude: number },
  now = new Date(),
) {
  const intent = PendingGenerationIntentSchema.parse({
    version: 1,
    action: "generate_npc",
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    createdAt: now.toISOString(),
  });

  storage.setItem(STORAGE_KEY, JSON.stringify(intent));
  return intent;
}

export function readPendingGenerationIntent(
  storage: Storage,
  now = new Date(),
) {
  const stored = storage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    const intent = PendingGenerationIntentSchema.parse(JSON.parse(stored));
    const age = now.getTime() - new Date(intent.createdAt).getTime();
    if (age < 0 || age > MAX_AGE_MS) {
      clearPendingGenerationIntent(storage);
      return null;
    }
    return intent;
  } catch {
    clearPendingGenerationIntent(storage);
    return null;
  }
}

export function consumePendingGenerationIntent(
  storage: Storage,
  now = new Date(),
) {
  const intent = readPendingGenerationIntent(storage, now);
  clearPendingGenerationIntent(storage);
  return intent;
}

export function clearPendingGenerationIntent(storage: Storage) {
  storage.removeItem(STORAGE_KEY);
}
