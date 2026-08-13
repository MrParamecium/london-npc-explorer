import { describe, expect, it } from "vitest";

import { buildActiveVersionSet } from "./active-version-set";
import { LONDON_NPC_METRIC_REGISTRY } from "./metric-registry";

const ids = {
  one: "11111111-1111-4111-8111-111111111111",
  two: "22222222-2222-4222-8222-222222222222",
} as const;

function activeRows() {
  return [
    {
      id: ids.one,
      source: "source-a",
      release_label: "2025",
      transform_version: "v1",
      compatibility_set_key: "london-v1",
      metric_ids: Object.keys(LONDON_NPC_METRIC_REGISTRY).slice(0, 6),
    },
    {
      id: ids.two,
      source: "source-b",
      release_label: "2025",
      transform_version: "v1",
      compatibility_set_key: "london-v1",
      metric_ids: Object.keys(LONDON_NPC_METRIC_REGISTRY).slice(6),
    },
  ];
}

describe("active statistical version set", () => {
  it("sorts one complete compatible active set by source", () => {
    const versionSet = buildActiveVersionSet(activeRows().reverse());

    expect(versionSet.compatibilitySetKey).toBe("london-v1");
    expect(versionSet.datasetVersionIds).toEqual([ids.one, ids.two]);
  });

  it("rejects a missing required metric", () => {
    const rows = activeRows();
    rows[1]!.metric_ids = rows[1]!.metric_ids.filter(
      (metric) => metric !== "imd_decile",
    );

    expect(() => buildActiveVersionSet(rows)).toThrow(/imd_decile/);
  });

  it("rejects duplicate active sources and mixed compatibility sets", () => {
    const duplicate = activeRows();
    duplicate[1]!.source = "source-a";
    expect(() => buildActiveVersionSet(duplicate)).toThrow(/duplicated/);

    const mixed = activeRows();
    mixed[1]!.compatibility_set_key = "london-v2";
    expect(() => buildActiveVersionSet(mixed)).toThrow(/compatibility/);
  });
});
