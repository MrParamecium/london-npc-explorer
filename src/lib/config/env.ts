import "server-only";

import { z } from "zod";

import { resolveGoogleMapsConfig } from "@/lib/config/google-maps-config";
import { resolveProviderMode } from "@/lib/providers/provider-mode";

const serverEnvSchema = z.object({
  PROVIDER_MODE: z.string().optional(),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(?:ql)?:\/\//)
    .optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().trim().min(1).optional(),
  CLERK_SECRET_KEY: z.string().trim().min(1).optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: z.string().trim().min(1).optional(),
  GOOGLE_MAPS_SERVER_KEY: z.string().trim().min(1).optional(),
  OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
  OPENROUTER_MODEL: z.string().trim().min(1).max(160).optional(),
});

const parsedEnv = serverEnvSchema.parse({
  PROVIDER_MODE: process.env.PROVIDER_MODE,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || undefined,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || undefined,
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY:
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || undefined,
  GOOGLE_MAPS_SERVER_KEY: process.env.GOOGLE_MAPS_SERVER_KEY || undefined,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || undefined,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || undefined,
});

const providerMode = resolveProviderMode(parsedEnv.PROVIDER_MODE);

const clerkKeyCount = [
  parsedEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  parsedEnv.CLERK_SECRET_KEY,
].filter(Boolean).length;

if (clerkKeyCount === 1) {
  throw new Error(
    "Clerk requires both NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.",
  );
}

const googleMaps = resolveGoogleMapsConfig({
  providerMode,
  browserKey: parsedEnv.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY,
  serverKey: parsedEnv.GOOGLE_MAPS_SERVER_KEY,
});

export const env = {
  providerMode,
  databaseUrl: parsedEnv.DATABASE_URL,
  clerkEnabled: clerkKeyCount === 2,
  googleMapsEnabled: googleMaps.enabled,
  googleMapsBrowserKey: googleMaps.browserKey,
  googleMapsServerKey: googleMaps.serverKey,
  openRouterApiKey: parsedEnv.OPENROUTER_API_KEY,
  openRouterModel: parsedEnv.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini",
};
