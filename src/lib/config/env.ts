import "server-only";

import { z } from "zod";

import { resolveProviderMode } from "@/lib/providers/provider-mode";

const serverEnvSchema = z.object({
  PROVIDER_MODE: z.string().optional(),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(?:ql)?:\/\//)
    .optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().trim().min(1).optional(),
  CLERK_SECRET_KEY: z.string().trim().min(1).optional(),
});

const parsedEnv = serverEnvSchema.parse({
  PROVIDER_MODE: process.env.PROVIDER_MODE,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || undefined,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || undefined,
});

const clerkKeyCount = [
  parsedEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  parsedEnv.CLERK_SECRET_KEY,
].filter(Boolean).length;

if (clerkKeyCount === 1) {
  throw new Error(
    "Clerk requires both NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.",
  );
}

export const env = {
  providerMode: resolveProviderMode(parsedEnv.PROVIDER_MODE),
  databaseUrl: parsedEnv.DATABASE_URL,
  clerkEnabled: clerkKeyCount === 2,
};
