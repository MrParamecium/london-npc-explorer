import { z } from "zod";

import { CoordinatesSchema } from "@/lib/location/contracts";
import type { RequestThrottle } from "@/lib/observability/request-throttle";

import { UNAUTHORIZED_ERROR_RESPONSE } from "@/lib/auth/contracts";
import {
  ProfileGenerationError,
  type ProfileGenerationInput,
} from "./profile-generation-service";

const GenerateRequestSchema = z
  .object({
    coordinates: CoordinatesSchema,
    idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/),
  })
  .strict();

const INVALID_REQUEST = {
  error: {
    code: "invalid_request",
    message: "Enter valid coordinates and a generation key.",
    retryable: false,
  },
} as const;

const GENERATION_ERROR_CODES = new Set([
  "unsupported_location",
  "statistics_unavailable",
  "invalid_distribution",
  "compatibility_exhausted",
  "provider_timeout",
  "invalid_output",
  "portrait_failed",
  "budget_exceeded",
  "persistence_failed",
  "unknown",
]);

const PORTRAIT_ERROR_MESSAGES: Partial<
  Record<ProfileGenerationError["code"], string>
> = {
  provider_timeout: "Portrait generation timed out.",
  invalid_output: "The portrait provider returned an unusable image.",
  portrait_failed: "The portrait could not be generated.",
  budget_exceeded: "The portrait request exceeded the configured budget.",
};

const RATE_LIMITED = {
  error: {
    code: "rate_limited",
    message: "Too many generation requests. Try again shortly.",
    retryable: true,
  },
} as const;

function noStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function createProfileGenerationHandler(dependencies: {
  getAuthenticatedUserId: () => Promise<string | null>;
  ensureUser: (userId: string) => Promise<string>;
  generate: (input: ProfileGenerationInput) => Promise<unknown>;
  throttle: RequestThrottle;
}) {
  return async function profileGenerationHandler(request: Request) {
    const userId = await dependencies.getAuthenticatedUserId();
    if (!userId) return noStore(UNAUTHORIZED_ERROR_RESPONSE, { status: 401 });

    const throttleDecision = dependencies.throttle.check(userId);
    if (!throttleDecision.allowed) {
      return noStore(RATE_LIMITED, {
        status: 429,
        headers: {
          "Retry-After": String(throttleDecision.retryAfterSeconds),
        },
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStore(INVALID_REQUEST, { status: 400 });
    }
    const parsed = GenerateRequestSchema.safeParse(body);
    if (!parsed.success) return noStore(INVALID_REQUEST, { status: 400 });

    try {
      const ownerId = await dependencies.ensureUser(userId);
      const result = await dependencies.generate({
        ownerId,
        coordinates: parsed.data.coordinates,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      return noStore(result, { status: 200 });
    } catch (error) {
      if (
        error instanceof ProfileGenerationError &&
        GENERATION_ERROR_CODES.has(error.code)
      ) {
        return noStore(
          {
            error: {
              code: error.code,
              message: PORTRAIT_ERROR_MESSAGES[error.code] ?? error.message,
              retryable: error.retryable,
            },
          },
          { status: error.code === "unsupported_location" ? 422 : 503 },
        );
      }
      return noStore(
        {
          error: {
            code: "internal_error",
            message: "NPC generation is temporarily unavailable.",
            retryable: true,
          },
        },
        { status: 503 },
      );
    }
  };
}
