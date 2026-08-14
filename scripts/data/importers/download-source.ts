import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, stat, unlink } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { SourceManifestEntry } from "../source-registry";

const CACHE_DIRECTORY = resolve(process.cwd(), ".cache/statistics/v1");

function extension(source: SourceManifestEntry) {
  return source.format;
}

export function cachedSourcePath(source: SourceManifestEntry) {
  return resolve(CACHE_DIRECTORY, `${source.key}.${extension(source)}`);
}

async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function verify(path: string, source: SourceManifestEntry) {
  const file = await stat(path);
  if (file.size !== source.byteSize) {
    throw new Error(
      `${source.key} expected ${source.byteSize} bytes, received ${file.size}.`,
    );
  }
  const checksum = await sha256File(path);
  if (checksum !== source.sha256) {
    throw new Error(`${source.key} failed SHA-256 verification.`);
  }
}

export async function downloadSource(source: SourceManifestEntry) {
  await mkdir(CACHE_DIRECTORY, { recursive: true });
  const path = cachedSourcePath(source);
  try {
    await access(path);
    await verify(path, source);
    return path;
  } catch (error) {
    if (
      error instanceof Error &&
      /failed SHA-256|expected .* bytes/.test(error.message)
    ) {
      await unlink(path).catch(() => undefined);
    }
  }

  const response = await fetch(source.fileUrl, {
    signal: AbortSignal.timeout(60_000),
    headers: { "user-agent": "London NPC statistics importer/1.0" },
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `${source.key} download failed with HTTP ${response.status}.`,
    );
  }
  const temporaryPath = `${path}.${process.pid}.part`;
  try {
    await pipeline(
      Readable.fromWeb(
        response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
      ),
      createWriteStream(temporaryPath),
    );
    await verify(temporaryPath, source);
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  console.info(`${source.key}: cached ${basename(path)}.`);
  return path;
}
