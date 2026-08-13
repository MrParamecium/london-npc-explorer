import {
  ensureCurrentAppUser,
  getAuthenticatedUserId,
} from "@/lib/auth/current-app-user";
import { createProfileGenerationHandler } from "@/lib/generation/profile-generation-handler";
import { generateProfileNpc } from "@/lib/generation/profile-generation-service";
import { InMemoryRequestThrottle } from "@/lib/observability/request-throttle";

export const dynamic = "force-dynamic";

const throttle = new InMemoryRequestThrottle({
  clientLimit: 6,
  globalLimit: 60,
  windowMs: 60_000,
});

export const POST = createProfileGenerationHandler({
  getAuthenticatedUserId,
  ensureUser: ensureCurrentAppUser,
  generate: (input) => generateProfileNpc(input),
  throttle,
});
