import { z } from "zod";

const providerModeSchema = z.enum(["mock", "live"]);

export type ProviderMode = z.infer<typeof providerModeSchema>;

export function resolveProviderMode(value: string | undefined): ProviderMode {
  return providerModeSchema.parse(value ?? "mock");
}
