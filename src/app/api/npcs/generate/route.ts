import { env } from "@/lib/config/env";
import {
  ensureCurrentAppUser,
  getAuthenticatedUserId,
} from "@/lib/auth/current-app-user";
import {
  createPortraitRuntime,
  type PortraitRuntime,
} from "@/lib/generation/portrait-runtime";
import { createProfileGenerationHandler } from "@/lib/generation/profile-generation-handler";
import {
  generateProfileNpc,
  ProfileGenerationError,
} from "@/lib/generation/profile-generation-service";
import { InMemoryRequestThrottle } from "@/lib/observability/request-throttle";

export const runtime = "nodejs";
export const maxDuration = 180;

let portraitRuntime: PortraitRuntime | undefined;

function getPortraitRuntime() {
  if (!portraitRuntime) {
    portraitRuntime = createPortraitRuntime({
      providerMode: env.providerMode,
      openRouterApiKey: env.openRouterApiKey,
      imageModel: env.openRouterImageModel,
      blobToken: env.blobReadWriteToken,
    });
  }
  return portraitRuntime;
}

const throttle = new InMemoryRequestThrottle({
  clientLimit: 6,
  globalLimit: 60,
  windowMs: 60_000,
});

export const POST = createProfileGenerationHandler({
  getAuthenticatedUserId,
  ensureUser: ensureCurrentAppUser,
  generate: async (input) => {
    let runtime: PortraitRuntime;
    try {
      runtime = getPortraitRuntime();
    } catch {
      throw new ProfileGenerationError(
        "portrait_failed",
        "Portrait generation is not configured.",
        false,
      );
    }
    return generateProfileNpc(input, { portraitRuntime: runtime });
  },
  throttle,
});
