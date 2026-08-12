import { z } from "zod";

import { ClerkUserIdSchema } from "@/lib/domain/primitives";

export const AuthenticatedAppUserSchema = z
  .object({
    userId: ClerkUserIdSchema,
  })
  .strict();

export const UnauthorizedErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("unauthorized"),
        message: z.literal("Sign in to continue."),
      })
      .strict(),
  })
  .strict();

export const UNAUTHORIZED_ERROR_RESPONSE = {
  error: {
    code: "unauthorized",
    message: "Sign in to continue.",
  },
} as const;

export type AuthenticatedAppUser = z.infer<typeof AuthenticatedAppUserSchema>;
