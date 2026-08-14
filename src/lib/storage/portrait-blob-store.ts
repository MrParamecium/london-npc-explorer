import "server-only";

import { randomUUID } from "node:crypto";

import { del, put } from "@vercel/blob";
import { z } from "zod";

import { EntityIdSchema } from "@/lib/domain/primitives";
import {
  PortraitGenerationError,
  type PortraitImage,
  type StoredPortrait,
} from "@/lib/generation/portrait-types";

const ONE_YEAR_SECONDS = 31_536_000;
const RandomSuffixSchema = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);

const StoredBlobSchema = z.object({
  url: z.string().url().startsWith("https://"),
  pathname: z.string().startsWith("npc-portraits/"),
});

export function createPortraitBlobStore(options: {
  token?: string;
  putImpl?: typeof put;
  delImpl?: typeof del;
  randomSuffix?: () => string;
}): {
  put(input: { jobId: string; image: PortraitImage }): Promise<StoredPortrait>;
  remove(url: string): Promise<void>;
} {
  const token = z.string().trim().min(1).parse(options.token);
  const putImpl = options.putImpl ?? put;
  const delImpl = options.delImpl ?? del;
  const randomSuffix = options.randomSuffix ?? randomUUID;

  return {
    async put({ jobId, image }) {
      try {
        const id = EntityIdSchema.parse(jobId);
        const suffix = RandomSuffixSchema.parse(randomSuffix());
        const pathname = `npc-portraits/${id}-${suffix}.${image.extension}`;
        const stored = await putImpl(pathname, Buffer.from(image.bytes), {
          access: "public",
          addRandomSuffix: false,
          cacheControlMaxAge: ONE_YEAR_SECONDS,
          contentType: image.contentType,
          token,
        });

        return StoredBlobSchema.parse(stored);
      } catch {
        throw new PortraitGenerationError(
          "portrait_failed",
          "The portrait could not be stored.",
          true,
        );
      }
    },

    async remove(url) {
      await delImpl(z.string().url().parse(url), { token });
    },
  };
}
