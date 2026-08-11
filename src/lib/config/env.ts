import "server-only";

import { z } from "zod";

import { resolveProviderMode } from "@/lib/providers/provider-mode";

const serverEnvSchema = z.object({
  PROVIDER_MODE: z.string().optional(),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(?:ql)?:\/\//)
    .optional(),
});

const parsedEnv = serverEnvSchema.parse({
  PROVIDER_MODE: process.env.PROVIDER_MODE,
  DATABASE_URL: process.env.DATABASE_URL,
});

export const env = {
  providerMode: resolveProviderMode(parsedEnv.PROVIDER_MODE),
  databaseUrl: parsedEnv.DATABASE_URL,
};
