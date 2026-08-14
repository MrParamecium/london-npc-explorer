export type PortraitContentType = "image/png" | "image/jpeg" | "image/webp";

export type PortraitImage = {
  bytes: Uint8Array;
  contentType: PortraitContentType;
  extension: "png" | "jpg" | "webp";
  model: string;
  costUsd: number | null;
};

export type StoredPortrait = { url: string; pathname: string };

export class PortraitGenerationError extends Error {
  constructor(
    readonly code:
      | "provider_timeout"
      | "invalid_output"
      | "portrait_failed"
      | "budget_exceeded",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PortraitGenerationError";
  }
}
