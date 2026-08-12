import { UNAUTHORIZED_ERROR_RESPONSE } from "./contracts";

export function createSyncCurrentUserHandler(dependencies: {
  getAuthenticatedUserId: () => Promise<string | null>;
  ensureUser: (userId: string) => Promise<string>;
}) {
  return async function syncCurrentUser() {
    const userId = await dependencies.getAuthenticatedUserId();
    if (!userId) {
      return Response.json(UNAUTHORIZED_ERROR_RESPONSE, { status: 401 });
    }

    const synchronizedUserId = await dependencies.ensureUser(userId);
    return Response.json({ userId: synchronizedUserId });
  };
}
