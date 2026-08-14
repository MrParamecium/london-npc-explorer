import { describe, expect, it, vi } from "vitest";

import type { PortraitImage } from "@/lib/generation/portrait-types";

import { createPortraitBlobStore } from "./portrait-blob-store";

const jobId = "33333333-3333-4333-8333-333333333333";
const image: PortraitImage = {
  bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
  contentType: "image/png",
  extension: "png",
  model: "openai/gpt-image-2",
  costUsd: 0.08,
};

describe("portrait Blob store", () => {
  it("uploads an immutable public object under a private-data-free path", async () => {
    const putImpl = vi.fn().mockResolvedValue({
      url: `https://store.public.blob.vercel-storage.com/npc-portraits/${jobId}-abc123.png`,
      downloadUrl: "https://store.public.blob.vercel-storage.com/download",
      pathname: `npc-portraits/${jobId}-abc123.png`,
      contentType: "image/png",
      contentDisposition: "inline",
    });
    const store = createPortraitBlobStore({
      token: "test-blob-token",
      putImpl: putImpl as never,
      randomSuffix: () => "abc123",
    });

    const stored = await store.put({ jobId, image });

    expect(putImpl).toHaveBeenCalledTimes(1);
    expect(putImpl).toHaveBeenCalledWith(
      `npc-portraits/${jobId}-abc123.png`,
      Buffer.from(image.bytes),
      {
        access: "public",
        addRandomSuffix: false,
        cacheControlMaxAge: 31_536_000,
        contentType: "image/png",
        token: "test-blob-token",
      },
    );
    expect(stored).toEqual({
      url: expect.stringContaining("vercel-storage.com"),
      pathname: `npc-portraits/${jobId}-abc123.png`,
    });
    expect(stored.pathname).not.toMatch(
      /user_|Amara|51\.5202|-0\.0979|test-blob-token/,
    );
  });

  it("deletes one stored URL through the injected client", async () => {
    const delImpl = vi.fn().mockResolvedValue(undefined);
    const store = createPortraitBlobStore({
      token: "test-blob-token",
      putImpl: vi.fn() as never,
      delImpl: delImpl as never,
    });
    const url =
      "https://store.public.blob.vercel-storage.com/npc-portraits/job.png";

    await store.remove(url);

    expect(delImpl).toHaveBeenCalledTimes(1);
    expect(delImpl).toHaveBeenCalledWith(url, { token: "test-blob-token" });
  });

  it("returns a safe upload error without leaking provider details", async () => {
    const store = createPortraitBlobStore({
      token: "test-blob-token",
      putImpl: vi
        .fn()
        .mockRejectedValue(new Error("secret blob response")) as never,
    });

    await expect(store.put({ jobId, image })).rejects.toMatchObject({
      code: "portrait_failed",
      retryable: true,
      message: "The portrait could not be stored.",
    });
  });
});
