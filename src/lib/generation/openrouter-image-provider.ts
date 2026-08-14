import "server-only";

import { z } from "zod";

import {
  PortraitGenerationError,
  type PortraitContentType,
  type PortraitImage,
} from "./portrait-types";

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";
const DEFAULT_MODEL = "openai/gpt-image-2";
const DEFAULT_TIMEOUT_MS = 110_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const OpenRouterImageResponseSchema = z
  .object({
    data: z.array(z.object({ b64_json: z.string().min(1) }).passthrough()),
    usage: z
      .object({ cost: z.number().finite().nonnegative().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

type ImageFormat = {
  contentType: PortraitContentType;
  extension: PortraitImage["extension"];
};

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function invalidOutput(): PortraitGenerationError {
  return new PortraitGenerationError(
    "invalid_output",
    "OpenRouter returned an invalid image.",
    false,
  );
}

function providerHttpError(status: number): PortraitGenerationError {
  if (status === 402) {
    return new PortraitGenerationError(
      "budget_exceeded",
      "OpenRouter image budget is unavailable.",
      false,
    );
  }

  if (status === 408 || status === 504) {
    return new PortraitGenerationError(
      "provider_timeout",
      "OpenRouter image generation timed out.",
      true,
    );
  }

  const retryable = status === 429 || status >= 500;
  return new PortraitGenerationError(
    "portrait_failed",
    retryable
      ? "OpenRouter image generation is temporarily unavailable."
      : "OpenRouter rejected the image generation request.",
    retryable,
  );
}

function decodeBase64Image(encoded: string): Uint8Array {
  if (encoded.length % 4 !== 0) {
    throw invalidOutput();
  }

  const paddingBytes = encoded.endsWith("==")
    ? 2
    : encoded.endsWith("=")
      ? 1
      : 0;
  const estimatedBytes = (encoded.length / 4) * 3 - paddingBytes;
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    throw invalidOutput();
  }

  const decoded = Buffer.from(encoded, "base64");
  if (decoded.toString("base64") !== encoded) {
    throw invalidOutput();
  }

  const bytes = Uint8Array.from(decoded);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw invalidOutput();
  }

  return bytes;
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]) {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function detectImageFormat(bytes: Uint8Array): ImageFormat {
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", extension: "png" };
  }

  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }

  if (
    bytes.byteLength >= 12 &&
    hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }

  throw invalidOutput();
}

export function createOpenRouterImageProvider(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): {
  generate(input: { prompt: string }): Promise<PortraitImage>;
} {
  const apiKey = z.string().trim().min(1).parse(options.apiKey);
  const model = z
    .string()
    .trim()
    .min(1)
    .max(160)
    .parse(options.model ?? DEFAULT_MODEL);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = z
    .number()
    .int()
    .positive()
    .max(300_000)
    .parse(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  return {
    async generate({ prompt }): Promise<PortraitImage> {
      const validatedPrompt = z.string().trim().min(1).parse(prompt);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(OPENROUTER_IMAGES_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt: validatedPrompt,
            quality: "high",
            aspect_ratio: "3:4",
            background: "opaque",
            n: 1,
          }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          throw new PortraitGenerationError(
            "provider_timeout",
            "OpenRouter image generation timed out.",
            true,
          );
        }

        if (!response.ok) {
          throw providerHttpError(response.status);
        }

        let responseBody: unknown;
        try {
          responseBody = await response.json();
        } catch {
          throw invalidOutput();
        }

        const parsedResponse =
          OpenRouterImageResponseSchema.safeParse(responseBody);
        if (!parsedResponse.success || parsedResponse.data.data.length !== 1) {
          throw invalidOutput();
        }

        const imagePayload = parsedResponse.data.data[0];
        if (!imagePayload) {
          throw invalidOutput();
        }

        const bytes = decodeBase64Image(imagePayload.b64_json);
        const format = detectImageFormat(bytes);

        return {
          bytes,
          ...format,
          model,
          costUsd: parsedResponse.data.usage?.cost ?? null,
        };
      } catch (error) {
        if (error instanceof PortraitGenerationError) {
          throw error;
        }

        if (isAbortError(error) || controller.signal.aborted) {
          throw new PortraitGenerationError(
            "provider_timeout",
            "OpenRouter image generation timed out.",
            true,
          );
        }

        throw new PortraitGenerationError(
          "portrait_failed",
          "OpenRouter image generation could not be reached.",
          true,
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
