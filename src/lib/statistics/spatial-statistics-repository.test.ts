import { describe, expect, it, vi } from "vitest";

import { loadSpatialStatisticCandidates } from "./spatial-statistics-repository";

describe("spatial statistics repository", () => {
  it("issues one bounded query and parses candidate rows", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          dataset_version_id: "11111111-1111-4111-8111-111111111111",
          source_release: "2025",
          transform_version: "v1",
          geography_level: "london",
          geography_code: "E12000007",
          metric: "imd_decile",
          distribution: {},
        },
      ],
    });

    const rows = await loadSpatialStatisticCandidates({ execute } as never, {
      geography: {
        lsoaCode: "E01000001",
        wardCode: null,
        boroughCode: "E09000001",
        fallbackLevel: "lsoa",
      },
      versionSet: {
        compatibilitySetKey: "london-v1",
        datasetVersionIds: ["11111111-1111-4111-8111-111111111111"],
        versions: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            source: "imd",
            releaseLabel: "2025",
            transformVersion: "v1",
            compatibilitySetKey: "london-v1",
            metricIds: ["imd_decile"],
          },
        ],
      },
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(rows[0]?.geography_level).toBe("london");
  });
});
