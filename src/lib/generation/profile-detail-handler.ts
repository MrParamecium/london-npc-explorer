import { EntityIdSchema } from "@/lib/domain/primitives";
import { UNAUTHORIZED_ERROR_RESPONSE } from "@/lib/auth/contracts";
import {
  getProfileNpcForOwner,
  serializeProfileNpc,
  type ProfileNpcRecord,
} from "@/lib/db/queries/profile-npcs";

function noStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function createProfileDetailHandler(dependencies: {
  getAuthenticatedUserId: () => Promise<string | null>;
  ensureUser: (userId: string) => Promise<string>;
  get: (ownerId: string, npcId: string) => Promise<ProfileNpcRecord | null>;
}) {
  return async function profileDetailHandler(
    _request: Request,
    context: { params: Promise<{ npcId: string }> },
  ) {
    const userId = await dependencies.getAuthenticatedUserId();
    if (!userId) return noStore(UNAUTHORIZED_ERROR_RESPONSE, { status: 401 });

    const { npcId } = await context.params;
    if (!EntityIdSchema.safeParse(npcId).success) {
      return noStore(
        {
          error: {
            code: "invalid_request",
            message: "Enter a valid NPC identifier.",
            retryable: false,
          },
        },
        { status: 400 },
      );
    }

    try {
      const ownerId = await dependencies.ensureUser(userId);
      const npc = await dependencies.get(ownerId, npcId);
      if (!npc) {
        return noStore(
          {
            error: {
              code: "not_found",
              message: "NPC not found.",
              retryable: false,
            },
          },
          { status: 404 },
        );
      }
      return noStore(serializeProfileNpc(npc));
    } catch {
      return noStore(
        {
          error: {
            code: "internal_error",
            message: "NPC is temporarily unavailable.",
            retryable: true,
          },
        },
        { status: 503 },
      );
    }
  };
}
