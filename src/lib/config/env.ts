import "server-only";

import { z } from "zod";

import { resolveProviderMode } from "@/lib/providers/provider-mode";

const serverEnvSchema = z.object({
  PROVIDER_MODE: z.string().optional(),
});

const parsedEnv = serverEnvSchema.parse({
  PROVIDER_MODE: process.env.PROVIDER_MODE,
});

export const env = {
  providerMode: resolveProviderMode(parsedEnv.PROVIDER_MODE),
};
