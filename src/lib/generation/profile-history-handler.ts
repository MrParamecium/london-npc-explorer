import { EntityIdSchema } from "@/lib/domain/primitives";
import { UNAUTHORIZED_ERROR_RESPONSE } from "@/lib/auth/contracts";
import {
  listProfileNpcsForOwner,
  serializeProfileNpc,
} from "@/lib/db/queries/profile-npcs";

type ProfileHistoryListInput = Parameters<typeof listProfileNpcsForOwner>[1];
type ProfileHistoryListResult = Awaited<
  ReturnType<typeof listProfileNpcsForOwner>
>;

function noStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function createProfileHistoryHandler(dependencies: {
  getAuthenticatedUserId: () => Promise<string | null>;
  ensureUser: (userId: string) => Promise<string>;
  list: (input: ProfileHistoryListInput) => Promise<ProfileHistoryListResult>;
}) {
  return async function profileHistoryHandler(request: Request) {
    const userId = await dependencies.getAuthenticatedUserId();
    if (!userId) return noStore(UNAUTHORIZED_ERROR_RESPONSE, { status: 401 });

    const url = new URL(request.url);
    const limitValue = url.searchParams.get("limit");
    const limit = limitValue ? Number(limitValue) : undefined;
    const cursorValue = url.searchParams.get("cursor");
    if (
      (limitValue && (!Number.isInteger(limit) || limit! < 1 || limit! > 50)) ||
      (cursorValue && !EntityIdSchema.safeParse(cursorValue).success)
    ) {
      return noStore(
        {
          error: {
            code: "invalid_request",
            message: "Enter a valid history cursor and limit.",
            retryable: false,
          },
        },
        { status: 400 },
      );
    }

    try {
      const ownerId = await dependencies.ensureUser(userId);
      const result = await dependencies.list({
        ownerId,
        cursor: cursorValue,
        limit,
      });
      return noStore({
        items: result.items.map(serializeProfileNpc),
        nextCursor: result.nextCursor,
      });
    } catch {
      return noStore(
        {
          error: {
            code: "internal_error",
            message: "NPC history is temporarily unavailable.",
            retryable: true,
          },
        },
        { status: 503 },
      );
    }
  };
}
