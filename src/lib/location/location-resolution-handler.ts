import { CoordinatesSchema, type ResolvedLocation } from "./contracts";
import type { RequestThrottle } from "../observability/request-throttle";

const INVALID_REQUEST = {
  error: {
    code: "invalid_request",
    message: "Enter a valid latitude and longitude.",
    retryable: false,
  },
} as const;

const RATE_LIMITED = {
  error: {
    code: "rate_limited",
    message: "Too many location requests. Try again shortly.",
    retryable: true,
  },
} as const;

const GEOGRAPHY_UNAVAILABLE = {
  error: {
    code: "geography_unavailable",
    message: "London geography is temporarily unavailable.",
    retryable: true,
  },
} as const;

type ResolveLocationHandlerDependencies = {
  resolveLocation: (coordinates: {
    latitude: number;
    longitude: number;
  }) => Promise<ResolvedLocation>;
  throttle: RequestThrottle;
};

function clientKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}

function json(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function createResolveLocationHandler(
  dependencies: ResolveLocationHandlerDependencies,
) {
  return async function resolveLocationHandler(request: Request) {
    const throttleDecision = dependencies.throttle.check(clientKey(request));
    if (!throttleDecision.allowed) {
      return json(RATE_LIMITED, {
        status: 429,
        headers: {
          "Retry-After": String(throttleDecision.retryAfterSeconds),
        },
      });
    }

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return json(INVALID_REQUEST, { status: 400 });
    }

    const coordinates = CoordinatesSchema.safeParse(input);
    if (!coordinates.success) {
      return json(INVALID_REQUEST, { status: 400 });
    }

    try {
      return json(await dependencies.resolveLocation(coordinates.data));
    } catch {
      return json(GEOGRAPHY_UNAVAILABLE, { status: 503 });
    }
  };
}
