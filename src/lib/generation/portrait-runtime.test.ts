import { describe, expect, it, vi } from "vitest";

import { createPortraitRuntime } from "./portrait-runtime";

describe("portrait runtime", () => {
  it("rejects live mode before a paid call when OpenRouter is missing", () => {
    expect(() =>
      createPortraitRuntime({
        providerMode: "live",
        openRouterApiKey: undefined,
        blobToken: "blob",
        imageModel: "openai/gpt-image-2",
      }),
    ).toThrow("OPENROUTER_API_KEY");
  });

  it("rejects live mode before a paid call when Blob is missing", () => {
    expect(() =>
      createPortraitRuntime({
        providerMode: "live",
        openRouterApiKey: "openrouter",
        blobToken: undefined,
        imageModel: "openai/gpt-image-2",
      }),
    ).toThrow("BLOB_READ_WRITE_TOKEN");
  });

  it("keeps mock mode local and returns a valid PNG data URL", async () => {
    const fetchImpl = vi.fn();
    const putImpl = vi.fn();
    const delImpl = vi.fn();
    const runtime = createPortraitRuntime({
      providerMode: "mock",
      openRouterApiKey: undefined,
      blobToken: undefined,
      imageModel: "openai/gpt-image-2",
      fetchImpl: fetchImpl as never,
      putImpl: putImpl as never,
      delImpl: delImpl as never,
    });

    const image = await runtime.generate({ prompt: "locked prompt" });
    const stored = await runtime.store({ jobId: "mock-job", image });
    await runtime.remove(stored.url);

    expect(image).toMatchObject({
      contentType: "image/png",
      extension: "png",
      model: "openai/gpt-image-2",
      costUsd: 0,
    });
    expect(Array.from(image.bytes.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(stored.url).toMatch(/^data:image\/png;base64,/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(putImpl).not.toHaveBeenCalled();
    expect(delImpl).not.toHaveBeenCalled();
  });
});
