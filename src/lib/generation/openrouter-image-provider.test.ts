import { describe, expect, it, vi } from "vitest";

import { createOpenRouterImageProvider } from "./openrouter-image-provider";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function imageResponse(
  bytes: Uint8Array,
  options: {
    cost?: number;
    events?: unknown[];
    includeDone?: boolean;
  } = {},
) {
  const events = options.events ?? [
    {
      type: "image_generation.partial_image",
      partial_image_index: 0,
      b64_json: "AA==",
    },
    {
      type: "image_generation.completed",
      b64_json: Buffer.from(bytes).toString("base64"),
      usage: options.cost === undefined ? undefined : { cost: options.cost },
    },
  ];
  const lines = events.map((event) => `data: ${JSON.stringify(event)}\n\n`);
  if (options.includeDone !== false) lines.push("data: [DONE]\n\n");

  return new Response(lines.join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

describe("OpenRouter image provider", () => {
  it("sends one fixed GPT Image 2 request and maps a valid PNG", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(imageResponse(PNG_BYTES, { cost: 0.134 }));
    const provider = createOpenRouterImageProvider({
      apiKey: "test-openrouter-key",
      fetchImpl,
    });

    const image = await provider.generate({ prompt: "locked portrait prompt" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/images");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "openai/gpt-image-2",
      prompt: "locked portrait prompt",
      quality: "high",
      aspect_ratio: "3:4",
      background: "opaque",
      n: 1,
      stream: true,
    });
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-openrouter-key",
      "Content-Type": "application/json",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(image).toEqual({
      bytes: PNG_BYTES,
      contentType: "image/png",
      extension: "png",
      model: "openai/gpt-image-2",
      costUsd: 0.134,
    });
  });

  it("uses the configured model and maps a missing cost to null", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse(PNG_BYTES));
    const provider = createOpenRouterImageProvider({
      apiKey: "test-openrouter-key",
      model: "vendor/image-model",
      fetchImpl,
    });

    const image = await provider.generate({ prompt: "locked portrait prompt" });

    expect(image.model).toBe("vendor/image-model");
    expect(image.costUsd).toBeNull();
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      model: "vendor/image-model",
    });
  });

  it("aborts at the configured timeout without retrying", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("sensitive upstream detail", "AbortError"));
          });
        }),
    );
    const provider = createOpenRouterImageProvider({
      apiKey: "test-openrouter-key",
      fetchImpl: fetchImpl as typeof fetch,
      timeoutMs: 1,
    });

    await expect(
      provider.generate({ prompt: "secret locked portrait prompt" }),
    ).rejects.toMatchObject({
      code: "provider_timeout",
      retryable: true,
      message: "OpenRouter image generation timed out.",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [408, "provider_timeout", true],
    [504, "provider_timeout", true],
    [402, "budget_exceeded", false],
    [429, "portrait_failed", true],
    [500, "portrait_failed", true],
    [503, "portrait_failed", true],
    [400, "portrait_failed", false],
  ] as const)(
    "maps HTTP %s to a safe %s error without retrying",
    async (status, code, retryable) => {
      const fetchImpl = vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              message: "secret policy or provider response",
              metadata: { prompt: "secret locked portrait prompt" },
            },
          },
          { status },
        ),
      );
      const provider = createOpenRouterImageProvider({
        apiKey: "test-openrouter-key",
        fetchImpl,
      });

      const generation = provider.generate({
        prompt: "secret locked portrait prompt",
      });

      await expect(generation).rejects.toMatchObject({ code, retryable });
      await expect(generation).rejects.not.toMatchObject({
        message: expect.stringMatching(/secret|test-openrouter-key/i),
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("maps network failures to a safe retryable error without retrying", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("secret network response body"));
    const provider = createOpenRouterImageProvider({
      apiKey: "test-openrouter-key",
      fetchImpl,
    });

    await expect(
      provider.generate({ prompt: "secret locked portrait prompt" }),
    ).rejects.toMatchObject({
      code: "portrait_failed",
      retryable: true,
      message: "OpenRouter image generation could not be reached.",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no completed event", []],
    [
      "multiple completed events",
      [
        {
          type: "image_generation.completed",
          b64_json: Buffer.from(PNG_BYTES).toString("base64"),
        },
        {
          type: "image_generation.completed",
          b64_json: Buffer.from(PNG_BYTES).toString("base64"),
        },
      ],
    ],
    ["missing image", [{ type: "image_generation.completed" }]],
    [
      "invalid base64",
      [
        {
          type: "image_generation.completed",
          b64_json: "not-base64!!!",
        },
      ],
    ],
  ])("rejects %s as invalid output", async (_label, events) => {
    const provider = createOpenRouterImageProvider({
      apiKey: "test-openrouter-key",
      fetchImpl: vi
        .fn()
        .mockResolvedValue(imageResponse(PNG_BYTES, { events })),
    });

    await expect(
      provider.generate({ prompt: "locked portrait prompt" }),
    ).rejects.toMatchObject({
      code: "invalid_output",
      retryable: false,
    });
  });

  it("trusts the file signature rather than forged PNG metadata", async () => {
    const provider = createOpenRouterImageProvider({
      apiKey: "test-openrouter-key",
      fetchImpl: vi.fn().mockResolvedValue(
        imageResponse(JPEG_BYTES, {
          events: [
            {
              type: "image_generation.completed",
              b64_json: Buffer.from(JPEG_BYTES).toString("base64"),
              media_type: "image/png",
            },
          ],
        }),
      ),
    });

    await expect(
      provider.generate({ prompt: "locked portrait prompt" }),
    ).resolves.toMatchObject({
      contentType: "image/jpeg",
      extension: "jpg",
    });
  });

  it("rejects bytes without an allowed image signature", async () => {
    const provider = createOpenRouterImageProvider({
      apiKey: "test-openrouter-key",
      fetchImpl: vi
        .fn()
        .mockResolvedValue(imageResponse(Uint8Array.from([1, 2, 3, 4]))),
    });

    await expect(
      provider.generate({ prompt: "locked portrait prompt" }),
    ).rejects.toMatchObject({ code: "invalid_output", retryable: false });
  });

  it("rejects a stream that closes without the DONE event", async () => {
    const provider = createOpenRouterImageProvider({
      apiKey: "test-openrouter-key",
      fetchImpl: vi
        .fn()
        .mockResolvedValue(imageResponse(PNG_BYTES, { includeDone: false })),
    });

    await expect(
      provider.generate({ prompt: "locked portrait prompt" }),
    ).rejects.toMatchObject({ code: "invalid_output", retryable: false });
  });

  it("maps a terminal SSE error without exposing provider details", async () => {
    const provider = createOpenRouterImageProvider({
      apiKey: "test-openrouter-key",
      fetchImpl: vi.fn().mockResolvedValue(
        imageResponse(PNG_BYTES, {
          events: [
            {
              type: "error",
              error: {
                code: "server_error",
                message: "secret upstream response",
              },
            },
          ],
        }),
      ),
    });

    await expect(
      provider.generate({ prompt: "secret locked portrait prompt" }),
    ).rejects.toMatchObject({
      code: "portrait_failed",
      retryable: true,
      message: "OpenRouter image generation is temporarily unavailable.",
    });
  });

  it("rejects an image larger than 20 MiB", async () => {
    const oversized = new Uint8Array(20 * 1024 * 1024 + 1);
    oversized.set(PNG_BYTES);
    const provider = createOpenRouterImageProvider({
      apiKey: "test-openrouter-key",
      fetchImpl: vi.fn().mockResolvedValue(imageResponse(oversized)),
    });

    await expect(
      provider.generate({ prompt: "locked portrait prompt" }),
    ).rejects.toMatchObject({ code: "invalid_output", retryable: false });
  });

  it.each([
    ["JPEG", JPEG_BYTES, "image/jpeg", "jpg"],
    ["WebP", WEBP_BYTES, "image/webp", "webp"],
  ] as const)(
    "accepts a valid %s file signature",
    async (_label, bytes, contentType, extension) => {
      const provider = createOpenRouterImageProvider({
        apiKey: "test-openrouter-key",
        fetchImpl: vi.fn().mockResolvedValue(imageResponse(bytes)),
      });

      await expect(
        provider.generate({ prompt: "locked portrait prompt" }),
      ).resolves.toMatchObject({ contentType, extension });
    },
  );
});
