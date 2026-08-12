type ThrottleDecision =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RequestThrottle {
  check(clientKey: string): ThrottleDecision;
}

type RequestThrottleOptions = {
  clientLimit: number;
  globalLimit: number;
  windowMs: number;
  now?: () => number;
};

type WindowBucket = {
  startedAt: number;
  count: number;
};

export class InMemoryRequestThrottle implements RequestThrottle {
  private readonly clientLimit: number;
  private readonly globalLimit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private globalBucket: WindowBucket;
  private readonly clients = new Map<string, WindowBucket>();

  constructor(options: RequestThrottleOptions) {
    if (
      options.clientLimit < 1 ||
      options.globalLimit < 1 ||
      options.windowMs < 1
    ) {
      throw new Error("Throttle limits and window must be positive.");
    }

    this.clientLimit = options.clientLimit;
    this.globalLimit = options.globalLimit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
    this.globalBucket = { startedAt: this.now(), count: 0 };
  }

  check(clientKey: string): ThrottleDecision {
    const now = this.now();
    this.globalBucket = this.currentBucket(this.globalBucket, now);

    const existingClientBucket = this.clients.get(clientKey) ?? {
      startedAt: now,
      count: 0,
    };
    const clientBucket = this.currentBucket(existingClientBucket, now);
    this.clients.set(clientKey, clientBucket);

    const clientExceeded = clientBucket.count >= this.clientLimit;
    const globalExceeded = this.globalBucket.count >= this.globalLimit;

    if (clientExceeded || globalExceeded) {
      const resetTimes = [
        clientExceeded ? clientBucket.startedAt + this.windowMs : 0,
        globalExceeded ? this.globalBucket.startedAt + this.windowMs : 0,
      ];
      const resetAt = Math.max(...resetTimes);

      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
      };
    }

    clientBucket.count += 1;
    this.globalBucket.count += 1;
    return { allowed: true };
  }

  private currentBucket(bucket: WindowBucket, now: number): WindowBucket {
    return now - bucket.startedAt >= this.windowMs
      ? { startedAt: now, count: 0 }
      : bucket;
  }
}
