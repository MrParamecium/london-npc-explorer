import { describe, expect, it } from "vitest";

import {
  AuthenticatedAppUserSchema,
  UnauthorizedErrorResponseSchema,
} from "./contracts";

describe("authentication contracts", () => {
  it("accepts the minimal synchronized application user", () => {
    expect(
      AuthenticatedAppUserSchema.parse({ userId: "user_2mockLondonExplorer" }),
    ).toEqual({ userId: "user_2mockLondonExplorer" });
  });

  it("keeps unauthorized errors stable for protected JSON resources", () => {
    expect(
      UnauthorizedErrorResponseSchema.parse({
        error: { code: "unauthorized", message: "Sign in to continue." },
      }),
    ).toEqual({
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
  });

  it("rejects identity fields that belong in Clerk", () => {
    expect(
      AuthenticatedAppUserSchema.safeParse({
        userId: "user_2mockLondonExplorer",
        email: "private@example.com",
      }).success,
    ).toBe(false);
  });
});
