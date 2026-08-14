import "server-only";

import type { del, put } from "@vercel/blob";
import { z } from "zod";

import { createPortraitBlobStore } from "@/lib/storage/portrait-blob-store";

import { createOpenRouterImageProvider } from "./openrouter-image-provider";
import type { PortraitImage, StoredPortrait } from "./portrait-types";

const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export type PortraitRuntime = {
  imageModel: string;
  generate(input: { prompt: string }): Promise<PortraitImage>;
  store(input: {
    jobId: string;
    image: PortraitImage;
  }): Promise<StoredPortrait>;
  remove(url: string): Promise<void>;
};

export function createPortraitRuntime(config: {
  providerMode: "mock" | "live";
  openRouterApiKey?: string;
  imageModel: string;
  blobToken?: string;
  fetchImpl?: typeof fetch;
  putImpl?: typeof put;
  delImpl?: typeof del;
}): PortraitRuntime {
  const imageModel = z.string().trim().min(1).max(160).parse(config.imageModel);

  if (config.providerMode === "mock") {
    const bytes = Uint8Array.from(Buffer.from(MOCK_PNG_BASE64, "base64"));

    return {
      imageModel,
      async generate({ prompt }) {
        z.string().trim().min(1).parse(prompt);
        return {
          bytes: Uint8Array.from(bytes),
          contentType: "image/png",
          extension: "png",
          model: imageModel,
          costUsd: 0,
        };
      },
      async store({ image }) {
        return {
          url: `data:${image.contentType};base64,${Buffer.from(image.bytes).toString("base64")}`,
          pathname: "mock/npc-portrait.png",
        };
      },
      async remove() {},
    };
  }

  const openRouterApiKey = z
    .string({ error: "OPENROUTER_API_KEY is required in live mode." })
    .trim()
    .min(1, "OPENROUTER_API_KEY is required in live mode.")
    .parse(config.openRouterApiKey);
  const blobToken = z
    .string({ error: "BLOB_READ_WRITE_TOKEN is required in live mode." })
    .trim()
    .min(1, "BLOB_READ_WRITE_TOKEN is required in live mode.")
    .parse(config.blobToken);
  const provider = createOpenRouterImageProvider({
    apiKey: openRouterApiKey,
    model: imageModel,
    fetchImpl: config.fetchImpl,
  });
  const store = createPortraitBlobStore({
    token: blobToken,
    putImpl: config.putImpl,
    delImpl: config.delImpl,
  });

  return {
    imageModel,
    generate: provider.generate,
    store: store.put,
    remove: store.remove,
  };
}
