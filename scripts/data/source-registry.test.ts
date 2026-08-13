import { describe, expect, it } from "vitest";

import manifestJson from "../../data/manifests/london-npc-statistics-v1.json";
import {
  SourceManifestSchema,
  assertDocumentedMappings,
} from "./source-registry";

describe("London statistics source registry", () => {
  it("locks a complete, licensed and checksum-pinned source set", () => {
    const manifest = SourceManifestSchema.parse(manifestJson);
    expect(manifest.sources).toHaveLength(10);
    expect(() => assertDocumentedMappings(manifest)).not.toThrow();
  });

  it("rejects moving latest URLs and undocumented mappings", () => {
    const broken = structuredClone(manifestJson);
    broken.sources[0]!.fileUrl = "https://example.com/latest/source.xlsx";
    expect(SourceManifestSchema.safeParse(broken).success).toBe(false);

    const parsed = SourceManifestSchema.parse(manifestJson);
    parsed.sources[0]!.mappingId = "missing_mapping";
    expect(() => assertDocumentedMappings(parsed)).toThrow(
      /no documented category mapping/,
    );
  });
});
